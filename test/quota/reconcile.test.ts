// ABOUTME: Quota reconciliation against REAL D1 (freshTestExecutor: FK-on, migrated) — the metered unit is pack inserts.
// ABOUTME: Covers write-once de-dup, per-user + global caps, the UTC-day boundary, and the FK to users (testing-pitfalls §5/§8).
import { describe, it, expect } from "vitest";
import { freshTestExecutor } from "../helpers/db";
import { upsertUser } from "../../src/db/users";
import { upsertArticle } from "../../src/db/articles";
import { insertPackStatement } from "../../src/db/research-packs";
import { quotaEntryFor, assertQuotaAvailable, QuotaExceededError, utcDayKey } from "../../src/quota/reconcile";
import type { ResearchPack } from "../../src/db/research-packs";

const PAGE_ID = 4242;
const REV_ID = 9001;

function pack(claimKey: string): ResearchPack {
  return {
    claimKey,
    sourceRevisionId: REV_ID,
    pageId: PAGE_ID,
    sectionHeading: "History",
    sentenceText: "The fleet will reach full strength by 2025.",
    year: 2025,
    providerName: "stub",
    modelVersion: "fake-provider/0",
    status: "no_proposals",
    queries: [],
    cards: [],
    dispositions: [],
    evaluatedAt: "2026-06-13T12:00:00.000Z",
  };
}

async function seed(db: ReturnType<typeof freshTestExecutor>) {
  await upsertUser(db, {
    userId: "u_admin",
    identityProvider: "admin",
    identitySubject: "admin",
    email: "admin@example.com",
    createdAt: "2026-06-13T00:00:00.000Z",
  });
  await upsertArticle(db, { pageId: PAGE_ID, title: "T", revisionId: REV_ID, fetchedAt: "2026-06-13T00:00:00.000Z" });
}

describe("quota reconciliation against real D1", () => {
  it("counts one ledger row per committed pack (the metered unit is pack inserts)", async () => {
    const db = freshTestExecutor();
    await seed(db);
    const p = pack("claim-1");
    await db.batch([
      insertPackStatement(db, p),
      quotaEntryFor(db, { userId: "u_admin", pack: p, neurons: 1234, braveQueryCount: 5 }),
    ]);
    await expect(
      assertQuotaAvailable(db, "u_admin", "2026-06-13T13:00:00.000Z", { perUserDailyCap: 5, globalDailyCap: 50 }),
    ).resolves.toBeUndefined();
    const rows = await db
      .prepare("SELECT neurons, brave_query_count FROM quota_ledger WHERE claim_key = ?")
      .bind("claim-1")
      .all<{ neurons: number; brave_query_count: number }>();
    expect(rows[0]).toEqual({ neurons: 1234, brave_query_count: 5 });
  });

  it("write-once: re-committing the same pack does NOT double-count the ledger", async () => {
    const db = freshTestExecutor();
    await seed(db);
    const p = pack("claim-dup");
    const commit = () =>
      db.batch([
        insertPackStatement(db, p),
        quotaEntryFor(db, { userId: "u_admin", pack: p, neurons: 1, braveQueryCount: 1 }),
      ]);
    await commit();
    await commit(); // re-delivery — both inserts are ON CONFLICT DO NOTHING
    const rows = await db
      .prepare("SELECT COUNT(*) AS n FROM quota_ledger WHERE claim_key = ?")
      .bind("claim-dup")
      .all<{ n: number }>();
    expect(rows[0].n).toBe(1);
  });

  it("throws QuotaExceededError when the per-user daily cap is reached", async () => {
    const db = freshTestExecutor();
    await seed(db);
    for (let i = 0; i < 3; i++) {
      const p = { ...pack(`claim-${i}`), sourceRevisionId: REV_ID };
      await db.batch([
        insertPackStatement(db, p),
        quotaEntryFor(db, { userId: "u_admin", pack: p, neurons: 0, braveQueryCount: 0 }),
      ]);
    }
    await expect(
      assertQuotaAvailable(db, "u_admin", "2026-06-13T13:00:00.000Z", { perUserDailyCap: 3, globalDailyCap: 50 }),
    ).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it("the daily window is UTC: a pack from the previous UTC day does not count toward today", async () => {
    const db = freshTestExecutor();
    await seed(db);
    const yesterday = { ...pack("claim-yest"), evaluatedAt: "2026-06-12T23:30:00.000Z" };
    await db.batch([
      insertPackStatement(db, yesterday),
      quotaEntryFor(db, { userId: "u_admin", pack: yesterday, neurons: 0, braveQueryCount: 0 }),
    ]);
    // Cap of 1, but yesterday's pack is a different UTC day → today still has room.
    await expect(
      assertQuotaAvailable(db, "u_admin", "2026-06-13T00:05:00.000Z", { perUserDailyCap: 1, globalDailyCap: 50 }),
    ).resolves.toBeUndefined();
  });

  it("global cap fires even when the per-user cap has room", async () => {
    const db = freshTestExecutor();
    await seed(db);
    await upsertUser(db, {
      userId: "u_other",
      identityProvider: "google",
      identitySubject: "o",
      email: "o@e.com",
      createdAt: "2026-06-13T00:00:00.000Z",
    });
    const a = pack("g-a");
    const b = { ...pack("g-b"), sourceRevisionId: REV_ID };
    await db.batch([insertPackStatement(db, a), quotaEntryFor(db, { userId: "u_admin", pack: a, neurons: 0, braveQueryCount: 0 })]);
    await db.batch([insertPackStatement(db, b), quotaEntryFor(db, { userId: "u_other", pack: b, neurons: 0, braveQueryCount: 0 })]);
    await expect(
      assertQuotaAvailable(db, "u_admin", "2026-06-13T13:00:00.000Z", { perUserDailyCap: 10, globalDailyCap: 2 }),
    ).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it("the QuotaExceededError carries the scope that fired", async () => {
    const db = freshTestExecutor();
    await seed(db);
    const p = pack("scope-user");
    await db.batch([insertPackStatement(db, p), quotaEntryFor(db, { userId: "u_admin", pack: p, neurons: 0, braveQueryCount: 0 })]);
    await expect(
      assertQuotaAvailable(db, "u_admin", "2026-06-13T13:00:00.000Z", { perUserDailyCap: 1, globalDailyCap: 50 }),
    ).rejects.toMatchObject({ scope: "user" });
  });

  it("utcDayKey returns the UTC calendar day", () => {
    expect(utcDayKey("2026-06-12T23:30:00.000Z")).toBe("2026-06-12");
    expect(utcDayKey("2026-06-13T00:05:00.000Z")).toBe("2026-06-13");
  });
});
