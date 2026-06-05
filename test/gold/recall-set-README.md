<!-- ABOUTME: Companion to recall-set.json — the chosen recall fixtures, selection rationale, the labeling protocol followed, and the measured detector recall baseline. -->
<!-- ABOUTME: Read alongside docs/design/recall-labeling-rubric.md, which is the authoritative labeling guide this set was built against. -->

# Recall gold set — chosen fixtures, protocol, and baseline

This is the exhaustive-recall sample for the WikiAsOfNow deterministic stale-claim
detector. `recall-set.json` is a flat array of every genuinely-stale sentence
(per `docs/design/recall-labeling-rubric.md`) found by reading 12 fixtures in
full, independently of detector output. Recall is `caught / labeled-stale`.

## Chosen fixtures (12, register-balanced)

The recommended register-balanced set was used as-is — all 12 fixtures were read
in full; none were trimmed.

| Register | Fixtures |
|----------|----------|
| Military | `sbx-1`, `m777_howitzer`, `robotic_combat_vehicle` |
| Engineering | `fehmarn_belt_fixed_link`, `gordie_howe_international_bridge`, `long_range_discrimination_radar` |
| Biomedical / policy | `hiv_vaccine_development`, `m72_as01e`, `windsor_framework` |
| Corporate / software | `3_nm_process`, `project_kuiper`, `wi-fi_7` |

**Why this set.** It is register-balanced (four domains × three fixtures), and
each fixture is modest enough to read every sentence exhaustively. The mix gives
both crisp forward-target claims (`m72_as01e`, `robotic_combat_vehicle`,
`long_range_discrimination_radar`) and fixtures dominated by historical narration
/ resolved plans (`fehmarn_belt_fixed_link`, `windsor_framework`,
`gordie_howe_international_bridge`), which exercise the exclusions and guard
against over-labeling.

**Fixtures contributing zero stale claims** — `wi-fi_7` (all dates are
publication/standardization facts or 2024+ targets), `windsor_framework` (a
policy article that is almost entirely historical narration and resolved/scrapped
plans). Reading them in full and labeling nothing is a deliberate part of the
exhaustive denominator and a check on not-over-labeling.

## Labeling protocol followed (rubric §6, anti-circularity / C2)

1. Read each fixture's parsed prose in full (via a throwaway script importing
   `parseArticle` from `src/detector/parse.ts`; deleted, not committed).
2. Labeled `stale` and `reachable` from the prose ONLY, before running the
   detector. `stale` = forward/expectation claim whose target time is now past
   (asOfYear = 2026) and that the article does not resolve nearby. `reachable` =
   an inline 4-digit past year is present in the sentence — decided purely by the
   year's presence, never by whether the detector flags it.
3. Applied the exclusions strictly: historical narration (leading dateline /
   `announced ... in <year>`), resolved-nearby / scrapped plans, incidental
   background years, and pure background facts. Worked examples that were
   deliberately NOT labeled: `fehmarn_belt_fixed_link`'s "originally expected to
   be completed by 2018" (scrapped bridge, resolved by the tunnel paragraph) and
   "Construction would start in 2015 ... completed by the end of 2021" (same
   abandoned bridge plan) — both are detector false positives, correctly left
   unlabeled.
4. THEN ran the detector (`detectStaleClaims(parseArticle(...), 2026)`) and
   assigned each entry's `shapeClass` from the caught/missed result + the lexicon:
   caught reachable → `simple`; missed reachable → `marker-gap` (forward phrase
   not in the lexicon) or `suppression-collateral` (in-lexicon marker dropped by a
   suppression rule); no inline year → `inline-year-absent`.

## Composition

- 12 entries total, all `stale: true`.
- **11 `reachable: true`** (≥ 6 required) — the tuning denominator.
- **1 `reachable: false`** — `sbx-1`'s Adak homeport ("is scheduled to be based in Adak Island"; the article confirms it lapsed — "never deployed to Adak"). This is the single genuine not-reachable stale claim in the 12-fixture sample (see the finding below); it carries the design-limit (absolute) denominator. The composition guard was relaxed from ≥3 to **≥1 not-reachable** (decision recorded in the plan's Deviations) because genuine not-reachable stale claims proved scarce.

**Finding — genuine not-reachable stale claims are rare (≈1 in 12 fixtures).** A stale claim with NO inline year is genuinely stale only when the article gives evidence the forward thing lapsed (the `sbx-1` Adak standard: "never deployed to Adak"). Undated forward commitments WITHOUT such evidence (e.g. m777 "an additional 19 guns will be bought", the AMPV "was scheduled to deliver 2,897", Germany's Fehmarn funding — which is tied to a *future* 2031 completion) fail §1 condition 2 ("target time is now past") and are NOT stale; they were dropped after the label review. The practical implication is reassuring for the deterministic design: **most genuinely-stale claims DO carry an inline year**, so the inline-year requirement (DET-2) costs less absolute recall than feared — the dominant recall gap is `marker-gap` (lexicon), which Phase 2 addresses.

## Measured baseline (asOfYear = 2026, detector v1.0.0)

> **These are the Phase 1 (pre-lexicon-expansion) numbers.** Phase 2 added 5 markers and raised reachable recall to **1.0 (11/11)** and absolute to **0.917 (11/12)** with precision held at 0.97 — see `docs/design/detector-precision-methodology.md` §7.4 for the post-expansion result. The 0.90 reachable-recall floor in `recall.test.ts` now gates regressions.

Computed by checking, for each entry, whether any detector candidate's
`sentenceText` includes the entry's `sentenceSubstring`.

| Metric | Value |
|--------|-------|
| Stale claims caught (reachable) | 7 / 11 |
| Stale claims caught (all) | 7 / 12 |
| **Reachable recall** | **0.636** |
| **Absolute recall** | **0.583** |

### shapeClass counts (all 12 entries)

| shapeClass | count |
|------------|-------|
| `simple` | 7 |
| `marker-gap` | 4 |
| `inline-year-absent` | 1 |

### Misses by shapeClass (the 5 false negatives)

| shapeClass | misses | nature |
|------------|--------|--------|
| `marker-gap` | 4 | reachable; forward phrase outside the lexicon — fixable by lexicon expansion (`was scheduled to`, `is expected by`, `planned to`) |
| `inline-year-absent` | 1 | not reachable; relies on a no-year forward claim the article confirms lapsed (`sbx-1` Adak) — needs the semantic lever, not a bug |
| `simple` | 0 | none missed — no potential detector bug surfaced by this set |

All 7 `simple` claims were caught and **zero `simple` claims were missed**, so this
sample surfaces no detector bug. Every false negative is an expected, documented
gap: the 4 `marker-gap` misses are candidates for Phase 2 lexicon expansion, and
the 1 `inline-year-absent` miss is structurally unreachable.

## Label-review judgment calls (resolved)

- **`gordie_howe_international_bridge` — "The bridge was to be completed by the end
  of 2024."** KEPT as `stale` / `simple`. The completion date is revised later in
  the article (fall 2025) but not in an adjacent sentence, so rubric Exclusion B
  (resolved-nearby, immediate-adjacency only) does not fire. Consistent with the
  precision gold set, which labels the same sentence `stale: true`.
- **The three no-year forward commitments** (`robotic_combat_vehicle` AMPV
  "scheduled to deliver 2,897", `m777_howitzer` "additional 19 guns", and
  `fehmarn_belt_fixed_link` "Germany plans to pay a further") were **dropped** after
  the label review: none has a now-past target or article-confirmed lapse, so under
  a strict reading of §1 condition 2 they are not genuinely stale (the Fehmarn
  funding is tied to a *future* 2031 completion). Only `sbx-1` Adak remains as a
  genuine not-reachable entry — see the finding above.
