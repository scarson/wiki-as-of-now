// ABOUTME: Tests for surfaceResearchPack — the drift-aware worksheet read over getSurfaceablePack against real D1.
// ABOUTME: Covers surfaced/revision_drift/not_found/unreadable, splitting CC-20's not_found into drift vs truly-absent.
import { describe, it, expect } from "vitest";
import { allowConsole } from "../setup/pristine";
import { freshTestExecutor } from "../helpers/db";
import { upsertArticle } from "../../src/db/articles";
import { insertPackIfAbsent, computeClaimKey } from "../../src/db/research-packs";
import { surfaceResearchPack } from "../../src/research/surface-pack";
import type { ResearchPack } from "../../src/db/research-packs";

const SECTION = "Fleet", SENTENCE = "The fleet will reach full strength by 2025.", YEAR = 2025;

async function seedPack(db: ReturnType<typeof freshTestExecutor>, pageId: number, packRev: number, articleRev: number, mutate?: (p: ResearchPack) => void) {
  await upsertArticle(db, { pageId, title: "T", revisionId: articleRev, fetchedAt: new Date().toISOString() });
  const claimKey = await computeClaimKey(pageId, SECTION, SENTENCE, YEAR);
  const pack: ResearchPack = {
    claimKey, sourceRevisionId: packRev, pageId, sectionHeading: SECTION, sentenceText: SENTENCE, year: YEAR,
    providerName: "workers-ai", modelVersion: "@cf/google/gemma-4-26b-a4b-it", status: "proposals_present",
    queries: ["fleet readiness 2025"],
    cards: [{ url: "https://navy.mil/z", verbatimQuote: "reached full strength in 2024", advisorySupport: true }],
    dispositions: [{ url: "https://x.gov/dead", reason: "http_error" }],
    evaluatedAt: new Date().toISOString(),
  };
  mutate?.(pack);
  await insertPackIfAbsent(db, pack);
  return claimKey;
}

describe("surfaceResearchPack", () => {
  it("surfaces a pack whose source_revision_id matches the article's current revision", async () => {
    const db = freshTestExecutor();
    const claimKey = await seedPack(db, 6001, 800, 800);
    const r = await surfaceResearchPack(db, { pageId: 6001, claimKey, currentRevisionId: 800 });
    expect(r.state).toBe("surfaced");
    if (r.state === "surfaced") {
      expect(r.cards).toEqual([{ url: "https://navy.mil/z", verbatimQuote: "reached full strength in 2024", advisorySupport: true }]);
      expect(r.dispositions).toEqual([{ url: "https://x.gov/dead", reason: "http_error" }]);
      expect(r.queries).toEqual(["fleet readiness 2025"]);
      expect(r.modelVersion).toBe("@cf/google/gemma-4-26b-a4b-it");
    }
  });

  it("flags revision_drift (NOT not_found) when the pack is at an older revision than the article (CC-20)", async () => {
    const db = freshTestExecutor();
    // Pack researched at rev 800, but the article has since advanced to 850.
    const claimKey = await seedPack(db, 6002, 800, 850);
    const r = await surfaceResearchPack(db, { pageId: 6002, claimKey, currentRevisionId: 850 });
    expect(r.state).toBe("revision_drift");
    if (r.state === "revision_drift") {
      expect(r.packRevisionId).toBe(800);
      expect(r.currentRevisionId).toBe(850);
    }
  });

  it("returns not_found when no pack was ever computed for the claim", async () => {
    const db = freshTestExecutor();
    await upsertArticle(db, { pageId: 6003, title: "T", revisionId: 900, fetchedAt: new Date().toISOString() });
    const claimKey = await computeClaimKey(6003, SECTION, SENTENCE, YEAR);
    const r = await surfaceResearchPack(db, { pageId: 6003, claimKey, currentRevisionId: 900 });
    expect(r.state).toBe("not_found");
  });

  it("returns unreadable when the stored cards_json is corrupt", async () => {
    // getSurfaceablePack's defensive read logs the parse failure via console.error (contract §3.4 / CC-19).
    allowConsole();
    const db = freshTestExecutor();
    const claimKey = await seedPack(db, 6004, 800, 800);
    // Corrupt the cards_json in place to simulate a damaged row.
    await db.prepare("UPDATE research_packs SET cards_json = ? WHERE claim_key = ? AND source_revision_id = ?")
      .bind("{not json", claimKey, 800).run();
    const r = await surfaceResearchPack(db, { pageId: 6004, claimKey, currentRevisionId: 800 });
    expect(r.state).toBe("unreadable");
  });
});
