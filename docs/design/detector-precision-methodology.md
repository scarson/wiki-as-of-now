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

- **Incidental historical year (DET-3).** The claim has no target year; the flagged year is background (a founding/launch date, a range, a parenthetical "(1938)"). The tempting fixes both fail: a "year-in-a-range → suppress" rule kills a real positive ("**From 2015 to 2022**, 24 units **will be manufactured**"); adding `built|launched|completed` to Rule 4 breaks forward claims ("will be **completed in 2024**") because those verbs are tense-ambiguous and regex can't read the auxiliary. There is no deterministic discriminator between an incidental year and a target year.
- **Earliest-year + dateline (DET-2).** `detect.ts` anchors to the earliest past year, so "In 2015, … expected to deliver in 2020." suppresses on the 2015 dateline and loses the 2020 target. Preferring the later year would re-flag a large set of genuinely-ambiguous historical-announcement sentences and *lower* precision — so the earliest-year choice is the precision-favoring one, not a bug.
- **Mid-sentence date-then-verb.** "in February 2025 it announced …" — catching it needs a date-then-verb rule whose gap window readily over-suppresses directly-asserted forward targets. Rising risk for a thin tail.

**The common root:** every hard residual is the same missing capability — the detector does not know **which year a given marker governs**. It pairs a marker with the earliest past year by position, not by grammatical dependency.

## 4. Precision/recall accounting (be honest about the number)

- **Gold-subset precision: 1.0** — but this is a *regression gate* over labeled entries, not true precision. It cannot drop below ~1.0 by construction (we label what the detector gets right and the FP-classes it correctly suppresses), guarded only against gaming by the ≥3/≥3 composition check.
- **True end-to-end precision: ~88–90%** (R4 reviewer estimate, ~3 clear FPs per ~30 non-gold flagged candidates), with residual FPs concentrated in DET-2/DET-3.
- **Recall: uncharacterized.** We have systematically hunted *false positives*; we have **not** measured *missed* stale claims (false negatives). The aggressive suppression certainly drops some real claims (every DET-2 gap is a recall loss). This is a real blind spot in the current methodology.

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

1. **Marker-governs-year (the one lever that matters).** A notion of which year a marker syntactically governs would close DET-3, improve the earliest-year/dateline interaction (DET-2), and sharpen mid-sentence attribution — all at once. This is a **semantic step beyond the current deterministic-regex design** (lightweight dependency parsing or a constrained grammar over the sentence), and would be a design decision to take deliberately, not another regex. **This is the next real precision lever.**
2. **Measure true precision by sampling.** Per wave, hand-judge a random sample of *all* flagged candidates (not just gold) to get an unbiased precision number and to detect saturation (FP-rate + new-pattern-rate both plateauing).
3. **Characterize recall.** Build a small set of known-stale sentences the detector *should* catch and measure misses — we have never done this; precision-only tuning hides it.
4. **Downstream mitigations carry the irreducible residuals.** DET-3-style FPs are ultimately caught by the human-verification gate and "show your work," not by the detector — the contract already assumes the detector is imperfect and bounds the blast radius.

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

## 8. Things considered and ruled out (so they aren't retried)

- Year-in-range suppression for DET-3 — over-suppresses real positives.
- Forward-action verbs in Rule 4 — breaks "will be completed in 2024".
- Date-then-verb attribution — thin tail, high over-suppression risk.
- Preferring the latest past year in `detect.ts` — re-flags ambiguous historical announcements, lowers precision.
