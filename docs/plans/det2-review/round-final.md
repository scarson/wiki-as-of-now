<!-- ABOUTME: Final review pass for the DET-2 measurement spike — checks report accuracy, decision soundness, compliance framing, scope gates, and CI cleanliness. -->
<!-- ABOUTME: Verdict: spike is sound, honest, and compliance-correct with two SHOULD-FIX prose issues documented below. -->

# DET-2 spike — final review round

**Reviewer:** orchestrator (final pass)
**Date:** 2026-06-05
**Branch:** `claude/wikiasofnow-detector-phase2-ZP1uQ`
**Scope:** report accuracy, decision soundness, compliance framing, scope/gate checks, CI. NOT a re-do of the label review (independently reviewed HONEST before this round; prior passes confirmed 0/47 mechanical mismatches, matrix reproduced, labels match fixtures).

---

## A. Report accuracy — do §9's numbers match `det2-candidates.json`?

**Recomputed from JSON:**

| metric | JSON value | §9 states | match? |
|---|---|---|---|
| total candidates | 47 | 47 | ✓ |
| genuine-target | 2 | 2 | ✓ |
| narration | 41 | 41 | ✓ |
| other | 4 | 4 | ✓ |
| TP (genuine-target & !hasReportingVerb) | 2 | 2 | ✓ |
| FP (narration & !hasReportingVerb) | 14 | 14 | ✓ |
| TN (narration & hasReportingVerb) | 27 | 27 | ✓ |
| FN (genuine-target & hasReportingVerb) | 0 | 0 | ✓ |
| guard precision = 2/(2+14) | 0.125 | 0.125 | ✓ |
| guard recall = 2/(2+0) | 1.0 | 1.0 | ✓ |

**All numbers in §9 are exact. Zero discrepancies.**

**Genuine-target shape verification:** both entries confirmed in the fixtures.
- `m1156_precision_guidance_kit`: "As of March 2024, the LR-PGK is expected to undergo its Critical Design Review in Q4 2025" — classic as-of snapshot in the article's own voice; dateline year 2024, target year 2025 now past.
- `rivian`: `{{as of|2019}}, Amazon expected to have as many as 10,000 electric vans in operation by 2022` — as-of-2019 snapshot, target year 2022 now past.
Both match the "As of `<date>`, X is expected to … in `<pastYear>`" shape §9 describes. ✓

**FP-escaping verb inventory:**

| verb | count in FP set | in §9 list? |
|---|---|---|
| `planned` | 4 | ✓ |
| `scheduled` | 3 | ✓ |
| `presented` | 2 | ✓ |
| `expected` | 2 | **NO** |
| `shared` | 1 | ✓ |
| `shifted` | 1 | ✓ |
| `informed` | 1 | ✓ |

**SHOULD-FIX (A1): §9's verb list omits `expected`.** Two FP entries use `expected` as the non-reporting-verb (brightline_west: "construction was not expected to start until mid-2014"; stuttgart_21: "operations had been expected to start in December 2025") — both notes correctly say "'expected' not a reporting verb." The §9 prose says the escaping verbs are "planned / scheduled / presented / shared / shifted / informed" — this list is incomplete by two instances. The omission does not affect any number (all counts are correct) but leaves the verb inventory wrong for a reader trying to understand the FP failure mode. Fix: add `expected` to the verb list in §9 (change "planned / scheduled / presented / shared / shifted / informed" to "planned / scheduled / expected / presented / shared / shifted / informed").

---

## B. Decision soundness + compliance framing

### B1. NO-GO follows from pre-registered §6 criteria

The spec §6 pre-registers:
- **No / tiny prize** (< ~5 genuine-targets) → STOP.
- **Meaningful prize + stubborn precision gap** → escalate LLM-layer as compliance decision.

With prize = 2 (at most 3 under the most generous re-labeling of `mars_sample_return`), the decision hits the first criterion cleanly. The §9 reasoning correctly invokes the tiny-prize criterion as the primary stopper, and correctly notes that the guard's 0.125 precision is a secondary confirming datum, not a necessary condition — the prize gate alone is sufficient.

**Robustness claim:** §9 states "≥3 labels would have to be wrong in the same direction to change it." Verified: the four `other` entries are:
- `boeing_777x`: resolved nearby (parenthetical states outcome) — cannot defensibly become genuine-target.
- `comac_c929`: resolved nearby ("since delayed to 2029") — cannot defensibly become genuine-target.
- `mars_sample_return`: genuinely ambiguous 1990s defunct plan — borderline at best; conceding it as genuine-target gives prize = 3, still below threshold.
- `type_31_frigate` ("all ships were planned to be service by February 2030"): the real target is February 2030 (future), not 2024 — cannot be genuine-target.

Even granting the most favorable re-labeling of ALL four `other` entries (prize = 6), the narration FPs from the guard would need to drop dramatically (from 14 to ~4) for the guard to be usable — which it clearly does not. The robustness claim is sound. ✓

### B2. LLM-layer framing — correctly moot, not silently adopted

§9 states: "The LLM-layer is therefore moot too. An LLM detection-filter would require a sacrosanct-contract amendment (the detection-is-deterministic + bounded-LLM-role guardrails); recovering ~2 claims/136-articles does not remotely justify that. The LLM question is closed for DET-2 by the size of the prize, not just the guard's weakness."

This is correct and precise:
- The spec §1 explicitly identifies the LLM-in-detection path as a compliance-amendment question requiring explicit human sign-off, not a casual feature. §9 correctly inherits this framing.
- The spec §6 criteria frame "meaningful prize + stubborn gap → escalate LLM-layer question" as a compliance-amendment decision. §9 correctly closes the path by noting the prize is not meaningful — the escalation condition is not reached, so the LLM question never opens.
- The guardrails cited (G10: detection-is-deterministic; G9: bounded-LLM-role) are correctly named and accurately described per `docs/policy/wikipedia-genai-compliance.md`.
- The report does NOT leave the door ambiguously open; it does NOT imply the contract could be bent casually. It closes the LLM question explicitly and traces the closure to the prize size, not solely to the guard weakness. ✓

### B3. Redirect soundness

§9 redirects to: (a) inline-year-absent / relative-date class (§7.3), or (b) tightening cut 1's named-entity over-KEEP residual. Both are appropriate:
- (a) is the remaining 1/12 absolute recall miss (the `sbx-1` Adak case), a structurally different gap from DET-2, documented in §7.3.
- (b) is a precision micro-lever documented in the governs-review.
Neither overpromises nor redirects to a compliance-sensitive path. ✓

---

## C. Scope + gates

### C1. Detection untouched — verified

`git diff origin/dev...HEAD --name-only` returns exactly:

```
docs/design/2026-06-05-det2-measurement-spike-design.md
docs/design/detector-precision-methodology.md
docs/plans/2026-06-05-det2-measurement-spike-plan.md
test/detector/det2-candidates.test.ts
test/gold/det2-candidates.json
```

- `src/detector/detect.ts` — untouched ✓
- `src/detector/governs.ts` — untouched ✓
- `src/detector/suppress.ts` — untouched ✓
- `test/gold/gold-set.json` — untouched ✓
- `test/gold/recall-set.json` — untouched ✓
- `test/gold/det3-fp-set.json` — untouched ✓

No stray scan script (`scan-det2.ts` etc.) in the working tree. `git status` clean. ✓

### C2. Gates green + pristine

- `pnpm test`: 17 test files, 132 tests — all passed ✓
- `pnpm exec tsc --noEmit`: clean ✓
- `pnpm lint`: clean ✓
- `det2-candidates.test.ts` specifically: 5/5 tests pass including structural validation, substring-occurs, currently-suppressed invariant, and min-count guard ✓

### C3. §3/§6/§8 pointer consistency

All three pointers updated correctly:
- **§3 DET-2 bullet**: updated from "not a bug" to "measured, deliberately NOT recovered (§9)" ✓
- **§6 roadmap item #1**: updated from "this is the next real precision lever" to "DET-2 half: measured NO-GO" ✓
- **§8 ruled-out item**: updated to add "Now quantified — see §9: NO-GO" ✓

**SHOULD-FIX (C1): Residual stale sentence in §3 "common root" paragraph.** The paragraph ending at line 40 reads: "DET-2 recovery is the next cut." This sentence was written pre-spike and was not removed or updated by Task 1.2. The §3 bullet immediately above it was correctly updated, but the paragraph's concluding sentence still forwards the pre-spike expectation. It contradicts §9's NO-GO and the §6 roadmap update. Fix: change "DET-2 recovery is the next cut." to something like "DET-2 recovery is deliberately deferred — measured NO-GO per §9."

One additional lower-severity instance: §4 (line 45) says "remaining residual FPs are DET-2 (dateline/earliest-year, deferred)" — the word "deferred" was accurate pre-spike (meaning "not yet addressed") but now reads ambiguously when "deferred" could mean either "future work" or "deliberately not recovered." Since §9 closes it as NO-GO, a reader following this from §4 might be confused. A NIT but worth noting.

---

## D. Findings summary

| ID | Severity | Location | Issue | Fix |
|---|---|---|---|---|
| A1 | SHOULD-FIX | §9, verb list | `expected` omitted from FP-escaping verb list (2 of 14 FP entries use it) | Add `expected` to the list |
| C1 | SHOULD-FIX | §3, "common root" paragraph, last sentence | "DET-2 recovery is the next cut." — pre-spike claim not updated, contradicts §9 NO-GO | Change to "DET-2 recovery is deliberately deferred — measured NO-GO per §9." |
| §4 word | NIT | §4, line 45 | "deferred" ambiguous now that §9 closes DET-2 as NO-GO | Consider "deliberately not recovered (§9)" for clarity |

**No MUST-FIX items.** All numbers are exact. All critical compliance framing is correct. Detection and existing gold files are untouched. Gates are green and the tree is clean.

---

## Explicit answers to the four required questions

**(1) Do §9's numbers match the JSON exactly?**
Yes. Every number in the result table, the confusion matrix, precision (0.125), and recall (1.0) reproduces exactly from `det2-candidates.json` computation. The only inaccuracy is the omitted `expected` verb in the prose description of FP-escaping verbs (SHOULD-FIX A1) — this does not affect any count.

**(2) Is the NO-GO sound per §6 criteria, and is the LLM-layer correctly framed as moot-not-adopted?**
Yes on both. The prize-too-small criterion (< ~5 genuine-targets) is cleanly satisfied at prize = 2, the robustness claim is verified (no defensible re-labeling reaches 5), and the NO-GO follows directly from the pre-registered §6 criteria. The LLM-layer is correctly closed as moot by the small prize — not adopted, not silently deferred as future possibility, and correctly traced to the compliance-amendment bar (G9 + G10 guardrails). The door is explicitly closed, not left ajar.

**(3) Is detection (`src/detector/*`) and every existing gold file untouched?**
Yes. Confirmed by `git diff origin/dev...HEAD --name-only`. Zero changes to `detect.ts`, `governs.ts`, `suppress.ts`, `gold-set.json`, `recall-set.json`, or `det3-fp-set.json`.

**(4) Gates green + tree clean?**
Yes. `pnpm test` 132/132, `tsc --noEmit` clean, `lint` clean, `git status` clean, no stray scripts.

---

## Verdict

**The spike is sound, honest, and compliance-correct.** Two SHOULD-FIX prose issues exist (a missing verb `expected` in the §9 FP verb list, and a residual stale sentence "DET-2 recovery is the next cut." in the §3 common-root paragraph) but neither affects any number, any decision, or any compliance framing. They should be fixed before merge, but they do not block the PR from being correct. Subject to those two fixes, the spike is ready to PR → dev.
