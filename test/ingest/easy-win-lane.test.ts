// ABOUTME: Tests for the easy-win lane (src/ingest/easy-win-lane.ts): Stage-1 pre-filter + Stage-2 re-fetch/re-run-gate.
// ABOUTME: Exercises the positive allowlist and every per-page outcome; fail-OPEN guards assert exclusion strictly.
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { lookupAndPersist } from "../../src/ingest/lookup";
import { getEasyWinLane, DEFAULT_MAX_PAGES, DEFAULT_FETCH_TIMEOUT_MS } from "../../src/ingest/easy-win-lane";
import { selectEasyWinPageIds } from "../../src/db/eligibility-verdicts";
import { makeAuditLog } from "../../src/db/audit-log";
import type { FetchLike } from "../../src/ingest/wikimedia";
import { freshTestExecutor } from "../helpers/db";
import { GATE_VERSION } from "../../src/safelane/eligibility";
import type { SqlExecutor } from "../../src/db/client";

const PAGE_ID = 60758751;
const REVISION_ID = 1357951754;
const FIXTURE = readFileSync("test/fixtures/artemis_program.wikitext", "utf8");
const AS_OF = 2026;
const NOW = new Date("2026-06-06T00:00:00Z");
const OLD_TS = "2020-01-01T00:00:00Z"; // far in the past → freshness never fires

/** Builds an Action-API JSON envelope for one resolved page. */
function envelope(opts: {
  pageId: number;
  title: string;
  revisionId: number;
  ns?: number;
  content?: string;
  timestamp?: string;
  categories?: { ns: number; title: string }[];
  warningsCategories?: boolean;
  missing?: boolean;
}) {
  const page: Record<string, unknown> = {
    pageid: opts.pageId,
    ns: opts.ns ?? 0,
    title: opts.title,
  };
  if (opts.missing) {
    page.missing = true;
  } else {
    page.revisions = [
      {
        revid: opts.revisionId,
        parentid: 1,
        timestamp: opts.timestamp ?? OLD_TS,
        slots: { main: { content: opts.content ?? FIXTURE } },
      },
    ];
    if (opts.categories !== undefined) page.categories = opts.categories;
  }
  const body: Record<string, unknown> = { query: { pages: [page] } };
  if (opts.warningsCategories) body.warnings = { categories: {} };
  return body;
}

/** A FetchLike serving one fixed envelope regardless of the requested title. */
function singleFetch(body: unknown): FetchLike {
  return async () => ({ ok: true, status: 200, json: async () => body });
}

/** An easy-win seed fetch for the page above (used to seed the article/candidates/verdict via lookup). */
const seedFetch: FetchLike = singleFetch(
  envelope({ pageId: PAGE_ID, title: "Artemis program", revisionId: REVISION_ID })
);

/** Routes a lane re-fetch by the `titles=` URL param to a per-title envelope body. */
function routedFetch(byTitle: Record<string, unknown>): FetchLike {
  return async (input: string) => {
    const url = new URL(input);
    const title = url.searchParams.get("titles") ?? "";
    const body = byTitle[title];
    if (body === undefined) throw new Error(`routedFetch: no envelope for title "${title}"`);
    return { ok: true, status: 200, json: async () => body };
  };
}

async function seedEasyWin(exec: SqlExecutor): Promise<void> {
  await lookupAndPersist(exec, "Artemis program", { fetchFn: seedFetch, asOfYear: AS_OF, now: NOW });
}

async function laneAuditRows(exec: SqlExecutor) {
  const rows = await makeAuditLog(exec).read();
  return rows.filter(r => r.eventType === "article.eligibility.revalidated");
}

afterEach(() => {
  vi.useRealTimers();
});

describe("getEasyWinLane", () => {
  it("surfaces a page whose re-fetch is still easy-win at the same revision (scenario 1)", async () => {
    const exec = freshTestExecutor();
    await seedEasyWin(exec);

    const result = await getEasyWinLane(exec, {
      fetchFn: seedFetch, // identical envelope: same page, same revision, no BLP
      now: NOW,
    });

    expect(result.summary.surfaced).toBe(1);
    expect(result.summary.considered).toBe(1);
    expect(result.summary.skipped).toEqual([]);
    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.pageId).toBe(PAGE_ID);
    expect(item.title).toBe("Artemis program");
    expect(item.revisionId).toBe(REVISION_ID);
    expect(item.candidates.length).toBeGreaterThan(0);
    item.candidates.forEach(c => {
      expect(c.pageId).toBe(PAGE_ID);
      expect(c.sourceRevisionId).toBe(REVISION_ID);
    });

    const audits = await laneAuditRows(exec);
    expect(audits).toHaveLength(1);
    expect(audits[0].payload).toMatchObject({ pageId: PAGE_ID, outcome: "surfaced", eligibility: "easy_win" });
    // identifiers/codes only — no title or content
    expect(JSON.stringify(audits[0].payload)).not.toMatch(/Artemis|will|expected|scheduled/);
  });

  it("EXCLUDES a page whose re-fetch is now BLP-present, refreshing the verdict to human_only (scenario 2)", async () => {
    const exec = freshTestExecutor();
    await seedEasyWin(exec);

    const blpBody = envelope({
      pageId: PAGE_ID,
      title: "Artemis program",
      revisionId: REVISION_ID,
      categories: [{ ns: 14, title: "Category:Living people" }],
    });

    const result = await getEasyWinLane(exec, { fetchFn: singleFetch(blpBody), now: NOW });

    // MUST-NOT-WEAKEN: page is NOT surfaced.
    expect(result.items).toHaveLength(0);
    expect(result.summary.surfaced).toBe(0);
    expect(result.summary.skipped).toEqual([{ pageId: PAGE_ID, outcome: "demoted" }]);

    // The persisted verdict for the same revision was overwritten to human_only(blp_category).
    const verdicts = await exec
      .prepare("SELECT eligibility, reasons_json FROM eligibility_verdicts WHERE page_id = ? AND revision_id = ? AND gate_version = ?")
      .bind(PAGE_ID, REVISION_ID, GATE_VERSION)
      .all<{ eligibility: string; reasons_json: string }>();
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].eligibility).toBe("human_only");
    expect(JSON.parse(verdicts[0].reasons_json)).toContain("blp_category");

    // And Stage-1 no longer selects it (self-heal via the overwrite).
    expect(await selectEasyWinPageIds(exec, GATE_VERSION)).not.toContain(PAGE_ID);

    const audits = await laneAuditRows(exec);
    expect(audits).toHaveLength(1);
    expect(audits[0].payload).toMatchObject({ pageId: PAGE_ID, outcome: "demoted", eligibility: "human_only" });
  });

  it("EXCLUDES a page whose re-fetch BLP probe is unknown (metadata_unavailable) (scenario 3)", async () => {
    const exec = freshTestExecutor();
    await seedEasyWin(exec);

    const unknownBody = envelope({
      pageId: PAGE_ID,
      title: "Artemis program",
      revisionId: REVISION_ID,
      warningsCategories: true, // → blpProbe "unknown"
    });

    const result = await getEasyWinLane(exec, { fetchFn: singleFetch(unknownBody), now: NOW });

    // MUST-NOT-WEAKEN: fail-CLOSED on the metadata_unavailable case — not surfaced.
    expect(result.items).toHaveLength(0);
    expect(result.summary.surfaced).toBe(0);
    expect(result.summary.skipped).toEqual([{ pageId: PAGE_ID, outcome: "demoted" }]);

    const audits = await laneAuditRows(exec);
    expect(audits).toHaveLength(1);
    expect(audits[0].payload).toMatchObject({ pageId: PAGE_ID, outcome: "demoted", eligibility: "human_only" });
    expect((audits[0].payload as { reasons: string[] }).reasons).toContain("metadata_unavailable");
  });

  it("EXCLUDES a page whose re-fetch resolves to a DIFFERENT pageid (identity mismatch) (scenario 4)", async () => {
    const exec = freshTestExecutor();
    await seedEasyWin(exec);

    const reboundBody = envelope({
      pageId: PAGE_ID + 1, // rename/redirect bounced the title to a different page
      title: "Artemis program",
      revisionId: REVISION_ID,
    });

    const result = await getEasyWinLane(exec, { fetchFn: singleFetch(reboundBody), now: NOW });

    // MUST-NOT-WEAKEN: identity mismatch → never surface.
    expect(result.items).toHaveLength(0);
    expect(result.summary.surfaced).toBe(0);
    expect(result.summary.skipped).toEqual([{ pageId: PAGE_ID, outcome: "demoted" }]);

    const audits = await laneAuditRows(exec);
    expect(audits).toHaveLength(1);
    expect(audits[0].payload).toMatchObject({ pageId: PAGE_ID, outcome: "demoted" });
    expect((audits[0].payload as { reasons: string[] }).reasons).toContain("identity_mismatch");
  });

  it("EXCLUDES a page whose re-fetch is a newer revision (revision drift), prunes the stale verdict, leaves articles.revision_id unchanged (scenario 5)", async () => {
    const exec = freshTestExecutor();
    await seedEasyWin(exec);

    const driftBody = envelope({
      pageId: PAGE_ID,
      title: "Artemis program",
      revisionId: REVISION_ID + 1, // newer live revision; still ns 0, no BLP → re-run easy_win
    });

    const result = await getEasyWinLane(exec, { fetchFn: singleFetch(driftBody), now: NOW });

    // MUST-NOT-WEAKEN: not surfaced; classified as revision_drift.
    expect(result.items).toHaveLength(0);
    expect(result.summary.skipped).toEqual([{ pageId: PAGE_ID, outcome: "revision_drift" }]);

    // articles.revision_id is UNCHANGED (no reprocessing here).
    const article = await exec
      .prepare("SELECT revision_id FROM articles WHERE page_id = ?")
      .bind(PAGE_ID)
      .all<{ revision_id: number }>();
    expect(article[0].revision_id).toBe(REVISION_ID);

    // The stale (page, stored_revision, gate) verdict was pruned so Stage-1 stops re-selecting.
    expect(await selectEasyWinPageIds(exec, GATE_VERSION)).not.toContain(PAGE_ID);

    const audits = await laneAuditRows(exec);
    expect(audits[0].payload).toMatchObject({ pageId: PAGE_ID, outcome: "revision_drift", eligibility: "easy_win" });
  });

  it("EXCLUDES a gone page (ArticleNotFoundError), deletes its verdict, and still surfaces a healthy sibling (scenario 6)", async () => {
    const exec = freshTestExecutor();
    // Seed the primary easy-win page.
    await seedEasyWin(exec);
    // Seed a second, distinct easy-win page.
    const SIBLING_ID = PAGE_ID + 100;
    const SIBLING_REV = REVISION_ID + 100;
    await lookupAndPersist(exec, "Europa Clipper", {
      fetchFn: singleFetch(
        envelope({ pageId: SIBLING_ID, title: "Europa Clipper", revisionId: SIBLING_REV })
      ),
      asOfYear: AS_OF,
      now: NOW,
    });

    const fetchFn = routedFetch({
      "Artemis program": envelope({ pageId: PAGE_ID, title: "Artemis program", revisionId: REVISION_ID, missing: true }),
      "Europa Clipper": envelope({ pageId: SIBLING_ID, title: "Europa Clipper", revisionId: SIBLING_REV }),
    });

    const result = await getEasyWinLane(exec, { fetchFn, now: NOW });

    // The gone page is excluded; the sibling still surfaces (per-page isolation).
    expect(result.summary.skipped).toContainEqual({ pageId: PAGE_ID, outcome: "article_gone" });
    expect(result.items.map(i => i.pageId)).toEqual([SIBLING_ID]);
    expect(result.summary.surfaced).toBe(1);

    // The gone page's stale verdict was deleted → Stage-1 no longer returns it.
    const remaining = await selectEasyWinPageIds(exec, GATE_VERSION);
    expect(remaining).not.toContain(PAGE_ID);
    expect(remaining).toContain(SIBLING_ID);
  });

  it("EXCLUDES a transiently-unavailable page (WikimediaUnavailableError) WITHOUT deleting its verdict; other pages still returned (scenario 7)", async () => {
    const exec = freshTestExecutor();
    await seedEasyWin(exec);
    const SIBLING_ID = PAGE_ID + 100;
    const SIBLING_REV = REVISION_ID + 100;
    await lookupAndPersist(exec, "Europa Clipper", {
      fetchFn: singleFetch(
        envelope({ pageId: SIBLING_ID, title: "Europa Clipper", revisionId: SIBLING_REV })
      ),
      asOfYear: AS_OF,
      now: NOW,
    });

    const fetchFn: FetchLike = async (input: string) => {
      const title = new URL(input).searchParams.get("titles") ?? "";
      if (title === "Artemis program") {
        return { ok: false, status: 503, json: async () => ({}) }; // → WikimediaUnavailableError
      }
      return {
        ok: true,
        status: 200,
        json: async () => envelope({ pageId: SIBLING_ID, title: "Europa Clipper", revisionId: SIBLING_REV }),
      };
    };

    const result = await getEasyWinLane(exec, { fetchFn, now: NOW });

    expect(result.summary.skipped).toContainEqual({ pageId: PAGE_ID, outcome: "fetch_unavailable" });
    expect(result.items.map(i => i.pageId)).toEqual([SIBLING_ID]);

    // Transient: the verdict row is NOT deleted — Stage-1 still includes the page once reachable.
    expect(await selectEasyWinPageIds(exec, GATE_VERSION)).toContain(PAGE_ID);
    const verdicts = await exec
      .prepare("SELECT 1 AS one FROM eligibility_verdicts WHERE page_id = ? AND revision_id = ? AND gate_version = ?")
      .bind(PAGE_ID, REVISION_ID, GATE_VERSION)
      .all<{ one: number }>();
    expect(verdicts).toHaveLength(1);
  });

  it("treats a hung re-fetch as fetch_unavailable, returns promptly, and produces no unhandled rejection (scenario 8)", async () => {
    const exec = freshTestExecutor();
    await seedEasyWin(exec);

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);

    const neverResolves: FetchLike = () => new Promise(() => {});

    try {
      const start = Date.now();
      const result = await getEasyWinLane(exec, { fetchFn: neverResolves, now: NOW, fetchTimeoutMs: 5 });
      const elapsed = Date.now() - start;

      expect(result.items).toHaveLength(0);
      expect(result.summary.skipped).toEqual([{ pageId: PAGE_ID, outcome: "fetch_unavailable" }]);
      expect(elapsed).toBeLessThan(1000); // returns promptly, no hang

      // Give any stray microtask/late rejection a tick to surface.
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(unhandled).toEqual([]);

      const audits = await laneAuditRows(exec);
      expect(audits[0].payload).toMatchObject({ pageId: PAGE_ID, outcome: "fetch_unavailable" });
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("reports summary counts; empty-healthy (no eligible pages) is distinguishable from all-skipped (scenario 9)", async () => {
    // Empty-healthy: no pages seeded → nothing eligible.
    const emptyExec = freshTestExecutor();
    const emptyResult = await getEasyWinLane(emptyExec, { fetchFn: seedFetch, now: NOW });
    expect(emptyResult.items).toEqual([]);
    expect(emptyResult.summary).toEqual({ considered: 0, surfaced: 0, deferred: 0, skipped: [] });

    // All-skipped: one eligible page, but the re-fetch demotes it.
    const skippedExec = freshTestExecutor();
    await seedEasyWin(skippedExec);
    const blpBody = envelope({
      pageId: PAGE_ID,
      title: "Artemis program",
      revisionId: REVISION_ID,
      categories: [{ ns: 14, title: "Category:Living people" }],
    });
    const skippedResult = await getEasyWinLane(skippedExec, { fetchFn: singleFetch(blpBody), now: NOW });
    expect(skippedResult.items).toEqual([]);
    expect(skippedResult.summary.considered).toBe(1);
    expect(skippedResult.summary.surfaced).toBe(0);
    expect(skippedResult.summary.skipped).toEqual([{ pageId: PAGE_ID, outcome: "demoted" }]);
    // Distinguishable: empty-healthy has considered 0 and empty skipped; all-skipped has considered 1 and a populated skipped.
    expect(emptyResult.summary.considered).not.toBe(skippedResult.summary.considered);
  });

  it("caps fan-out at maxPages, defers the rest, and re-fetches only maxPages pages (scenario 10)", async () => {
    const exec = freshTestExecutor();
    // Seed two eligible pages.
    await seedEasyWin(exec); // PAGE_ID
    const SECOND_ID = PAGE_ID + 100;
    const SECOND_REV = REVISION_ID + 100;
    await lookupAndPersist(exec, "Europa Clipper", {
      fetchFn: singleFetch(envelope({ pageId: SECOND_ID, title: "Europa Clipper", revisionId: SECOND_REV })),
      asOfYear: AS_OF,
      now: NOW,
    });

    let fetchCalls = 0;
    const countingFetch: FetchLike = async (input: string) => {
      fetchCalls += 1;
      const title = new URL(input).searchParams.get("titles") ?? "";
      const body =
        title === "Europa Clipper"
          ? envelope({ pageId: SECOND_ID, title: "Europa Clipper", revisionId: SECOND_REV })
          : envelope({ pageId: PAGE_ID, title: "Artemis program", revisionId: REVISION_ID });
      return { ok: true, status: 200, json: async () => body };
    };

    const result = await getEasyWinLane(exec, { fetchFn: countingFetch, now: NOW, maxPages: 1 });

    expect(result.summary.considered).toBe(1);
    expect(result.summary.deferred).toBe(1); // total (2) - maxPages (1)
    expect(fetchCalls).toBe(1); // only maxPages pages were re-fetched
    expect(result.summary.surfaced).toBe(1);
  });

  it("exposes named, sane defaults for the fan-out cap and per-page timeout", () => {
    expect(DEFAULT_MAX_PAGES).toBe(25);
    expect(DEFAULT_FETCH_TIMEOUT_MS).toBe(10_000);
  });
});
