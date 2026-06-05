# Phase 1 (detector-recall) — consolidated final review

**Scope:** holistic final pass over Phase 1 (measurement only, no detector change).
Branch `claude/wikiasofnow-recall`. Review-only; no repo files edited, no
HEAD-moving git commands run. One throwaway `npx tsx` spot-check script was
created in-repo and deleted; working tree left clean.

**Verdict (one line): Phase 1 is sound, honest, internally consistent, and gate-green — READY TO MARK SHIPPED. No MUST-FIX or SHOULD-FIX findings; two NITs below.**

---

## Direct answers to the four mandated questions

1. **Do the marker-gap counts hold up to a spot-check?** Yes. Independent
   re-count of the top 5 phrases (parse all 136 fixtures, count sentences with
   the phrase + an inline past year, exclude leading datelines, require no
   in-lexicon marker) reproduces the table's **ranking exactly** and the
   **magnitudes within a few units**. Table → my count: expected-to(bare) 45→49,
   planned-to 38→39, scheduled-for 20→21, intended-to 15→15, was-scheduled-to
   13→14. Small deltas are expected (my dateline heuristic and bare-"expected to"
   exclusion differ slightly from the scan's exact internal ones). All five
   representative example sentences cited in the table are **verbatim** in their
   named fixtures (an_tps-80, bell_v-280_valor, artemis_program, agm-183_arrw,
   long_range_discrimination_radar confirmed by substring match against parsed
   sentences).

2. **Are the recall numbers consistent across ALL artifacts (any stale
   leftovers)?** Yes, fully consistent; **no stale leftovers found.** Grepped for
   `7/15`, `0.467`, `≥3 not-reachable`, `15 entries` etc. — none present. The
   headline `7/11`, `7/12`, `0.636`, `0.583` agrees across recall-set-README.md,
   the live `recall.test.ts` console output, methodology §7.1, and the plan's
   Discoveries/Deviations. The single `≥3` reference in the plan (line 266) is a
   captured *planning-review-round* note explicitly superseded two lines earlier
   by the Sam-approved relaxation to `≥1` (line 72) — not a stale implemented
   number. The implemented guard (test assertion, README §Composition, plan
   Deviations) is uniformly **≥6 reachable / ≥1 not-reachable**.

3. **Does the recomputed baseline match (7/11, 7/12, zero simple missed)?** Yes,
   exactly. Independent recompute via the detector directly: 7 entries FLAGGED
   (all `simple`), 5 MISSED (4 `marker-gap` + 1 `inline-year-absent`). Reachable
   recall 7/11 = 0.6364, absolute 7/12 = 0.5833, precision-on-sample 7/9 = 0.778
   (2 genuine sample-FPs). **Zero `simple` missed → no detector bug** confirmed;
   harness `surprises` array empty.

4. **Gates green + pristine?** Yes. `pnpm test` → 14 files / 63 tests passed,
   pristine output. `tsc --noEmit` → exit 0. `pnpm lint` (eslint) → exit 0.
   `recall.test.ts` run standalone with `--disableConsoleIntercept` → 4/4 passed,
   single labeled metrics block, no stray logs.

---

## Round-lens 1 — Task 1.4 Recall section accuracy

- **Counts plausible/real:** verified independently (see Q1). Ranking exact,
  magnitudes match within noise. The top-5 priority read (the five phrases that
  account for the bulk of marker-gap misses) is well-supported.
- **Example sentences verbatim:** confirmed for all 5 spot-checked rows.
- **Framing as a BIASED survey:** §7.2 opens with the bolded sentence "This
  section is a biased category survey, not a recall number" and explicitly points
  to §7.1's 12-fixture exhaustive sample as "the honest recall number," naming the
  four reasons the scan is not a recall percentage (doesn't count every stale
  sentence, can't count misses it wasn't designed for, hits include
  resolved/historical/suppressed, purpose is ranking only). Framing is correct
  and appropriately self-deprecating about its own bias. §7.3 (inline-year-absent
  class) cross-checks the two methodologies (12-fixture: 1; corpus scan: 2) and
  correctly defers the class to the semantic lever.

## Round-lens 2 — Cross-artifact consistency

- **Numbers agree everywhere:** confirmed (Q2). README table, harness output,
  methodology §7.1 table, plan Discoveries all show 7/11, 7/12, 0.636, 0.583.
- **Composition guard consistent:** test asserts `≥6 reachable AND ≥1
  not-reachable`; README §Composition states the same and records the ≥3→≥1
  relaxation; plan Deviations record the Sam-approved relaxation. Actual set
  satisfies it: **11 reachable / 1 not-reachable.**
- **Set integrity:** exactly **12 entries**, **all `stale:true`**, the single
  not-reachable entry has `expectedYear: null`, and the harness's own structural
  test (substrings verbatim in parsed sentence text) passes for all 12.
- **Precision gold cross-check:** the gordie_howe "to be completed by the end of
  2024" sentence is labeled `stale:true` in BOTH the precision gold-set
  (gold-set.json line 301–307) and the recall set — the README's claimed
  consistency holds.

## Round-lens 3 — Honesty + metric correctness

- **Baseline recomputed independently** (not via the harness): matches 7/11,
  7/12, 4 marker-gap + 1 inline-year-absent missed, zero simple missed.
- **Anti-circularity — HOLDS STRONGLY.** The set contains 5 entries the detector
  does NOT flag (the misses). Had the labeler mirrored detector output, every
  entry would be a flagged sentence; the presence of 5 independently-labeled
  misses (incl. 4 reachable marker-gaps the lexicon can't reach and 1 no-year
  lapse claim) is positive evidence labels were derived from prose, not from
  detector output. Conversely, **no flagged recall entry is a detector false
  positive** — each of the 7 FLAGGED sentences is a genuine forward-claim with a
  now-past inline target year. The 2 sample-FPs are genuine non-stale flags
  (gordie_howe "As of February 2026 … construction has been completed" — a
  resolved present-tense sentence; 3_nm_process "the 2021 update of the
  International R[oadmap]…" — a background past-year citation), correctly counted
  against precision-on-sample (which is honestly framed in-code as a LOWER BOUND).
- **Gates:** green + pristine (Q4).

---

## Findings

### NIT-1 — plan line 266 carries a superseded `≥3 non-reachable` in a review-round summary
- **Severity:** NIT
- **Location:** `docs/plans/2026-06-05-wikiasofnow-recall-plan.md` line 266 (the
  "R1 (8)" planning-review-round bullet): "strengthened the recall composition
  guard (≥6 reachable / ≥3 non-reachable)".
- **What:** This is a faithful historical record of what plan-review round R1
  decided, and it is explicitly superseded by the Sam-approved ≥3→≥1 relaxation
  recorded at line 72 and in the Deviations. It is NOT a stale *implemented*
  number — every implemented artifact uses ≥1. But a future reader skimming the
  review-round log in isolation could momentarily read ≥3 as current.
- **Suggested change:** Optional — append "(later relaxed to ≥1; see Deviations
  2026-06-05)" to the line 266 parenthetical. Not blocking; the relaxation is
  already unambiguous from line 72.

### NIT-2 — methodology §7.2 "expected to (bare)" row is the one phrase whose exact count is hardest to reproduce
- **Severity:** NIT
- **Location:** `docs/design/detector-precision-methodology.md` §7.2, first table
  row (`expected to` (bare), count 45).
- **What:** "bare expected-to" requires distinguishing `was/now/were expected to`
  from the in-lexicon `is expected to`; the exact count depends on the precise
  exclusion rule the scan used (my approximation got 49). The ranking position
  (#1) is robust and the magnitude is right; only the precise integer is
  sensitive to the bare-vs-`is` cut. No action needed — flagging only because it
  is the single least-reproducible cell, and a future re-baseline of this row
  should re-derive rather than trust the exact 45.

---

## Notes for the next phase (not findings)
- The harness deliberately has **no recall floor** yet (Task 2.2 sets it post-lexicon). Correct per plan.
- Phase 1 status banner correctly reads "In progress" — this review is the gate to flip it to shipped.
