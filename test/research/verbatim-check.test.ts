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
  it("does NOT match across non-newline vertical separators (cross-block-forgery defense)", () => {
    // Each vertical separator normalizes to \n; a space-joined quote bridging the boundary won't match
    // VT (U+000B)
    expect(evaluateQuote(page("End of section one.\u000BStart of section two here."), "section one. Start of section")).toBe("quote_not_found");
    // FF (U+000C)
    expect(evaluateQuote(page("End of section one.\u000CStart of section two here."), "section one. Start of section")).toBe("quote_not_found");
    // CR (U+000D)
    expect(evaluateQuote(page("End of section one.\rStart of section two here."), "section one. Start of section")).toBe("quote_not_found");
    // LS (U+2028)
    expect(evaluateQuote(page("End of section one.\u2028Start of section two here."), "section one. Start of section")).toBe("quote_not_found");
    // PS (U+2029)
    expect(evaluateQuote(page("End of section one.\u2029Start of section two here."), "section one. Start of section")).toBe("quote_not_found");
    // Positive control: a genuinely contiguous quote within one segment still matches
    expect(evaluateQuote(page("End of section one. Start of section two here."), "Start of section two here.")).toBe("matched");
  });

  it("quote that itself spans a block boundary -> quote_not_found (quote-side cross-block rejection)", () => {
    // A quote containing a literal \n is rejected regardless of what the page contains.
    // This is the quote-side check: if normalizeForVerbatim(quote).includes("\n"), drop it.
    expect(evaluateQuote(page("alpha beta gamma delta epsilon"), "alpha beta\ngamma delta")).toBe("quote_not_found");
    // Same result when the quote is built from parts joined by \n — the \n survives normalization.
    const quoteWithNewline = "alpha beta\ngamma delta";
    expect(evaluateQuote(page("alpha beta gamma delta epsilon"), quoteWithNewline)).toBe("quote_not_found");
  });

  it("MAX_PAGE_CHARS (4_000_000) truncation: quote only beyond cap -> quote_not_found; quote near start -> matched", () => {
    // Build a page where the unique quote appears ONLY beyond 4_000_000 characters.
    // The cap slices the tail off before normalization, so the quote is invisible.
    const filler = "x".repeat(4_000_001);
    const pageWithTailQuote = page(filler + " UNIQUE_TAIL_QUOTE_PRESENT_HERE");
    const start = performance.now();
    expect(evaluateQuote(pageWithTailQuote, "UNIQUE_TAIL_QUOTE_PRESENT_HERE")).toBe("quote_not_found");
    expect(performance.now() - start).toBeLessThan(1000);

    // Positive (bipolar) control: the SAME quote near the START of a page > 4 MB is found
    // because the quote falls within the first 4_000_000 characters.
    const pageWithHeadQuote = page("UNIQUE_HEAD_QUOTE_PRESENT_HERE " + filler);
    expect(evaluateQuote(pageWithHeadQuote, "UNIQUE_HEAD_QUOTE_PRESENT_HERE")).toBe("matched");
  });

});
