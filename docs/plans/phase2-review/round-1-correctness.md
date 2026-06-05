<!-- ABOUTME: Batch review Round 1 — detector correctness / edge cases for Phase 2. -->
<!-- ABOUTME: Empirically verified findings from read-only analysis of committed code on branch claude/wikiasofnow-detector-phase2-ZP1uQ. -->

# Phase 2 — Round 1 Correctness Review

**Branch:** `claude/wikiasofnow-detector-phase2-ZP1uQ`  
**Reviewer role:** Batch-Review Round 1 — Detector Correctness / Edge Cases  
**Date:** 2026-06-04  
**Method:** Read every source and test file; write probe scripts under `/tmp` to empirically verify every suspicious pattern; run `pnpm test` and `pnpm exec tsc --noEmit` for baseline.

---

## Baseline state

- `pnpm test`: 31/31 tests pass across 12 test files.
- `pnpm exec tsc --noEmit`: clean (no errors).
- Gold-set precision: **1.000** (4 TP, 0 FP — above the 0.9 gate). Recall also 1.000 (0 FN).

---

## Findings

### F-1 — SHOULD-FIX | `suppress.ts`:44 | `"By <year>"` deadline claims are suppressed as if they were historical narration

**Concrete scenario:**

```
"By 2025, the fleet will reach full strength."
"By January 2025, the system will be fully operational."
```

`suppressionScore("By 2025, the fleet will reach full strength.", 2025)` returns **100** (suppressed).

The dateline regex `/^(?:In|By|During|As of)\s+(?:[A-Za-z]+\.?\s+)?(1[89]\d\d|20[0-2]\d)\b/i` treats `By` as a sentence-initial temporal frame in all cases. But `"By <year>, X will Y"` is a **deadline framing** (the year is the forward target), not a historical narration. `"In 2008, the Army announced…"` is narration. `"By 2025, the fleet will reach full strength."` is an unresolved forward commitment whose target date has passed.

The inclusion of `By` in the same class as `In` / `During` / `As of` is semantically incorrect: `By` at sentence-initial position signals a deadline, not a historical dateline.

**Why it matters:** Wikipedia procurement articles commonly use deadline framing ("By 2025, X will Y"). Any such sentence with an expectation marker is silently suppressed. These are exactly the stale claims the detector is meant to surface.

**Empirical check:** The four current fixtures happen not to contain sentence-initial `"By <year>"` clauses (confirmed by fixture scan), so this bug does not affect the gold set. It is a latent precision-over-recall regression for future fixture additions.

**Suggested fix:**  
Remove `By` from the dateline regex, or add a tense-based guard: fire Rule 1 only when the optional-month slot is followed by a past-tense construction (`was`, `had`, `announced`, `said`, `stated`), rather than a present/future-tense expectation marker. The simplest safe fix is removing `By`:

```ts
// Before:
const datelineRegex = /^(?:In|By|During|As of)\s+(?:[A-Za-z]+\.?\s+)?(1[89]\d\d|20[0-2]\d)\b/i;
// After:
const datelineRegex = /^(?:In|During|As of)\s+(?:[A-Za-z]+\.?\s+)?(1[89]\d\d|20[0-2]\d)\b/i;
```

This still covers `In 2008, the Army announced…`, `In March 2013, the Navy revealed…`, `During 2017, the program…`, and `As of 2020…` — all current gold-set negatives. It would need new gold-set coverage for `By <year>` sentences.

---

### F-2 — SHOULD-FIX | `suppress.ts`:44 | `"In the <year> budget"` is suppressed as if it were a temporal dateline

**Concrete scenario:**

```
"In the 2008 budget, the Navy plans to procure 14 ships."
```

`suppressionScore("In the 2008 budget, the Navy plans to procure 14 ships.", 2008)` returns **100**.

The optional `[A-Za-z]+\.?\s+` slot in the dateline regex is intended to absorb a month name (e.g., `March`, `January`). It also matches any other single word — including `the`. So `"In the 2008 budget"` matches because `the` fills the month slot.

`"In the 2008 budget"` is a **budget-year reference** (the sentence is about the FY 2008 budget), not a historical narrative frame. If the sentence contains a forward claim (`the Navy plans to procure 14 ships`), that claim is stale and should be flagged.

**Why it matters:** Budget-year references are common in procurement articles. Silently suppressing `"In the 2008 budget, X plans to Y"` loses a real stale claim.

**Suggested fix:**  
Constrain the month slot to actual month names (or common month abbreviations), rather than any alphabetic word:

```ts
const MONTH_PATTERN = String.raw`(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+`;
const datelineRegex = new RegExp(
  String.raw`^(?:In|During|As of)\s+(?:${MONTH_PATTERN})?(1[89]\d\d|20[0-2]\d)\b`,
  "i"
);
```

This also closes the `"In early 2007"` / `"In late 2021"` borderline case (see F-3 below).

---

### F-3 — NIT | `suppress.ts`:44 | `"In early/late <year>"` qualifier words match the month slot

**Concrete scenario:**

```
"In early 2007, the Navy plans to deploy a new system."
"In late 2021, the missile defense program plans to expand."
```

Both suppressed (Rule 1 fires). The word `early` / `late` fills the `[A-Za-z]+\.?\s+` slot.

**Is it a bug?** Borderline. `"In early 2007, X plans to Y"` is probably historical narration of a 2007-era intent, so suppression is arguably correct. However, the intent is to match **month names**, not qualifier words. The fix in F-2 (constrain to actual months) automatically resolves this too — `"In early 2007"` would then NOT match the month slot, so Rule 1 would fire only on the bare `"In 2007"` form with no month slot. Since `2007 === chosenYear`, it would still correctly suppress the sentence. Net effect: F-2's fix does not change the suppression outcome for `"In early 2007"`. Noted here for completeness.

---

### F-4 — SHOULD-FIX | `suppress.ts`:69 | Rule 3 (`later`/`subsequently`) over-fires on temporal uses

**Concrete scenario:**

```
"The system will be deployed later in 2017."
"The Navy plans to subsequently upgrade all ships by 2020."
"Shipments will begin later in the program, estimated for 2019."
```

All three return `suppressionScore(…) = 100`.

The intended use of Rule 3 is resolution cues: `"The merger, later completed, was expected to close in 2018."` (the claim was resolved — not stale). But `later` and `subsequently` are also ordinary temporal adverbs meaning "at a later time" — which is a forward-looking statement, not evidence of resolution.

There is no disambiguation between:
- `"later completed"` (passive-voice participial phrase indicating resolution — should suppress)
- `"deployed later in 2017"` (temporal adverb indicating the deployment IS a forward event — should NOT suppress)
- `"plans to subsequently upgrade"` (sequential forward step — should NOT suppress)

**Why it matters:** A stale claim phrased as `"The system will be deployed later in the program cycle in 2019."` is silently suppressed. This is a real recall loss.

**Suggested fix:** Tighten Rule 3 to the phrase form that signals resolution: `later [verb-pp]` (past participle, e.g., `later completed`, `later canceled`, `later withdrawn`, `later deployed`) and `subsequently [verb-pp]`:

```ts
const resolutionCueRegex = /\b(later\s+\w+ed|subsequently\s+\w+ed|ultimately\s+\w+ed)\b/i;
```

Or use a narrower allowlist: `\b(later\s+(?:completed?|cancel(?:l?ed)?|abandon(?:ed)?|withdrawn?|dropped?|terminated?)|subsequently\s+\w+ed|ultimately\s+\w+ed)\b/i`.

The most conservative safe fix is to match only `later` immediately followed by a past-participle resolution verb, not bare `later`.

---

### F-5 — SHOULD-FIX (undocumented tradeoff) | `detect.ts`:57 | The earliest-past-year selection + dateline suppression silently drops forward targets when both years are past

**Concrete scenario:**

```
"In 2015, the program was expected to deliver new radars in 2020."
asOfYear = 2026
```

Pipeline trace:
1. `extractYears` → `[2015, 2020]`
2. `pastYears` (both < 2026) → `[2015, 2020]`
3. `chosenYear = Math.min(2015, 2020) = 2015`
4. `suppressionScore("In 2015,…", 2015)` → Rule 1 fires (dateline `"In 2015"` matches, `2015 === 2015`) → **100**
5. `scoreClaim(year=2015)` → `total = max(0, 11+2-100) = 0`
6. Candidate **dropped**.

The forward target (2020) is a genuine stale claim, but it is silently missed because `detect.ts` always picks the **earliest** past year, and when that year is the dateline year, suppression fires for the wrong year.

**The suppress.ts comment is correct but misleading.** It describes `suppress.ts`'s behavior in isolation (with `year=2020`, Rule 1 does NOT fire — correctly). But it does not document that `detect.ts` always passes `year=2015`, making this test case unreachable. The comments in the two files together tell an incoherent story: suppress.ts says `"In 2015, … expected to deliver in 2020."` is NOT suppressed (true when `year=2020`), but detect.ts guarantees `year=2015` is what gets passed (making the unsuppressed case unreachable).

**Why it matters:** This is a real recall hole for a common Wikipedia sentence pattern: `"In <past-year-A>, the program/Navy/administration was expected/announced plans to X by/in <past-year-B>."` Both years are past; the earlier one is the historical dateline; the later one is the stale forward target. The detector currently misses all such claims.

**Suggested fix (two options):**

*Option A — Iterate over past years, not just the minimum:* Score each past year independently and emit a candidate for the earliest-past-year that survives suppression. This is a more complete algorithm change but correctly handles the multi-year case.

*Option B — Use the latest past year when the earliest is a dateline year:* After `Math.min`, check whether the dateline regex fires on the sentence with `chosenYear`; if so, retry with the next-earliest past year. Repeat until a non-suppressed year is found or all years are exhausted.

*Minimum viable:* At minimum, document this interaction explicitly in `detect.ts` Step 3 comment so it is not silently lost. The suppress.ts comment currently implies the case is handled; it is not. This documentation gap is a must-fix regardless of whether the algorithm is changed.

---

### F-6 — NIT | `suppress.ts`:54 | Rule 2 checks the quoted span for markers, but a quoted year within the span is not checked

**Concrete scenario:**

```
'The spokesman said "the program is expected to complete" by 2019.'
```

Rule 2 fires (marker inside quotes), score = 100, sentence dropped. Correct.

```
'The spokesman said "the program is expected to complete by 2019".'
```

Rule 2 fires, same outcome. Both forms correctly suppressed.

However, consider:
```
'A 2019 report noted that the system "is expected to launch."'
```

Rule 2 fires (marker inside quotes), suppressed — correct.  
But:
```
'A 2019 report noted that the system is expected to launch.'
```

Rule 2 does NOT fire (no quotes), not suppressed by quotation rule — so if the sentence doesn't match a dateline either, it is flagged as stale. This is correct behavior (no quotation marks = the article asserts the claim directly).

No actual bug here. Rule 2 behaves correctly. Noted for completeness.

---

### F-7 — Accepted design tradeoff (not a bug) | `detect.ts` | Mid-sentence historical attribution is not suppressed

**Concrete scenario:**

```
"A report from the Office of the Chief of Naval Operations (OPNAV) on a January 2012 
sustainment wargame reportedly stated that, possibly for logistics reasons, the mission 
module changes may take as long as weeks, and that in the future, the Navy plans to use 
LCSs with a single module, with module changes being a rare occurrence."
```

This sentence IS flagged as a stale candidate (year=2012, score=16). The detector picks up `plans to` as the marker and `2012` as the year (only past year).

Is it a false positive? Yes — this is historical narration: a 2012 report stated a plan. The sentence does not assert the plan as currently operative. But:

- The sentence does NOT start with a dateline (Rule 1 misses it — sentence starts with "A report from…").
- There are no quotation marks (Rule 2 misses the indirect quote).
- There is no resolution cue (Rule 3 misses it).

This is a **known coverage gap**: the dateline rule is explicitly stated as a *leading* temporal-frame rule. Mid-sentence attributions like `"A 2012 report stated that…plans to…"` are not in scope of any current suppression rule.

**Verdict:** This is a false positive. It does not appear in the gold set, so the precision gate passes. It is an accepted limitation of the sentence-initial-only dateline rule, not a bug in the existing rule. Adding a mid-sentence attribution rule would require more pattern matching (e.g., `[year] report[…]stated that/reportedly`) and is in-scope for a future precision improvement. Sam should be aware this candidate appears in the LCS fixture output.

---

### F-8 — NIT | `markers.ts`:56 | `extractYears` returns years in appearance order; year-range strings (`"2006-2007"`) extract both endpoints

**Concrete scenario:**

```
extractYears("2006-2007") → [2006, 2007]
```

Both extracted because `-` is not a `\w` character, so `\b` fires between `6-` and `-2`. This means `"During the 2006-2007 fiscal year, plans to expand by 2009."` produces `pastYears = [2006, 2007, 2009]` and `chosenYear = 2006`. The dateline fires for `2006` → suppressed, losing the `2009` forward target.

This is a consequence of F-5 (earliest-year + dateline interaction) applied to year-range strings. No independent fix needed beyond fixing F-5.

---

### F-9 — Verified correct | `markers.ts` | Word-boundary matching

All boundary cases verified empirically:

| Input | Expected | Actual |
|-------|----------|--------|
| `"Goodwill ambassadors will attend"` | `["will"]` | `["will"]` ✓ |
| `"Goodwill ambassadors attended"` | `[]` | `[]` ✓ |
| `"willingness to proceed"` | `[]` | `[]` ✓ |
| `"thesis expected to confirm"` | `[]` | `[]` ✓ (because `\b` before `is expected to` fails between `s` and ` `) |
| `"unanticipated"` | `[]` | `[]` ✓ |
| `"reclaims to itself"` | `[]` | `[]` ✓ |
| `"is due to be completed by 2020"` | `["is due to", "to be completed by"]` | `["is due to", "to be completed by"]` ✓ |

---

### F-10 — Verified correct | `markers.ts` | `extractYears` bounds

| Input | Expected | Actual |
|-------|----------|--------|
| `"1899"` | `[]` | `[]` ✓ |
| `"1900"` | `[1900]` | `[1900]` ✓ |
| `"2099"` | `[2099]` | `[2099]` ✓ |
| `"2100"` | `[]` | `[]` ✓ |
| `"20171"` | `[]` | `[]` ✓ |
| `"(2017)"` | `[2017]` | `[2017]` ✓ |
| `"year-2017-report"` | `[2017]` | `[2017]` (hyphen is non-word, `\b` fires — acceptable) |
| Order preserved | `[2020, 2018, 2015]` | `[2020, 2018, 2015]` ✓ |

---

### F-11 — Verified correct | `score.ts` | Arithmetic invariants

| Invariant | Status |
|-----------|--------|
| `year === asOfYear` → `total = 0` | ✓ (`isPast = 2026 < 2026 = false`) |
| Unknown marker → `total` is not NaN | ✓ (`MARKER_STRENGTH[x] ?? 0` → `futureTenseConfidence=0`) |
| `breakdown.total === total` | ✓ (same const assigned to both) |
| `total >= 0` always | ✓ (`Math.max(0, …)` + future-year guard) |
| Pluralization: `yearsPast === 1 ? "year" : "years"` | ✓ |

`temporalRisk` is computed as `Math.max(0, asOfYear - year)` for all inputs — this is correct and produces 0 for future years (since `asOfYear - futureYear < 0`). The `total = 0` when `!isPast` is a redundant but harmless second gate.

---

### F-12 — Verified correct | `detect.ts` | Marker tie-breaking and determinism

The marker loop picks the highest-strength marker, with first-occurrence tiebreaking:

```ts
let chosenMarker = markers[0];
for (let i = 1; i < markers.length; i++) {
  if ((MARKER_STRENGTH[markers[i]] ?? 0) > (MARKER_STRENGTH[chosenMarker] ?? 0)) {
    chosenMarker = markers[i];
  }
}
```

`>` (not `>=`) ensures the first-occurrence tiebreaker. Verified correct.

Sort stability: `candidates.sort((a, b) => b.score.total - a.score.total)` — V8 stable sort since Node 11; Node 24 in use. Confirmed stable.

Empty article / section with no sentences: loop bodies never execute → `[]` returned. Correct.

---

### F-13 — Verified correct | `parse.ts` | Edge-case robustness

| Input | Outcome |
|-------|---------|
| Empty wikitext `""` | `sections: []` ✓ |
| Whitespace-only `"   "` | `sections: []` ✓ |
| Heading-only `"== S =="` | section exists, `sentences: []` ✓ |
| Lead heading | `s.title()` returns `""` → `heading: ""` ✓ |
| `[[wikilinks]]` and `[[pipe|text]]` | `text()` strips markup, e.g. `"The Navy plans to deploy the vessel in 2017."` ✓ |
| Whitespace sentences → filtered | `.filter(u => u.text.length > 0)` removes them ✓ |
| `s.sentences()` returns non-array | `Array.isArray` guard handles it ✓ (observed always returns array in practice) |

`wtf_wikipedia` section depths: lead=0, `== H2 ==`=0, `=== H3 ===`=1. The `level` field is stored but not used by the detector — no impact.

---

### F-14 — Verified correct | `precision.test.ts` | Metric formula and composition guard

- `tp / (tp + fp || 1)`: operator precedence is `(tp + fp) || 1` (standard JS). When `tp=4, fp=0`, evaluates to `4/4=1.0`. Correct.
- Anti-gaming guard: `positives >= 3 && negatives >= 3` locked. 4 positives, 6 negatives in current gold set. ✓
- Substring matching (`c.sentenceText.includes(g.sentenceSubstring)`) is deliberate (robust to `wtf_wikipedia` tokenization differences). ✓

---

## Summary table

| ID | Severity | File | Line | Type |
|----|----------|------|------|------|
| F-1 | SHOULD-FIX | `suppress.ts` | 44 | Bug: `"By <year>"` deadline claims suppressed as narration |
| F-2 | SHOULD-FIX | `suppress.ts` | 44 | Bug: `"In the <year> budget"` suppressed (month slot over-broad) |
| F-3 | NIT | `suppress.ts` | 44 | Related to F-2: qualifiers `early/late` match month slot |
| F-4 | SHOULD-FIX | `suppress.ts` | 69 | Bug: Rule 3 `later`/`subsequently` fires on temporal uses, not just resolution cues |
| F-5 | SHOULD-FIX | `detect.ts` | 57 + `suppress.ts` | Undocumented recall hole: earliest-past-year + dateline drops forward targets when both years are past; suppress.ts comment is misleading |
| F-6 | NIT | `suppress.ts` | 54 | Observation: Rule 2 correct but quotation edge cases noted |
| F-7 | Accepted tradeoff | `suppress.ts` | — | Mid-sentence historical attribution not suppressed (LCS "January 2012 wargame" sentence) |
| F-8 | NIT | `markers.ts` | 56 | Year-range strings (`2006-2007`) yield both endpoints; compound of F-5 |
| F-9–F-14 | — | Various | — | Verified correct (no bugs) |

---

## Verdict

**Three real bugs found (F-1, F-2, F-4), one significant undocumented recall hole (F-5), one accepted false positive (F-7).**

The gold-set precision gate passes (4/4 TP, 0/0 FP on the labeled set) because the fixture corpus was selected to exercise the happy path of the suppression rules. The bugs are latent — they affect inputs outside the current gold set — except F-5 which is documented as a design tradeoff in suppress.ts but misleadingly implies the case is handled when it is not reachable.

None of the bugs affect the test suite's correctness. All are correctness findings for production use against a broader Wikipedia article corpus.

**Priority order:** F-5 (documentation fix minimum; algorithm fix preferred) → F-4 (Rule 3 over-fires on common temporal `later`) → F-1 (`By <year>` deadline suppression) → F-2 (month-slot over-broad) → F-7 (note to Sam, not a code bug).

---

## Appendix: Probe scripts used

All probes run as read-only `/tmp` scripts; no repo files were modified.

- `/tmp/probe-markers.mjs` — word-boundary and year-bounds edge cases
- `/tmp/probe-suppress.mjs` — Rule 1 month slot, Rule 3 `later`, dateline-vs-forward-target
- `/tmp/probe-suppress2.mjs` — `By <year>`, `"In the <year> budget"`, Rule 3 false positives in depth
- `/tmp/probe-score.mjs` — arithmetic invariants, pluralization, future-year behavior
- `/tmp/probe-detect.mjs` — marker tie-breaking, Math.min on pastYears, section clause
- `/tmp/probe-recall-gap.mjs` — characterization of `By <year>` and `"In the <year> budget"` patterns
- `/tmp/probe-hyphen-year.mjs` — year-range `"2006-2007"` extraction behavior
- `/tmp/probe-parse-cjs2.js` / `/tmp/probe-parse-cjs3.js` — parse.ts edge cases via wtf_wikipedia
- `/tmp/probe-pipeline.mjs` — full pipeline on all 10 gold entries (verified 4 TP, 0 FP, 0 FN, 6 TN)
- `/tmp/probe-full-pipeline.mjs` — full pipeline on all fixtures (surfaced LCS "January 2012" false positive)
- `/tmp/probe-fp-check.mjs` / `/tmp/probe-lcs-full.mjs` / `/tmp/probe-lcs-fp.mjs` — characterize the LCS false positive
