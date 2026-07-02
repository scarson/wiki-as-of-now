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

- **Proposed:** `confirmed_stale` / `event_occurred`
- **Evidence:** https://www.navalnews.com/naval-news/2022/07/u-s-navy-declares-ioc-for-unmanned-influence-sweep-system-uiss/
  → `test/gold/sources/2022-07-29-u-s-navy-declares-ioc-for-unmanned-influence-sweep-system-uiss-naval-news.md`
- **Quote:** "declared UISS IOC on 22 July. The program completed formal testing and delivered a system with logistics and training material with appropriately trained Fleet personnel to execute minesweeping as part of the Mine Countermeasures (MCM) Mission Package (MP)."
- **Reason:** Re-grounded on independent verification (2026-07-02). The Increment-three sweep system (USSS, renamed UISS) did not merely slip — it reached IOC on 22 July 2022 (first IOC of any U.S. Navy unmanned surface platform), so as of the current-state verification the introduction `event_occurred` (~5 years late), not `slipped_still_pending`. The original grounding was a 2021 IOT&E-completion snapshot that could support only "slipped as of 2021"; swapped to this NAVSEA press release (via Naval News) carrying the IOC resolving fact and tying UISS to the LCS MCM mission package. Source authority: Naval News is reputable defense trade press (would qualify by type; allowlist call is Sam's); the primary navy.mil release is the same NAVSEA text but is 403-blocked to the fetcher. Residual co-reference note: the claim names "USSS," the source names "UISS" (the rename) — self-evident enough for a human_confirmed record.

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
- **Evidence:** https://honolulutransit.org/hart-faqs/what-is-the-city-center-utilities-relocation-project-and-what-is-the-schedule-for-for-rail-station-and-guideway-construction-work/
  → `test/gold/sources/2025-10-03-what-is-the-city-center-utilities-relocation-project-and-what-is-the-schedule-fo.md`
- **Quote:** "Downtown Utilities Relocation**(Kaʻaʻahi Street to Cooke Street): Ongoing since 2022; nearly complete."
- **Reason:** Re-grounded on independent verification (2026-07-02). The original quote grounded the WRONG segment: it described the "Dillingham Boulevard" relocation, which HART's own contract split (this snapshot) identifies as the separate **Dillingham Utilities Relocation** (Middle St → Kaʻaʻahi St = the fixture's Kahauiki–Kūwili segment, due late 2026) — not the claim's **Kūwili–Kaʻākaukukui** span. Swapped to HART's "City Center Utilities Relocation" FAQ, which names the correct **Downtown Utilities Relocation** (Kaʻaʻahi St → Cooke St = Kūwili–Kaʻākaukukui) as "nearly complete" as of Oct 2025 — i.e. the August 2025 target slipped and the work is still not declared finished, confirming `slipped_still_pending`. Disposition unchanged; grounding corrected. (The `**` in the quote is `url-to-markdown` emphasis bytes, preserved verbatim.)

---

## Batch A — defense programs (LCS/Zumwalt/GCV/FVL/K9/RCV)

---

# Escalation review queue — batch A (claims 9–16)

Calibration note: per Sam's batch-A instruction, **every** record in this batch is
`certification: "human_confirmed"` (no auto-certification this run — Sam promotes to
`agent_auto` later). Items that would otherwise have met all three §2.2 Tier-1
auto-certify criteria are flagged "(Tier-1-eligible)" so the calibration pass can see
where the gate would have fired.

## 9. `littoral_combat_ship.wikitext` — "will be fielded in 2018"

- **Proposed:** `superseded` / `event_cancelled`
- **Authority:** USNI News (high-reliability defense trade press) — **(Tier-1-eligible)**
- **Evidence:** https://news.usni.org/2016/03/24/navys-remote-minehunting-system-officially-canceld-sonar-may-live-on
  → `test/gold/sources/2016-03-24-navy-s-remote-minehunting-system-officially-canceled-sonar-may-live-on-usni-news.md`
- **Quotes (2 spans, same source; co-reference via "RMS"):**
  - "The Navy has officially canceled the Remote Minehunting System acquisition program, but the AN/AQS-20A advanced minehunting sonar within the RMS program may live on in another capacity"
  - "Service officials said then that the Navy would upgrade most of the 10 Remote Multimission Vehicles – the unmanned vehicle at the center of RMS"
- **Judgment call:** The claim is about upgrading the RMMVs (the vehicle at the center of RMS); the article confirms the RMS *program* was officially cancelled in March 2016 (before the 2018 fielding target), so the upgrade-and-field plan is `superseded`/`event_cancelled`. The second span supplies the RMMV↔RMS anchor in-text.

## 10. `littoral_combat_ship.wikitext` — "Knifefish unmanned underwater vehicle (UUV) to find and detect buried mines in 2019"

- **Proposed:** `confirmed_stale` / `slipped_still_pending`
- **Authority:** NAVSEA (`navsea.navy.mil`, official `.mil`) — **(Tier-1-eligible)**
- **Evidence:** https://www.navsea.navy.mil/Media/News/Article-View/Article/1944024/us-navys-knifefish-uuv-program-achieves-milestone-c/
  → `test/gold/sources/2019-08-26-us-navy-s-knifefish-uuv-program-achieves-milestone-c.md`
- **Quotes (2 spans, same source; "Knifefish"/"LRIP" anchor in both):**
  - "granted Milestone C approval to the Knifefish Surface Mine Countermeasure Unmanned Undersea Vehicle Program. The decision clears the way for low-rate initial production (LRIP) of the system"
  - "A full-rate production decision is expected in fiscal year 2022 after additional testing of LRIP systems"
- **Judgment call:** Claim predicted operational buried-mine detection "in 2019." As of Aug 2019 Knifefish only reached Milestone C (LRIP approval); full-rate production decision was pushed to FY2022 — so the 2019 fielding target slipped (`slipped_still_pending`), not cancelled. In-span year (FY2022) resolves the slip without relying on the article date.

## 11. `zumwalt-class_destroyer.wikitext` — "will request FY 2022 funding"

- **Proposed:** `confirmed_stale` / `event_occurred`
- **Authority:** USNI News (high-reliability defense trade press) — reuses the pilot's committed Zumwalt CPS snapshot
- **Evidence:** https://news.usni.org/2024/11/14/navy-wants-to-start-conventional-prompt-strike-tests-aboard-uss-zumwalt-in-2027
  → `test/gold/sources/2024-11-14-navy-wants-to-start-conventional-prompt-strike-tests-aboard-uss-zumwalt-in-2027.md`
- **Quote:** "Part of that overhaul is removing the destroyer’s 155mm Advanced Gun Systems and fitting it with four large diameter tubes to accommodate the missiles for CPS. Wolfe said this work is complete and went well"
- **Judgment call:** The claim is literally a *funding request* (FY2022 budget action) to replace the AGS turrets with Advanced Payload Modules for CPS. No transcribable in-span quote of the FY2022 budget line exists (the official DOT&E FY2022 CPS report is a PDF, which url-to-markdown refuses). This is an **adjacent-milestone** resolution: the funded conversion (AGS removal + CPS tube fitting) is now complete, which confirms the funding request resolved into the predicted action — `event_occurred`. Flagged per the in-span-preference calibration delta: the resolving quote is the completed conversion, not the budget request itself.

## 12. `ground_combat_vehicle.wikitext` — "will each receive $50 million in FY 2015"

- **Proposed:** `superseded` / `superseded`
- **Authority:** Military & Aerospace Electronics (trade press; NOT on the curated allowlist)
- **Evidence:** https://www.militaryaerospace.com/power/article/16718673/army-asks-bae-systems-and-general-dynamics-to-recycle-gcv-vetronics-for-future-fighting-vehicle
  → `test/gold/sources/2014-08-18-army-asks-bae-systems-and-general-dynamics-to-recycle-gcv-vetronics-for-future-f.md`
- **Quotes (2 spans, same source; GCV/BAE/GDLS anchor in both):**
  - "awarded $7.9 million study contracts last week to GCV contractors BAE Systems Land & Armaments LP in Sterling Heights, Mich., and to General Dynamics Land Systems (GDLS)"
  - "The Ground Combat Vehicle program, cancelled in February due to budget constraints"
- **Judgment call:** Claim said BAE and GD would "each receive $50 million in FY 2015 to continue technology development." The GCV was cancelled Feb 2014; instead they each got **$7.9M** study contracts (Aug 2014) to recycle GCV vetronics for a possible Future Fighting Vehicle. So the $50M/FY2015 plan was superseded by a smaller post-cancellation arrangement (`superseded`/`superseded`), not merely slipped. Escalated for (a) non-allowlist trade press and (b) the superseded-vs-slipped/unverifiable disposition call.

## 13. `future_vertical_lift.wikitext` — "build technology demonstration aircraft with flight tests starting in 2017"

- **Proposed:** `confirmed_stale` / `event_occurred`
- **Authority:** Bell (news.bellflight.com — the primary manufacturer named in the claim) — **(Tier-1-eligible)**
- **Evidence:** https://news.bellflight.com/en-US/162449-bell-v-280-valor-achieves-first-flight/
  → `test/gold/sources/2017-12-18-bell-v-280-valor-achieves-first-flight.md`
- **Quotes (2 spans, same source; "V-280 Valor" anchor in both):**
  - "today announced that its V-280 Valor has achieved first flight. The V-280 Valor is a next-generation tiltrotor"
  - "The Bell V-280 Valor program is part of the Joint Multi Role   Technology Demonstrator (JMR-TD) initiative"
- **Judgment call:** Claim predicted JMR-TD demonstrator flight tests "starting in 2017." The V-280 Valor (a JMR-TD technology demonstrator) achieved first flight on 18 Dec 2017 — `event_occurred`. The year is established by the press-release date (18 Dec 2017) rather than a digits-in-span quote; the first-flight fact and the JMR-TD anchor are both in-span. (SB-1 Defiant, the other team, first flew March 2019 — a later slip — but the claim resolves true via the V-280 on the 2017 target.)

## 14. `k9_thunder.wikitext` — "HSW will begin producing PK9 chassis starting in 2017"

- **Proposed:** `confirmed_stale` / `slipped_still_pending`
- **Authority:** Defence24 (defence24.com — defence trade press, cited by the fixture itself)
- **Evidence:** https://defence24.com/armed-forces/land/series-manufactured-krab-howitzers-for-the-polish-military
  → `test/gold/sources/2019-03-21-series-manufactured-krab-howitzers-for-the-polish-military.md`
- **Quotes (2 spans, same source):**
  - "It was assumed that to the introductory DMO element would use readymade PK9/K9PL platforms delivered by the licensor and HSW S.A.’s partner, the Hanwha Techwin company"
  - "ready to deliver the first battery (8 howitzers, 4 command/staff command vehicles, 2 WA ammunition carriers and 1 WRUiE repair vehicles) during the last quarter of 2018"
- **Judgment call:** Inference needed — "producing PK9 chassis" means HSW's *domestic* manufacture. Source shows the introductory DMO (2016–17) used *readymade* PK9/K9PL platforms from the Korean licensor (HSW not yet producing them), and HSW's own series production for the first battery was due Q4 2018, then delayed to 16 March 2019. So the 2017 domestic-production start slipped (`slipped_still_pending`). Escalated: disposition relies on distinguishing readymade-delivery from HSW manufacture (not a single self-evident span), and the slip year (2018→2019) is adjacent to, not exactly, the claimed 2017.

## 15. `k9_thunder.wikitext` — "All Korean K9s will receive A1 upgrades"

- **Proposed:** `confirmed_stale` / `slipped_still_pending`
- **Authority:** Janes (janes.com — on the curated high-reliability trade-press allowlist) — **(Tier-1-eligible)**
- **Evidence:** https://www.janes.com/osint-insights/defence-news/land/south-korea-to-upgrade-k9a1-howitzers
  → `test/gold/sources/2023-06-01-south-korea-to-upgrade-k9a1-howitzers.md`
- **Quotes (2 spans, same source; "K9A1" anchor in both):**
  - "According to *Janes World Armies, *the RoKA operates 1,136 K9 and K9A1 SPHs"
  - "The enhanced K9A1 version, which features an improved mission system was deployed from 2018"
- **Judgment call:** Claim = "all Korean K9s will receive A1 upgrades, starting in 2018." The A1 deployment did begin in 2018 (span 2), but as of mid-2023 the RoKA fleet is still a *mix* of 1,136 K9 and K9A1 (span 1) — "all" not achieved. (Fixture's own 2024 DAPA cite caps it at 600 vehicles, and the newer K9A2 program is now the headline upgrade.) Read as `slipped_still_pending`: the 2018-start happened but the fleet-wide "all" conversion is incomplete with no in-source completion date. Escalated because (a) `slipped_still_pending` vs `superseded` (A1→600/K9A2) is a genuine disposition call, and (b) "all not yet done" is partly an absence-of-evidence inference.

## 16. `robotic_combat_vehicle.wikitext` — "Testing of the vehicle is expected to begin in 2020"

- **Proposed:** `superseded` / `superseded`
- **Authority:** Defense News (reputable, but NOT on the curated allowlist — same as pilot item 1)
- **Evidence:** https://www.defensenews.com/land/2020/01/16/army-takes-step-back-on-bradley-replacement-prototyping-effort/
  → `test/gold/sources/2020-01-16-us-army-cancels-current-effort-to-replace-bradley-vehicle.md`
- **Quotes (2 spans, same source; both from the Army acquisition chief's OMFV statement):**
  - "Today the U.S. Army will cancel the current solicitation for the Section 804 Middle Tier acquisition rapid prototyping phase of the [optionally manned fighting vehicle]"
  - "we have determined it is necessary to revisit the requirements, acquisition strategy and schedule moving forward"
- **Judgment call:** Context check — the fixture sentence sits in the **OMFV** paragraph (30mm cannon + 2nd-gen FLIR), so "the vehicle" = OMFV, not the RCV. In Jan 2020 the Army cancelled the current OMFV prototyping solicitation (single bidder) and restarted requirements/strategy/**schedule** — so the planned 2020 testing did not proceed on schedule; the effort was superseded by a restarted competition (`superseded`/`superseded`, explicitly "not abandoned"). Escalated for non-allowlist authority and the superseded-vs-slipped call.


---

## Batch B — defense programs (Blackjack/PGK/K9/Dark Eagle/LRDR/PrSM)

## 9. `k9_thunder.wikitext` — "24 units will be manufactured in South Korea"

- **Proposed:** `confirmed_stale` / `event_occurred`
- **Evidence:** https://www.technology.org/2023/03/16/why-did-it-take-almost-20-years-for-poland-to-develop-ahs-krab/
  → `test/gold/sources/2023-03-16-why-did-it-take-almost-20-years-for-poland-to-develop-ahs-krab.md`
- **Quote:** "In 2014 a new chassis developed by the Korean Samsung Techwin was chosen, but the first 24 chassis were to be delivered in 2017. This means that the full-rate production of 120 Krabs for the Polish Army has started only in 2016"
- **Reason:** Source authority + date framing — technology.org is a low-authority republisher, not on the curated allowlist; and the resolving fact ("first 24 chassis were to be delivered in 2017") is partly forward-framed (the in-span resolving anchor is "full-rate production … started only in 2016"). The fixture's own resolving cite (all 24 Korean chassis left for Poland by Oct 2016) is Korean-language; no high-authority English source positively states the 24-unit completion in-span.

## 10. `long_range_discrimination_radar.wikitext` — "The first operation is expected to start from 2025"

- **Proposed:** `superseded` / `superseded`
- **Evidence:** https://news.lockheedmartin.com/2025-07-07-Aegis-System-Equipped-Vessel-Takes-Shape-Lockheed-Martin-Delivers-AN-SPY-7-V-1-Radar-Antennas-to-Japan
  → `test/gold/sources/2025-07-07-aegis-system-equipped-vessel-takes-shape-lockheed-martin-delivers-an-spy-7-v-1-r.md`
- **Quote:** "The JMOD is acquiring two ASEVs, and both are on track for commissioning in Japan Fiscal Year 2027 and 2028"
- **supersededBy:** Aegis System Equipped Vessels (ASEV) — two SPY-7 destroyers commissioning JFY2027/2028, replacing the cancelled land-based Aegis Ashore deployment.
- **Reason:** Inference/stitching — the claim is the Japanese **Aegis Ashore** SPY-7(V)1 plan ("first operation from 2025, by Ground SDF"). Lockheed (manufacturer primary, high authority) confirms the *replacement* plan (two ASEV ships, FY2027/2028 commissioning), but the supersession link — that Aegis Ashore was cancelled in 2020 and these two radars repurposed onto ASEV destroyers — is background knowledge, not stated in the quoted span. Disposition `superseded` vs `confirmed_stale/slipped` is a human call.

## 11. `dark_eagle.wikitext` — "field the weapon aboard its Zumwalt-class destroyers by 2025"

- **Proposed:** `confirmed_stale` / `slipped_still_pending`
- **Evidence:** https://news.usni.org/2024/11/14/navy-wants-to-start-conventional-prompt-strike-tests-aboard-uss-zumwalt-in-2027
  → `test/gold/sources/2024-11-14-navy-wants-to-start-conventional-prompt-strike-tests-aboard-uss-zumwalt-in-2027.md` (snapshot shared with the existing zumwalt-class CPS pilot record)
- **Quote:** "delayed plans to field CPS aboard the Zumwalt class from Fiscal Year 2025 to FY 2026"
- **Reason:** Per the calibration directive every record this batch is `human_confirmed` (no auto-cert). Substantively this is a strong in-span resolving quote from USNI News (reputable defense outlet); the only judgment is the cross-name co-reference that the Navy's "CPS" is the same Dark Eagle/LRHW weapon the claim names (shared Common Hypersonic Glide Body) — self-evident from the fixture but worth a human confirm. Reuses the committed pilot snapshot.

## 12. `precision_strike_missile.wikitext` — "upgraded seeker is expected to be part of a major program improvement"

- **Proposed:** `confirmed_stale` / `slipped_still_pending`
- **Evidence:** https://www.janes.com/osint-insights/defence-news/industry/pentagon-budget-2025-precision-strike-missile-inc-2-procurement-delayed
  → `test/gold/sources/2024-03-13-pentagon-budget-2025-precision-strike-missile-inc-2-procurement-delayed.md`
- **Quote:** "The multimode seeker that makes the US Army's Precision Strike Missile Increment 2 (PrSM Inc 2) unique and more advanced than Inc 1 is holding the capability back from its scheduled procurement in fiscal year (FY) 2025"
- **Reason:** Per the calibration directive, `human_confirmed` (no auto-cert this batch). Substantively near-Tier-1: Janes is on the curated trade-press allowlist and the in-span quote names the subject anchor (the upgraded multimode seeker / PrSM Inc 2) and the resolving fact (the 2025 program improvement is held back / pushed to FY2026 because the seeker tech "was not ready"). Worth a human confirm that the fixture's "major program improvement planned for 2025" maps to PrSM Inc 2 (the seeker upgrade), which the fixture context supports.

## 13. `k9_thunder.wikitext` — "manufacturing is expected to start in Q4 2024"

- **Proposed:** `confirmed_stale` / `event_occurred`
- **Evidence:** https://www.hanwha-defence.com.au/news/first-australian-made-as9s-debut-in-geelong
  → `test/gold/sources/2026-02-26-first-australian-made-as9s-debut-in-geelong.md`
- **Quote:** "Hanwha Defence Australia (HDA) has welcomed the first three Australian-made AS9 HuntsmanSelf-Propelled Howitzers (SPH) made at the Hanwha Armoured Vehicle Centre of Excellence (H-ACE) in Victoria" (the "HuntsmanSelf" missing-space is the snapshot's literal bytes; preserved verbatim)
- **Reason:** Per the calibration directive, `human_confirmed`. Substantively near-Tier-1: this is the official manufacturer (Hanwha Defence Australia) primary release. The claim is the Geelong (H-ACE) facility manufacturing "expected to start in Q4 2024"; the resolving fact is that the first Australian-made AS9s came off the Geelong line, debuting Feb 2026 — `event_occurred` (it happened, ~14 months late). Judgment for human: `event_occurred` vs `slipped_still_pending` — production DID start (vehicles exist), so `event_occurred`, but the ~14-month slip is notable.

## 14. `k9_thunder.wikitext` — "The manufacturing will start in 2022"

- **Proposed:** `confirmed_stale` / `slipped_still_pending`
- **Evidence:** https://www.janes.com/osint-insights/defence-news/defence/south-korea-to-mass-produce-extended-range-projectiles-for-k9-howitzers
  → `test/gold/sources/2024-02-08-south-korea-to-mass-produce-extended-range-projectiles-for-k9-howitzers.md`
- **Quote:** "South Korean metal and munition manufacturer Poongsan will initiate the mass production of the extended-range 155 mm artillery shells for the Hanwha Land Systems K9 Thunder self-propelled howitzers (SPHs) in 2024"
- **Reason:** Co-reference + date judgment. The claim is the Poongsan extended-range 155mm BB+RAP round whose manufacturing was "expected to start in 2022, operational by 2023" (the fixture itself notes a delay from failed heat/cold-wave tests). Janes (allowlist) confirms the same Poongsan extended-range 155mm-for-K9 program slipped to **mass production in 2024** (combat-suitability cert July 2023) — a clean `slipped_still_pending`. Human-confirm caveats: (a) the Janes/DAPA round is reported at 60 km / ">30%" range while the fixture says 54 km — same Poongsan K9 extended-range program, range figure refined over time, but worth confirming it is the same munition, not a sibling round; (b) the fixture's "accepted for service" in Nov 2020 vs DAPA's Feb-2024 "system development completion" suggests milestone conflation in the article. The official DAPA primary (defensemirror transcription of the DAPA release, 2024-01-27, hash 5d99092e…) corroborates but is a secondary outlet; the Janes span is the cleaner in-span resolver.

## 15. `m1156_precision_guidance_kit.wikitext` — "will be designed to operate with the GPS-M satellite constellation"

- **Proposed:** `confirmed_stale` / `event_occurred`
- **Evidence:** https://www.janes.com/osint-insights/defence-news/defence/northrop-grumman-integrating-m-code-into-precision-artillery
  → `test/gold/sources/2023-01-30-northrop-grumman-integrating-m-code-into-precision-artillery.md`
- **Quote:** "CAES, a Northern Virginia-based company specialising in advanced radio frequency (RF) technologies, will carry out the M-Code GPS integration work into Northrop Grumman's Precision Guidance Kit (PGK)"
- **Reason:** Co-reference judgment. The claim's "GPS-M satellite constellation" (the fixture wikilinks GPS-M → GPS Block III) is the modernized military GPS signal — i.e. **M-Code**, the encrypted military-only GPS signal. Janes (allowlist) confirms Northrop Grumman (the PGK manufacturer / primary org) began integrating M-Code into the PGK (CAES integration deal announced Jan 2023, ~1 yr after the 2022 plan) → `event_occurred`. Human-confirm: the source names "the PGK" generally, not the specific "M1156E3/A2" variant the fixture cites; mapping M-Code ⇄ "GPS-M constellation" and PGK ⇄ M1156 is self-evident but is the relevance call reserved for the human. Official CAES press release corroborates but is a JS-SPA that won't transcribe (businesswire/caes.com both SPA); the Janes span is the clean resolver.

## 16. `boeing_insitu_rq-21_blackjack.wikitext` — "plans to add a sensor to the Blackjack"

- **Proposed:** `confirmed_stale` / `event_occurred`
- **Evidence (2 spans, 2 sources):**
  - https://www.navalnews.com/naval-news/2021/04/logos-technologies-successfully-tests-wami-sensor-on-rq-21a-blackjack/
    → `test/gold/sources/2021-04-26-logos-technologies-successfully-tests-wami-sensor-on-rq-21a-blackjack-naval-news.md`
    — Quote: "We are very excited by our recent test aboard the RQ-21A Blackjack"
  - https://seapowermagazine.org/logos-technologies-successfully-flight-tests-sprite-multi-sensor-pod-for-onr/
    → `test/gold/sources/2021-07-28-logos-technologies-successfully-flight-tests-sprite-multi-sensor-pod-for-onr-sea.md`
    — Quote: "with the successful test flight of the Spectral and Reconnaissance Imaging for Tactical Exploitation (SPRITE) pod earlier this year, has met all the goals of its five-year contract with the Office of Naval Research"
- **Reason:** Multi-source span + disposition nuance (escalated). The ONR program in the claim is **SPRITE** (Logos Technologies, $18.2M ONR contract, four-sensor inspection payload, originally due 27 March 2020 — per the fixture's own 2015 Flightglobal cite). Resolution: the WAMI component was flight-tested aboard the RQ-21A Blackjack (Apr 2021) and the full SPRITE pod met all ONR goals (Jul 2021) — so the sensor effort `event_occurred`, ~1 year past the 2020 target. Human-confirm caveats: (a) the *full integrated four-sensor pod* ultimately flew on a manned Cessna 337, not the Blackjack — only the WAMI sensor flew on the Blackjack — so "add a [single multi-sensor] payload to the Blackjack by 2020" was only partially realized as specified; (b) `event_occurred` vs `slipped_still_pending` is a judgment given the 2020→2021 slip; (c) two evidence sources are needed to co-locate "Blackjack" (navalnews) and "SPRITE/ONR program completion" (seapower) — neither single span carries both anchors, which is itself the reason this is Tier-2 rather than Tier-1.


---

## Batch C — civil/tech (Gateway/Brightline/M72/aducanumab/3nm/PCIe/Kuiper)

## 9. `aducanumab.wikitext` — "is expected to continue for existing commercial patients until November 2024"

- **Proposed:** `confirmed_stale` / `event_occurred`
- **Evidence:** https://www.alz.org/alzheimers-dementia/treatments/aducanumab
  → `test/gold/sources/2026-06-21-aducanumab-discontinued-as-alzheimers-treatment-alz-org.md`
- **Quote:** "Biogen announced in January 2024 that Aduhelm would be discontinued in November 2024, allowing clinical trial participants access until May 1, 2024, and those receiving it by prescription until Nov. 1, 2024."
- **Reason:** Source authority — the Alzheimer's Association is a high-reliability medical nonprofit but is not on the curated Tier-1 allowlist (it is secondary to Biogen's own commercial-wind-down announcement). The in-span resolving date (prescription patients until Nov. 1, 2024) is explicit; disposition is unambiguous, so this is a close-to-Tier-1 escalation flagged for an allowlist decision.

## 10. `3_nm_process.wikitext` — "TSMC plans to start volume production"

- **Proposed:** `confirmed_stale` / `event_occurred`
- **Evidence:** https://pr.tsmc.com/english/news/2986
  → `test/gold/sources/2022-12-29-tsmc-holds-3nm-volume-production-and-capacity-expansion-ceremony-marking-a-key-m.md`
- **Quote:** "**HSINCHU, Taiwan, R.O.C. – Dec. 29, 2022 **-** **TSMC (TWSE: 2330, NYSE: TSM) today held a 3 nanometer (3nm) Volume Production and Capacity Expansion Ceremony"
- **Reason:** Listed for completeness only — this is the primary official TSMC press room with a single self-evident in-span span carrying the date (Dec. 29, 2022), subject anchor (TSMC / 3nm), and resolving milestone, so it genuinely meets all three §2.2 Tier-1 criteria. Marked `human_confirmed` solely because this batch certifies every record human per the run directive, NOT because of any doubt. Note: the claim predicted 2023; actual volume production began Dec 2022 (the event occurred — the milestone is real, the predicted year is wrong-direction-early but the claim is still stale as a forward assertion about a now-past plan).

## 11. `project_kuiper.wikitext` — "is expected to open in June 2024" → UNVERIFIABLE

- **Proposed:** `unverifiable` / `unverifiable` (`evidence: []`)
- **Best available (insufficient) candidate:** https://www.geekwire.com/2024/amazon-kuiper-satellite-training-program-everett-logistics/ — span "Amazon said the hub is due to come fully online by next month" (dated 2024-05-14, so "next month" = June 2024).
- **Reason:** No qualifying source establishes the **current state** of the Everett logistics center. Every retrievable source is the same May-14-2024 announcement cluster (GeekWire, HeraldNet, Seattle Times, SatelliteToday), all of which only restate the *expectation* that the facility would come online in June 2024 — a snapshot-date-relative re-assertion of the claim, not a resolving fact (it does not confirm the facility opened on time, slipped, or was cancelled). Seattle Times follow-ups are paywalled and concern the Kirkland hub, not Everett. Per the calibration rule (adjacent/snapshot-relative-only quote → record but flag), recorded as `unverifiable` rather than inventing a disposition the evidence does not support. No snapshot committed (unverifiable → empty evidence).

## 12. `pci_express.wikitext` — "The specification is expected to be finalized in 2025"

- **Proposed:** `confirmed_stale` / `event_occurred`
- **Evidence:** https://www.businesswire.com/news/home/20250611299049/en/PCI-SIG-Releases-PCIe-7.0-Specification-to-Support-the-Bandwidth-Demands-of-Artificial-Intelligence-at-128.0-GTs-Transfer-Rates
  → `test/gold/sources/2025-06-11-pci-sig-releases-pcie-7-0-specification-to-support-the-bandwidth-demands-of-arti.md`
- **Quote:** "PCI-SIG announced the official release of the PCI Express (PCIe) 7.0 specification, reaching 128.0 GT/s."
- **Reason:** Source authority is strong (the official PCI-SIG release distributed via BusinessWire — the same standards-body/newswire pairing the fixture itself cites for the PCIe 7.0 announcement; PCI-SIG is the primary standards org named in the claim). The in-span quote carries the subject anchor + resolving fact (official release of PCIe 7.0) but **not the year in-span** — the 2025 date is pinned by the snapshot dateline (`date: 2025-06-11`) and the BusinessWire URL slug (`20250611`), and the body says "today announced." Flagged for human confirmation that snapshot-pinned-year (rather than in-span-year) grounding is acceptable for this record; disposition itself is unambiguous (the spec finalized in 2025, exactly the predicted year).

## 13. `m72_as01e.wikitext` — "is scheduled to begin in 2024"

- **Proposed:** `confirmed_stale` / `event_occurred`
- **Evidence:** https://www.gatesmri.org/mri-initiates-phase-3-clinical-trial-tuberculosis-vaccine-candidate/
  → `test/gold/sources/2024-03-19-bill-melinda-gates-medical-research-institute-initiates-phase-3-clinical-trial-o.md`
- **Quote:** "**Cambridge, Mass., USA (19 March 2024)** – The Bill & Melinda Gates Medical Research Institute (Gates MRI) today announced that a Phase 3 clinical trial to assess the efficacy of the M72/AS01E tuberculosis (TB) vaccine candidate is now underway, with first doses given in South Africa"
- **Reason:** Listed for completeness only — primary official source (the Gates MRI, the named trial sponsor/funder in the claim) with a single self-evident in-span span carrying the date (19 March 2024), the subject anchor (M72/AS01E TB vaccine), and the resolving milestone (Phase 3 trial now underway, first doses given). Genuinely meets all three §2.2 Tier-1 criteria; `human_confirmed` solely per this batch's run directive, not from doubt. The predicted "begin in 2024" event occurred in March 2024.

## 14. `gateway_program_northeast_corridor.wikitext` — "was expected to be completed in October 2025"

- **Proposed:** `confirmed_stale` / `event_occurred`
- **Evidence:** https://www.gatewayprogram.org/tonnelle-avenue-bridge-utility-relocation-project.html
  → `test/gold/sources/2026-06-21-tonnelle-avenue-bridge-utility-relocation-gateway-program.md`
- **Quote:** "Ground broke on the Tonnelle Avenue Project in November 2023, marking the start of Hudson Tunnel Project construction in New Jersey. The project was completed in 2026."
- **Reason:** Listed for completeness only — official Gateway Program project page (the program office named in the claim), in-span resolving fact carrying the subject anchor (Tonnelle Avenue Project) and the completion year (2026); the page also flags "Status: Complete." Genuinely meets all three §2.2 Tier-1 criteria; `human_confirmed` per the run directive. Disposition nuance worth a glance: the predicted October-2025 completion was missed — actual completion was 2026 — but because the project DID complete, the outcome is `event_occurred` (the predicted thing happened, late), not `slipped_still_pending` (which is for events that have not yet happened).

## 15. `brightline_west.wikitext` — "to be completed by the end of 2013" → UNVERIFIABLE

- **Proposed:** `unverifiable` / `unverifiable` (`evidence: []`)
- **Reason:** No qualifying source establishes the **current state** of the specific milestone in the claim. The claim ("the earliest environmental work [for the Victorville–Palmdale / DesertXpress Metrolink link] was to be completed by the end of 2013") traces to a single June-2012 Vegas Inc. article, and the fixture itself notes "the date of the service for this link has not been determined." The corridor concept was repeatedly reshaped (DesertXpress → High Desert Corridor → a possible Brightline West extension); as of 2025 the Victor Valley–Palmdale link is only at the design-firm-hiring stage and the High Desert connection is described as "as-yet unbuilt" (la.urbanize.city, 2025-09-02). No accessible source verbatim-states whether the specific 2013 environmental-work milestone was completed, slipped, or abandoned. The most directly on-point candidate (vvdailypress.com, 2025-06-27, "Victor Valley to Palmdale … hires HDR for design") is blocked by the environment's egress policy (HTTP 403). Recorded `unverifiable` rather than stitching a disposition from adjacent-corridor reporting. No snapshot committed (unverifiable → empty evidence).

