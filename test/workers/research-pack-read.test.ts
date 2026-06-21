// ABOUTME: Workers-pool test for handlePackRead — the drift-aware surfacing read against real Miniflare D1.
// ABOUTME: Asserts a current pack surfaces verified cards, an advanced article returns revision_drift (never silent empty).
import { describe, it, expect } from "vitest";
import { testEnv } from "./test-env";
import { d1Executor } from "../../src/db/client";
import { upsertArticle } from "../../src/db/articles";
import { insertPackIfAbsent, computeClaimKey } from "../../src/db/research-packs";
import { handlePackRead } from "../../src/app/api/research/[candidateId]/pack/route";
import type { ResearchPack } from "../../src/db/research-packs";

const SECTION = "Fleet", SENTENCE = "The fleet will reach full strength by 2025.", YEAR = 2025;

async function seed(db: ReturnType<typeof d1Executor>, pageId: number, packRev: number, articleRev: number) {
  await upsertArticle(db, { pageId, title: "T", revisionId: articleRev, fetchedAt: new Date().toISOString() });
  await db.prepare(
    "INSERT INTO stale_candidates (page_id, section_heading, sentence_text, year, marker, score, explanation, detector_version, source_revision_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(pageId, SECTION, SENTENCE, YEAR, "will", 1.5, "e", "1.0.0", packRev).run();
  const idRows = await db.prepare("SELECT id FROM stale_candidates WHERE page_id = ?").bind(pageId).all<{ id: number }>();
  const claimKey = await computeClaimKey(pageId, SECTION, SENTENCE, YEAR);
  const pack: ResearchPack = {
    claimKey, sourceRevisionId: packRev, pageId, sectionHeading: SECTION, sentenceText: SENTENCE, year: YEAR,
    providerName: "workers-ai", modelVersion: "@cf/google/gemma-4-26b-a4b-it", status: "proposals_present",
    queries: ["q"], cards: [{ url: "https://navy.mil/z", verbatimQuote: "reached full strength in 2024", advisorySupport: true }],
    dispositions: [], evaluatedAt: new Date().toISOString(),
  };
  await insertPackIfAbsent(db, pack);
  return idRows[0].id;
}

describe("handlePackRead (real Miniflare D1)", () => {
  it("returns 200 surfaced with verified cards when the pack matches the current revision", async () => {
    const db = d1Executor(testEnv.DB);
    const id = await seed(db, 7101, 900, 900);
    const res = await handlePackRead(db, id);
    expect(res.status).toBe(200);
    const body = await res.json() as { state: string; cards: unknown[] };
    expect(body.state).toBe("surfaced");
    expect(body.cards).toEqual([{ url: "https://navy.mil/z", verbatimQuote: "reached full strength in 2024", advisorySupport: true }]);
  });

  it("returns 200 with state revision_drift (never a silent empty) when the article advanced past the pack", async () => {
    const db = d1Executor(testEnv.DB);
    const id = await seed(db, 7102, 900, 950);
    const res = await handlePackRead(db, id);
    expect(res.status).toBe(200);
    const body = await res.json() as { state: string; packRevisionId: number; currentRevisionId: number };
    expect(body.state).toBe("revision_drift");
    expect(body.packRevisionId).toBe(900);
    expect(body.currentRevisionId).toBe(950);
  });

  it("returns 404 for an unknown candidate id", async () => {
    const db = d1Executor(testEnv.DB);
    const res = await handlePackRead(db, 777777);
    expect(res.status).toBe(404);
  });
});
