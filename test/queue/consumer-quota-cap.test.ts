// ABOUTME: SECURITY tests for the consumer-side quota — the metered-unit owner + the count-at-commit cap (the only race-free point).
// ABOUTME: Real D1 (freshTestExecutor), real commit path: a non-admin enqueuer keys the ledger to THAT user, and the sequential
//          consumer enforces the per-user + global daily cap at commit (the pre-check is advisory; commit is authoritative).
import { describe, it, expect, vi } from "vitest";
import {
  handleResearchMessage,
  makeResearchPackStore,
  type ResearchMessage,
  type ResearchConsumerDeps,
} from "../../src/queue/research-jobs";
import { makeAuditLog } from "../../src/db/audit-log";
import { computeClaimKey, packExists } from "../../src/db/research-packs";
import { upsertArticle } from "../../src/db/articles";
import { upsertUser } from "../../src/db/users";
import { assertQuotaAvailable, QuotaExceededError } from "../../src/quota/reconcile";
import { freshTestExecutor } from "../helpers/db";
import { allowConsole } from "../setup/pristine";
import type { ResearchOutcome } from "../../src/research/pipeline";

const FIXED_NOW = new Date("2026-06-13T12:00:00.000Z");
const DAY = "2026-06-13";

function noProposals(): ResearchOutcome {
  return { status: "no_proposals", providerName: "fake-provider", modelVersion: "fake-provider/1.0", queries: [], cards: [], dispositions: [], overCapCount: 0 };
}

async function seedUser(db: ReturnType<typeof freshTestExecutor>, userId: string) {
  await upsertUser(db, { userId, identityProvider: "google", identitySubject: userId, email: `${userId}@e.com`, createdAt: FIXED_NOW.toISOString() });
}

async function seedArticle(db: ReturnType<typeof freshTestExecutor>, pageId: number, rev: number) {
  await upsertArticle(db, { pageId, title: "T", revisionId: rev, fetchedAt: FIXED_NOW.toISOString() });
}

function deps(db: ReturnType<typeof freshTestExecutor>, quotaConfig: { perUserDailyCap: number; globalDailyCap: number }): ResearchConsumerDeps {
  return {
    researchClaim: vi.fn().mockResolvedValue(noProposals()),
    packStore: makeResearchPackStore(db),
    audit: makeAuditLog(db),
    now: FIXED_NOW,
    quotaConfig,
  };
}

async function msgFor(pageId: number, rev: number, userId: string): Promise<ResearchMessage> {
  const input = { claimText: `Claim ${pageId}/${rev} will resolve by 2025.`, sectionHeading: "History", year: 2025, sourceRevisionId: rev };
  const claimKey = await computeClaimKey(pageId, input.sectionHeading, input.claimText, input.year);
  return { claimKey, pageId, sourceRevisionId: rev, input, userId };
}

describe("Fix 2 — the ledger row is keyed to the enqueuer's real userId (not hardcoded u_admin)", () => {
  it("a non-admin enqueuer's committed pack writes a ledger row for THAT user; the per-user pre-check then trips the cap", async () => {
    const db = freshTestExecutor();
    await seedUser(db, "u_alice");
    await seedArticle(db, 3001, 5001);

    // Before commit, the non-admin user has 0 packs today → pre-check passes.
    await expect(assertQuotaAvailable(db, "u_alice", FIXED_NOW.toISOString(), { perUserDailyCap: 1, globalDailyCap: 50 })).resolves.toBeUndefined();

    const msg = await msgFor(3001, 5001, "u_alice");
    await handleResearchMessage(msg, deps(db, { perUserDailyCap: 10, globalDailyCap: 50 }));

    // The ledger row MUST be owned by u_alice — the masking bug hardcoded u_admin, so the per-user pre-check never saw it.
    const owner = await db.prepare("SELECT user_id FROM quota_ledger WHERE claim_key = ?").bind(msg.claimKey).all<{ user_id: string }>();
    expect(owner).toHaveLength(1);
    expect(owner[0].user_id).toBe("u_alice");

    // Coupling assertion: the SAME real commit path makes the per-user pre-check now see u_alice's row and trip the cap of 1.
    await expect(assertQuotaAvailable(db, "u_alice", FIXED_NOW.toISOString(), { perUserDailyCap: 1, globalDailyCap: 50 }))
      .rejects.toBeInstanceOf(QuotaExceededError);
  });

  it("a message with NO userId (cron/seed path) still attributes the ledger row to the single-admin user", async () => {
    const db = freshTestExecutor();
    await seedArticle(db, 3002, 5002);
    const input = { claimText: "Seed claim will resolve by 2025.", sectionHeading: "History", year: 2025, sourceRevisionId: 5002 };
    const claimKey = await computeClaimKey(3002, input.sectionHeading, input.claimText, input.year);
    const msg: ResearchMessage = { claimKey, pageId: 3002, sourceRevisionId: 5002, input }; // no userId
    await handleResearchMessage(msg, deps(db, { perUserDailyCap: 10, globalDailyCap: 50 }));
    const owner = await db.prepare("SELECT user_id FROM quota_ledger WHERE claim_key = ?").bind(claimKey).all<{ user_id: string }>();
    expect(owner[0].user_id).toBe("u_admin");
  });
});

describe("Fix 3 — the consumer enforces the daily cap at commit (the only race-free point)", () => {
  it("per-user cap N: N distinct claims commit; the (N+1)th is dropped (no pack, no ledger) with a codes-only quota_exceeded audit, then ACKed", async () => {
    allowConsole();
    const db = freshTestExecutor();
    await seedUser(db, "u_bob");
    const CAP = 2;
    const d = deps(db, { perUserDailyCap: CAP, globalDailyCap: 50 });

    const msgs: ResearchMessage[] = [];
    for (let i = 0; i < CAP + 1; i++) {
      await seedArticle(db, 3100 + i, 5100 + i);
      msgs.push(await msgFor(3100 + i, 5100 + i, "u_bob"));
    }

    // Drive all N+1 distinct claims through the REAL sequential consumer.
    for (const m of msgs) {
      await expect(handleResearchMessage(m, d)).resolves.toBeUndefined(); // every one ACKs (drop, not retry-loop)
    }

    // Exactly N packs + N ledger rows for the user today; the (N+1)th wrote neither.
    const packCount = await db.prepare("SELECT COUNT(*) AS n FROM research_packs WHERE substr(evaluated_at,1,10) = ?").bind(DAY).all<{ n: number }>();
    expect(packCount[0].n).toBe(CAP);
    const ledgerCount = await db.prepare("SELECT COUNT(*) AS n FROM quota_ledger WHERE user_id = ? AND substr(evaluated_at,1,10) = ?").bind("u_bob", DAY).all<{ n: number }>();
    expect(ledgerCount[0].n).toBe(CAP);

    // The (N+1)th claim wrote NO pack.
    const overflow = msgs[CAP];
    expect(await packExists(db, overflow.claimKey, overflow.sourceRevisionId)).toBe(false);

    // A codes-only quota_exceeded audit was written for the dropped claim, carrying no PII.
    const rows = await makeAuditLog(db).read();
    const dropped = rows.filter((r) => r.eventType === "research.quota_exceeded");
    expect(dropped).toHaveLength(1);
    const payload = dropped[0].payload as Record<string, unknown>;
    expect(new Set(Object.keys(payload))).toEqual(new Set(["claimKey", "scope"]));
    expect(payload.claimKey).toBe(overflow.claimKey);
    expect(payload.scope).toBe("user");
    // No claim text leaks into the audit.
    expect(JSON.stringify(rows.map((r) => r.payload))).not.toContain("will resolve by 2025");
  });

  it("global cap fires even when the per-user cap has room", async () => {
    allowConsole();
    const db = freshTestExecutor();
    await seedUser(db, "u_c1");
    await seedUser(db, "u_c2");
    const d = deps(db, { perUserDailyCap: 10, globalDailyCap: 1 });

    await seedArticle(db, 3200, 5200);
    await seedArticle(db, 3201, 5201);
    const first = await msgFor(3200, 5200, "u_c1");
    const second = await msgFor(3201, 5201, "u_c2"); // different user, but global cap is 1

    await handleResearchMessage(first, d);
    await expect(handleResearchMessage(second, d)).resolves.toBeUndefined();

    expect(await packExists(db, first.claimKey, first.sourceRevisionId)).toBe(true);
    expect(await packExists(db, second.claimKey, second.sourceRevisionId)).toBe(false);

    const rows = await makeAuditLog(db).read();
    const dropped = rows.filter((r) => r.eventType === "research.quota_exceeded");
    expect(dropped).toHaveLength(1);
    expect((dropped[0].payload as Record<string, unknown>).scope).toBe("global");
  });

  it("a quota-dropped claim writes no pack, so it can be re-researched after the day rolls over", async () => {
    allowConsole();
    const db = freshTestExecutor();
    await seedUser(db, "u_d1");
    await seedArticle(db, 3300, 5300);
    await seedArticle(db, 3301, 5301);
    // Cap 1: first commits, second is dropped today.
    const dToday = deps(db, { perUserDailyCap: 1, globalDailyCap: 50 });
    await handleResearchMessage(await msgFor(3300, 5300, "u_d1"), dToday);
    const overflow = await msgFor(3301, 5301, "u_d1");
    await handleResearchMessage(overflow, dToday);
    expect(await packExists(db, overflow.claimKey, overflow.sourceRevisionId)).toBe(false);

    // Next UTC day: the same claim now commits (no blocking pack was written).
    const TOMORROW = new Date("2026-06-14T08:00:00.000Z");
    const dTomorrow: ResearchConsumerDeps = {
      researchClaim: vi.fn().mockResolvedValue(noProposals()),
      packStore: makeResearchPackStore(db),
      audit: makeAuditLog(db),
      now: TOMORROW,
      quotaConfig: { perUserDailyCap: 1, globalDailyCap: 50 },
    };
    await handleResearchMessage(overflow, dTomorrow);
    expect(await packExists(db, overflow.claimKey, overflow.sourceRevisionId)).toBe(true);
  });
});
