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

- 15 entries total, all `stale: true`.
- **11 `reachable: true`** (≥ 6 required) — the tuning denominator.
- **4 `reachable: false`** (≥ 3 required) — `sbx-1` Adak homeport, the AMPV
  delivery schedule, the m777 "additional 19 guns", and Germany's Fehmarn funding
  commitment. These carry a real share of the design-limit (absolute) denominator.

## Measured baseline (asOfYear = 2026, detector v1.0.0)

Computed by checking, for each entry, whether any detector candidate's
`sentenceText` includes the entry's `sentenceSubstring`.

| Metric | Value |
|--------|-------|
| Stale claims caught (reachable) | 7 / 11 |
| Stale claims caught (all) | 7 / 15 |
| **Reachable recall** | **0.636** |
| **Absolute recall** | **0.467** |

### shapeClass counts (all 15 entries)

| shapeClass | count |
|------------|-------|
| `simple` | 7 |
| `marker-gap` | 4 |
| `inline-year-absent` | 4 |

### Misses by shapeClass (the 8 false negatives)

| shapeClass | misses | nature |
|------------|--------|--------|
| `marker-gap` | 4 | reachable; forward phrase outside the lexicon — fixable by lexicon expansion (`was scheduled to`, `is expected by`, `planned to`) |
| `inline-year-absent` | 4 | not reachable; relies on a no-year forward commitment — needs the semantic lever, not a bug |
| `simple` | 0 | none missed — no potential detector bug surfaced by this set |

All 7 `simple` claims were caught and **zero `simple` claims were missed**, so this
sample surfaces no detector bug. Every false negative is an expected, documented
gap: the 4 `marker-gap` misses are candidates for Phase 2 lexicon expansion, and
the 4 `inline-year-absent` misses are structurally unreachable.

## Entries to flag for the reviewer (judgment calls)

- **`gordie_howe_international_bridge` — "The bridge was to be completed by the end
  of 2024."** Labeled `stale` / `simple`. The article revises the completion date
  several sentences later (fall 2025, then early 2026), but not in an adjacent
  sentence, so rubric Exclusion B (resolved-nearby) does not fire on a strict
  immediate-adjacency reading. The past-tense "was to be completed" framing makes
  this borderline historical-narration-of-a-revised-plan; a reviewer may judge it
  not-stale.
- **The three no-year forward commitments** (`robotic_combat_vehicle` AMPV
  "scheduled to deliver 2,897", `m777_howitzer` "additional 19 guns will be
  bought", `fehmarn_belt_fixed_link` "Germany plans to pay a further") were
  labeled `stale` / `inline-year-absent` by analogy to the rubric-adjudicated
  `sbx-1` Adak example (Example 4): each is an unresolved forward commitment with
  no inline year that an editor would plausibly want to verify. They have no
  explicit past deadline, so a stricter reading of §1 condition 2 ("target time is
  now past") could exclude them. They are the bulk of the not-reachable
  denominator; a reviewer should confirm the labeling threshold.
