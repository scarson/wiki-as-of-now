// ABOUTME: Tests for sliceQuoteContext — the deterministic surrounding-context slicer for evidence cards.
// ABOUTME: Boils the edge-case lake: mid/edge/whole-block, cap+word-snap, code-point counting, block-boundary isolation.
import { describe, it, expect } from "vitest";
import { armDeterminismTraps } from "../helpers/determinism";
import { sliceQuoteContext, CONTEXT_SIDE_CAP } from "../../src/research/quote-context";
import { normalizeForVerbatim } from "../../src/research/normalize";
import type { UntrustedSourceText } from "../../src/research/source-fetch";

const src = (s: string): UntrustedSourceText => s as unknown as UntrustedSourceText;

describe("sliceQuoteContext", () => {
  armDeterminismTraps();

  it("returns the flanking text for a quote mid-paragraph", () => {
    const quote = "concluded testing in 2025";
    const page = src("The program " + quote + " after a long delay.");
    const r = sliceQuoteContext(page, quote);
    expect(r.contextBefore).toBe("The program ");
    expect(r.contextAfter).toBe(" after a long delay.");
  });

  it("returns null before when the quote starts the paragraph", () => {
    const quote = "Program X concluded testing";
    const page = src(quote + " in 2025.");
    const r = sliceQuoteContext(page, quote);
    expect(r.contextBefore).toBeNull();
    expect(r.contextAfter).toBe(" in 2025.");
  });

  it("returns null after when the quote ends the paragraph", () => {
    const quote = "awarded the production contract";
    const page = src("The DoD " + quote);
    const r = sliceQuoteContext(page, quote);
    expect(r.contextBefore).toBe("The DoD ");
    expect(r.contextAfter).toBeNull();
  });

  it("returns null on both sides when the quote is the whole paragraph", () => {
    const quote = "The whole paragraph is the quote.";
    const r = sliceQuoteContext(src(quote), quote);
    expect(r.contextBefore).toBeNull();
    expect(r.contextAfter).toBeNull();
  });

  it("never crosses a paragraph boundary (\\n)", () => {
    const quote = "the resolving fact here";
    // Prior + next paragraphs must NOT leak into the window.
    const page = src("PRIOR PARAGRAPH.\nThe lede states " + quote + " plainly.\nNEXT PARAGRAPH.");
    const r = sliceQuoteContext(page, quote);
    expect(r.contextBefore).toBe("The lede states ");
    expect(r.contextAfter).toBe(" plainly.");
    expect(r.contextBefore).not.toContain("PRIOR");
    expect(r.contextAfter).not.toContain("NEXT");
  });

  it("caps each side at CONTEXT_SIDE_CAP code points and snaps to a word boundary", () => {
    const quote = "the central claim";
    const before = "x ".repeat(400);          // 800 chars, far over the cap, space-separated tokens
    const after = " y".repeat(400);
    const page = src(before + quote + after);
    const r = sliceQuoteContext(page, quote);
    // Bounded
    expect([...(r.contextBefore ?? "")].length).toBeLessThanOrEqual(CONTEXT_SIDE_CAP);
    expect([...(r.contextAfter ?? "")].length).toBeLessThanOrEqual(CONTEXT_SIDE_CAP);
    // Word-snapped: no partial leading/trailing token (these tokens are single chars, so boundaries are clean)
    expect(r.contextBefore?.startsWith("x")).toBe(true);
    expect(r.contextAfter?.endsWith("y")).toBe(true);
  });

  it("counts the cap in code points, not UTF-16 units", () => {
    const quote = "anchor fact";
    // Astral emoji are 2 UTF-16 units / 1 code point each. cap+50 of them must be truncated to <= cap.
    const before = "😀 ".repeat(CONTEXT_SIDE_CAP + 50);
    const page = src(before + quote + " tail.");
    const r = sliceQuoteContext(page, quote);
    expect([...(r.contextBefore ?? "")].length).toBeLessThanOrEqual(CONTEXT_SIDE_CAP);
  });

  it("returns the reconstructable window: normalize(before+quote+after) is a substring of normalize(page)", () => {
    const quote = "concluded testing in 2025";
    const page = src("The program " + quote + " after a long delay.");
    const r = sliceQuoteContext(page, quote);
    const window = normalizeForVerbatim((r.contextBefore ?? "") + quote + (r.contextAfter ?? ""));
    expect(normalizeForVerbatim(page as unknown as string).includes(window)).toBe(true);
  });

  it("returns both null defensively when the quote is absent (caller only calls after a match)", () => {
    const r = sliceQuoteContext(src("page without it"), "totally absent quote");
    expect(r).toEqual({ contextBefore: null, contextAfter: null });
  });

  it("returns both null for an empty quote (the q.length === 0 guard)", () => {
    const r = sliceQuoteContext(src("some page text"), "");
    expect(r).toEqual({ contextBefore: null, contextAfter: null });
  });

  it("uses the FIRST occurrence when the quote repeats (matches evaluateQuote's includes basis)", () => {
    const quote = "delivered the unit";
    const page = src("Early: the vendor " + quote + " late. Later: they " + quote + " again.");
    const r = sliceQuoteContext(page, quote);
    expect(r.contextBefore).toBe("Early: the vendor ");
    expect(r.contextAfter).toBe(" late. Later: they delivered the unit again."); // tail of the FIRST match's block
  });

  it("SAFE-1: slices a multi-MB page within a tight time bound (linear, no superlinear scan)", () => {
    const quote = "the central resolving fact of the claim";
    // ~4 MB of filler, quote planted near the middle; pure-token spam stresses the boundary scan.
    const filler = "spam ".repeat(400_000); // ~2 MB
    const page = src(filler + quote + filler);
    const start = performance.now();
    const r = sliceQuoteContext(page, quote);
    const elapsedMs = performance.now() - start;
    expect([...(r.contextBefore ?? "")].length).toBeLessThanOrEqual(CONTEXT_SIDE_CAP);
    expect([...(r.contextAfter ?? "")].length).toBeLessThanOrEqual(CONTEXT_SIDE_CAP);
    expect(elapsedMs).toBeLessThan(1000); // generous; a superlinear scan would blow past this
  });
  // Note: armDeterminismTraps() traps fetch/Date.now/Math.random only — NOT performance.now — so this
  // timing assertion is safe. Do NOT remove the perf test thinking the trap will break it.
});
