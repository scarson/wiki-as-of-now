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

**Should we keep expanding "until we stop finding new patterns"?** Recommendation: **yes to more, but bounded and instrumented — not open-ended.** Reasoning:

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

## 7. Things considered and ruled out (so they aren't retried)

- Year-in-range suppression for DET-3 — over-suppresses real positives.
- Forward-action verbs in Rule 4 — breaks "will be completed in 2024".
- Date-then-verb attribution — thin tail, high over-suppression risk.
- Preferring the latest past year in `detect.ts` — re-flags ambiguous historical announcements, lowers precision.
