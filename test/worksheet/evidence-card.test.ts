// ABOUTME: Tests toEvidenceCardView — the evidence-card render model carries verbatim fields ONLY.
// ABOUTME: Enforces the no-machine-written-text guardrail (G1) at the view boundary.
import { describe, it, expect } from "vitest";
import { toEvidenceCardView } from "../../src/worksheet/evidence-card";
import type { EvidenceCard } from "../../src/research/provider";

const card: EvidenceCard = {
  url: "https://example.gov/2024-report",
  verbatimQuote: "The first unit entered service in March 2024.",
  advisorySupport: true,
};

describe("toEvidenceCardView", () => {
  it("carries exactly url, verbatimQuote, advisorySupport — no other text field", () => {
    const view = toEvidenceCardView(card);
    expect(Object.keys(view).sort()).toEqual(["advisorySupport", "url", "verbatimQuote"]);
  });

  it("passes the stored verbatim quote through unchanged (it already survived the G8 check)", () => {
    expect(toEvidenceCardView(card).verbatimQuote).toBe(card.verbatimQuote);
  });

  it("preserves the real URL exactly (anchor-to-a-real-URL guardrail G3)", () => {
    expect(toEvidenceCardView(card).url).toBe(card.url);
  });

  it("never reads a 'summary' / 'explanation' / 'prose' field even if one is smuggled onto the input", () => {
    const poisoned = { ...card, summary: "MODEL-AUTHORED PROSE", explanation: "MODEL TEXT" } as EvidenceCard & Record<string, unknown>;
    const view = toEvidenceCardView(poisoned);
    expect(JSON.stringify(view)).not.toContain("MODEL-AUTHORED PROSE");
    expect(JSON.stringify(view)).not.toContain("MODEL TEXT");
    expect(Object.keys(view).sort()).toEqual(["advisorySupport", "url", "verbatimQuote"]);
  });
});
