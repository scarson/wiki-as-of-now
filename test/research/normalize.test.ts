// ABOUTME: Unit tests for normalizeForVerbatim \u2014 the shared verbatim-normalization contract.
// ABOUTME: Drives NFC composition, the strip set, non-ASCII whitespace folding, \n preservation, idempotence.
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { normalizeForVerbatim } from "../../src/research/normalize";

describe("normalizeForVerbatim", () => {
  it("folds runs of horizontal Unicode whitespace to a single space but preserves \\n", () => {
    // nbsp (U+00A0) + nbsp + tab + space -> one space
    expect(normalizeForVerbatim("a\u00A0\u00A0\t b")).toBe("a b");
    // em-space (U+2003) + thin-space (U+2009)
    expect(normalizeForVerbatim("a\u2003\u2009b")).toBe("a b");
    // ideographic (U+3000) + narrow-nbsp (U+202F) + MMSP (U+205F) + ogham (U+1680)
    expect(normalizeForVerbatim("a\u3000\u202F\u205F\u1680b")).toBe("a b");
    // \n preserved (block boundary)
    expect(normalizeForVerbatim("line1\nline2")).toBe("line1\nline2");
    // spaces adjacent to \n collapse
    expect(normalizeForVerbatim("line1  \n  line2")).toBe("line1\nline2");
  });

  it("collapses vertical whitespace / line separators to a single \\n boundary", () => {
    // VT (U+000B) -> \n block boundary
    expect(normalizeForVerbatim("a\u000Bb")).toBe("a\nb");
    // FF (U+000C) -> \n block boundary
    expect(normalizeForVerbatim("a\u000Cb")).toBe("a\nb");
    // CR (U+000D) -> \n block boundary
    expect(normalizeForVerbatim("a\rb")).toBe("a\nb");
    // CRLF -> single \n
    expect(normalizeForVerbatim("a\r\nb")).toBe("a\nb");
    // NEL (U+0085) -> \n block boundary
    expect(normalizeForVerbatim("a\u0085b")).toBe("a\nb");
    // LS (U+2028) -> \n block boundary
    expect(normalizeForVerbatim("a\u2028b")).toBe("a\nb");
    // PS (U+2029) -> \n block boundary
    expect(normalizeForVerbatim("a\u2029b")).toBe("a\nb");
    // spaces around a vertical separator collapse into the \n boundary
    expect(normalizeForVerbatim("a  \u000B  b")).toBe("a\nb");
    // a run of mixed vertical separators collapses to one \n
    expect(normalizeForVerbatim("a\u000B\u000C\u0085b")).toBe("a\nb");
  });

  it("strips zero-width / soft-hyphen (reader-visible-equivalent), never inserting a space", () => {
    // soft hyphen (U+00AD) renders zero-width
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
    // fullwidth A (U+FF21): NFKC would fold to ASCII 'A'; NFC must not
    expect(normalizeForVerbatim("\uFF21")).toBe("\uFF21");
    // fi ligature (U+FB01): NFKC would fold to "fi"; NFC must not
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
