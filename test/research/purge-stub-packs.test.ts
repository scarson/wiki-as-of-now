// ABOUTME: Tests the stub-pack purge — deletes only fake-provider/0 packs, leaving real packs intact (CC-7 precondition).
// ABOUTME: Real D1 via freshTestExecutor() (FK-on, migrated); stub packs are write-once PK-poison and must be purged.
import { describe, it, expect } from "vitest";
import { freshTestExecutor } from "../helpers/db";
import { upsertArticle } from "../../src/db/articles";
import { insertPackIfAbsent, packExists, computeClaimKey } from "../../src/db/research-packs";
import { purgeStubPacks } from "../../scripts/purge-stub-packs";
import type { ResearchPack } from "../../src/db/research-packs";

async function seedPack(db: ReturnType<typeof freshTestExecutor>, modelVersion: string, rev: number): Promise<string> {
  await upsertArticle(db, { pageId: 1, title: "A", revisionId: rev, fetchedAt: new Date().toISOString() });
  const claimKey = await computeClaimKey(1, "S", `sentence ${modelVersion} ${rev}`, 2025);
  const pack: ResearchPack = {
    claimKey, sourceRevisionId: rev, pageId: 1, sectionHeading: "S",
    sentenceText: `sentence ${modelVersion} ${rev}`, year: 2025,
    providerName: "x", modelVersion, status: "no_proposals",
    queries: [], cards: [], dispositions: [], evaluatedAt: new Date().toISOString(),
  };
  await insertPackIfAbsent(db, pack);
  return claimKey;
}

describe("purgeStubPacks", () => {
  it("deletes only fake-provider/0 packs, leaving real packs intact", async () => {
    const db = freshTestExecutor();
    const stubKey = await seedPack(db, "fake-provider/0", 100);
    const realKey = await seedPack(db, "@cf/google/gemma-4-26b-a4b-it", 200);

    const deleted = await purgeStubPacks(db);

    expect(deleted).toBe(1);
    expect(await packExists(db, stubKey, 100)).toBe(false);
    expect(await packExists(db, realKey, 200)).toBe(true);
  });
  it("returns 0 and deletes nothing when there are no stub packs", async () => {
    const db = freshTestExecutor();
    const realKey = await seedPack(db, "@cf/google/gemma-4-26b-a4b-it", 300);
    expect(await purgeStubPacks(db)).toBe(0);
    expect(await packExists(db, realKey, 300)).toBe(true);
  });
});
