// ABOUTME: Research-job queue consumer — total/contained handler that drives the research provider.
// ABOUTME: Also exports a thin producer (enqueueResearch) for posting to a Cloudflare Queue binding.
import type { AuditEntry } from "../db/audit-log";
import type { ResearchInput } from "../research/provider";
import type { ResearchOutcome } from "../research/pipeline";
import type { ResearchPack } from "../db/research-packs";
import { computeClaimKey, packExists, insertPackIfAbsent } from "../db/research-packs";
import type { SqlExecutor } from "../db/client";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A message posted to the research queue. claimKey is the durable (content-derived) identity. */
export interface ResearchMessage {
  claimKey: string;
  pageId: number;
  sourceRevisionId: number;
  input: ResearchInput;
}

/** The persistence port the consumer needs (full-PK existence + write-once insert). */
export interface PackStore {
  has(claimKey: string, sourceRevisionId: number): Promise<boolean>;
  insertIfAbsent(pack: ResearchPack): Promise<void>;
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
  /** Stamps pack.evaluatedAt via now.toISOString(). */
  now: Date;
}

// ---------------------------------------------------------------------------
// Real PackStore adapter
// ---------------------------------------------------------------------------

/**
 * Real PackStore adapter backed by packExists + insertPackIfAbsent.
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
 *    - terminal (no_proposals | proposals_present): persist pack, audit codes-only, ACK.
 *    - provider_unavailable: audit codes-only, THROW (retry).
 *    - unexpected error: audit codes-only (no raw error text), RETHROW (retry).
 */
export async function handleResearchMessage(
  msg: ResearchMessage,
  deps: ResearchConsumerDeps,
): Promise<void> {
  // Step 1: Validate the message shape.
  if (!isValidMessage(msg)) {
    await deps.audit.append({
      actor: "system",
      eventType: "research.failed",
      payload: { claimKey: (msg as Record<string, unknown>)?.claimKey ?? "unknown", reason: "malformed_message" },
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

  // Terminal outcome (no_proposals | proposals_present): persist + audit.
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
  await deps.packStore.insertIfAbsent(pack);

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

  await deps.audit.append({
    actor: "system",
    eventType: "research.completed",
    payload: auditPayload,
  });
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
  params: { pageId: number; sourceRevisionId: number; input: ResearchInput },
): Promise<void> {
  const { pageId, sourceRevisionId, input } = params;
  const claimKey = await computeClaimKey(pageId, input.sectionHeading, input.claimText, input.year);
  await queue.send({ claimKey, pageId, sourceRevisionId, input });
}
