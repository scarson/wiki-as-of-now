// ABOUTME: Tests for getVerdict — persisted eligibility-verdict read for one (page, revision, gateVersion).
// ABOUTME: Covers easy_win, human_only with reason codes, the absent (null) path, and a corrupt reasons_json defensive read.
import { describe, it, expect } from "vitest";
import { freshTestExecutor } from "../helpers/db";
import { upsertArticle } from "../../src/db/articles";
import { upsertVerdict, getVerdict } from "../../src/db/eligibility-verdicts";

// eligibility_verdicts.page_id REFERENCES articles(page_id); the FK-on test DB requires the parent row.
async function seedArticle(db: ReturnType<typeof freshTestExecutor>) {
  await upsertArticle(db, { pageId: 9, title: "T", revisionId: 100, fetchedAt: "2026-06-13T00:00:00Z" });
}

describe("getVerdict", () => {
  it("returns the persisted EligibilityDecision for a (page, revision, gateVersion)", async () => {
    const db = freshTestExecutor();
    await seedArticle(db);
    await upsertVerdict(db, { pageId: 9, revisionId: 100, gateVersion: "1.0.0", eligibility: "easy_win", reasons: [], evaluatedAt: "2026-06-13T00:00:00Z" });
    expect(await getVerdict(db, 9, 100, "1.0.0")).toEqual({ eligibility: "easy_win", reasons: [] });
  });
  it("returns a human_only decision with its reason codes when that is what was recorded", async () => {
    const db = freshTestExecutor();
    await seedArticle(db);
    await upsertVerdict(db, { pageId: 9, revisionId: 100, gateVersion: "1.0.0", eligibility: "human_only", reasons: ["blp_category"], evaluatedAt: "2026-06-13T00:00:00Z" });
    expect(await getVerdict(db, 9, 100, "1.0.0")).toEqual({ eligibility: "human_only", reasons: ["blp_category"] });
  });
  it("returns null when no verdict was recorded (route fails closed to human_only, G11)", async () => {
    const db = freshTestExecutor();
    await seedArticle(db);
    expect(await getVerdict(db, 9, 100, "1.0.0")).toBeNull();
  });
  it("returns null (pack_unreadable-style defensive read) when reasons_json is corrupt", async () => {
    const db = freshTestExecutor();
    await seedArticle(db);
    await upsertVerdict(db, { pageId: 9, revisionId: 100, gateVersion: "1.0.0", eligibility: "easy_win", reasons: [], evaluatedAt: "2026-06-13T00:00:00Z" });
    await db.prepare("UPDATE eligibility_verdicts SET reasons_json = ? WHERE page_id = 9").bind("{nope").run();
    expect(await getVerdict(db, 9, 100, "1.0.0")).toBeNull();
  });
});
