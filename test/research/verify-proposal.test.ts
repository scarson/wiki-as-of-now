// ABOUTME: Tests for verifyProposal -- the standalone compliance seam that fetches a proposed URL,
// ABOUTME: runs the real deterministic verbatim check, and emits a verified EvidenceCard or DroppedProposal.
import { describe, it, expect } from "vitest";
import { armDeterminismTraps } from "../helpers/determinism";
import { verifyProposal } from "../../src/research/verify-proposal";
import type { DroppedProposal } from "../../src/research/verify-proposal";
import type { ProposedEvidence } from "../../src/research/provider";
import type { SourceFetchResult, UntrustedSourceText, SourceFetchFailureReason } from "../../src/research/source-fetch";

const ok = (s: string): SourceFetchResult => ({ ok: true, text: s as unknown as UntrustedSourceText });
const fail = (reason: SourceFetchFailureReason): SourceFetchResult => ({ ok: false, reason });
const isDrop = (r: object): r is DroppedProposal => "reason" in r;
const proposal = (over: Partial<ProposedEvidence> = {}): ProposedEvidence =>
  ({ url: "https://example.com/p", proposedQuote: "NASA confirmed the launch on 3 May 2024", advisorySupport: true, ...over });

describe("verifyProposal", () => {
  armDeterminismTraps();

  // Case 1: standalone guardrail -- page lacks the quote --> dropped quote_not_found
  it("drops with quote_not_found when the page does not contain the proposed quote", async () => {
    const fetch = async (_url: string) => ok("Some page text that does not contain it.");
    const result = await verifyProposal(proposal(), { fetchSource: fetch });
    expect(isDrop(result)).toBe(true);
    const drop = result as DroppedProposal;
    expect(drop.url).toBe("https://example.com/p");
    expect(drop.reason).toBe("quote_not_found");
  });

  // Case 2: matched --> EvidenceCard storing the RAW proposed quote (not the normalized page form).
  // The page uses a non-breaking space (U+00A0) where the quote uses an ASCII space (U+0020);
  // normalizeForVerbatim maps both to ASCII space, so evaluateQuote sees a match.
  // The returned card MUST store the RAW proposedQuote (ASCII-space version), never the page form.
  it("returns an EvidenceCard with the RAW proposedQuote (not the normalized page form) on a match", async () => {
    const rawQuote = "NASA confirmed the launch on 3 May 2024";
    // Build page text using U+00A0 (non-breaking space) in the quote region to prove normalization does the work.
    // "\u00A0" is the escape for U+00A0; rawQuote uses ASCII spaces (U+0020).
    const pageQuoteWithNbsp = "NASA confirmed the launch on 3\u00A0May 2024";
    const pageText = "Lorem " + pageQuoteWithNbsp + " ipsum.";
    const fetch = async (_url: string) => ok(pageText);
    const p = proposal({ proposedQuote: rawQuote });
    const result = await verifyProposal(p, { fetchSource: fetch });
    expect(isDrop(result)).toBe(false);
    // Must carry through url and advisorySupport
    expect(result).toMatchObject({ url: "https://example.com/p", advisorySupport: true });
    // verbatimQuote must be the RAW proposed quote (ASCII-space version), not the page's U+00A0 form
    if ("verbatimQuote" in result) {
      expect(result.verbatimQuote).toBe(rawQuote);
      // Confirm the stored quote does not contain U+00A0 (the page's form)
      expect(result.verbatimQuote).not.toContain("\u00A0");
    } else {
      throw new Error("Expected EvidenceCard but got DroppedProposal");
    }
  });

  // Case 3: each fetch failure reason --> DroppedProposal with that reason
  const fetchFailureReasons: SourceFetchFailureReason[] = [
    "blocked_scheme",
    "blocked_host",
    "redirect_not_allowed",
    "timeout",
    "too_large",
    "unsupported_content_type",
    "decode_error",
    "http_error",
    "network_error",
    "empty_after_extraction",
  ];

  it.each(fetchFailureReasons)(
    "drops with reason '%s' when fetchSource fails with that reason",
    async (reason) => {
      const fetch = async (_url: string) => fail(reason);
      const result = await verifyProposal(proposal(), { fetchSource: fetch });
      expect(isDrop(result)).toBe(true);
      const drop = result as DroppedProposal;
      expect(drop.url).toBe("https://example.com/p");
      expect(drop.reason).toBe(reason);
    },
  );

  // Case 4a: quote too short --> dropped quote_too_short
  it("drops with quote_too_short when the proposed quote is shorter than MIN_QUOTE_LEN code points", async () => {
    // "3 May 2" is 7 code points -- one below the MIN_QUOTE_LEN floor of 8
    const shortQuote = "3 May 2";
    const fetch = async (_url: string) => ok("Some page text with 3 May 2 in it.");
    const result = await verifyProposal(proposal({ proposedQuote: shortQuote }), { fetchSource: fetch });
    expect(isDrop(result)).toBe(true);
    const drop = result as DroppedProposal;
    expect(drop.url).toBe("https://example.com/p");
    expect(drop.reason).toBe("quote_too_short");
  });

  // Case 4b: quote too long --> dropped quote_too_long
  it("drops with quote_too_long when the proposed quote exceeds MAX_QUOTE_LEN code points", async () => {
    // 301 "x" code points -- one above the MAX_QUOTE_LEN ceiling of 300
    const longQuote = "x".repeat(301);
    // Page contains the exact long quote so the only rejection trigger is the length bound
    const fetch = async (_url: string) => ok(longQuote);
    const result = await verifyProposal(proposal({ proposedQuote: longQuote }), { fetchSource: fetch });
    expect(isDrop(result)).toBe(true);
    const drop = result as DroppedProposal;
    expect(drop.url).toBe("https://example.com/p");
    expect(drop.reason).toBe("quote_too_long");
  });

  // Context capture: a matched proposal carries the flanking source slices (design 2026-06-21 §3.2).
  it("populates contextBefore/contextAfter from the page on a match", async () => {
    const quote = "NASA confirmed the launch on 3 May 2024";
    const page = "Earlier reports were cautious. " + quote + " in a press briefing.";
    const fetch = async (_url: string) => ok(page);
    const result = await verifyProposal(proposal({ proposedQuote: quote }), { fetchSource: fetch });
    expect(isDrop(result)).toBe(false);
    expect(result).toMatchObject({
      contextBefore: "Earlier reports were cautious. ",
      contextAfter: " in a press briefing.",
    });
  });

  it("yields a null side when the matched quote sits at a paragraph edge", async () => {
    const quote = "NASA confirmed the launch on 3 May 2024";
    const fetch = async (_url: string) => ok(quote + " afterwards.");
    const result = await verifyProposal(proposal({ proposedQuote: quote }), { fetchSource: fetch });
    expect(result).toMatchObject({ contextBefore: null, contextAfter: " afterwards." });
  });
});
