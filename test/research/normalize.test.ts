import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { normalizeForVerbatim } from "../../src/research/normalize";

describe("normalizeForVerbatim", () => {
  it("folds runs of visible Unicode whitespace to a single space but preserves \\n", () => {
    expect(normalizeForVerbatim("a  \t b")).toBe("a b");      // nbsp + tab + spaces → one space
    expect(normalizeForVerbatim("a  b")).toBe("a b");          // em-space + thin-space → one space
    expect(normalizeForVerbatim("line1\nline2")).toBe("line1\nline2");  // \n preserved (block boundary)
  });
  it("strips zero-width / soft-hyphen (reader-visible-equivalent), never inserting a space", () => {
    expect(normalizeForVerbatim("inter­national")).toBe("international"); // soft hyphen (renders zero-width mid-line)
    expect(normalizeForVerbatim("a​b‌c‍d⁠e﻿")).toBe("abcde"); // ZWSP/ZWNJ/ZWJ/WJ/ZWNBSP
  });
  it("applies NFC, preserves case and punctuation (no meaning erasure)", () => {
    expect(normalizeForVerbatim("é")).toBe("é");           // e + combining acute → é (NFC composes)
    expect(normalizeForVerbatim("Not Awarded.")).toBe("Not Awarded."); // case + punctuation kept
  });
  it("trims leading/trailing whitespace", () => {
    expect(normalizeForVerbatim("  hi  ")).toBe("hi");
  });
  it("is idempotent (property)", () => {
    fc.assert(fc.property(fc.string(), (s) => {
      expect(normalizeForVerbatim(normalizeForVerbatim(s))).toBe(normalizeForVerbatim(s));
    }));
  });
});
