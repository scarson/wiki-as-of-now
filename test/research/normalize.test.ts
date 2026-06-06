// ABOUTME: Unit tests for normalizeForVerbatim — the shared verbatim-normalization contract.
// ABOUTME: Drives NFC composition, the strip set, non-ASCII whitespace folding, \n preservation, idempotence.
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { normalizeForVerbatim } from "../../src/research/normalize";

describe("normalizeForVerbatim", () => {
  it("folds runs of visible Unicode whitespace to a single space but preserves \\n", () => {
    // nbsp + nbsp + tab + space -> one space
    expect(normalizeForVerbatim("a\u00A0\u00A0\t b")).toBe("a b");
    // em-space + thin-space
    expect(normalizeForVerbatim("a\u2003\u2009b")).toBe("a b");
    // ideographic + narrow-nbsp + MMSP + ogham
    expect(normalizeForVerbatim("a\u3000\u202F\u205F\u1680b")).toBe("a b");
    // VT + FF + NEL (control whitespace)
    expect(normalizeForVerbatim("a\u000B\u000C\u0085b")).toBe("a b");
    // \n preserved (block boundary)
    expect(normalizeForVerbatim("line1\nline2")).toBe("line1\nline2");
    // spaces adjacent to \n collapse
    expect(normalizeForVerbatim("line1  \n  line2")).toBe("line1\nline2");
  });

  it("strips zero-width / soft-hyphen (reader-visible-equivalent), never inserting a space", () => {
    // soft hyphen renders zero-width
    expect(normalizeForVerbatim("inter\u00ADnational")).toBe("international");
    // ZWSP/ZWNJ/ZWJ/WJ/ZWNBSP
    expect(normalizeForVerbatim("a\u200Bb\u200Cc\u200Dd\u2060e\uFEFF")).toBe("abcde");
  });

  it("applies NFC composition, preserves case and punctuation (no meaning erasure)", () => {
    // e + combining acute -> \u00E9 (NFC composes)
    expect(normalizeForVerbatim("\u0065\u0301")).toBe("\u00E9");
    // composition mid-word
    expect(normalizeForVerbatim("caf\u0065\u0301")).toBe("caf\u00E9");
    // a+grave composes to \u00E0; trailing tilde stays (no precomposed form)
    expect(normalizeForVerbatim("\u0061\u0300\u0303")).toBe("\u00E0\u0303");
    // case + punctuation kept (all ASCII)
    expect(normalizeForVerbatim("Not Awarded.")).toBe("Not Awarded.");
    // negation not erasable (all ASCII)
    expect(normalizeForVerbatim("The contract was not awarded.")).toBe("The contract was not awarded.");
  });

  it("uses NFC, NOT NFKC \u2014 compatibility glyphs are preserved (no over-folding)", () => {
    // fullwidth A: NFKC would fold to ASCII 'A'; NFC must not
    expect(normalizeForVerbatim("\uFF21")).toBe("\uFF21");
    // fi ligature: NFKC would fold to "fi"; NFC must not
    expect(normalizeForVerbatim("\uFB01")).toBe("\uFB01");
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
