// ABOUTME: Tests deriveHonestyState — maps a ResearchPackRead + revision context to a worksheet honesty state.
// ABOUTME: Covers all four degradation states, the supported case, and the revision-drift discriminator.
import { describe, it, expect } from "vitest";
import { deriveHonestyState, honestyFromSurfaced } from "../../src/worksheet/honesty-state";
import type { ResearchPackRead, ResearchPack } from "../../src/db/research-packs";
import type { EvidenceCard } from "../../src/research/provider";

function pack(over: Partial<ResearchPack>): ResearchPack {
  return {
    claimKey: "a".repeat(64),
    sourceRevisionId: 100,
    pageId: 1,
    sectionHeading: "Development",
    sentenceText: "It is expected to deliver in 2020.",
    year: 2020,
    providerName: "fake",
    modelVersion: "fake-provider/0",
    status: "proposals_present",
    queries: ["delivery status"],
    cards: [],
    dispositions: [],
    evaluatedAt: "2026-06-13T00:00:00.000Z",
    ...over,
  };
}
const card = (advisorySupport: boolean): EvidenceCard => ({
  url: "https://example.gov/report",
  verbatimQuote: "The program delivered its first unit in 2024.",
  advisorySupport,
  contextBefore: null,
  contextAfter: null,
});

describe("deriveHonestyState", () => {
  it("returns 'supported' when a card has advisorySupport true", () => {
    const read: ResearchPackRead = { state: "found", pack: pack({ cards: [card(true)] }) };
    expect(deriveHonestyState(read, 100, 100).kind).toBe("supported");
  });

  it("returns 'possible_update_weak_support' when cards exist but none has advisory support", () => {
    const read: ResearchPackRead = { state: "found", pack: pack({ cards: [card(false)] }) };
    expect(deriveHonestyState(read, 100, 100).kind).toBe("possible_update_weak_support");
  });

  it("returns 'likely_stale_no_strong_source' when the pack has zero cards", () => {
    const read: ResearchPackRead = {
      state: "found",
      pack: pack({ status: "proposals_present", cards: [], dispositions: [{ url: "https://x/y", reason: "quote_not_found" }] }),
    };
    expect(deriveHonestyState(read, 100, 100).kind).toBe("likely_stale_no_strong_source");
  });

  it("returns 'likely_stale_no_strong_source' for a no_proposals pack (model surfaced nothing)", () => {
    const read: ResearchPackRead = { state: "found", pack: pack({ status: "no_proposals", cards: [] }) };
    expect(deriveHonestyState(read, 100, 100).kind).toBe("likely_stale_no_strong_source");
  });

  it("returns 'article_changed_since_detection' when not_found AND the revision drifted", () => {
    const read: ResearchPackRead = { state: "not_found" };
    expect(deriveHonestyState(read, 100, 137).kind).toBe("article_changed_since_detection");
  });

  it("returns 'provider_unavailable' when not_found AND the revision is unchanged", () => {
    const read: ResearchPackRead = { state: "not_found" };
    expect(deriveHonestyState(read, 100, 100).kind).toBe("provider_unavailable");
  });

  it("treats pack_unreadable as provider_unavailable (defensive read failed; never throws to UI)", () => {
    const read: ResearchPackRead = { state: "pack_unreadable" };
    expect(deriveHonestyState(read, 100, 100).kind).toBe("provider_unavailable");
  });

  it("flags revision drift on a FOUND pack whose source_revision_id is older than current", () => {
    const read: ResearchPackRead = { state: "found", pack: pack({ sourceRevisionId: 100, cards: [card(true)] }) };
    const s = deriveHonestyState(read, 100, 137);
    expect(s.revisionDrift).toBe(true); // CC-20: still surfaceable, but the drift flag must render
  });
});

describe("honestyFromSurfaced (the SurfacedPack mapping loadWorksheetView uses)", () => {
  it("maps surfaced + a supported card → supported", () => {
    expect(honestyFromSurfaced({ state: "surfaced", providerName: "p", modelVersion: "m/1", queries: [], cards: [card(true)], dispositions: [], evaluatedAt: "t", sourceRevisionId: 100 }).kind).toBe("supported");
  });
  it("maps surfaced + cards-but-none-supported → possible_update_weak_support", () => {
    expect(honestyFromSurfaced({ state: "surfaced", providerName: "p", modelVersion: "m/1", queries: [], cards: [card(false)], dispositions: [], evaluatedAt: "t", sourceRevisionId: 100 }).kind).toBe("possible_update_weak_support");
  });
  it("maps surfaced + zero cards → likely_stale_no_strong_source", () => {
    expect(honestyFromSurfaced({ state: "surfaced", providerName: "p", modelVersion: "m/1", queries: [], cards: [], dispositions: [], evaluatedAt: "t", sourceRevisionId: 100 }).kind).toBe("likely_stale_no_strong_source");
  });
  it("maps revision_drift → article_changed_since_detection with revisionDrift true", () => {
    const s = honestyFromSurfaced({ state: "revision_drift", packRevisionId: 100, currentRevisionId: 137 });
    expect(s.kind).toBe("article_changed_since_detection");
    expect(s.revisionDrift).toBe(true);
  });
  it("maps not_found and unreadable → provider_unavailable", () => {
    expect(honestyFromSurfaced({ state: "not_found" }).kind).toBe("provider_unavailable");
    expect(honestyFromSurfaced({ state: "unreadable" }).kind).toBe("provider_unavailable");
  });
});
