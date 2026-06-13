// ABOUTME: Workers-pool SECURITY test (real Miniflare D1) — the consumer enforces the daily cap at commit (Fix 3).
// ABOUTME: Drives N+1 distinct easy-win claims through the REAL worker.queue with cap N: exactly N packs+ledger rows; the (N+1)th dropped with a codes-only quota_exceeded audit and NO pack.
import { describe, it, expect, vi } from "vitest";
import worker from "../../workers/research/index";
import { testEnv } from "./test-env";
import { d1Executor } from "../../src/db/client";
import { upsertArticle } from "../../src/db/articles";
import { computeClaimKey, getPack } from "../../src/db/research-packs";
import { makeAuditLog } from "../../src/db/audit-log";
import type { ResearchMessage } from "../../src/queue/research-jobs";

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

function makeBatch(body: ResearchMessage) {
  const message = { id: "m", timestamp: new Date(), body, attempts: 1, ack: vi.fn(), retry: vi.fn() };
  const batch = { queue: "research", messages: [message], ackAll: vi.fn(), retryAll: vi.fn() };
  return { batch, message };
}

describe("consumer count-at-commit cap on real Miniflare D1 (Fix 3)", () => {
  it("per-user cap N: exactly N packs+ledger rows commit; the (N+1)th is dropped (no pack) with a codes-only quota_exceeded audit", async () => {
    const db = d1Executor(testEnv.DB);
    const CAP = 2;
    // QUOTA_PER_USER_DAILY caps pack inserts per user per UTC day; the worker reads it via loadQuotaConfig.
    const env = { DB: testEnv.DB, RESEARCH_QUEUE: testEnv.RESEARCH_QUEUE, AI: testEnv.AI, QUOTA_PER_USER_DAILY: String(CAP), QUOTA_GLOBAL_DAILY: "1000" };
    const USER = "u_cap";
    const PAGE_BASE = 9100;
    const REV = 9000;

    const msgs: ResearchMessage[] = [];
    for (let i = 0; i < CAP + 1; i++) {
      const pageId = PAGE_BASE + i;
      await upsertArticle(db, { pageId, title: "T", revisionId: REV, fetchedAt: "2026-06-13T00:00:00.000Z" });
      const input = { claimText: `Distinct claim ${i} will open by 2024.`, sectionHeading: "Status", year: 2024, sourceRevisionId: REV };
      const claimKey = await computeClaimKey(pageId, input.sectionHeading, input.claimText, input.year);
      msgs.push({ claimKey, pageId, sourceRevisionId: REV, input, userId: USER });
    }

    // Drive each distinct claim through the REAL worker consumer (sequential per CC-16).
    const messages = [];
    for (const body of msgs) {
      const { batch, message } = makeBatch(body);
      await worker.queue(batch as unknown as MessageBatch<ResearchMessage>, env, ctx);
      messages.push(message);
    }

    // Every message ACKs (the over-cap claim is dropped, NOT retry-looped).
    for (const m of messages) {
      expect(m.ack).toHaveBeenCalledTimes(1);
      expect(m.retry).not.toHaveBeenCalled();
    }

    // Exactly N packs committed; the (N+1)th wrote none.
    for (let i = 0; i < CAP; i++) {
      const read = await getPack(db, msgs[i].claimKey, REV);
      expect(read.state).toBe("found");
    }
    const overflow = msgs[CAP];
    const overflowRead = await getPack(db, overflow.claimKey, REV);
    expect(overflowRead.state).toBe("not_found");

    // Exactly N ledger rows for the user today.
    const ledger = await db.prepare("SELECT COUNT(*) AS n FROM quota_ledger WHERE user_id = ?").bind(USER).all<{ n: number }>();
    expect(ledger[0].n).toBe(CAP);

    // The dropped claim wrote a codes-only quota_exceeded audit (no claim text, no userId).
    const rows = await makeAuditLog(db).read();
    const dropped = rows.filter((r) => r.eventType === "research.quota_exceeded" && (r.payload as { claimKey?: string }).claimKey === overflow.claimKey);
    expect(dropped).toHaveLength(1);
    const payload = dropped[0].payload as Record<string, unknown>;
    expect(new Set(Object.keys(payload))).toEqual(new Set(["claimKey", "scope"]));
    expect(payload.scope).toBe("user");
    expect(JSON.stringify(rows.map((r) => r.payload))).not.toContain("Distinct claim");
  });
});
