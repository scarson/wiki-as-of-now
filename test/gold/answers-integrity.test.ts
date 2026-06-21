// ABOUTME: Corpus integrity gate — every answer record's quote is byte-present on its snapshot, the snapshot
// ABOUTME: body hash matches, outcome nests under disposition, and the key maps to a real stale gold-set entry.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { validateAnswerRecord, hashSnapshotBody, stripFrontmatter, type AnswerRecord } from "./answer-record";
import { evaluateQuote } from "../../src/research/verbatim-check";
import type { UntrustedSourceText } from "../../src/research/source-fetch";

// cwd-relative paths — matches the established pattern in test/detector/recall.test.ts (vitest runs from repo root).
const read = (rel: string) => readFileSync(rel, "utf8");
const asSource = (s: string) => s as unknown as UntrustedSourceText;

/** The byte-presence + hash assertions one record/snapshot pair must satisfy. Reused for synthetic + real. */
function assertEvidenceGrounded(rec: AnswerRecord): void {
  expect(validateAnswerRecord(rec)).toEqual([]);
  for (const ev of rec.evidence) {
    const file = read(ev.snapshot);
    // Byte-presence + hash both operate on the BODY (frontmatter excluded): the quote is asserted present in
    // real content, and the MIN/MAX_QUOTE_LEN bounds are enforced implicitly (out-of-range → not "matched").
    expect(evaluateQuote(asSource(stripFrontmatter(file)), ev.verbatimQuote)).toBe("matched");
    expect(hashSnapshotBody(file)).toBe(ev.contentHashSha256);
  }
}

describe("answer-record invariants (synthetic)", () => {
  const snapshotRel = "test/gold/fixtures/sample-snapshot.md";
  const file = read(snapshotRel);
  const goodQuote = "concluded testing in 2025";

  const synthetic = (over: Partial<AnswerRecord> = {}): AnswerRecord => ({
    fixture: "zumwalt-class_destroyer.wikitext",
    sentenceSubstring: "will be ready to test the CPS in 2025",
    expectedYear: 2025,
    disposition: "confirmed_stale",
    outcome: "event_occurred",
    evidence: [{ sourceUrl: "https://example.invalid/cps", snapshot: snapshotRel,
      contentHashSha256: hashSnapshotBody(file), verbatimQuote: goodQuote, supportsStaleness: true }],
    supersededBy: null, certification: "agent_auto", verifiedAsOf: "2026-06-21",
    ...over,
  });

  it("a grounded synthetic record passes byte-presence + hash", () => {
    assertEvidenceGrounded(synthetic());
  });

  it("a tampered quote fails the byte-presence gate", () => {
    const file2 = read(snapshotRel);
    expect(evaluateQuote(asSource(file2), "concluded testing in 2099")).not.toBe("matched");
  });

  it("a wrong recorded hash fails the hash gate", () => {
    const rec = synthetic({ evidence: [{ ...synthetic().evidence[0], contentHashSha256: "deadbeef" }] });
    expect(hashSnapshotBody(read(rec.evidence[0].snapshot))).not.toBe(rec.evidence[0].contentHashSha256);
  });
});

describe("corpus integrity (real answers.json)", () => {
  const records = JSON.parse(read("test/gold/answers.json")) as AnswerRecord[];
  const gold = JSON.parse(read("test/gold/gold-set.json")) as Array<{ fixture: string; sentenceSubstring: string; stale?: boolean }>;
  const staleKeys = new Set(gold.filter((g) => g.stale).map((g) => `${g.fixture} ${g.sentenceSubstring}`));

  it("answers.json is an array", () => {
    expect(Array.isArray(records)).toBe(true);
  });

  it("every record is grounded, nests, and keys to a real stale gold-set entry", () => {
    for (const rec of records) {
      assertEvidenceGrounded(rec);
      expect(staleKeys.has(`${rec.fixture} ${rec.sentenceSubstring}`)).toBe(true);
    }
  });
});
