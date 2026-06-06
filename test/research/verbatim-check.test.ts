// ABOUTME: Tests for evaluateQuote -- deterministic verbatim-quote byte-presence check, the G8/G15 fabrication backstop.
// ABOUTME: Covers NFC/whitespace normalization, block-boundary isolation, case sensitivity, length bounds, and linear-time perf.
import { describe, it, expect } from "vitest";
import { evaluateQuote, MIN_QUOTE_LEN, MAX_QUOTE_LEN } from "../../src/research/verbatim-check";
import type { UntrustedSourceText } from "../../src/research/source-fetch";

const page = (s: string) => s as unknown as UntrustedSourceText; // brand cast for tests

describe("evaluateQuote", () => {
  it("matches a quote present only after NFC/whitespace normalization (normalization does work)", () => {
    // nbsp (U+00A0) in page vs ASCII space in quote
    expect(evaluateQuote(page("The contract was\u00A0awarded in 2024."), "The contract was awarded in 2024.")).toBe("matched");
    // decomposed e+combining-acute (U+0065 U+0301) in page vs precomposed e-acute (U+00E9) in quote
    expect(evaluateQuote(page("r\u0065\u0301sum\u0065\u0301 published"), "r\u00E9sum\u00E9 published")).toBe("matched");
  });

  it("does NOT match across a block boundary (cross-block forgery prevention)", () => {
    expect(evaluateQuote(page("Paragraph one ends.\nParagraph two starts."), "ends. Paragraph two")).toBe("quote_not_found");
  });

  it("does NOT match a negation flip (no punctuation/case stripping)", () => {
    expect(evaluateQuote(page("The contract was not awarded."), "The contract was awarded.")).toBe("quote_not_found");
  });

  it("is case-sensitive -- a case-only difference is not a match", () => {
    expect(evaluateQuote(page("The NASA Program Continues"), "the nasa program continues")).toBe("quote_not_found");
  });

  it("rejects empty/whitespace/too-short/too-long with the right code (code-point lengths)", () => {
    expect(evaluateQuote(page("anything"), "")).toBe("quote_not_found");
    expect(evaluateQuote(page("anything"), "   ")).toBe("quote_not_found");
    expect(evaluateQuote(page("a b"), "a")).toBe("quote_too_short");
    const long = "x".repeat(MAX_QUOTE_LEN + 1);
    expect(evaluateQuote(page(long), long)).toBe("quote_too_long");
  });

  it("honors the MIN_QUOTE_LEN boundary for short date anchors", () => {
    // "3 May 24" is exactly 8 code points (the floor) -- date anchors must pass
    expect(evaluateQuote(page("Event on 3 May 24 confirmed."), "3 May 24")).toBe("matched");
    // "3 May 2" is 7 code points, below the floor
    expect(evaluateQuote(page("Event on 3 May 24 confirmed."), "3 May 2")).toBe("quote_too_short");
    expect(MIN_QUOTE_LEN).toBe(8);
    expect(MAX_QUOTE_LEN).toBe(300);
  });

  it("matches a real pointer-sized quote", () => {
    expect(evaluateQuote(page("Lorem ipsum. NASA confirmed the launch on 3 May 2024 at the site."), "NASA confirmed the launch on 3 May 2024")).toBe("matched");
  });

  it("is linear-time on pathological input (no ReDoS) and handles empty page", () => {
    const spam = page("{".repeat(1_000_000));
    const start = performance.now();
    expect(evaluateQuote(spam, "a confirmed factual quote here")).toBe("quote_not_found");
    expect(performance.now() - start).toBeLessThan(1000);
    expect(evaluateQuote(page(""), "a confirmed factual quote here")).toBe("quote_not_found");
  });
});
