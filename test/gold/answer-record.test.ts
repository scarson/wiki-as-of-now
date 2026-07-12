// ABOUTME: Tests for the ground-truth answer-record schema — nesting invariants, unverifiable rules, body hashing.
// ABOUTME: Pure unit tests; no network, no snapshot files (those are exercised by answers-integrity.test.ts).
import { describe, it, expect } from "vitest";
import {
  DISPOSITION_OUTCOMES, validateAnswerRecord, stripFrontmatter, hashSnapshotBody,
  type AnswerRecord,
} from "./answer-record";
import { createHash } from "node:crypto";

const base = (over: Partial<AnswerRecord> = {}): AnswerRecord => ({
  fixture: "zumwalt-class_destroyer.wikitext",
  sentenceSubstring: "will be ready to test the CPS in 2025",
  expectedYear: 2025,
  disposition: "confirmed_stale",
  outcome: "event_occurred",
  evidence: [{ sourceUrl: "https://navy.mil/x", snapshot: "test/gold/sources/2026-06-21-x.md",
    contentHashSha256: "abc", verbatimQuote: "concluded testing in 2025", supportsStaleness: true }],
  supersededBy: null,
  certification: "agent_auto",
  verifiedAsOf: "2026-06-21",
  ...over,
});

describe("validateAnswerRecord", () => {
  it("accepts a well-formed confirmed_stale record", () => {
    expect(validateAnswerRecord(base())).toEqual([]);
  });

  it("rejects an outcome that does not nest under its disposition", () => {
    const errs = validateAnswerRecord(base({ disposition: "still_current", outcome: "event_occurred" }));
    expect(errs.some((e) => /does not nest/.test(e))).toBe(true);
  });

  it("requires unverifiable records to carry empty evidence and human_confirmed", () => {
    const errs = validateAnswerRecord(base({
      disposition: "unverifiable", outcome: "unverifiable", certification: "agent_auto",
      evidence: [{ sourceUrl: "x", snapshot: "y", contentHashSha256: "z", verbatimQuote: "q", supportsStaleness: false }],
    }));
    expect(errs.some((e) => /unverifiable record must carry evidence: \[\]/.test(e))).toBe(true);
    expect(errs.some((e) => /unverifiable record must be human_confirmed/.test(e))).toBe(true);
  });

  it("requires a non-unverifiable record to carry at least one evidence entry", () => {
    const errs = validateAnswerRecord(base({ evidence: [] }));
    expect(errs.some((e) => /must carry >= 1 evidence/.test(e))).toBe(true);
  });

  it("rejects supersededBy on a non-superseded record", () => {
    const errs = validateAnswerRecord(base({ supersededBy: "New Plan B" }));
    expect(errs.some((e) => /supersededBy is only valid on a superseded record/.test(e))).toBe(true);
  });

  it("accepts supersededBy on a superseded record", () => {
    expect(validateAnswerRecord(base({
      disposition: "superseded", outcome: "superseded", supersededBy: "Constellation-class FFG(X)",
    }))).toEqual([]);
  });

  it("rejects a malformed verifiedAsOf", () => {
    expect(validateAnswerRecord(base({ verifiedAsOf: "June 2026" })).some((e) => /verifiedAsOf/.test(e))).toBe(true);
  });

  it("DISPOSITION_OUTCOMES covers all four dispositions with non-empty outcome lists", () => {
    expect(Object.keys(DISPOSITION_OUTCOMES).sort()).toEqual(
      ["confirmed_stale", "still_current", "superseded", "unverifiable"]);
    for (const outs of Object.values(DISPOSITION_OUTCOMES)) expect(outs.length).toBeGreaterThan(0);
  });
});

describe("stripFrontmatter / hashSnapshotBody", () => {
  it("strips a leading YAML frontmatter block and hashes only the body", () => {
    const body = "The program concluded testing in 2025 after delays.\n";
    const file = `---\ntitle: X\nsource_url: 'https://navy.mil/x'\nword_count: 8\n---\n${body}`;
    expect(stripFrontmatter(file)).toBe(body);
    expect(hashSnapshotBody(file)).toBe(createHash("sha256").update(body, "utf8").digest("hex"));
  });

  it("returns the whole text when there is no frontmatter", () => {
    const file = "no frontmatter here, just body text.";
    expect(stripFrontmatter(file)).toBe(file);
  });
});
