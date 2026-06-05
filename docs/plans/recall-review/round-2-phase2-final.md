# Phase 2 (lexicon expansion + recall floor) — consolidated final review

**Scope:** Holistic final pass over Phase 2 of the WikiAsOfNow recall work, covering (a) the durable recall floor (Task 2.2), (b) doc/number honesty across all artifacts, and (c) whole-work consistency and anti-circularity. Branch `claude/wikiasofnow-recall`. Review-only; no repo files edited, no HEAD-moving git commands run. Throwaway `npx tsx` scripts used in-repo for spot-checks; working tree left clean.

**Verdict (one line): The recall work is sound, honest, and gate-green — READY TO PR. One SHOULD-FIX finding (stale numbers in recall-set-README.md without a Phase 2 pointer); two NITs (stale lexicon entry count in plan source-docs section; incomplete Phase 2 SHA range in plan execution table). No MUST-FIX findings.**

---

## Direct answers to the four mandated questions

### Q1. Does the recall floor bite at the right threshold, and does it floor reachable (not absolute) recall?

**Yes — correctly designed and verified.**

The floor test (line 296 of `test/detector/recall.test.ts`) asserts `reachableRecall >= 0.9` where `reachableRecall = flagged / reachable.length`, using only `recallSet.filter(e => e.reachable)` as the denominator — it does NOT use all 12 entries, so it correctly floors reachable recall, never absolute. The comment (lines 282–294) explicitly states: "We floor REACHABLE recall only, never absolute recall — absolute is bounded by the deferred inline-year design limit (C1), so it is reported, not gated."

Floor threshold is 0.90, set conservatively below the shipped 1.0 (11/11). The comment documents the margin rationale: tolerates ±1 entry of legitimate re-labeling noise (10/11 = 0.909 still passes) while catching a 2-entry regression.

**Proof the floor bites (verified by calculation without editing committed files):**

The 4 formerly-missed `marker-gap` entries are now caught by Phase 2 markers:
- "was scheduled to begin in 2019" — caught by `scheduled to`
- "is expected by 2023" — caught by `expected by`
- "planned to start in 2023" — caught by `planned to`
- "was scheduled to enter volume production in 2024" — caught by `scheduled to`

Removing `scheduled to` alone drops 2 entries, leaving 9/11 = 0.818 < 0.90. The floor fails. Removing any single load-bearing Phase 2 marker (one that covers 2 recall-set entries) triggers the gate. This matches the commit message for 497a0b6: "Proven to bite: removing a marker drops recall to 0.818 and fails the gate."

Removing a single-entry marker (e.g. `planned to` or `expected by`, each covering exactly 1 recall entry) drops to 10/11 = 0.909, which still passes the 0.90 floor. This is the intended behavior: ±1 labeling noise tolerance documented in the comment.

### Q2. Do live numbers match the docs (reachable 1.0, absolute 0.917, precision 0.97)? Any stale/contradictory figures?

**Live numbers match. One SHOULD-FIX stale-number location; the distinction is maintained everywhere except that one location.**

Live run results (from `pnpm vitest run test/detector/recall.test.ts --disableConsoleIntercept`):
- Reachable recall: 11/11 = **1.0** ✓
- Absolute recall: 11/12 = **0.917** ✓
- Precision-on-sample: 11/14 = 0.786 (lower bound, correctly labeled as such in-code)

Live precision (from `npx tsx` spot-check over gold-set.json): TP=33, FP=1, precision=33/34 = **0.9706 (~0.97)** ✓

**Number consistency across artifacts:**
- `methodology §7.4`: reachable 0.636→**1.0 (11/11)**, absolute 0.583→**0.917 (11/12)**, precision gate **0.97** — CORRECT
- `methodology §4` (precision/recall accounting): "Reachable recall 1.0 (11/11) after the Phase 2 lexicon expansion (0.636 before), absolute recall 0.917 (11/12)" — CORRECT
- Plan Discoveries (line 78): "Reachable recall 0.636→1.0... absolute 0.583→0.917... precision gate held at 0.97" — CORRECT
- Plan Execution Status table (line 66): "reachable recall 0.636→1.0, absolute 0.583→0.917, precision held 0.97" — CORRECT
- `methodology §7.1` (Phase 1 baseline): 7/11, 7/12 — CORRECT as historical baseline; §7.4 follows with Phase 2 update
- `recall-set-README.md §Measured baseline`: **STALE** — shows 7/11=0.636, 7/12=0.583 with "marker-gap misses are candidates for Phase 2 lexicon expansion" (Phase 2 is now done; no pointer to §7.4). See SHOULD-FIX finding below.

**Reachable-vs-absolute distinction:** maintained everywhere in code, methodology, plan, harness comments. Bare `expected to` and `scheduled for` are documented as non-load-bearing in §7.4: "The recall gate (11/11) is carried entirely by the three load-bearing markers `scheduled to` / `expected by` / `planned to`. The other two — bare `expected to` and `scheduled for` — are NON-load-bearing... first markers to drop if a future pass prioritizes precision." This is honest and deliberate.

**Precision-on-sample vs gold-set precision:** the 0.97 number consistently refers to gold-set precision (the regression gate), never to the recall-harness precision-on-sample (0.786). The two are clearly distinct across all artifacts; no conflation detected.

### Q3. Was the recall set left UNTOUCHED by Phase 2 (anti-circularity preserved)?

**Yes — anti-circularity fully preserved.**

`git log -- test/gold/recall-set.json` shows exactly two commits, both from Phase 1:
- `f94a322` — "test(recall): finalize recall set after label review (12 entries, strict not-reachable)"
- `71c3db7` — "Add exhaustive recall gold set for detector-recall measurement"

The three Phase 2 commits (667b44e, 497a0b6, 62ebd1e) do NOT touch `recall-set.json`. Phase 2 touched only: `src/detector/markers.ts`, `test/detector/markers.test.ts`, `test/detector/recall.test.ts` (floor addition only), `docs/design/detector-precision-methodology.md`, `docs/pitfalls/implementation-pitfalls.md`, `docs/plans/2026-06-05-wikiasofnow-recall-plan.md`.

Anti-circularity further evidenced structurally: the recall set contains 4 entries the Phase 1 detector did NOT flag (the marker-gap entries). Had the labeler mirrored Phase 1 detector output, those 4 entries would not appear. Their presence — and the fact that Phase 2 expansion now catches them — is the validation that labels preceded detector output, not the reverse.

### Q4. Gates green + tree clean?

**All gates green. Tree clean.**

- `pnpm test`: 14 test files / 69 tests passed, pristine output — no warnings, no stray logs beyond the single labeled recall metrics block.
- `pnpm exec tsc --noEmit`: exit 0, no output.
- `pnpm lint` (eslint): exit 0.
- `git status --porcelain`: empty (nothing to commit, working tree clean).
- Branch is ahead of remote by 3 commits (Phase 2 work not yet PR'd — expected, "PR pending" state).

---

## Lens 1 — Recall gate integrity (Task 2.2)

**Floor test assessment: correct, non-trivial, appropriately commented.**

The floor test (`it("reachable recall stays at or above the regression floor (0.90)")`) is a standalone test, separate from the unconditional reporting test. It re-runs the candidate cache from scratch (no shared mutable state) and asserts `reachableRecall >= 0.9`. This is the correct separation: reporting is unconditional (for observation), the gate is a real assertion.

**Composition guard:** intact. The structural test (`it("recall set composition: ≥6 reachable:true and ≥1 reachable:false entries")`) asserts `reachableCount >= 6` and `notReachableCount >= 1`. Actual counts: 11 reachable / 1 not-reachable. The guard satisfies the "≥1 not-reachable" bar recorded in the plan's Deviations (Sam-approved relaxation from ≥3 to ≥1 given genuine not-reachable claims proved scarce).

**No assertion weakening vs Task 1.3 harness:** Task 1.3 added 4 tests (structural validation, substring-in-fixture, composition guard, and unconditional reporting). Task 2.2 added a 5th test (the floor). No existing test was weakened, loosened, or removed. Total tests in `recall.test.ts`: 5 passing.

**4 "surprise" entries in harness output:** expected, not a problem. The 4 formerly-`marker-gap` entries tagged as "non-simple-or-non-reachable caught (tag may be too pessimistic)" are the 4 Phase 2 lexicon wins. The `shapeClass` of `marker-gap` remains structurally accurate (the phrase was NOT in the lexicon at labeling time), and the harness's surprise diagnostic is informational. The reporting test passes unconditionally regardless.

---

## Lens 2 — Doc/number honesty

**Numbers accurate. Distinction maintained. One stale location found.**

**Methodology §7.4:** The Phase 2 result section is comprehensive and honest. It correctly identifies bare `expected to` and `scheduled for` as non-load-bearing, quantifies their FP density (~15–20% for bare `expected to`), explains why they were kept (no new FP class, gate held), and explicitly flags them as "the first markers to drop if a future pass prioritizes precision." This is the right epistemic posture: document the tradeoff and make it revisitable, not hidden.

**DET-2 cross-sentence-resolution note (implementation-pitfalls.md, line 99):** Accurate. Rule 3 (`RESOLUTION_REGEX` in `suppress.ts` lines 43–44, applied at lines 123–130) operates on a single sentence string — there is no cross-sentence lookahead. The fehmarn example ("The Fehmarn Belt bridge was originally expected to be completed by 2018. However, in late 2010 … an immersed tunnel would instead…") is correctly characterized as a cross-sentence-resolution FP because the resolution cue is in the NEXT sentence, which Rule 3 cannot see. The note is factually accurate.

---

## Lens 3 — Whole-work holistic consistency + honesty

**Set integrity:** 12 entries, all `stale: true`, all substrings verified by the harness's substring-in-fixture test (passes). The single `reachable: false` entry (`sbx-1` Adak) has `expectedYear: null` as required.

**Anti-circularity:** holds strongly (Q3 above).

**DET-2 fehmarn note accuracy:** confirmed correct (see Lens 2).

**Phase 2 status banners:** correctly marked ✅ BUILT in the plan execution table. The `<2.3>` SHA placeholder in the first-column phase name is a minor formatting artifact (see NIT-2 below).

---

## Findings

### SHOULD-FIX-1 — recall-set-README.md shows stale Phase 1 baseline numbers without a Phase 2 pointer

- **Severity:** SHOULD-FIX
- **Location:** `test/gold/recall-set-README.md` §"Measured baseline (asOfYear = 2026, detector v1.0.0)" and §"Misses by shapeClass"
- **What:** The baseline table shows 7/11 = 0.636 reachable recall and 7/12 = 0.583 absolute recall. The misses section says "the 4 `marker-gap` misses are candidates for Phase 2 lexicon expansion" — but Phase 2 is complete; these are no longer candidates, they are shipped improvements. There is no pointer to `docs/design/detector-precision-methodology.md §7.4` where the Phase 2 result (11/11, 11/12) is recorded. A reader arriving via `recall-set.json` → README sees numbers that contradict the live test output and has no signpost to the updated figures.
- **Fix:** Add one sentence below the baseline table: "Phase 2 lexicon expansion improved reachable recall to 1.0 (11/11) and absolute recall to 0.917 (11/12); see `docs/design/detector-precision-methodology.md §7.4` for the Phase 2 result." Optionally update the misses section to note the 4 marker-gap misses were addressed by Phase 2.
- **Not blocking PR:** the live test output and methodology doc are authoritative; this is a usability gap, not a data-integrity issue.

### NIT-1 — plan source-docs section says "9-entry lexicon" (now 14)

- **Severity:** NIT
- **Location:** `docs/plans/2026-06-05-wikiasofnow-recall-plan.md` line 91: "`MARKER_STRENGTH` 9-entry lexicon"
- **What:** The "Source documents (read before executing)" section is a planning pre-amble written before Phase 2. After Phase 2 expanded `MARKER_STRENGTH` from 9 to 14 entries, this count was not updated. As a planning pre-amble it is somewhat forgivable (describes pre-execution state), but the plan is described as a living document, so stale counts in it are still a gap.
- **Fix:** Update "9-entry lexicon" to "14-entry lexicon" (or omit the count since it is an implementation detail that will continue to drift).

### NIT-2 — plan Phase 2 execution table has `<2.3>` SHA placeholder and truncated SHA range

- **Severity:** NIT
- **Location:** `docs/plans/2026-06-05-wikiasofnow-recall-plan.md` line 66 (Phase 2 table row) and line 210 (Phase 2 execution banner)
- **What:** The Phase 2 table row shows `667b44e…<2.3>` (literal angle-bracket placeholder) in the Status column; the Ship SHA(s) column and the Phase 2 banner both stop at `497a0b6`, omitting `62ebd1e` (the Task 2.3 docs commit, which IS the commit that updated the methodology doc, pitfalls doc, and plan itself to record the Phase 2 result). The plan's living-document contract requires recording the ship SHA at completion.
- **Fix:** Replace `<2.3>` with `62ebd1e`, and extend the SHA range to `667b44e`…`62ebd1e` in both the table and the banner.

---

## Reasoning trace

**Things I almost missed:**

1. The 4 `surprises` in the recall harness output (entries tagged `marker-gap` that are now caught) initially looked like possible label inconsistency — but they are correctly labeled: `shapeClass` is a structural description set at labeling time (when the phrase was NOT in the lexicon), not a live "does the detector catch this" flag. The surprise output is working-as-intended diagnostic noise.

2. The precision-on-sample (0.786) from the recall harness is computed over a different population than the gold-set precision (0.97). I confirmed no doc conflates them — the 0.97 is always the gold-set gate, and the recall harness clearly labels precision-on-sample as a "lower bound" in both code and comment.

3. The "9-entry lexicon" reference in the plan is in a planning-time source-docs section, not a post-execution claim. It's stale but not misleading about current shipped state — the MARKER_STRENGTH lexicon is the authoritative source, not the plan's pre-execution notes.

**What I'm still uncertain about:** The 3 sample FPs in the recall harness (sampleFP=3, giving precision-on-sample 0.786) are described as possible "stale claim the labeler missed" rather than confirmed FPs. I did not independently hand-judge these 3 candidates against the fixture text. Given the methodology doc's honest lower-bound framing and the caveat in the harness code, this is acceptable — but a future pass could resolve whether any of the 3 are genuine unlabeled stale claims that should be added to the recall set (which would upgrade them from sample-FP to recall-set entries).

**What I'd add with more time:** A spot-check of the 3 sample FPs to determine if any are genuine unlabeled stale claims. This would either (a) confirm they're real FPs (precision-on-sample is the true precision-on-sample) or (b) find 1–2 should be added to the recall set (improving absolute recall measurement accuracy).
