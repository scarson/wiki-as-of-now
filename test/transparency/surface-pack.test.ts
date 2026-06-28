// ABOUTME: Tests the ResearchPackRead → TransparencyView transformer (G6/G7, defensive read CC-19).
// ABOUTME: Verifies full-candidate-set preservation, both degradation states, and no model-prose slot.
import { describe, it, expect } from "vitest";
import { toTransparencyView } from "../../src/transparency/surface-pack";
import type { ResearchPackRead } from "../../src/db/research-packs";

function packRead(overrides: Partial<{
  status: "no_proposals" | "proposals_present";
  cards: { url: string; verbatimQuote: string; advisorySupport: boolean; contextBefore: string | null; contextAfter: string | null }[];
  dispositions: { url: string; reason: string }[];
  queries: string[];
}>): ResearchPackRead {
  return {
    state: "found",
    pack: {
      claimKey: "a".repeat(64),
      sourceRevisionId: 42,
      pageId: 7,
      sectionHeading: "Funding",
      sentenceText: "The program is scheduled to deliver by 2019.",
      year: 2019,
      providerName: "workers-ai",
      modelVersion: "@cf/google/gemma-4-26b-a4b-it",
      status: overrides.status ?? "proposals_present",
      queries: overrides.queries ?? ["program delivery status", "program 2023 budget"],
      cards: overrides.cards ?? [
        { url: "https://example.gov/report", verbatimQuote: "delivery slipped to 2024", advisorySupport: true, contextBefore: null, contextAfter: null },
      ],
      dispositions: overrides.dispositions ?? [
        { url: "https://example.com/blog", reason: "quote_not_found" },
        { url: "https://example.net/x", reason: "quote_too_short" },
      ],
      evaluatedAt: "2026-06-13T00:00:00.000Z",
    },
  };
}

describe("toTransparencyView", () => {
  it("renders selected cards and dropped dispositions with humanized reasons, preserving counts (G7)", () => {
    const view = toTransparencyView(packRead({}));
    expect(view.kind).toBe("pack");
    if (view.kind !== "pack") throw new Error("unreachable");
    expect(view.modelVersion).toBe("@cf/google/gemma-4-26b-a4b-it"); // G12 disclosure surfaced
    expect(view.providerName).toBe("workers-ai");
    expect(view.status).toBe("proposals_present");
    expect(view.evaluatedAt).toBe("2026-06-13T00:00:00.000Z");
    expect(view.selected).toHaveLength(1);
    expect(view.selected[0].url).toBe("https://example.gov/report");
    expect(view.selected[0].verbatimQuote).toBe("delivery slipped to 2024");
    expect(view.dropped).toHaveLength(2); // ALL dispositions, no truncation
    expect(view.dropped[0].reasonLabel).toMatch(/not found verbatim/i);
    expect(view.dropped[0].reason).toBe("quote_not_found"); // raw code preserved alongside the label
    expect(view.dropped[0].lane).toBe("evidence");
    expect(view.queries).toEqual(["program delivery status", "program 2023 budget"]);
  });

  it("renders a no_proposals pack with zero cards but still shows queries and any dispositions (G7)", () => {
    const view = toTransparencyView(
      packRead({ status: "no_proposals", cards: [], dispositions: [{ url: "https://a.test", reason: "network_error" }] }),
    );
    expect(view.kind).toBe("pack");
    if (view.kind !== "pack") throw new Error("unreachable");
    expect(view.selected).toHaveLength(0);
    expect(view.dropped).toHaveLength(1);
    expect(view.dropped[0].reasonLabel).not.toBe("network_error"); // humanized
    expect(view.queries).toHaveLength(2);
  });

  it("preserves an empty disposition + empty query set without inventing content", () => {
    const view = toTransparencyView(packRead({ cards: [], dispositions: [], queries: [] }));
    expect(view.kind).toBe("pack");
    if (view.kind !== "pack") throw new Error("unreachable");
    expect(view.selected).toEqual([]);
    expect(view.dropped).toEqual([]);
    expect(view.queries).toEqual([]);
  });

  it("maps pack_unreadable to a degradation view, never throwing (CC-19)", () => {
    const view = toTransparencyView({ state: "pack_unreadable" });
    expect(view.kind).toBe("unreadable");
  });

  it("maps not_found to a distinct degradation view (CC-20: stale-revision JOIN miss, not 'never computed')", () => {
    const view = toTransparencyView({ state: "not_found" });
    expect(view.kind).toBe("not_found");
  });

  it("never exposes a model-authored summary field (G1/G9 — only verbatim quotes, URLs, queries, reasons)", () => {
    const view = toTransparencyView(packRead({}));
    if (view.kind !== "pack") throw new Error("unreachable");
    // The view shape is closed: assert no stray prose field leaked into a card. The context sides are
    // deterministic source slices (design 2026-06-21 §3.2), not prose — so they belong in the closed set.
    const cardKeys = Object.keys(view.selected[0]).sort();
    expect(cardKeys).toEqual(["advisorySupport", "contextAfter", "contextBefore", "url", "verbatimQuote"]);
    // The dropped-view shape is also closed: url + reason + reasonLabel + lane only.
    const droppedKeys = Object.keys(view.dropped[0]).sort();
    expect(droppedKeys).toEqual(["lane", "reason", "reasonLabel", "url"]);
  });
});
