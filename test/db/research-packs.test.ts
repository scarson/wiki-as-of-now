// ABOUTME: Tests for the research_packs persistence module (src/db/research-packs.ts).
// ABOUTME: Covers computeClaimKey determinism, write-once insert, defensive read, deletion, and revision-match surfacing.
import { describe, it, expect, vi } from "vitest";
import {
  computeClaimKey,
  insertPackIfAbsent,
  insertPackStatement,
  packExists,
  getPack,
  deletePack,
  getSurfaceablePack,
  type ResearchPack,
} from "../../src/db/research-packs";
import { upsertArticle } from "../../src/db/articles";
import { freshTestExecutor } from "../helpers/db";
import { allowConsole } from "../setup/pristine";
import type { EvidenceCard } from "../../src/research/provider";
import type { DroppedProposal } from "../../src/research/verify-proposal";
import { MIN_QUOTE_LEN, MAX_QUOTE_LEN } from "../../src/research/verbatim-check";
import { CONTEXT_SIDE_CAP } from "../../src/research/quote-context";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function article(pageId: number, revisionId: number = 100) {
  return {
    pageId,
    title: `Article ${pageId}`,
    revisionId,
    fetchedAt: "2026-06-06T00:00:00.000Z",
  };
}

function makePack(overrides: Partial<ResearchPack> = {}): ResearchPack {
  return {
    claimKey: "abc123deadbeef",
    sourceRevisionId: 100,
    pageId: 1,
    sectionHeading: "History",
    sentenceText: "The fleet will reach full strength.",
    year: 2017,
    providerName: "fake-provider",
    modelVersion: "fake-provider/0",
    status: "no_proposals",
    queries: ["query one"],
    cards: [],
    dispositions: [],
    evaluatedAt: "2026-06-06T00:00:00.000Z",
    ...overrides,
  };
}

const VALID_CARD: EvidenceCard = {
  url: "https://example.com/source",
  verbatimQuote: "The fleet reached full strength by 2017.",
  advisorySupport: true,
  contextBefore: null,
  contextAfter: null,
};

const VALID_DROPPED: DroppedProposal = {
  url: "https://example.com/other",
  reason: "quote_not_found",
};

// ---------------------------------------------------------------------------
// computeClaimKey
// ---------------------------------------------------------------------------

describe("computeClaimKey", () => {
  it("returns a 64-character hex string", async () => {
    const key = await computeClaimKey(1, "History", "sentence", 2024);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("same inputs produce identical hex", async () => {
    const k1 = await computeClaimKey(42, "Background", "The fleet will deploy.", 2019);
    const k2 = await computeClaimKey(42, "Background", "The fleet will deploy.", 2019);
    expect(k1).toBe(k2);
  });

  it("changing pageId changes the key", async () => {
    const k1 = await computeClaimKey(1, "Background", "sentence", 2019);
    const k2 = await computeClaimKey(2, "Background", "sentence", 2019);
    expect(k1).not.toBe(k2);
  });

  it("changing sectionHeading changes the key", async () => {
    const k1 = await computeClaimKey(1, "History", "sentence", 2019);
    const k2 = await computeClaimKey(1, "Background", "sentence", 2019);
    expect(k1).not.toBe(k2);
  });

  it("changing sentenceText changes the key", async () => {
    const k1 = await computeClaimKey(1, "History", "sentence A", 2019);
    const k2 = await computeClaimKey(1, "History", "sentence B", 2019);
    expect(k1).not.toBe(k2);
  });

  it("changing year changes the key", async () => {
    const k1 = await computeClaimKey(1, "History", "sentence", 2019);
    const k2 = await computeClaimKey(1, "History", "sentence", 2020);
    expect(k1).not.toBe(k2);
  });

  it("NFC normalization: decomposed vs precomposed accent in sectionHeading yields the same key", async () => {
    // é = precomposed é; é = e + combining acute accent (NFD form)
    const precomposed = "résumé";
    const decomposed = "résumé";
    const k1 = await computeClaimKey(1, precomposed, "x", 2024);
    const k2 = await computeClaimKey(1, decomposed, "x", 2024);
    expect(k1).toBe(k2);
  });

  it("NFC normalization: decomposed vs precomposed accent in sentenceText yields the same key", async () => {
    const precomposed = "café";
    const decomposed = "café";
    const k1 = await computeClaimKey(1, "sec", precomposed, 2024);
    const k2 = await computeClaimKey(1, "sec", decomposed, 2024);
    expect(k1).toBe(k2);
  });

  it("field-boundary: adjacent fields are disambiguated (no length-prefix collision)", async () => {
    // Without length prefixes: ("12", "3", ...) and ("1", "23", ...) would produce
    // the same concatenated bytes; with byte-length-prefixed encoding they differ.
    const k1 = await computeClaimKey(12, "3History", "sentence", 2019);
    const k2 = await computeClaimKey(1, "23History", "sentence", 2019);
    expect(k1).not.toBe(k2);
  });
});

// ---------------------------------------------------------------------------
// insertPackIfAbsent / getPack round-trip
// ---------------------------------------------------------------------------

describe("insertPackIfAbsent", () => {
  it("writes a pack; getPack round-trips it (including queries, cards, dispositions)", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));
    const pack = makePack({
      queries: ["search one", "search two"],
      cards: [VALID_CARD],
      dispositions: [VALID_DROPPED],
    });
    await insertPackIfAbsent(exec, pack);

    const result = await getPack(exec, pack.claimKey, pack.sourceRevisionId);
    expect(result.state).toBe("found");
    if (result.state !== "found") return;
    const r = result.pack;
    expect(r.claimKey).toBe(pack.claimKey);
    expect(r.sourceRevisionId).toBe(pack.sourceRevisionId);
    expect(r.pageId).toBe(pack.pageId);
    expect(r.sectionHeading).toBe(pack.sectionHeading);
    expect(r.sentenceText).toBe(pack.sentenceText);
    expect(r.year).toBe(pack.year);
    expect(r.providerName).toBe(pack.providerName);
    expect(r.modelVersion).toBe(pack.modelVersion);
    expect(r.status).toBe(pack.status);
    expect(r.queries).toEqual(pack.queries);
    expect(r.cards).toEqual(pack.cards);
    expect(r.dispositions).toEqual(pack.dispositions);
    expect(r.evaluatedAt).toBe(pack.evaluatedAt);
  });

  it("getPack returns not_found for a non-existent (claimKey, sourceRevisionId)", async () => {
    const exec = freshTestExecutor();
    const result = await getPack(exec, "nonexistent", 1);
    expect(result.state).toBe("not_found");
  });

  it("re-insert of the same (claim_key, source_revision_id) is a NO-OP — original pack is preserved", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));

    const packA = makePack({
      claimKey: "same-key",
      sourceRevisionId: 100,
      queries: ["original query"],
      cards: [VALID_CARD],
      status: "proposals_present",
    });
    await insertPackIfAbsent(exec, packA);

    // Pack B has same PK but different content — should be silently ignored.
    const packB = makePack({
      claimKey: "same-key",
      sourceRevisionId: 100,
      queries: ["overwrite attempt"],
      cards: [],
      status: "no_proposals",
    });
    await insertPackIfAbsent(exec, packB);

    const result = await getPack(exec, "same-key", 100);
    expect(result.state).toBe("found");
    if (result.state !== "found") return;
    // Original pack A must be preserved.
    expect(result.pack.queries).toEqual(["original query"]);
    expect(result.pack.cards).toEqual([VALID_CARD]);
    expect(result.pack.status).toBe("proposals_present");
  });

  it("different source_revision_id for the same claim_key creates a separate row (both retrievable)", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1, 100));
    // We need a second articles row for rev 200 — upsert updates in place.
    await upsertArticle(exec, article(1, 200));

    const packRev100 = makePack({ claimKey: "shared-key", sourceRevisionId: 100, queries: ["rev100 query"] });
    const packRev200 = makePack({ claimKey: "shared-key", sourceRevisionId: 200, queries: ["rev200 query"] });

    await insertPackIfAbsent(exec, packRev100);
    await insertPackIfAbsent(exec, packRev200);

    const r100 = await getPack(exec, "shared-key", 100);
    const r200 = await getPack(exec, "shared-key", 200);

    expect(r100.state).toBe("found");
    expect(r200.state).toBe("found");
    if (r100.state !== "found" || r200.state !== "found") return;
    expect(r100.pack.queries).toEqual(["rev100 query"]);
    expect(r200.pack.queries).toEqual(["rev200 query"]);
  });

  it("rejects insert when page_id has no articles row (FK enforcement)", async () => {
    const exec = freshTestExecutor();
    const pack = makePack({ pageId: 9999 });
    await expect(insertPackIfAbsent(exec, pack)).rejects.toThrow(/FOREIGN KEY/i);
  });
});

// ---------------------------------------------------------------------------
// insertPackStatement — returns a bound statement without executing
// ---------------------------------------------------------------------------

describe("insertPackStatement", () => {
  it("building the statement does NOT insert the row — packExists is false before .run()", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));
    const pack = makePack({ claimKey: "stmt-build-test", pageId: 1 });

    // Build the statement — must not execute
    insertPackStatement(exec, pack);

    // Row must not exist yet
    expect(await packExists(exec, pack.claimKey, pack.sourceRevisionId)).toBe(false);
    const before = await getPack(exec, pack.claimKey, pack.sourceRevisionId);
    expect(before.state).toBe("not_found");
  });

  it("calling .run() on the built statement inserts the row (same data as insertPackIfAbsent)", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));
    const pack = makePack({
      claimKey: "stmt-run-test",
      pageId: 1,
      queries: ["q1", "q2"],
      cards: [VALID_CARD],
      dispositions: [VALID_DROPPED],
      status: "proposals_present",
    });

    const stmt = insertPackStatement(exec, pack);

    // Still absent before run
    expect(await packExists(exec, pack.claimKey, pack.sourceRevisionId)).toBe(false);

    await stmt.run();

    // Now present — full round-trip
    const result = await getPack(exec, pack.claimKey, pack.sourceRevisionId);
    expect(result.state).toBe("found");
    if (result.state !== "found") return;
    expect(result.pack.claimKey).toBe(pack.claimKey);
    expect(result.pack.queries).toEqual(pack.queries);
    expect(result.pack.cards).toEqual(pack.cards);
    expect(result.pack.dispositions).toEqual(pack.dispositions);
    expect(result.pack.status).toBe("proposals_present");
  });

  it("is idempotent (ON CONFLICT DO NOTHING) — running twice does not error and preserves original row", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));
    const pack = makePack({ claimKey: "stmt-idempotent-test", pageId: 1, queries: ["first"] });

    await insertPackStatement(exec, pack).run();

    // Second run: same PK, different content — should be silently ignored
    const pack2 = makePack({ claimKey: "stmt-idempotent-test", pageId: 1, queries: ["second-attempt"] });
    await expect(insertPackStatement(exec, pack2).run()).resolves.toBeUndefined();

    const result = await getPack(exec, pack.claimKey, pack.sourceRevisionId);
    expect(result.state).toBe("found");
    if (result.state !== "found") return;
    expect(result.pack.queries).toEqual(["first"]); // original preserved
  });
});

// ---------------------------------------------------------------------------
// packExists
// ---------------------------------------------------------------------------

describe("packExists", () => {
  it("returns true after inserting a pack for (claimKey, sourceRevisionId)", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));
    const pack = makePack({ claimKey: "exists-key", sourceRevisionId: 100 });
    await insertPackIfAbsent(exec, pack);
    expect(await packExists(exec, "exists-key", 100)).toBe(true);
  });

  it("returns false when no row exists for that (claimKey, sourceRevisionId)", async () => {
    const exec = freshTestExecutor();
    expect(await packExists(exec, "no-such-key", 100)).toBe(false);
  });

  it("returns false for the same claimKey but a different sourceRevisionId", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));
    const pack = makePack({ claimKey: "pk-test-key", sourceRevisionId: 100 });
    await insertPackIfAbsent(exec, pack);
    expect(await packExists(exec, "pk-test-key", 200)).toBe(false);
  });

  it("returns false for the same sourceRevisionId but a different claimKey", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));
    const pack = makePack({ claimKey: "exact-key", sourceRevisionId: 100 });
    await insertPackIfAbsent(exec, pack);
    expect(await packExists(exec, "other-key", 100)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Defensive read: pack_unreadable on corrupt JSON
// ---------------------------------------------------------------------------

describe("getPack — defensive read", () => {
  it("returns pack_unreadable (not throw) when cards_json is invalid JSON", async () => {
    // Silence any console.error the implementation may emit when catching the parse error.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));
    // Insert a valid pack first via the module so we get the row.
    const pack = makePack();
    await insertPackIfAbsent(exec, pack);
    // Corrupt cards_json directly via the executor.
    await exec
      .prepare("UPDATE research_packs SET cards_json = ? WHERE claim_key = ? AND source_revision_id = ?")
      .bind("not valid json {{{", pack.claimKey, pack.sourceRevisionId)
      .run();

    const result = await getPack(exec, pack.claimKey, pack.sourceRevisionId);
    expect(result.state).toBe("pack_unreadable");
    spy.mockRestore();
  });

  it("returns pack_unreadable (not throw) when queries_json is invalid JSON", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));
    const pack = makePack();
    await insertPackIfAbsent(exec, pack);
    await exec
      .prepare("UPDATE research_packs SET queries_json = ? WHERE claim_key = ? AND source_revision_id = ?")
      .bind("{{bad", pack.claimKey, pack.sourceRevisionId)
      .run();

    const result = await getPack(exec, pack.claimKey, pack.sourceRevisionId);
    expect(result.state).toBe("pack_unreadable");
    spy.mockRestore();
  });

  it("returns pack_unreadable (not throw) when dispositions_json is invalid JSON", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));
    const pack = makePack();
    await insertPackIfAbsent(exec, pack);
    await exec
      .prepare("UPDATE research_packs SET dispositions_json = ? WHERE claim_key = ? AND source_revision_id = ?")
      .bind("{{bad", pack.claimKey, pack.sourceRevisionId)
      .run();

    const result = await getPack(exec, pack.claimKey, pack.sourceRevisionId);
    expect(result.state).toBe("pack_unreadable");
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Read-time cap validation (G16 backstop)
// ---------------------------------------------------------------------------

describe("getPack — read-time verbatim quote length validation", () => {
  it("returns pack_unreadable when a card's verbatimQuote exceeds MAX_QUOTE_LEN code points", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));

    // Build a card with a quote that is one code point over the cap.
    const longQuote = "a".repeat(MAX_QUOTE_LEN + 1);
    const overCapCard: EvidenceCard = { url: "https://example.com", verbatimQuote: longQuote, advisorySupport: false, contextBefore: null, contextAfter: null };
    const pack = makePack({ cards: [overCapCard], status: "proposals_present" });

    // Bypass the module's own validation by inserting directly.
    await exec
      .prepare(
        "INSERT INTO research_packs (claim_key, source_revision_id, page_id, section_heading, sentence_text, year, provider_name, model_version, status, queries_json, cards_json, dispositions_json, evaluated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        pack.claimKey, pack.sourceRevisionId, pack.pageId, pack.sectionHeading,
        pack.sentenceText, pack.year, pack.providerName, pack.modelVersion,
        pack.status, JSON.stringify(pack.queries), JSON.stringify(pack.cards),
        JSON.stringify(pack.dispositions), pack.evaluatedAt
      )
      .run();

    const result = await getPack(exec, pack.claimKey, pack.sourceRevisionId);
    expect(result.state).toBe("pack_unreadable");
    spy.mockRestore();
  });

  it("returns pack_unreadable when a card's verbatimQuote is shorter than MIN_QUOTE_LEN code points", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));

    // Minimum length is MIN_QUOTE_LEN; one shorter should be rejected.
    const shortQuote = "a".repeat(MIN_QUOTE_LEN - 1);
    const underCapCard: EvidenceCard = { url: "https://example.com", verbatimQuote: shortQuote, advisorySupport: false, contextBefore: null, contextAfter: null };
    const pack = makePack({ claimKey: "short-quote-key", cards: [underCapCard], status: "proposals_present" });

    await exec
      .prepare(
        "INSERT INTO research_packs (claim_key, source_revision_id, page_id, section_heading, sentence_text, year, provider_name, model_version, status, queries_json, cards_json, dispositions_json, evaluated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        pack.claimKey, pack.sourceRevisionId, pack.pageId, pack.sectionHeading,
        pack.sentenceText, pack.year, pack.providerName, pack.modelVersion,
        pack.status, JSON.stringify(pack.queries), JSON.stringify(pack.cards),
        JSON.stringify(pack.dispositions), pack.evaluatedAt
      )
      .run();

    const result = await getPack(exec, pack.claimKey, pack.sourceRevisionId);
    expect(result.state).toBe("pack_unreadable");
    spy.mockRestore();
  });

  it("both valid status values round-trip correctly (no_proposals and proposals_present)", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));

    const packA = makePack({ claimKey: "no-proposals-key", status: "no_proposals" });
    const packB = makePack({ claimKey: "proposals-present-key", status: "proposals_present", cards: [VALID_CARD] });
    await insertPackIfAbsent(exec, packA);
    await insertPackIfAbsent(exec, packB);

    const rA = await getPack(exec, "no-proposals-key", 100);
    const rB = await getPack(exec, "proposals-present-key", 100);
    expect(rA.state).toBe("found");
    expect(rB.state).toBe("found");
    if (rA.state === "found") expect(rA.pack.status).toBe("no_proposals");
    if (rB.state === "found") expect(rB.pack.status).toBe("proposals_present");
  });

  it("returns pack_unreadable when a card's contextBefore exceeds CONTEXT_SIDE_CAP code points", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));

    const overCap = "x".repeat(CONTEXT_SIDE_CAP + 1);
    const overCapCard: EvidenceCard = {
      url: "https://example.com", verbatimQuote: "The fleet reached full strength by 2017.",
      advisorySupport: false, contextBefore: overCap, contextAfter: null,
    };
    const pack = makePack({ claimKey: "over-cap-context-key", cards: [overCapCard], status: "proposals_present" });

    await exec
      .prepare(
        "INSERT INTO research_packs (claim_key, source_revision_id, page_id, section_heading, sentence_text, year, provider_name, model_version, status, queries_json, cards_json, dispositions_json, evaluated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        pack.claimKey, pack.sourceRevisionId, pack.pageId, pack.sectionHeading,
        pack.sentenceText, pack.year, pack.providerName, pack.modelVersion,
        pack.status, JSON.stringify(pack.queries), JSON.stringify(pack.cards),
        JSON.stringify(pack.dispositions), pack.evaluatedAt
      )
      .run();

    const result = await getPack(exec, pack.claimKey, pack.sourceRevisionId);
    expect(result.state).toBe("pack_unreadable");
    spy.mockRestore();
  });

  it("reads back a card with null context and an in-cap contextAfter", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));

    const card: EvidenceCard = {
      url: "https://example.com", verbatimQuote: "The fleet reached full strength by 2017.",
      advisorySupport: true, contextBefore: null, contextAfter: " after a refit.",
    };
    const pack = makePack({ claimKey: "ok-context-key", cards: [card], status: "proposals_present" });
    await insertPackIfAbsent(exec, pack);

    const result = await getPack(exec, "ok-context-key", 100);
    expect(result.state).toBe("found");
    if (result.state === "found") {
      expect(result.pack.cards[0].contextBefore).toBeNull();
      expect(result.pack.cards[0].contextAfter).toBe(" after a refit.");
    }
  });
});

// ---------------------------------------------------------------------------
// Defensive read: valid JSON but NOT an array / malformed card shapes
// ---------------------------------------------------------------------------

describe("getPack — defensive read: valid JSON non-array and malformed card shapes", () => {
  // Helper to insert a row directly (bypassing the module's own validation)
  async function insertRawRow(
    exec: ReturnType<typeof freshTestExecutor>,
    overrides: {
      claimKey?: string;
      queriesJson?: string;
      cardsJson?: string;
      dispositionsJson?: string;
    } = {}
  ) {
    const pk = overrides.claimKey ?? "raw-row-key";
    await exec
      .prepare(
        "INSERT INTO research_packs " +
          "(claim_key, source_revision_id, page_id, section_heading, sentence_text, year, " +
          "provider_name, model_version, status, queries_json, cards_json, dispositions_json, evaluated_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        pk,
        100,
        1,
        "History",
        "The fleet reached full strength.",
        2017,
        "fake-provider",
        "fake-provider/0",
        "no_proposals",
        overrides.queriesJson ?? "[]",
        overrides.cardsJson ?? "[]",
        overrides.dispositionsJson ?? "[]",
        "2026-06-06T00:00:00.000Z"
      )
      .run();
    return { claimKey: pk, sourceRevisionId: 100 };
  }

  it("returns pack_unreadable when cards_json is valid JSON but NOT an array (a string)", async () => {
    allowConsole();
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));
    const { claimKey, sourceRevisionId } = await insertRawRow(exec, {
      claimKey: "string-cards-key",
      // Valid JSON, not an array — JSON.parse succeeds; the Array.isArray check fires
      cardsJson: '"a string, valid JSON, not an array"',
    });
    const result = await getPack(exec, claimKey, sourceRevisionId);
    expect(result.state).toBe("pack_unreadable");
  });

  it("returns pack_unreadable when queries_json is valid JSON but NOT an array (an object)", async () => {
    allowConsole();
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));
    const { claimKey, sourceRevisionId } = await insertRawRow(exec, {
      claimKey: "object-queries-key",
      // Valid JSON, not an array — JSON.parse succeeds; the Array.isArray check fires
      queriesJson: '{}',
    });
    const result = await getPack(exec, claimKey, sourceRevisionId);
    expect(result.state).toBe("pack_unreadable");
  });

  it("returns pack_unreadable when a card object is missing verbatimQuote", async () => {
    allowConsole();
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));
    // A card that is an object with url + advisorySupport but NO verbatimQuote
    const { claimKey, sourceRevisionId } = await insertRawRow(exec, {
      claimKey: "missing-quote-card-key",
      cardsJson: '[{"url":"https://x/","advisorySupport":true}]',
      // status must be proposals_present to have non-empty cards pass earlier checks
    });
    // Insert with proposals_present status so it reaches the card validation
    await exec
      .prepare(
        "UPDATE research_packs SET status = ?, cards_json = ? WHERE claim_key = ? AND source_revision_id = ?"
      )
      .bind("proposals_present", '[{"url":"https://x/","advisorySupport":true}]', claimKey, sourceRevisionId)
      .run();
    const result = await getPack(exec, claimKey, sourceRevisionId);
    expect(result.state).toBe("pack_unreadable");
  });

  it("returns pack_unreadable when a card is not an object (a number)", async () => {
    allowConsole();
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));
    const { claimKey, sourceRevisionId } = await insertRawRow(exec, {
      claimKey: "number-card-key",
      cardsJson: '[123]',
    });
    await exec
      .prepare(
        "UPDATE research_packs SET status = ?, cards_json = ? WHERE claim_key = ? AND source_revision_id = ?"
      )
      .bind("proposals_present", '[123]', claimKey, sourceRevisionId)
      .run();
    const result = await getPack(exec, claimKey, sourceRevisionId);
    expect(result.state).toBe("pack_unreadable");
  });

});

// ---------------------------------------------------------------------------
// deletePack
// ---------------------------------------------------------------------------

describe("deletePack", () => {
  it("removes exactly the targeted (claimKey, sourceRevisionId) row; sibling row survives", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));

    const packA = makePack({ claimKey: "key-a", sourceRevisionId: 100 });
    const packB = makePack({ claimKey: "key-b", sourceRevisionId: 100 });
    await insertPackIfAbsent(exec, packA);
    await insertPackIfAbsent(exec, packB);

    await deletePack(exec, "key-a", 100);

    const deletedResult = await getPack(exec, "key-a", 100);
    const survivingResult = await getPack(exec, "key-b", 100);

    expect(deletedResult.state).toBe("not_found");
    expect(survivingResult.state).toBe("found");
  });

  it("is a no-op when the targeted row does not exist (no throw)", async () => {
    const exec = freshTestExecutor();
    await expect(deletePack(exec, "nonexistent-key", 999)).resolves.toBeUndefined();
  });

  it("only removes the row matching both claimKey and sourceRevisionId — same claimKey / different revisionId survives", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1, 100));
    await upsertArticle(exec, article(1, 200));

    const packRev100 = makePack({ claimKey: "shared-key", sourceRevisionId: 100 });
    const packRev200 = makePack({ claimKey: "shared-key", sourceRevisionId: 200 });

    await insertPackIfAbsent(exec, packRev100);
    await insertPackIfAbsent(exec, packRev200);

    await deletePack(exec, "shared-key", 100);

    expect((await getPack(exec, "shared-key", 100)).state).toBe("not_found");
    expect((await getPack(exec, "shared-key", 200)).state).toBe("found");
  });
});

// ---------------------------------------------------------------------------
// getSurfaceablePack
// ---------------------------------------------------------------------------

describe("getSurfaceablePack", () => {
  it("returns found when source_revision_id matches the article's current revision_id", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1, 100));
    const pack = makePack({ claimKey: "surf-key", sourceRevisionId: 100, pageId: 1 });
    await insertPackIfAbsent(exec, pack);

    const result = await getSurfaceablePack(exec, "surf-key", 1);
    expect(result.state).toBe("found");
  });

  it("returns not_found when the article revision has moved on (pack is stale)", async () => {
    const exec = freshTestExecutor();
    // Insert pack at revision 100, then move the article to revision 200.
    await upsertArticle(exec, article(1, 100));
    const pack = makePack({ claimKey: "stale-key", sourceRevisionId: 100, pageId: 1 });
    await insertPackIfAbsent(exec, pack);

    // Advance the article to revision 200 — pack at rev 100 is no longer surfaceable.
    await upsertArticle(exec, article(1, 200));

    const result = await getSurfaceablePack(exec, "stale-key", 1);
    expect(result.state).toBe("not_found");
  });

  it("returns not_found when no pack exists for that claimKey + pageId", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1, 100));

    const result = await getSurfaceablePack(exec, "no-such-key", 1);
    expect(result.state).toBe("not_found");
  });

  it("returns not_found when a pack exists but for a different pageId", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1, 100));
    await upsertArticle(exec, article(2, 100));
    const pack = makePack({ claimKey: "page-key", sourceRevisionId: 100, pageId: 1 });
    await insertPackIfAbsent(exec, pack);

    const result = await getSurfaceablePack(exec, "page-key", 2);
    expect(result.state).toBe("not_found");
  });

  it("returns pack_unreadable (not throw) for a surfaceable row with corrupt JSON", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1, 100));
    const pack = makePack({ claimKey: "corrupt-surf-key", sourceRevisionId: 100 });
    await insertPackIfAbsent(exec, pack);

    // Corrupt cards_json directly.
    await exec
      .prepare("UPDATE research_packs SET cards_json = ? WHERE claim_key = ? AND source_revision_id = ?")
      .bind("{{bad", pack.claimKey, pack.sourceRevisionId)
      .run();

    const result = await getSurfaceablePack(exec, "corrupt-surf-key", 1);
    expect(result.state).toBe("pack_unreadable");
    spy.mockRestore();
  });

  it("round-trips the full pack when surfaceable", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1, 100));
    const pack = makePack({
      claimKey: "full-round-trip-key",
      sourceRevisionId: 100,
      queries: ["q1", "q2"],
      cards: [VALID_CARD],
      dispositions: [VALID_DROPPED],
      status: "proposals_present",
    });
    await insertPackIfAbsent(exec, pack);

    const result = await getSurfaceablePack(exec, "full-round-trip-key", 1);
    expect(result.state).toBe("found");
    if (result.state !== "found") return;
    expect(result.pack.queries).toEqual(["q1", "q2"]);
    expect(result.pack.cards).toEqual([VALID_CARD]);
    expect(result.pack.dispositions).toEqual([VALID_DROPPED]);
  });
});
