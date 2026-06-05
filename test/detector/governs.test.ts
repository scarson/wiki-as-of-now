// ABOUTME: Unit tests for the marker-governs-year eligibility filter.
import { describe, it, expect } from "vitest";
import { yearOccurrences, governedYears } from "../../src/detector/governs";

describe("yearOccurrences", () => {
  it("returns each 4-digit year with its character span, in order", () => {
    const occ = yearOccurrences("built in 1910 and 2024");
    expect(occ).toEqual([
      { value: 1910, start: 9, end: 13 },
      { value: 2024, start: 18, end: 22 },
    ]);
  });
});

describe("governedYears (identity baseline — before discriminators)", () => {
  it("returns all past years when none are incidental", () => {
    expect(governedYears("X is expected to deliver in 2020", "is expected to", [2020])).toEqual([2020]);
  });
  it("returns distinct values only", () => {
    expect(governedYears("expected in 2020, again in 2020", "expected to", [2020])).toEqual([2020]);
  });
});

describe("governedYears — cross-clause aside (§2.1) + dateline guard (§2.2)", () => {
  it("DROPS an incidental year in a trailing participial aside", () => {
    // marker 'will'; 1910 is in ", built in 1910"
    expect(governedYears("It will replace the Portal Bridge, built in 1910", "will", [1910])).toEqual([]);
  });
  it("DROPS an incidental year in an embedded aside before the marker", () => {
    expect(governedYears("The bridge, completed in 1998, will be replaced", "will", [1998])).toEqual([]);
  });
  it("KEEPS a target year in the marker's own clause (no boundary between)", () => {
    // 'completed in 2024' is the marker's complement, NOT an aside
    expect(governedYears("It is expected to be completed in 2024", "is expected to", [2024])).toEqual([2024]);
  });
  it("KEEPS the mixed case's real target, dropping the incidental", () => {
    // "the IRDS, updated in 2019, is expected to ship in 2026" → drop 2019, keep 2026
    expect(
      governedYears("the IRDS, updated in 2019, is expected to ship in 2026", "is expected to", [2019, 2026])
    ).toEqual([2026]);
  });
  it("KEEPS a leading-dateline year eligible (deferred to suppress Rule 1, §2.2)", () => {
    // 2015 stays eligible so detect picks min(2015,2020)=2015 and Rule 1 suppresses as today
    expect(
      governedYears("In 2015, X is expected to deliver in 2020", "is expected to", [2015, 2020])
    ).toEqual([2015, 2020]);
  });
  it("KEEPS a forward 'updated' target (the participle as the marker's complement, no boundary)", () => {
    // 'updated' is in the aside-participle list; the CLAUSE_BOUNDARY guard keeps its
    // forward-target form ("expected to be updated in 2027") eligible.
    expect(governedYears("the spec is expected to be updated in 2027", "is expected to", [2027])).toEqual([2027]);
  });
  it("locates the marker by word boundary, not substring (no 'will' inside 'willing')", () => {
    // The real marker 'will' governs 2024 (no boundary between); the earlier 'willing'
    // must not be mistaken for the marker and shift markerIndex into the wrong clause.
    expect(
      governedYears("Though willing to wait, it will be completed in 2024", "will", [2024])
    ).toEqual([2024]);
  });
});

describe("governedYears — real mixed cases (target governed across an incidental, det3 README)", () => {
  // These three real fixture sentences carry an incidental earliest year AND a real
  // later target the marker governs. The cross-clause discriminator (and the later
  // task discriminators) must NEVER drop the governed target. At this task stage
  // some incidentals (range/parenthetical) are dropped by later tasks, so assert
  // only that the governed target year survives (.toContain).
  it("m109 howitzer — keeps the 1991 target governed by 'plans to' (field the weapon in 1991)", () => {
    const text =
      "Developed from 1984, it was adopted in 1990 with original plans to field the weapon in 1991 later slipping to 1992 and finally to 1993.";
    expect(governedYears(text, "plans to", [1984, 1990, 1991, 1992, 1993])).toContain(1991);
  });
  it("high_speed_2 — keeps the 2025 target governed by 'expected to' across an em-dash range aside", () => {
    const text =
      "The paper noted that railway passenger numbers had been growing significantly in recent years—doubling from 1995 to 2015 —and that the Rugby – Euston section was expected to have insufficient capacity sometime around 2025.";
    expect(governedYears(text, "expected to", [1995, 2015, 2025])).toContain(2025);
  });
  it("stuttgart_21 — keeps the 2025 target governed by 'expected to' across a leading dateline + trailing parenthetical", () => {
    const text =
      "In 2019, operations had been expected to start in December 2025, delayed from the initial estimation of 2019 (made in 2010).";
    expect(governedYears(text, "expected to", [2019, 2025, 2019, 2010])).toContain(2025);
  });
});
