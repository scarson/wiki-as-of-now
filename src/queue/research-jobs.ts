// ABOUTME: Research-job queue consumer — total/contained handler that drives the research provider.
// ABOUTME: Also exports queue producers (enqueueResearch, enqueueResearchBatch) and the atomic pack+audit pack store.
import type { AuditEntry } from "../db/audit-log";
import { appendStatement } from "../db/audit-log";
import type { ResearchInput } from "../research/provider";
import type { ResearchOutcome } from "../research/pipeline";
import type { ResearchPack } from "../db/research-packs";
import { computeClaimKey, packExists, insertPackIfAbsent, insertPackStatement } from "../db/research-packs";
import { seedUserIfAbsentStatement } from "../db/users";
import { quotaEntryFor, utcDayKey } from "../quota/reconcile";
import { countPacksForUserOnDay, countPacksGlobalOnDay } from "../db/quota-ledger";
import { SINGLE_ADMIN_USER_ID } from "../auth/mode";
import type { QuotaConfig } from "../quota/config";
import type { SqlExecutor } from "../db/client";

/** Per-pack metered-spend stats recorded on the quota ledger (observability; the metered unit is the row itself). */
export interface PackUsage {
  neurons: number;
  braveQueryCount: number;
}

/** The single-admin identity that owns cron/seed-originated packs (no enqueuer userId on the message). */
const CONSUMER_USER = {
  userId: SINGLE_ADMIN_USER_ID,
  identityProvider: "admin",
  identitySubject: "admin",
  email: "admin@localhost",
  createdAt: "1970-01-01T00:00:00.000Z",
} as const;

/**
 * Builds the bound, UNEXECUTED user-seed statement for the ledger row's owner so the quota_ledger FK is
 * always satisfiable inside the atomic commit (CC-3). DO-NOTHING-on-conflict: it never overwrites an
 * existing user's identity/email, so a real OAuth login's row is left untouched (idempotent FK safety net).
 * The single-admin owner uses its fixed seed identity; any OAuth userId is seeded with a placeholder
 * identity used only if no real user row exists yet.
 */
function ledgerOwnerSeed(db: SqlExecutor, userId: string) {
  if (userId === SINGLE_ADMIN_USER_ID) return seedUserIfAbsentStatement(db, CONSUMER_USER);
  return seedUserIfAbsentStatement(db, {
    userId,
    identityProvider: "pending",
    identitySubject: userId,
    email: "",
    createdAt: "1970-01-01T00:00:00.000Z",
  });
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A message posted to the research queue. claimKey is the durable (content-derived) identity. */
export interface ResearchMessage {
  claimKey: string;
  pageId: number;
  sourceRevisionId: number;
  input: ResearchInput;
  /** Opaque id of the user who requested this research — the quota_ledger owner the consumer commits to.
   *  Absent on cron/seed-originated messages, which the consumer attributes to the single-admin user. */
  userId?: string;
}

/** The committed-pack counts for one UTC day — the count-at-commit cap inputs (Fix 3). */
export interface CommittedPackCounts {
  user: number;
  global: number;
}

/** The persistence port the consumer needs (full-PK existence + write-once insert + count-at-commit). */
export interface PackStore {
  has(claimKey: string, sourceRevisionId: number): Promise<boolean>;
  insertIfAbsent(pack: ResearchPack): Promise<void>;
  /** Counts already-committed packs on a UTC day, for the owner `userId` and globally — the inputs to the
   *  sequential consumer's count-at-commit cap (the only race-free enforcement point; the producer pre-check
   *  is advisory). Called immediately before commitTerminal, so it reflects every earlier sequential commit. */
  countCommittedPacksOnDay(userId: string, utcDay: string): Promise<CommittedPackCounts>;
  /** Persists the pack, its write-once quota-ledger row (owned by `userId`), and the completion audit entry
   *  atomically (both-or-neither). The ledger row is the metered unit (one per pack); usage is observability
   *  stats. Seeds `userId` in the same batch so the quota_ledger FK is always satisfiable (idempotent). */
  commitTerminal(pack: ResearchPack, audit: AuditEntry, usage: PackUsage, userId: string): Promise<void>;
}

/** Codes-only audit payload (G13). NEVER quotes/queries/URLs/claim text — ids, enums, counts only. */
export interface ResearchAuditPayload {
  claimKey: string;
  providerName: string;
  modelVersion: string;
  status: "no_proposals" | "proposals_present";
  cardCount: number;
  overCapCount: number;
  dispositionTally: Record<string, number>; // reason-code → count
}

/** Injected dependencies for the research-job consumer. */
export interface ResearchConsumerDeps {
  /** Phase-8 pipeline PRE-BOUND with {provider, fetchSource, now, maxProposals, perHostCap}. */
  researchClaim: (input: ResearchInput) => Promise<ResearchOutcome>;
  packStore: PackStore;
  audit: { append(entry: AuditEntry): Promise<void> };
  /** Stamps pack.evaluatedAt via now.toISOString(); also the UTC-day key for the count-at-commit cap. */
  now: Date;
  /** Per-user + global daily pack-insert caps. Enforced at commit (the sequential, race-free point — Fix 3). */
  quotaConfig: QuotaConfig;
}

// ---------------------------------------------------------------------------
// Real PackStore adapter
// ---------------------------------------------------------------------------

/**
 * Real PackStore adapter backed by packExists + insertPackIfAbsent + batch.
 * Tests can use makeResearchPackStore(freshTestExecutor()) for the real-store cases.
 */
export function makeResearchPackStore(db: SqlExecutor): PackStore {
  return {
    has(claimKey: string, sourceRevisionId: number): Promise<boolean> {
      return packExists(db, claimKey, sourceRevisionId);
    },
    insertIfAbsent(pack: ResearchPack): Promise<void> {
      return insertPackIfAbsent(db, pack);
    },
    async countCommittedPacksOnDay(userId: string, utcDay: string): Promise<CommittedPackCounts> {
      // Sequential consumer (CC-16): these counts reflect every earlier committed pack today, so the
      // subsequent count-then-insert in handleResearchMessage is race-free.
      const user = await countPacksForUserOnDay(db, userId, utcDay);
      const global = await countPacksGlobalOnDay(db, utcDay);
      return { user, global };
    },
    commitTerminal(pack: ResearchPack, audit: AuditEntry, usage: PackUsage, userId: string): Promise<void> {
      // All four statements come from the SAME executor instance (CC-3) and commit atomically (CC §3.5):
      //  - ledgerOwnerSeed seeds the ledger row's owner (the enqueuer's userId, or the single-admin for
      //    cron/seed packs) so the quota_ledger FK is always satisfiable — ON CONFLICT DO NOTHING, so a
      //    real OAuth login's existing user row is never clobbered.
      //  - the pack insert and the quota-ledger insert are both ON CONFLICT DO NOTHING (write-once):
      //    a re-delivered claim that no-ops the pack also no-ops the ledger row — no double-count.
      return db.batch([
        ledgerOwnerSeed(db, userId),
        insertPackStatement(db, pack),
        quotaEntryFor(db, { userId, pack, neurons: usage.neurons, braveQueryCount: usage.braveQueryCount }),
        appendStatement(db, audit),
      ]);
    },
  };
}

// ---------------------------------------------------------------------------
// Message validation
// ---------------------------------------------------------------------------

function isValidMessage(msg: unknown): msg is ResearchMessage {
  if (msg === null || typeof msg !== "object") return false;
  const m = msg as Record<string, unknown>;
  if (typeof m.claimKey !== "string" || m.claimKey.length === 0) return false;
  if (typeof m.pageId !== "number" || !Number.isFinite(m.pageId)) return false;
  if (typeof m.sourceRevisionId !== "number" || !Number.isFinite(m.sourceRevisionId)) return false;
  if (m.input === null || typeof m.input !== "object") return false;
  return true;
}

// ---------------------------------------------------------------------------
// Consumer: handleResearchMessage
// ---------------------------------------------------------------------------

/**
 * Total/contained queue consumer: return = ack; throw = retry.
 *
 * Flow:
 * 1. Validate the message shape — permanently-bad input is ACKed (not retried).
 * 2. Idempotency skip on full PK (claimKey, sourceRevisionId) — ACKed silently.
 * 3. Call researchClaim:
 *    - terminal (no_proposals | proposals_present): persists pack + completion audit atomically
 *      (both-or-neither via packStore.commitTerminal), ACK.
 *    - provider_unavailable: audit codes-only, THROW (retry).
 *    - unexpected error: audit codes-only (no raw error text), RETHROW (retry).
 */
export async function handleResearchMessage(
  msg: ResearchMessage,
  deps: ResearchConsumerDeps,
): Promise<void> {
  // Step 1: Validate the message shape.
  if (!isValidMessage(msg)) {
    // Codes-only audit (G13): NEVER echo a raw, unvalidated claimKey — a malformed or crafted message
    // could smuggle content/PII into the append-only audit log. Only pass through a claimKey that is a
    // genuine computeClaimKey output (64-char lowercase hex); otherwise use a fixed placeholder.
    const rawKey = (msg as Record<string, unknown> | null)?.claimKey;
    const claimKey = typeof rawKey === "string" && HEX64_PATTERN.test(rawKey) ? rawKey : "malformed";
    await deps.audit.append({
      actor: "system",
      eventType: "research.failed",
      payload: { claimKey, reason: "malformed_message" },
    });
    return; // ACK — do not retry permanently-bad input
  }

  // Step 2: Idempotency skip (best-effort sequential-skip optimization).
  if (await deps.packStore.has(msg.claimKey, msg.sourceRevisionId)) {
    return; // ACK silently — no provider call, no new audit
  }

  // Step 3: Wrapped research + persistence.
  let outcome: ResearchOutcome;
  try {
    outcome = await deps.researchClaim(msg.input);
  } catch (e) {
    await deps.audit.append({
      actor: "system",
      eventType: "research.failed",
      payload: { claimKey: msg.claimKey, reason: "unexpected_error" },
    });
    throw e; // rethrow — retry (transient)
  }

  if (outcome.status === "provider_unavailable") {
    await deps.audit.append({
      actor: "system",
      eventType: "research.unavailable",
      payload: { claimKey: msg.claimKey, status: "provider_unavailable" },
    });
    throw new Error("provider_unavailable: retry"); // retry — nothing persisted blocks re-attempt
  }

  // Terminal outcome (no_proposals | proposals_present): persist pack and completion audit atomically.
  const pack: ResearchPack = {
    claimKey: msg.claimKey,
    sourceRevisionId: msg.sourceRevisionId,
    pageId: msg.pageId,
    sectionHeading: msg.input.sectionHeading,
    sentenceText: msg.input.claimText,
    year: msg.input.year,
    providerName: outcome.providerName,
    modelVersion: outcome.modelVersion,
    status: outcome.status,
    queries: outcome.queries,
    cards: outcome.cards,
    dispositions: outcome.dispositions,
    evaluatedAt: deps.now.toISOString(),
  };

  // Build the dispositionTally: reason-code → count (codes only, G13).
  const dispositionTally: Record<string, number> = {};
  for (const d of outcome.dispositions) {
    dispositionTally[d.reason] = (dispositionTally[d.reason] ?? 0) + 1;
  }

  const auditPayload: ResearchAuditPayload = {
    claimKey: msg.claimKey,
    providerName: outcome.providerName,
    modelVersion: outcome.modelVersion,
    status: outcome.status,
    cardCount: outcome.cards.length,
    overCapCount: outcome.overCapCount,
    dispositionTally,
  };

  // Usage stats for the quota ledger. The stub provider surfaces no usage, so both default to 0
  // (honest, not fabricated — ?? 0 per the Phase 1 usage-threading contract).
  const usage: PackUsage = {
    neurons: outcome.usage?.neurons ?? 0,
    braveQueryCount: outcome.usage?.braveQueryCount ?? 0,
  };

  // The ledger row's owner: the enqueuer's real userId, or the single-admin for cron/seed-originated packs.
  const ledgerUserId = msg.userId ?? SINGLE_ADMIN_USER_ID;

  // Count-at-commit cap (Fix 3): the metered unit is the pack insert. The producer pre-check is advisory
  // (count-then-enqueue races); the SEQUENTIAL consumer (CC-16) is the only race-free enforcement point —
  // counting committed packs here reflects every earlier commit today. At/over either cap → drop this
  // claim: no pack, no ledger row, a codes-only quota_exceeded audit, then ACK (not a retry-loop). A
  // dropped claim writes no pack, so it can be re-researched after the UTC day rolls over.
  const day = utcDayKey(deps.now.toISOString());
  const counts = await deps.packStore.countCommittedPacksOnDay(ledgerUserId, day);
  if (counts.user >= deps.quotaConfig.perUserDailyCap || counts.global >= deps.quotaConfig.globalDailyCap) {
    const scope: "user" | "global" = counts.user >= deps.quotaConfig.perUserDailyCap ? "user" : "global";
    await deps.audit.append({
      actor: "system",
      eventType: "research.quota_exceeded",
      payload: { claimKey: msg.claimKey, scope }, // codes only (G13): no claim text, no userId
    });
    return; // ACK — drop. No pack/ledger written; re-researchable after the day rolls over.
  }

  await deps.packStore.commitTerminal(
    pack,
    {
      actor: "system",
      eventType: "research.completed",
      payload: auditPayload,
    },
    usage,
    ledgerUserId,
  );
  // return (ACK)
}

// ---------------------------------------------------------------------------
// Producer: enqueueResearch
// ---------------------------------------------------------------------------

/**
 * Thin producer — computes the claimKey, then posts a ResearchMessage to a
 * Cloudflare Queue binding.
 */
export async function enqueueResearch(
  queue: { send(message: ResearchMessage): Promise<void> },
  params: { pageId: number; sourceRevisionId: number; input: ResearchInput; userId?: string },
): Promise<void> {
  const { pageId, sourceRevisionId, input, userId } = params;
  const claimKey = await computeClaimKey(pageId, input.sectionHeading, input.claimText, input.year);
  await queue.send({ claimKey, pageId, sourceRevisionId, input, userId });
}

// ---------------------------------------------------------------------------
// Producer: enqueueResearchBatch
// ---------------------------------------------------------------------------

/** Maximum messages per Cloudflare Queue sendBatch call. */
const MAX_BATCH_COUNT = 100;

/** Maximum byte size per sendBatch call (256 KB). */
const MAX_BATCH_BYTES = 256 * 1024;

/** Threshold above which a single message is skipped rather than included in any batch. */
const MAX_MESSAGE_BYTES = 128 * 1024;

/**
 * Upper bound on the seed fan-out — the number of ResearchMessages a seeder
 * may produce in one invocation. Must never exceed MAX_BATCH_COUNT so an entire
 * seed fan-out fits in a single sendBatch call without seed-level chunking.
 */
export const SEED_BATCH_LIMIT = 50;

// Invariant enforced at module load: a future bump that violates the queue cap fails loudly.
if (SEED_BATCH_LIMIT > MAX_BATCH_COUNT) {
  throw new Error("SEED_BATCH_LIMIT must be <= MAX_BATCH_COUNT");
}

/** 64-char lowercase hex pattern — matches real computeClaimKey output. */
const HEX64_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Batch producer for seed fan-out — sends pre-built ResearchMessages to a Cloudflare Queue
 * via sendBatch, chunked to <=100 messages AND <=256 KB per chunk.
 *
 * claimKey is already computed by the seed; it is passed through unchanged and never
 * recomputed from the input fields.
 *
 * A single message whose JSON size exceeds ~128 KB is skipped and logged (codes-only)
 * rather than failing the entire batch. This ensures one pathological message never
 * blocks the rest of the seed fan-out.
 */
export async function enqueueResearchBatch(
  queue: { sendBatch(msgs: { body: ResearchMessage }[]): Promise<void> },
  msgs: ResearchMessage[],
): Promise<void> {
  const chunks: { body: ResearchMessage }[][] = [];
  let current: { body: ResearchMessage }[] = [];
  let currentBytes = 0;

  for (const msg of msgs) {
    const size = JSON.stringify(msg).length;

    if (size > MAX_MESSAGE_BYTES) {
      // Codes-only warn (G13): sanitize claimKey to 64-hex-or-"unknown"; never log message body/claimText.
      const rawKey = msg.claimKey;
      const safeKey = typeof rawKey === "string" && HEX64_PATTERN.test(rawKey) ? rawKey : "unknown";
      console.warn("research.batch.message_skipped", { claimKey: safeKey, reason: "oversized_message_skipped" });
      continue;
    }

    // Start a new chunk BEFORE adding when the current would exceed either limit.
    if (
      current.length > 0 &&
      (current.length >= MAX_BATCH_COUNT || currentBytes + size > MAX_BATCH_BYTES)
    ) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }

    current.push({ body: msg });
    currentBytes += size;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  for (const chunk of chunks) {
    await queue.sendBatch(chunk);
  }
}
