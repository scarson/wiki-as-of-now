<!-- ABOUTME: Methodology + roadmap for the deterministic detector's precision — pattern catalog, residual limits, corpus strategy. -->
<!-- ABOUTME: Captures the reasoning behind the suppression rules and the "what's next" lever so it isn't lost to session chat. -->

# Detector precision — methodology, residual limits, and roadmap

**Status:** living note, started 2026-06-05 (Phase 2). **Scope:** the deterministic, LLM-free stale-claim detector (`src/detector/*`). Companion to `docs/pitfalls/implementation-pitfalls.md` §2 (DET-1…DET-3) and the Phase 2 plan's Discoveries. Read those for the per-rule detail; this doc holds the *why* and the *what next*.

## 1. What the detector is (and the precision bias)

It flags a sentence when it has a future-tense/expectation **marker** and an **inline 4-digit year** now in the past, scores it, and suppresses known false-positive shapes. It is deterministic and LLM-free (the "detection is deterministic and explainable" guardrail, G10). Design bias: **precision over recall** — a false "stale" flag spends an editor's attention and erodes trust in the queue, while a missed claim costs nothing. So we suppress aggressively and accept named recall gaps.

## 2. The structural pattern catalog (what we've actually learned)

Building the gold set from *real* detector output over a 100-article corpus (not idealized sentences) surfaced a small number of **structural** patterns. This catalog is the real deliverable of the corpus work — far more than any single precision number.

**Genuine positives (what a real stale claim looks like):** a forward marker whose *target* year is now past, the sentence beginning with its **subject**, not a date — "Testing … is expected to begin in 2020", "… will be fielded in 2018", "expected to be completed by 2018", "scheduled to be launched no earlier than 2024".

**False-positive shapes, and how each is handled:**

| FP shape | Example | Handling |
|---|---|---|
| Leading dateline narration | "In March 2013, X announced plans to add…" | **Rule 1** — frame `In/By/During/As of/On` + optional full date + year, fires when frame year == claim year |
| Quotation | 'a spokesman said it "is expected to launch in 2017"' | **Rule 2** — marker inside a quoted span |
| Resolution cue | "The merger, later completed, was expected to close in 2018." | **Rule 3** — resolution cue + resolution verb |
| Mid-sentence attribution | "X announced plans to acquire … in January 2010" | **Rule 4** — reporting/event verb + `on/in <date>` of the claim year |
| Mid-sentence date-*then*-verb | "in February 2025 it announced … will …" | **residual (DET-2)** — date precedes verb; suppressing it risks real claims |
| `By <year>` deadline | "By 2025, the fleet will reach full strength." | **accepted recall loss (DET-2)** — ambiguous vs. historical "By May 2022, X shifted…" |
| Incidental historical year | "… will replace the Portal Bridge, **built in 1910**, …" | **irreducible (DET-3)** — the year isn't the claim's anchor at all |

The first four are *suppressible* and suppressed. The last three are the honest residuals.

## 3. Why the residuals are not "just more regex"

Each residual was poked at and the obvious fix found to be a trap — captured here so nobody re-derives it:

- **Incidental historical year (DET-3) — now substantially closed by the marker-governs-year lever (cut 1).** The claim's marker doesn't govern the flagged year; the year is background (a founding/launch date, a range, a parenthetical "(1938)"). The tempting *whole-sentence* fixes both fail: a "year-in-a-range → suppress" rule kills a real positive ("**From 2015 to 2022**, 24 units **will be manufactured**"); adding `built|launched|completed` to Rule 4 breaks forward claims ("will be **completed in 2024**") because those verbs are tense-ambiguous and regex can't read the auxiliary. The working fix is NOT whole-sentence suppression but a **year-eligibility filter** (`src/detector/governs.ts`): classify each past year's local role and drop the incidental ones (cross-clause aside, noun-modifier, named-entity, parenthetical, range), keeping `min` of what the marker actually governs. This preserves the mixed case ("the **2021** roadmap expects production in **2024**" → drop 2021, keep 2024) that whole-sentence suppression would lose. Result over the 136-fixture corpus: a curated 23-FP set (5 sub-shapes) all dropped + ~8 uncurated incidental FPs, **precision held at 0.9697 and reachable recall at 1.0** (it even un-masked 2 genuine claims an incidental anchor had hidden). The discriminators ARE deterministic — the key signal turned out to be marker position relative to the year (a year in the marker's own clause is a target; one separated by a clause boundary, or a noun/label/range year, is incidental). Design + full result: `docs/design/2026-06-05-marker-governs-year-design.md`; review `docs/plans/governs-review/round-phase2-final.md`. Residuals remain (named-entity over-KEEP when an entity follows the marker; a leading deadline-frame edge; the one-marker-per-sentence limit) — documented there, candidates for a future tightening pass.
- **Earliest-year + dateline (DET-2) — measured, deliberately NOT recovered (§9).** `detect.ts` anchors to the earliest past year, so "In 2015, … expected to deliver in 2020." suppresses on the 2015 dateline and loses the 2020 target. Preferring the later year would re-flag a large set of genuinely-ambiguous historical-announcement sentences and *lower* precision. The 2026-06-05 spike (§9) quantified this: across 136 fixtures only **2** such sentences are genuine lost targets vs **41** narration, and a deterministic reporting-verb guard scores 0.125 precision — so the earliest-year choice stays the precision-favoring one, and DET-2 recovery is a NO-GO.
- **Mid-sentence date-then-verb.** "in February 2025 it announced …" — catching it needs a date-then-verb rule whose gap window readily over-suppresses directly-asserted forward targets. Rising risk for a thin tail.

**The common root (now partly addressed):** every hard residual was the same missing capability — the detector did not know **which year a given marker governs**, pairing a marker with the earliest past year by position. The marker-governs-year lever (cut 1, `governs.ts`) supplies this for the DET-3 (incidental-year) half deterministically, via clause-association + per-year role classification rather than grammatical parsing. The DET-2 half (re-anchoring a dateline-suppressed sentence to its later governed target — "In 2015, … expected … in 2020") is deliberately still deferred: cut 1's §2.2 leading-dateline guard keeps that year eligible so the sentence stays dateline-suppressed exactly as before, avoiding the precision trap below. DET-2 recovery was then **measured and ruled out** — the spike (§9) found only 2 genuine targets vs 41 narration across 136 fixtures, so it is a NO-GO.

## 4. Precision/recall accounting (be honest about the number)

- **Gold-subset precision: 1.0** — but this is a *regression gate* over labeled entries, not true precision. It cannot drop below ~1.0 by construction (we label what the detector gets right and the FP-classes it correctly suppresses), guarded only against gaming by the ≥3/≥3 composition check.
- **True end-to-end precision: ~88–90% at the foundation, improved by the marker-governs-year lever (cut 1).** The R4 estimate (~3 clear FPs per ~30 non-gold flagged candidates) concentrated residual FPs in DET-2/DET-3. The `governs.ts` year-eligibility filter removed ~31 incidental-anchor (DET-3) flags across the 136-fixture corpus (the 23-entry curated FP set + ~8 uncurated) with no new FP and no recall loss, so the DET-3 share of true-precision FPs is now substantially closed; the remaining residual FPs are DET-2 (dateline/earliest-year — measured and ruled out as a NO-GO, §9) plus the small named-entity over-KEEP tail. The gold-subset precision is **0.9697 (32 TP / 1 FP)** after a gold mislabel was corrected (panzerhaubitze_2000: the sentence targets a *future* 2028, and the past year 2000 is the product name "PzH 2000" — see Discoveries in the lever's plan).
- **Recall: now measured (§7).** Originally uncharacterized; measured in the recall work over a 12-fixture exhaustive sample. **Reachable recall 1.0 (11/11) after the Phase 2 lexicon expansion** (0.636 before), **absolute recall 0.917 (11/12)** — bounded by the one deferred inline-year-absent miss. Zero `simple` claims missed → the deterministic design loses far less recall than feared (most genuinely-stale claims carry an inline year). A 0.90 reachable-recall floor now gates regressions. The remaining recall gap is the inline-year-absent / relative-date class (semantic lever, §6).

## 5. The corpus methodology, and when to stop (the open question)

How we build: fetch raw wikitext (`action=raw`, descriptive UA), run the detector, read *what it actually flags*, label genuine positives and correctly-suppressed FP-class negatives, improve suppression for any **principled** new FP class, never delete a negative to pass the gate. Each domain wave so far found a new structural pattern: military equipment → leading + mid-sentence datelines; the new-domain wave (space/rail/infra/nuclear/aviation/naval) → the incidental-year class (DET-3).

### Per-wave pattern tracking (the instrumentation)

The unit that matters is **new *structural* patterns per wave**, not fixtures added. Tracked so far:

| Wave | Domains | New *structural* patterns | New *instances* of known patterns | Fixable? |
|---|---|---|---|---|
| 1 | US military equipment | leading bare/`In`-month datelines; mid-sentence attribution | — | yes (Rules 1, 4) |
| 2 | space, rail, infra, nuclear, aviation, naval | leading **`On` + full-date** datelines; **incidental historical year** (DET-3) | more dateline/attribution instances | dateline yes (Rule 1+On); incidental-year **no** |
| 3 | clinical/biomedical, legislation/policy | **regulatory effective-date** ("From July 2022 … will need…", "will apply in 2023") | DET-3 (years in named standards "SAP 2005", ranges "2024–2034", election years); Rule-4 verb gaps ("**claimed** in July 2022 that"); Rule-3 verb gaps ("later **moved** that to 2023") | effective-date **no**; verb gaps **yes** (extended Rule 3/4 verb lists) |
| 4 | corporate / software roadmaps | **none** | DET-3 (version/event/product-name years — "2024 Update", "CES 2025", "the 2021 update of the IRDS", game "(2003)"); effective-date again ("Starting in 2022, X will be turned off"); date-then-verb / "In a &lt;date&gt;" attribution | nothing new fixable — only cataloged classes |

**Wave-3 true-precision sample (all 18 flags hand-judged):** ~5 genuine positives, ~13 FPs — but the FPs concentrate in two policy articles (Inflation Reduction Act, Building Safety Act) heavy with named-standard/range/opinion incidental years. Biomedical articles were *cleaner* (clinical-trial "expected to conclude / scheduled to begin in &lt;year&gt;" is a textbook positive). Notable register fact: biomedical/policy prose has **fewer leading `On <date>` datelines** than engineering prose (it cites differently), so the dateline rules fire less.

**Saturation read after wave 3:** the rate of new *fixable structural* patterns is approaching zero. Wave 3's only new structural pattern (regulatory effective-date) is **unfixable** (a `From` frame collides with the "From 2015 to 2022 … will be manufactured" positive; "will apply in 2023" needs semantics); everything else fixable was a *verb-list extension* to an existing rule, i.e. an instance.

**Saturation CONFIRMED after wave 4 (corporate/software roadmaps).** This was the confirmation wave. Across 34 articles / 27 flags, **zero new structural patterns** appeared — every FP mapped to a cataloged class: DET-3 (this register is especially rich in years-in-names — "2024 Update", "CES 2025", "the 2021 update of the IRDS", parenthetical game years), the effective-date pattern again ("Starting in 2022, X will be turned off"), and date-then-verb / "In a &lt;date&gt;" attribution. No new suppression rule was warranted. Clean positives are still plentiful ("TSMC plans to start volume production … in 2023", "expected to be finalized in 2025", "expected to open in June 2024"). True-precision sample ≈ 7/27 — depressed by DET-3-heavy software prose, not by a new gap.

**Conclusion: stop corpus-driven precision work.** Three structurally-distinct registers beyond the original (engineering → biomedical/policy → corporate/software) have left the pattern catalog stable; the remaining FPs are cataloged and mostly unfixable by regex. Further fixtures buy regression breadth (worth a little, if labeled) but not new precision. The remaining gains are in the §6 roadmap — semantic marker-governs-year, true-precision sampling, and **recall** (still unmeasured) — not more fixtures.

**Should we keep expanding "until we stop finding new patterns"?** Recommendation: **a little more, bounded and instrumented — not open-ended.** Reasoning:

- **Distinguish a new *structural* pattern from a new *instance*.** New domains now mostly produce new instances of cataloged patterns; genuinely new structural patterns are getting rarer. The marginal *structural* discovery rate is the real signal — track patterns-found-per-wave, not fixtures-added.
- **"Until we stop finding patterns" has a fuzzy stopping rule.** The pattern space is long-tailed; a quiet wave doesn't prove saturation. Replace the vibe with an explicit rule, e.g. *stop adding domains when N (≈3) consecutive deliberately-distinct domains yield zero new structural patterns, only new instances.*
- **Choose waves for stylistic distance, not volume.** A few registers we haven't touched and that plausibly differ structurally: clinical-trial / biomedical, legislation & policy, corporate product roadmaps, sports/event scheduling, elections. 2–3 of these test saturation better than 50 more of the same.
- **Watch the cost.** The corpus is ~7 MB at 100 fixtures; unbounded growth bloats the repo and slows test reads for marginal discovery. Prefer representative fixtures per domain; prune redundant giants.
- **The gold set, not the raw corpus, is what protects against regressions.** Growth that isn't labeled adds discovery breadth but not regression coverage — keep labeling as we grow.

## 6. Roadmap — higher-leverage than more fixtures

1. **Marker-governs-year.** A notion of which year a marker governs. **DET-3 half: DONE** — shipped as the `governs.ts` year-eligibility filter (cut 1; §3, §4), deterministically, no dependency parser needed. **DET-2 half (dateline re-anchoring): measured NO-GO** — the spike (§9) found only 2 genuine targets across 136 fixtures and a 0.125-precision deterministic guard, so it is not worth building. Mid-sentence attribution remains a thin residual.
2. **Measure true precision by sampling.** Per wave, hand-judge a random sample of *all* flagged candidates (not just gold) to get an unbiased precision number and to detect saturation (FP-rate + new-pattern-rate both plateauing).
3. **Characterize recall. DONE** — the recall work built a 12-fixture exhaustive gold set + a 0.90 reachable-recall floor (§7); reachable recall is 1.0 after the cut-1/lexicon work.
4. **Downstream mitigations carry the irreducible residuals.** DET-3-style FPs are ultimately caught by the human-verification gate and "show your work," not by the detector — the contract already assumes the detector is imperfect and bounds the blast radius.

**Detector roadmap status (2026-06-05): substantially exhausted — diminishing returns on the 136-fixture corpus.** Three consecutive residual-mining candidates have now measured to ~0 prize: DET-2 dateline recovery (§9: 2 genuine/136, NO-GO); the **named-entity over-KEEP** precision residual (0 real FPs in the corpus — the only shape-matches are correct fiscal-year/quarter KEEPs like "FY 2016"/"Q4 2024", and tightening would risk the load-bearing FY-2022 recall positive; NO-GO); and the **inline-year-absent / relative-date** recall class (10 raw hits, 0 genuine-and-deterministically-resolvable — all future, non-deadline, or undatable without a reference date; structurally outside the deterministic detector, confirming §7.3; NO-GO). Cut 1 (DET-3) was the last meaningful deterministic win. **Further detector leverage now requires either corpus expansion (more fixtures → more precision signal, per §5's saturation question) or moving beyond the detector** to the foundational subsystems the design spec calls for but that are not yet built out (the append-only audit log — the "foundational, day one" guardrail; the bounded research-assist layer; safe-lane enforcement; mechanical disclosure; the data layer; the queue UI). Roadmap item 2 (unbiased true-precision sampling) remains the one cheap detector measurement still worth doing if precision confidence is needed before launch.

## 7. Recall — baseline measurement and category survey

### 7.1 The honest recall numbers (12-fixture exhaustive sample)

Recall was measured for the first time during Phase 1 Task 1.3. The methodology: 12 fixtures were read exhaustively, every genuinely-stale sentence labeled **before** running the detector (rubric at `docs/design/recall-labeling-rubric.md`), then detector output was compared against the label set. The sample is register-balanced — 3 military, 3 engineering, 3 biomedical/policy, 3 corporate/software — and every sentence in all 12 fixtures was read; nothing was sampled. The gold is in `test/gold/recall-set.json`; the gate is `test/detector/recall.test.ts`. The companion narrative is in `test/gold/recall-set-README.md`.

| Metric | Value |
|--------|-------|
| Stale claims caught (reachable) | 7 / 11 |
| Stale claims caught (all) | 7 / 12 |
| **Reachable recall** | **0.636** |
| **Absolute recall** | **0.583** |

**Zero `simple` claims were missed** — no potential detector bug surfaced. Every false negative is a documented, expected gap. The 1 not-reachable stale claim (no inline year, article-confirmed lapse) is structurally outside the detector's reach; most genuinely-stale claims DO carry an inline year, so the inline-year requirement (DET-2) costs less absolute recall than feared. The dominant recall gap is `marker-gap` (4 of 5 misses) — forward phrases outside the lexicon — which Phase 2 lexicon expansion directly addresses.

### 7.2 Broader category survey (136-fixture biased scan)

**This section is a biased category survey, not a recall number.** The 12-fixture exhaustive sample (§7.1) is the honest recall number. This scan searched the full 136-fixture corpus for out-of-lexicon forward phrases co-occurring with a past inline year; it does not count every stale sentence (many hits will be resolved/historical/suppressed), it cannot count misses it was not designed to look for, and its counts are therefore not a recall percentage. Its purpose is to **rank which out-of-lexicon forward phrases are most common** so Phase 2 lexicon expansion can prioritize.

Methodology: for every fixture, `parseArticle` was run; each parsed sentence was checked for (a) an out-of-lexicon candidate forward phrase, (b) a past 4-digit year (< 2026), (c) no lexicon marker (so the sentence would be missed by the current detector), and (d) no leading historical dateline. Corpus: 136 `.wikitext` fixtures, `asOfYear = 2026`.

#### Ranked marker-gap table (out-of-lexicon forward phrases with a past year)

Sorted by corpus occurrence count, descending. These are the Phase-2 lexicon-candidate priority list.

| Forward phrase | Corpus count | Representative verbatim examples |
|---|---|---|
| `expected to` (bare — "was/now expected to") | 45 | `an_tps-80`: "was expected to reach initial operating capability in August 2016." — `bell_v-280_valor`: "JMR-TD contracts were expected to be awarded in September 2013, with flights scheduled for 2017." |
| `planned to` | 38 | `3_nm_process`: "American manufacturer Intel planned to start '3 nm' production in 2023." — `amphibious_combat_vehicle`: "A winner is planned to be selected in 2018 to build 204 vehicles, with the first entering service in 2020 and all delivered by 2023." |
| `scheduled for` | 20 | `artemis_program`: "Orion's first launch on SLS, originally scheduled for 2016, was delayed repeatedly and ultimately flew on November 16, 2022, as Artemis I." |
| `intended to` | 15 | `agm-183_arrw`: "in 2025, the Air Force announced that it intended to revive the shelved AGM-183A hypersonic program and move it into the procurement phase." — `integrated_visual_augmentation_system`: "Initially intended to be fielded in 2021, ergonomic and reliability issues have pushed this date back to 2025." |
| `was scheduled to` | 13 | `brightline_west`: "Heavy construction was scheduled to begin in early 2025, with the Nevada DOT saying work could start in April 2025." — `3_nm_process`: "N3P was scheduled to enter volume production in the second half of 2024, and N3X would follow in 2025." |
| `set to` | 6 | `comac_c919`: "The aircraft, bearing the livery of China Eastern Airlines, was set to be delivered in 2022." — `grand_ethiopian_renaissance_dam`: "The reservoir was set to hold 64 billion m³ of water." |
| `slated for` | 5 | `grand_ethiopian_renaissance_dam`: "It was slated for completion in July 2017." — `boeing_777x`: "it is slated for avionics systems, APU, flight test." |
| `to be delivered` | 5 | `comac_c919`: "Plans foresaw that one C919 was to be delivered to China Eastern Airlines in 2022." — `boeing_777x`: "Boeing expects the first aircraft to be delivered in 2027." |
| `to be launched` | 5 | `boeing_new_midsize_airplane`: "If the NMA were to be launched in early 2019, its design would be completed in 2020." |
| `targeting` | 4 | `california_high-speed_rail`: "targeting construction start of the Merced-Bakersfield section by 2012." — `iter`: "A new schedule was issued in July 2024, targeting first plasma in the mid-2030s." |
| `to be fielded` | 3 | `integrated_visual_augmentation_system`: "Initially intended to be fielded in 2021." |
| `due in` | 3 | `boeing_777x`: "The first -9 roll-out is due in late 2018." |
| `aiming to` | 3 | `viper_rover`: "NASA was aiming to land the rover in September 2025 until the mission was canceled on 17 July 2024." |
| `on track to` | 2 | `psyche_spacecraft`: "the spacecraft was in good health and on track to complete its mission on the planned timeline." |
| `intends to` | 1 | `boeing_777x`: "it intends to boost production of current-generation 777 freighters in 2020." |
| `is expected by` | 1 | `long_range_discrimination_radar`: "Testing for Full Operational Capability is expected by 2023." |
| `poised to` | 1 | `iter`: "Switzerland … is poised to rejoin in 2026 following subsequent negotiations." |
| `due to be`, `on course to` | 0 | not observed in this corpus |

**Phase 2 priority read:** the top five phrases — `expected to` (bare, 45), `planned to` (38), `scheduled for` (20), `intended to` (15), `was scheduled to` (13) — together account for the large majority of reachable marker-gap misses. The lexicon already contains `is expected to`, `is scheduled to`, and `is slated to`; the gap is in the bare/past-tense variants (`was expected to`, `planned to`, `was scheduled to`) and the noun-phrase form (`scheduled for`). Extending the lexicon to these five phrases would cover the dominant gap; the remaining phrases have counts of 6 or fewer.

### 7.3 Inline-year-absent / relative-date class (deferred)

The corpus scan found only **2 examples** of the inline-year-absent/relative-date shape (a forward marker with no past year but a relative-date anchor): `ground_combat_vehicle` — "The Army planned to spend … on the GCV over the next five years" — and `k9_thunder` — "The platform will consist of the RCH 155 … by the end of the decade." Both carry no inline past year and cannot be reached by the current inline-year gate. The 12-fixture exhaustive sample found 1 such entry (`sbx-1` Adak). Counts are small and consistent between the two methodologies.

This class requires the semantic lever (§6 roadmap item 1 — marker-governs-year) or external temporal reasoning; it is deferred. No lexicon change addresses it.

### 7.4 Phase 2 result — lexicon expansion (the safe recall win)

Phase 2 added five forward markers to `MARKER_STRENGTH`, each gated one-at-a-time on the precision gate staying ≥0.9 AND no structurally-new corpus FP class: **`expected to` (bare), `expected by`, `scheduled to`, `scheduled for`, `planned to`** (all strength 2). Outcome:

| Metric | Before (Phase 1) | After (Phase 2) |
|--------|------------------|-----------------|
| **Reachable recall** | 0.636 (7/11) | **1.000 (11/11)** |
| **Absolute recall** | 0.583 (7/12) | **0.917 (11/12)** |
| Precision gate | 0.97 | **0.97 (unchanged)** |

All four `marker-gap` misses are now caught; the single remaining miss is the `inline-year-absent` (`sbx-1` Adak), structurally deferred (§7.3). A durable **reachable-recall floor of 0.90** now locks this in (`test/detector/recall.test.ts`) as a regression gate.

**Corrections to the §7.2 prediction (measured, not predicted):** `intended to` (ranked #4 by raw count) was **DROPPED** — ~50% of its new corpus flags were FPs ("intended to replace … " coupling with incidental background years), and it added zero recall-set value; it is a generic purpose verb, not a scheduling marker. `expected by` (raw count 1) was **ADDED** despite its low corpus count because it is a recall-set target ("Full Operational Capability is expected by 2023"). Lesson: rank candidates by FP-gated value, not raw frequency.

**The precision/recall tradeoff to revisit (precision-tightening candidates).** The recall *gate* (11/11) is carried entirely by the three load-bearing markers `scheduled to` / `expected by` / `planned to`. The other two — **bare `expected to` and `scheduled for`** — are NON-load-bearing: they add no recall-gate value, only broader-corpus recall. Bare `expected to` in particular adds ~44 corpus flags at ~15–20% FP density (independently reviewed) — all **cataloged** DET-2 (cross-sentence/earliest-year resolution) and DET-3 (incidental/named-event year) instances, no new class, so it passed the gate, but its density is at the upper edge of "modest." Because the design bias is precision-over-recall, **bare `expected to` (and to a lesser degree `scheduled for`) are the first markers to drop if a future pass prioritizes precision over broad-corpus recall.** They are kept now because two independent reviews confirmed no new FP class and the gate holds; the tradeoff is documented here so it is a deliberate, revisitable choice, not a hidden one.

## 8. Things considered and ruled out (so they aren't retried)

- Year-in-range suppression for DET-3 — over-suppresses real positives.
- Forward-action verbs in Rule 4 — breaks "will be completed in 2024".
- Date-then-verb attribution — thin tail, high over-suppression risk.
- Preferring the latest past year in `detect.ts` — re-flags ambiguous historical announcements, lowers precision. **Now quantified — see §9 (DET-2 measurement spike): NO-GO.**

## 9. DET-2 recall-recovery measurement (spike, 2026-06-05) — NO-GO

The DET-2 residual (a leading dateline suppresses a sentence whose *later* year is a real forward target — "In 2015, X is expected to deliver in 2020" loses 2020) was the natural "cut 2" after the marker-governs-year DET-3 work. Before building a precision-risky re-anchoring, we measured the opportunity. Spec: `docs/design/2026-06-05-det2-measurement-spike-design.md`; data: `test/gold/det2-candidates.json`; plan + reviews: `docs/plans/2026-06-05-det2-measurement-spike-plan.md`, `docs/plans/det2-review/`.

**Method.** Enumerated, deterministically, every currently-suppressed "leading dateline + later governed target" sentence across the 136 fixtures (marker present, `DATELINE_REGEX` frame year == the `min(governedYears)` anchor, a later governed target year < 2026, currently unflagged). Hand-labeled each `genuine-target` (a live forward expectation now past) / `narration` (the dateline dates a past announcement/plan) / `other`, and scored a deterministic **reporting-verb guard** (re-anchor unless a `REPORTING_VERB` sits in the dateline→marker span).

**Result — 47 candidates:**

| label | count |
|---|---|
| `genuine-target` (the recall prize) | **2** |
| `narration` | 41 |
| `other` (resolved-nearby / future target / ambiguous) | 4 |

Reporting-verb guard confusion matrix (over the 43 genuine+narration):

| | guard fires (reporting verb) | guard re-anchors (no reporting verb) |
|---|---|---|
| `genuine-target` | 0 (FN) | **2 (TP — recovered)** |
| `narration` | 27 (TN) | **14 (FP — precision cost)** |

**Guard precision = 2 / 16 = 0.125; recall = 1.0.** (Independently re-verified in review: labels match the fixtures, 0/47 mechanical-field mismatches, matrix reproduces.)

**Decision: NO-GO on cut 2 — neither deterministic nor LLM.** Against the spec's pre-registered criteria:
- **The recall prize is tiny** — 2 genuine targets across 136 fixtures (at most 3 under the most generous re-labeling of the one borderline `other`, `mars_sample_return`), far below the ~5 "worth touching the precision-critical anchor" line. STOP holds on the prize gate alone — ≥3 labels would have to be wrong *in the same direction* to change it, and none of the 41 narration entries support that.
- **The deterministic guard is unusable** — 0.125 precision (14 narration FPs to recover 2 real claims). The verbs that escape `REPORTING_VERB` and cause the FPs are `planned` / `scheduled` / `presented` / `shared` / `shifted` / `informed` / `expected` (plan-state and as-of datelines, not announcement events).
- **The LLM-layer is therefore moot too.** An LLM detection-filter would require a sacrosanct-contract amendment (the detection-is-deterministic + bounded-LLM-role guardrails); recovering ~2 claims/136-articles does not remotely justify that. The LLM question is closed for DET-2 by the size of the prize, not just the guard's weakness.

**Why this was the right measure-first call.** The 41:2 narration-to-genuine ratio *quantifies* the methodology's long-standing instinct (and §3 / §8's "preferring the latest year lowers precision"): a leading dateline in this corpus almost always dates an announcement, so re-anchoring past it is structurally a precision loser. The cheap spike saved building a cut that would have added ~14 FPs (deterministic) or forced a contract amendment (LLM) for a 2-claim gain. The 2 genuine targets both share the **"As of `<date>`, X is expected to … in `<pastYear>`"** shape (an as-of snapshot, not an announcement) — a possible future micro-lever if ever revisited, but not worth it now.

**Redirect.** Higher-leverage next steps than DET-2: the recall work's deferred **inline-year-absent / relative-date** class (§7.3), or tightening cut 1's small **named-entity over-KEEP** residual (`docs/plans/2026-06-05-marker-governs-year-plan.md` Discoveries).
