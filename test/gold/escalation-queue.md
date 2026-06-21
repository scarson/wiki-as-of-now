<!-- ABOUTME: Sam-facing review checklist for the ground-truth corpus pilot — every human_confirmed (Tier-2) record with its candidate evidence and the one-line reason it escalated. -->
<!-- ABOUTME: Navigation for human review only; the persisted corpus is answers.json. Per Task 3.3, no model prose about "the fact" — just the evidence pointers. -->

# Escalation review queue — pilot batch

Each item below is a record in [answers.json](answers.json) with
`certification: "human_confirmed"`. Every `verbatimQuote` is byte-present on its
committed snapshot (the integrity harness enforces this). The proposed
disposition/outcome is the pilot author's read; the escalation reason states why
it did not meet ALL three §2.2 auto-certify criteria. Tier-1 auto-certified items
are NOT listed here (see the calibration log in `answers-README.md` for the split).

Authority allowlist + self-evidence rules:
[design §2.1/§2.2](../../docs/design/2026-06-21-ground-truth-corpus-design.md).

---

## 1. `littoral_combat_ship.wikitext` — "introduction is expected in 2017"

- **Proposed:** `confirmed_stale` / `slipped_still_pending`
- **Evidence:** https://www.defensenews.com/digital-show-dailies/navy-league/2021/08/24/us-navy-completes-testing-of-littoral-combat-ships-minesweeper-system/
  → `test/gold/sources/2021-08-24-us-navy-completes-testing-of-littoral-combat-ship-s-minesweeper-system.md`
- **Quote:** "The U.S. Navy has completed the initial operational test and evaluation of its Unmanned Influence Sweep System (UISS) program, bringing a key element of the littoral combat ship's mine countermeasures mission package"
- **Reason:** Source authority — Defense News is reputable but not on the curated trade-press allowlist; and the year of the slip relies on the article date (2021), not an in-span year.

## 2. `m109_howitzer.wikitext` — "plans to buy 133 vehicles"

- **Proposed:** `confirmed_stale` / `event_occurred`
- **Evidence:** https://thedefensepost.com/2024/08/05/us-army-bae-m109a7/
  → `test/gold/sources/2024-08-05-us-army-awards-bae-additional-493m-m109a7-howitzer-contract.md`
- **Quote:** "The M109A7 entered full rate production in 2020. Since then, $3 billion in contracts have been awarded by the US Army for the howitzer"
- **Reason:** Source authority — The Defense Post is non-curated trade press; the BAE official primary it cites is a JS-SPA that won't transcribe. Also a granularity judgment: the FY2014 "133 vehicles" was a low-rate plan now far exceeded by full-rate production.

## 3. `precision_strike_missile.wikitext` — "achieve initial operational capability in 2023"

- **Proposed:** `confirmed_stale` / `event_occurred`
- **Evidence:** https://news.lockheedmartin.com/2023-12-11-lockheed-martin-delivers-first-prsm-to-us-army
  → `test/gold/sources/2023-12-11-lockheed-martin-delivers-first-precision-strike-missiles-to-us-army.md`
- **Quote:** "Lockheed Martin (NYSE: LMT) has delivered the first Precision Strike Missiles (PrSM) to the U.S. Army providing long-range precision fires capability and achieving a major modernization milestone"
- **Reason:** Disposition ambiguity — the Dec-2023 delivery was *Early* Operational Capability; per the fixture, formal IOC slipped to FY28. `event_occurred` vs `slipped_still_pending` is a judgment call.

## 4. `gordie_howe_international_bridge.wikitext` — "to be completed by the end of 2024"

- **Proposed:** `confirmed_stale` / `slipped_still_pending`
- **Evidence:** https://gordiehoweinternationalbridge.com/personal-travellers-invited-to-breakaway-with-gordie-howe-international-bridge/
  → `test/gold/sources/2026-03-31-personal-travellers-invited-to-breakaway-with-gordie-howe-international-bridge.md`
- **Quote:** "Opening this spring, the Gordie Howe International Bridge will transform how people and goods move across the region"
- **Reason:** Self-evidence — source is the official WDBA authority and the disposition is clear, but the current opening year ("this spring") is supplied by the article date (2026-03-31), not the quoted span.

## 5. `gaganyaan.wikitext` — "scheduled to be launched no earlier than 2024"

- **Proposed:** `confirmed_stale` / `slipped_still_pending`
- **Evidence:** https://www.space.com/space-exploration/human-spaceflight/india-delays-1st-gaganyaan-astronaut-launch-to-2027
  → `test/gold/sources/2025-05-08-india-delays-1st-gaganyaan-astronaut-launch-to-2027.md`
- **Quote:** "The first crewed mission, dubbed H1, will fly in the first quarter of 2027"
- **Reason:** Source authority — Space.com is reputable and reports an official Indian space-minister announcement, but is not on the curated allowlist. (The in-span year is explicit, so this is the closest-to-Tier-1 escalation; flagged for an allowlist decision.)

## 6. `hiv_vaccine_development.wikitext` — "phase one trial is expected to conclude July 2023"

- **Proposed:** `confirmed_stale` / `event_occurred`
- **Evidence:** https://pubmed.ncbi.nlm.nih.gov/40737434/
  → `test/gold/sources/2025-07-30-vaccination-with-mrna-encoded-membrane-anchored-hiv-envelope-trimers-elicited-ti.md`
- **Quote:** "We evaluated the safety and immunogenicity of three mRNA-encoded envelope trimers, including two doses of soluble and membrane-anchored forms, in a randomized, open-label, phase 1 clinical trial"
- **Reason:** Date unverified — the peer-reviewed result (Science Transl. Med.) confirms the phase 1 trial concluded and published, but the exact "July 2023" conclusion date is unconfirmed; ClinicalTrials.gov (NCT05217641) is a JS-SPA that won't transcribe.

## 7. `rivian.wikitext` — "Construction is planned to begin in summer 2022"

- **Proposed:** `confirmed_stale` / `slipped_still_pending`
- **Evidence:** https://www.enr.com/articles/61374-rivian-breaks-ground-on-5b-ev-plant-in-georgia
  → `test/gold/sources/2025-09-18-rivian-breaks-ground-on-5b-ev-plant-in-georgia.md`
- **Quotes (2 spans, same source):**
  - "marking the official start of site development. Construction is expected to mobilize in 2026, with vehicle production beginning in 2028, according to the automaker"
  - "The car company temporarily paused the Georgia project in 2024 to conserve cash while launching its R2 line at its Normal, Ill., plant"
- **Reason:** Disposition judgment + authority — messy pause(2024)/restart(2025) history; `slipped_still_pending` vs `superseded` is a call, and ENR is not on the curated allowlist.

## 8. `honolulu_rail_transit.wikitext` — "is expected to be completed in August 2025"

- **Proposed:** `confirmed_stale` / `slipped_still_pending`
- **Evidence:** https://honolulutransit.org/hart-faqs/what-is-the-current-status-of-the-construction-for-the-honolulu-rail-transit-project/
  → `test/gold/sources/2026-04-21-what-is-the-current-status-of-the-construction-for-the-honolulu-rail-transit-pro.md`
- **Quote:** "Utility relocation work along Dillingham Boulevard is ongoing, along with roadway improvements such as widening and paving. This work is anticipated to be complete by the end of 2026"
- **Reason:** Scope nuance — official HART source, but it describes Segment 3 utility relocations "along Dillingham Boulevard," while the claim names the specific "Kūwili–Kaʻākaukukui" span. Whether these are the same work needs human confirmation.
