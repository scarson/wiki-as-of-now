// ABOUTME: Tests for getArticleByPageId — single-article read by natural key (page_id) against real D1.
// ABOUTME: The pack-read route needs the article's current revisionId for drift re-validation.
import { describe, it, expect } from "vitest";
import { freshTestExecutor } from "../helpers/db";
import { upsertArticle, getArticleByPageId } from "../../src/db/articles";

describe("getArticleByPageId", () => {
  it("returns the article record (incl. current revisionId) for a known page", async () => {
    const db = freshTestExecutor();
    await upsertArticle(db, { pageId: 77, title: "Zumwalt", revisionId: 9050, fetchedAt: "2026-06-13T00:00:00Z" });
    const a = await getArticleByPageId(db, 77);
    expect(a).toEqual({ pageId: 77, title: "Zumwalt", revisionId: 9050, fetchedAt: "2026-06-13T00:00:00Z" });
  });
  it("returns null for an unknown page (no throw)", async () => {
    const db = freshTestExecutor();
    expect(await getArticleByPageId(db, 999999)).toBeNull();
  });
});
