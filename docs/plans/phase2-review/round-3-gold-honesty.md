# Phase 2 Batch Review — Round 3: Gold-Set Honesty / Assertion Rigor

**Date:** 2026-06-05  
**Scope:** `test/gold/gold-set.json`, `test/fixtures/*.wikitext`, `test/fixtures/README.md`, `test/detector/precision.test.ts`, `src/detector/suppress.ts` (commit `fb14c94`), plan Task 2.7 completion check.  
**Method:** Read all files; wrote and ran probe scripts that independently verify each gold entry via the real detector and test suppression generalisation on 14 novel sentences not in the gold set.

---

## Composition check (anti-gaming guard)

The gold set has **4 positives** and **6 negatives** — well above the ≥3/≥3 guard in the composition test. The `precision.test.ts` has a separate `it("gold set has real positives AND real negatives")` test that will catch future attempts to make the gate trivial by removing one class.

**Confirmed:** the composition guard is real and working. Threshold is `>= 0.9` (not lowered).

---

## Findings

### F-1 — NIT: Gold note for GOLD-NEG-1 (sbx-1) slightly mischaracterises the suppression mechanism

**Severity:** NIT  
**Entry:** `sentenceSubstring: "smaller radars in the Pacific will"` (sbx-1, `stale: false`)  
**Note in gold-set.json says:** `"Negative (historical dateline narration + quotation): 'In July 2011, a ... spokesman explained that ... will \"pick up the slack\"'. The year is the dateline of a 2011 statement, not a forward target. Suppressed by the dateline rule."`

**What actually happens:** The marker `will` sits at character index 101 of the parsed sentence; the first quote character appears at index 106. `will` is **outside** the quoted span `"pick up the slack"`. Rule 2 (quotation) checks for expectation markers *inside* quoted spans — `"pick up the slack"` contains none. Rule 2 does **not** fire. The sentence is suppressed entirely by Rule 1 (dateline `In July 2011`, frame year 2011 == anchor year 2011).

**Evidence:**
```
will at character index 101, first quote at index 106 → will is before the quote
suppressionScore("In July 2011, ... will \"pick up the slack\"...", 2011) = 100 (Rule 1 only)
```

**Label is correct** (suppressed → `stale: false` ✓). The note's concluding claim ("Suppressed by the dateline rule") is accurate. The parenthetical `+ quotation` describes the sentence's character (there is a quotation present in it) rather than which rule fires, but it is ambiguous enough to mislead a future maintainer into thinking Rule 2 is load-bearing here.

**Suggested fix:** Change the note parenthetical from `"historical dateline narration + quotation"` to `"historical dateline narration"` (Rule 2 does not fire; the quotation is incidental).

---

### F-2 — SHOULD-FIX: GOLD-NEG-5 suppression is fragile and under-documented

**Severity:** SHOULD-FIX  
**Entry:** `sentenceSubstring: "revealed plans to reduce the procurement rate in 2016"` (littoral_combat_ship, `stale: false`)  
**Full sentence:** `"In August 2013, the USN revealed plans to reduce the procurement rate in 2016."`

**What happens:** The sentence contains **two past years**: 2013 (the dateline frame) and 2016 (the forward target). The detector picks `chosenYear = min(pastYears) = 2013`. Rule 1 fires because frame year 2013 == anchor year 2013. Suppressed correctly.

**The fragility:** `suppressionScore(sentence, 2016) = 0` — if the year-selection algorithm ever changes from "min past year" to "the year adjacent to the expectation marker" (a semantically appealing alternative), the anchor would become 2016, frame year 2013 ≠ 2016, Rule 1 would not fire, and this TN would become a FP not caught by the gold set.

The gold note acknowledges this dependency — `"Frame year 2013 == earliest past year; suppressed"` — but does not flag the brittleness or explain what would happen if year selection changed. A maintainer optimising the year-selection heuristic could silently break this suppression.

**Mitigating factor:** The precision gate itself would catch the regression (the entry would start flagging), so the fragility is self-protecting at the gate level. The issue is that the *intent* is not documented, making the fragility invisible during code review.

**Suggested fix:** Extend the gold note to say explicitly: `"Suppression depends on chosenYear = min(pastYears) = 2013 (the dateline frame year). If year selection changes to pick the year nearest the marker, chosenYear would be 2016, Rule 1 would not fire, and this entry would become a false positive caught by this gate."` Also, add a suppress.test.ts case: `suppressionScore("In August 2013, ... in 2016.", 2016) === 0` (already derivable from the suite's "target year differs" test, but making it explicit here names the exact at-risk sentence).

---

### F-3 — SHOULD-FIX: Two detected candidates not in the gold set — one genuine stale claim, one borderline false positive — are undocumented

**Severity:** SHOULD-FIX  
**What the detector actually flags over the four fixtures (beyond the gold positives):**

1. **Zumwalt `FY 2022` candidate** (score=5, year=2022, marker=`will`):  
   `"The Navy will request FY 2022 funding to replace the 155 mm AGS turrets with Advanced Payload Modules for the Conventional Prompt Strike (CPS) hypersonic missile."`  
   This is a genuine forward-tense stale claim. FY 2022 is now past; the sentence uses `will` with no leading dateline; suppression score = 0. The detector correctly flags it. It is not in the gold set — it is a **real recall gap** (a stale claim the detector finds but gold doesn't acknowledge).

2. **LCS OPNAV 2012 candidate** (score=16, year=2012, marker=`plans to`):  
   `"A report from the Office of the Chief of Naval Operations (OPNAV) on a January 2012 sustainment wargame reportedly stated that, possibly for logistics reasons, the mission module changes may take as long as weeks, and that in the future, the Navy plans to use LCSs with a single module, with module changes being a rare occurrence."`  
   The year 2012 comes from the report date in the middle of the sentence (`"January 2012 sustainment wargame"`), not from the forward claim itself. The forward claim ("plans to use LCSs with a single module") has no specific year; it says "in the future." The detector attaches year 2012 (the only year in the sentence) to this claim and scores it at 16. This is a **borderline false positive** — a human editor would likely find the 2012 report reference helpful context but would not consider "plans to use single module" a tightly time-bounded stale claim.

**Why this matters:** Task 2.7 Step 3 says: "If a true stale claim can't be caught without dropping precision below 0.9, record it as a Discovery (recall gap) and leave it." The FY 2022 candidate is exactly such a recall gap. The OPNAV candidate is a borderline FP that arguably should be a labeled negative in the gold set, so future suppression work knows to address it. **Neither is recorded anywhere** — not in the plan's Discoveries section, not in the gold set notes, not in `docs/pitfalls/`.

**Evidence:**
```
Detector output for zumwalt-class_destroyer.wikitext:
  score=5, year=2022, marker="will"  [NOT in gold]
  score=2, year=2025, marker="will"  [GOLD TP]

Detector output for littoral_combat_ship.wikitext:
  score=16, year=2012, marker="plans to"  [NOT in gold — borderline FP]
  score=10, year=2017, ...  [GOLD TP]
  score=9,  year=2018, ...  [GOLD TP]
  score=8,  year=2019, ...  [GOLD TP]
```

Note: The Zumwalt FY 2022 candidate scores **higher** (5) than the Zumwalt gold positive (2), which is unusual — the highest-scored candidate in a fixture is not in the gold set.

**Suggested fix:** Add the Zumwalt FY 2022 sentence to the gold set as `stale: true` (it is a genuine stale claim). Add the OPNAV 2012 sentence as `stale: false` with a note explaining why it is a borderline FP (year is from report date, not from the forward claim). Record both in the plan's Discoveries section as required by the plan's own Discovery rule. This turns the unlabeled cases into regression guards.

---

### F-4 — NIT: "By YYYY" forward-target sentences are suppressed by Rule 1 (known limitation, not flagged)

**Severity:** NIT (no current false positive; design limitation)  
**Rule 1 pattern:** `^(?:In|By|During|As of)\s+...year\b` — the `By` branch.

**The issue:** `By` has two distinct uses in Wikipedia:
- Deadline/target: `"By 2025, the fleet will include 10 destroyers."` — a genuine stale forward claim.
- Historical narration: `"By May 2022, the Navy shifted its plans..."` — past event, correct to suppress.

Rule 1 suppresses **both** when the frame year equals the anchor year. The current fixtures only contain `By` in the historical-narration sense ("By May 2022, the Navy shifted..."), so there is no current false positive. But a future fixture article containing `"By 2022, the program will have fielded all units."` would be incorrectly suppressed (score = 0 instead of being flagged).

**Evidence:**
```js
suppressionScore("By 2022, the Army will have deployed all units.", 2022) = 100
// Incorrect: this is a genuine stale deadline claim, not historical narration
```

**Not a MUST-FIX** for the current corpus (no actual false suppression in the fixtures), but it is an undocumented limitation. If future fixture articles are added that include `"By YYYY, X will..."` deadline patterns, precision could silently drop.

**Suggested fix:** Add a comment in `suppress.ts` Rule 1 noting this limitation: `"'By' can introduce either a deadline ('By 2025, X will...') or historical narration ('By 2022, X shifted...'). The year-match heuristic suppresses both; the deadline case is a known precision-over-recall trade-off when the deadline year matches the frame year."` Add a suppression test that explicitly names this as an ACCEPTED false suppression: `suppressionScore("By 2022, the fleet will include 10 destroyers.", 2022) > 0 // accepted false suppression: By-YYYY deadline sentences indistinguishable from By-YYYY narration`.

---

### F-5 — SHOULD-FIX: No Phase 2 task completion log or Discoveries section in the plan

**Severity:** SHOULD-FIX  
**What the plan says:** Task 2.7 Step 3 says "record [recall gaps] as a Discovery." The plan's Discoveries section (and task completion log) contain only Phase 1 entries. Phase 2 tasks 2.1–2.7 are all committed and appear complete, but none have a completion log entry and no Phase 2 Discoveries were recorded.

**Specifically missing:** The recall gaps identified in F-3 should be in the Discoveries section. The plan's after-phase block also says "populate `docs/pitfalls/implementation-pitfalls.md` with any detector pitfall discovered" — a check of that file is warranted.

**Evidence:** `grep "Task 2\." plan.md | grep -v "Step\|BEFORE\|### Task"` returns only one completion-log-formatted entry (the Phase 1 summary row). The Discoveries section has no Phase 2 entries.

---

## Answering the plan's honesty checklist (Task 2.7 "BEFORE marking complete")

**(a) Does the gold set have real negatives?**  
**YES.** 6 negatives, all with distinct suppression mechanisms: 4 suppressed by Rule 1 (dateline year match) and 1 by the year gate (2026 not past). The 6th negative is the "As of January 2026" year-gate case, which is legitimate (the year gate, not suppression, eliminates it). All negatives are genuine false-positive-class examples — historical narration of past decisions, not trivially-never-flagged throwaway sentences.

**(b) Is any negative actually a mislabeled positive, or vice versa?**  
**No mislabeled entry found.** Each label was independently verified by running the actual detector:
- All 4 positives are detected (`TP=4, FN=0`).
- All 6 negatives are correctly not flagged (`TN=6, FP=0`).
- Precision = 1.0, Recall (over gold) = 1.0.

The GOLD-NEG-5 entry (`"In August 2013...in 2016"`) has a labeling ambiguity at the semantic level (the 2016 procurement target IS a dated forward claim), but the suppression is principled: the dateline frame correctly identifies the sentence as a past announcement attributed to 2013, and min-year selection anchors the claim to the dateline year. The label is defensible under precision-over-recall.

**(c) Is the suppression change (commit `fb14c94`) a principled generalisation or overfit?**  
**PRINCIPLED GENERALISATION.** Tested on 14 novel sentences not in the gold set:
- 6 dateline-narration sentences (various verbs, months, years, prepositions) → all correctly suppressed.
- 5 non-dateline genuine stale claims → none incorrectly suppressed.
- 3 leading-dateline cases where the target year differs from the frame year → none suppressed (forward target preserved).
- All 14/14 pass.

The rule is based on a sound structural cue (leading temporal frame + year match), not on surface features of the specific fixture sentences. The year-match guard prevents over-suppression when a dateline introduces a claim pointing at a *different* future year.

---

## Verdict

**The precision gate is HONEST.** The gold set has real negatives and real positives, all correctly labeled by the detector, and the suppression change is a principled generalisation that works on novel sentences. There is no gamed precision, no deleted negatives, no softened threshold.

However, there are **two SHOULD-FIX gaps** that reduce the gate's comprehensiveness:
1. Two detected-but-unlabeled candidates (a genuine stale claim and a borderline FP) are not in the gold set and not recorded in the plan's Discoveries section as required.
2. The GOLD-NEG-5 fragility (suppression depends on min-year selection) is tacitly acknowledged in the note but not explicitly flagged for future maintainers.

And two NITs:
- The GOLD-NEG-1 note's parenthetical `+ quotation` is ambiguous (Rule 2 does not fire).
- The `By YYYY` forward-target limitation of Rule 1 is not documented.

None of these require blocking the gate from being marked complete, but F-3 (undocumented recall gap + undocumented borderline FP) and F-5 (missing Phase 2 task completion log and Discoveries section) should be addressed before closing Phase 2.
