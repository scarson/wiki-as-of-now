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

describe("governedYears — noun-modifier", () => {
  it("DROPS 'the <year> <noun>' label", () => {
    expect(governedYears("the 2021 update of the IRDS will ship", "will", [2021])).toEqual([]);
  });
  it("DROPS '<year> <Noun>' attributive label", () => {
    expect(governedYears("the 2024 Update is expected to add features", "is expected to", [2024])).toEqual([]);
  });
  it("DROPS a 'prep the <year> <noun>' label in a leading aside before the marker (during the <year> event)", () => {
    // optimus_robot real FP: "during the 2021 AI Day event, Optimus will be ..." — the
    // year labels the event in a leading aside; 'will' is after the year past a comma boundary.
    const text = "According to the presentation made during the 2021 AI Day event, Optimus will be controlled by AI.";
    expect(governedYears(text, "will", [2021])).toEqual([]);
  });
  it("DROPS a 'During the <year> <noun>' leading-aside label (marker after, boundary between)", () => {
    // nancy_grace real FP: "During the 2025 federal government shutdown, ... not expected to impact missions".
    const text =
      "During the 2025 federal government shutdown, the center began closing buildings, which is not expected to impact missions.";
    expect(governedYears(text, "expected to", [2025])).toEqual([]);
  });
  it("DROPS a 'prep the <year> <noun> of …' document-version label before the marker", () => {
    // 3_nm_process real FP: "contained in the 2021 update of the IRDS ... is expected to have ...".
    const text =
      "According to the projections contained in the 2021 update of the IRDS, a node is expected to have a 48 nm pitch.";
    expect(governedYears(text, "is expected to", [2021])).toEqual([]);
  });
  it("DROPS a 'prep the <year> <ProperNoun> by-election' label before the marker", () => {
    // high_speed_2 real FP: "a cited factor in the 2021 Chesham and Amersham by-election ... that was planned to ...".
    const text =
      "Issues were a cited factor in the 2021 Chesham and Amersham by-election, resulting in the line that was planned to go through.";
    expect(governedYears(text, "planned to", [2021])).toEqual([]);
  });
  it("DROPS a possessive-led '<year> <noun>' label before the marker (Science's 2020 survey)", () => {
    // spacex_starship real FP: "Science's 2020 survey recommended ...; the observatory will search ...".
    const text =
      "The National Academies of Science's 2020 survey recommended the observatory; the observatory will search for life.";
    expect(governedYears(text, "will", [2020])).toEqual([]);
  });
  it("KEEPS a target year after a forward preposition", () => {
    expect(governedYears("production is expected to begin in 2024", "is expected to", [2024])).toEqual([2024]);
  });
  it("KEEPS a forward target preposition that leads a determiner+noun (in 2024 production)", () => {
    // "in 2024 production" — 'in' makes 2024 a temporal target even though a noun follows.
    expect(governedYears("output is expected to ramp in 2024 production lines", "is expected to", [2024])).toEqual([
      2024,
    ]);
  });
  it("KEEPS a forward target preposition that leads a determiner-led noun (in 2024 the program)", () => {
    expect(governedYears("is expected to launch in 2024 the program will be live", "is expected to", [2024])).toEqual([
      2024,
    ]);
  });
  it("KEEPS a temporal-horizon year (prep + determiner + noun): 'a boost in the 2022 midterm elections'", () => {
    // README over-drop KEEP: 2022 is the WHEN of the expectation, not a version label.
    const text =
      "the new reality was expected to give the president and his party a boost in the 2022 midterm elections.";
    expect(governedYears(text, "expected to", [2022])).toContain(2022);
  });
  it("KEEPS a temporal-horizon year (prep + determiner + noun): 'not be felt before the 2024 election'", () => {
    // README over-drop KEEP: 2024 is the election year (temporal target), not a label.
    const text =
      "the benefits of the act will likely not be felt before the 2024 election, but the act is a great strategy.";
    expect(governedYears(text, "will", [2024])).toContain(2024);
  });
  it("KEEPS a leading deadline-frame year with the marker AFTER it (By the 2024 election, ... will pass)", () => {
    // 'by|before|until the <year> <event>' points the claim AT that year (a deadline target),
    // so the year is kept regardless of marker position — unlike a background 'during|in the <year>' frame.
    expect(governedYears("By the 2024 election, the bill will pass", "will", [2024])).toContain(2024);
    expect(governedYears("Until the 2023 review concludes, the program will continue", "will", [2023])).toContain(2023);
  });
  it("still DROPS a leading BACKGROUND-frame year (During the 2025 shutdown, ... expected to)", () => {
    // during/in/after frame background context, not a deadline the claim targets → dropped.
    expect(
      governedYears("During the 2025 government shutdown, services are expected to resume", "expected to", [2025])
    ).toEqual([]);
  });
  it("KEEPS a bare temporal-frame year before a proper-noun subject, marker after (by 2023 SpaceX will fly)", () => {
    // A 'prep <year>' frame (NO determiner) is a temporal window, not a label, even when a
    // proper-noun SUBJECT follows the year and the marker comes after it.
    expect(governedYears("It was announced that by 2023 SpaceX will fly the rocket", "will", [2023])).toEqual([2023]);
  });
  it("KEEPS a bare temporal-frame year before a proper-noun subject (after 2022 Boeing will deliver)", () => {
    expect(governedYears("Officials said that after 2022 Boeing will deliver the jets", "will", [2022])).toEqual([2022]);
  });
  it("KEEPS a bare temporal-frame year before a proper-noun subject (in 2024 NASA will launch)", () => {
    expect(governedYears("The agency confirmed that in 2024 NASA will launch the telescope", "will", [2024])).toEqual([
      2024,
    ]);
  });
});

describe("governedYears — named-entity", () => {
  it("DROPS '<ProperNoun> <year>' where the proper noun is an acronym/product name (CES 2025)", () => {
    expect(governedYears("announced at CES 2025 that it will ship", "will", [2025])).toEqual([]);
  });
  it("DROPS '<ProperNoun> <year>' where the proper noun is an all-caps abbreviation (MSPO 2024)", () => {
    expect(governedYears("At the MSPO 2024 defense expo, the frigates will be fitted", "will", [2024])).toEqual([]);
  });
  it("DROPS '<ProperNoun> <year>' where the proper noun is a mixed-case code (PzH 2000)", () => {
    // PzH 2000 — "PzH" is uppercase-leading mixed-case
    expect(governedYears("The MLU variant is the PzH 2000 A5, expected to be ready by 2028", "expected to", [2000])).toEqual([]);
  });
  it("does NOT treat a month name as a named entity (March 2013 is a date)", () => {
    expect(governedYears("delivery is expected to slip to March 2013", "is expected to", [2013])).toEqual([2013]);
  });
  it("KEEPS a forward target year after a forward preposition even if a proper noun is nearby (in 2024)", () => {
    // "Boeing is expected to deliver in 2024" — 'in' makes 2024 a temporal target
    expect(governedYears("Boeing is expected to deliver in 2024", "is expected to", [2024])).toEqual([2024]);
  });
  it("KEEPS a bare-frame year preceded by a preposition, no proper noun immediately before (by 2023 SpaceX)", () => {
    // 'by 2023' — no proper noun immediately before the year, it's a temporal frame
    expect(governedYears("by 2023 SpaceX will fly the rocket", "will", [2023])).toEqual([2023]);
  });
  it("KEEPS a sentence-initial temporal-preposition year even when capitalized ('After 2020, the Army planned')", () => {
    // 'After' is a temporal preposition that happens to be sentence-initial (capital A);
    // it is NOT a proper-noun entity label — 2020 is the marker's temporal target frame.
    expect(governedYears("After 2020, the Army planned to buy another 2,618 vehicles.", "planned to", [2020])).toEqual([2020]);
  });
  it("KEEPS a year in the marker's complement clause even when an abbreviation precedes it ('FY 2022' with marker before year)", () => {
    // 'FY 2022' in 'The Navy will request FY 2022 funding' — the marker 'will' precedes 2022
    // in its own clause; the year is the marker's temporal target, not just a label.
    expect(governedYears("The Navy will request FY 2022 funding to replace the AGS turrets.", "will", [2022])).toEqual([2022]);
  });
  it("KEEPS a sentence-initial 'From <year>' range start ('From 2015 to 2022, … will be manufactured')", () => {
    // 'From' is a sentence-initial preposition, not a proper-noun entity name;
    // 2015 is a range-start temporal frame, not a named-entity label.
    expect(governedYears("From 2015 to 2022, 24 units will be manufactured in South Korea.", "will", [2015, 2022])).toContain(2015);
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
