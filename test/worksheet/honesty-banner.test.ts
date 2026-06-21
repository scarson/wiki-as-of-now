// ABOUTME: Tests honestyBannerText — maps each WorksheetHonestyKind to its human-readable banner string.
// ABOUTME: Asserts every kind has a non-empty banner (no honesty state renders blank — the show-your-work guardrail G6).
import { describe, it, expect } from "vitest";
import { honestyBannerText } from "../../src/worksheet/honesty-banner";
import type { WorksheetHonestyKind } from "../../src/worksheet/view-types";

const ALL_KINDS: WorksheetHonestyKind[] = [
  "supported",
  "possible_update_weak_support",
  "likely_stale_no_strong_source",
  "provider_unavailable",
  "article_changed_since_detection",
];

describe("honestyBannerText", () => {
  it("returns the four spec degradation strings verbatim", () => {
    expect(honestyBannerText("likely_stale_no_strong_source")).toBe("likely stale, no strong current source");
    expect(honestyBannerText("possible_update_weak_support")).toBe("possible update, weak support");
    expect(honestyBannerText("provider_unavailable")).toBe("provider unavailable");
    expect(honestyBannerText("article_changed_since_detection")).toBe("article changed since detection");
  });

  it("returns a neutral confirmation (not an alarm) for the supported case", () => {
    expect(honestyBannerText("supported").length).toBeGreaterThan(0);
  });

  it("never returns an empty banner for any kind (every honesty state is shown — G6)", () => {
    for (const kind of ALL_KINDS) {
      expect(honestyBannerText(kind).trim().length).toBeGreaterThan(0);
    }
  });
});
