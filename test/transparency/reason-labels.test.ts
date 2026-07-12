// ABOUTME: Tests the dropped-disposition reason→label map (show-your-work, G6/G7).
// ABOUTME: Every reason code must humanize to a non-empty evidence-lane label; unknown codes fall back safely.
import { describe, it, expect } from "vitest";
import { labelForReason, DISPOSITION_REASONS } from "../../src/transparency/reason-labels";

describe("labelForReason", () => {
  it("maps each verbatim-check reason to a human label in the evidence lane", () => {
    expect(labelForReason("quote_not_found")).toEqual({
      label: "Quote not found verbatim on the fetched page",
      lane: "evidence",
    });
    expect(labelForReason("quote_too_short")).toEqual({
      label: "Quote too short to verify (under 8 characters)",
      lane: "evidence",
    });
    expect(labelForReason("quote_too_long")).toEqual({
      label: "Quote too long to verify (over 300 characters)",
      lane: "evidence",
    });
  });

  it("maps every real SourceFetchFailureReason to a humanized label in the evidence lane", () => {
    // These flow through DroppedProposal.reason verbatim from src/research/source-fetch.ts.
    const fetchReasons = [
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
    for (const reason of fetchReasons) {
      const r = labelForReason(reason);
      expect(r.lane).toBe("evidence");
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.label).not.toBe(reason); // must be humanized, not the raw code
    }
  });

  it("falls back safely for an unknown code without throwing or leaking the bare code as the whole label", () => {
    const r = labelForReason("some_future_reason_we_have_not_seen");
    expect(r.lane).toBe("evidence");
    expect(r.label).toMatch(/dropped/i); // generic, human-readable
    expect(r.label).not.toBe(""); // never empty — a blank label would hide the row
    expect(r.label).not.toBe("some_future_reason_we_have_not_seen");
  });

  it("handles empty and whitespace reason strings without throwing", () => {
    expect(() => labelForReason("")).not.toThrow();
    expect(labelForReason("").lane).toBe("evidence");
    expect(labelForReason("").label.length).toBeGreaterThan(0);
    expect(() => labelForReason("   ")).not.toThrow();
    expect(labelForReason("   ").label.length).toBeGreaterThan(0);
  });

  it("exposes the canonical reason set with stable labels for the UI legend", () => {
    expect(DISPOSITION_REASONS).toContain("quote_not_found");
    expect(DISPOSITION_REASONS).toContain("quote_too_short");
    expect(DISPOSITION_REASONS).toContain("quote_too_long");
    // Never tagged "error" — dispositions are evidence facts, not system errors.
    for (const code of DISPOSITION_REASONS) {
      expect(labelForReason(code).lane).toBe("evidence");
      expect(labelForReason(code).label).not.toBe(code); // every canonical code is humanized
    }
  });
});
