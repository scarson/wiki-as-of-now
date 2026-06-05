<!-- ABOUTME: Labeling rubric for the WikiAsOfNow detector recall measurement campaign. -->
<!-- ABOUTME: Defines "genuinely stale", the reachable/absolute recall split, exclusions, and worked examples from the corpus. -->

# Recall labeling rubric — WikiAsOfNow stale-claim detector

**Purpose.** This rubric is the labeling guide for the recall measurement campaign. The deterministic stale-claim detector has had its precision characterized exhaustively (see `docs/design/detector-precision-methodology.md`) but its recall — how many genuinely stale claims it *misses* — has never been measured. To measure recall, labelers must first identify a ground-truth set of stale claims by reading article prose, independently of what the detector does. This document tells them exactly how to do that.

**C2 invariant.** Label by reading the article prose. Never label "stale" because the detector flagged it — that would make recall trivially 1.0. Run the detector only after labeling.

---

## 1. The "genuinely stale" definition (C3)

A sentence is **genuinely stale** if and only if ALL of the following hold:

1. **Forward-tense / expectation claim.** The sentence makes a claim about a future state of affairs — using words like "is expected to", "is scheduled to", "will", "plans to", "anticipated", "is slated to" — not merely describing what happened in the past.
2. **Target time is now past.** The event or milestone the claim predicts was supposed to happen by a specific time that is **earlier than asOfYear = 2026**. (For claims without an explicit past target year, see §2 — these are typically `reachable=false`.)
3. **A Wikipedia editor would plausibly want to review or update it.** The claim is still presented as an open expectation; the article does not itself resolve it; and it describes something a living Wikipedia article would reasonably track.

All three conditions are necessary. A sentence satisfying only one or two is NOT genuinely stale.

**asOfYear = 2026.** All staleness judgments are relative to this year. A claim targeting 2025 or earlier is past. A claim targeting 2026 is borderline — treat as not-past (the year may still be in progress). A claim targeting 2027+ is future, not stale.

---

## 2. The reachable / absolute recall split (C1)

Not all genuinely stale claims are reachable by the detector. The detector requires an **inline 4-digit past year in the same sentence** to flag a claim. This creates two distinct recall numbers:

| Term | Definition |
|------|-----------|
| **Reachable** | The stale claim's sentence contains an explicit 4-digit year (e.g. "2020") that is now past. The detector *could* catch it (whether it actually does is what recall measures). |
| **Not reachable** | The staleness depends on a relative date ("next year", "by end of decade"), a cross-sentence date (a year stated only in a prior sentence), or no date at all. The detector structurally cannot catch these — they are an accepted recall gap, not a bug. |

**Reachable is decided purely by the presence of an inline 4-digit past year — NOTHING ELSE.** A sentence that HAS an inline past year is `reachable=true` even if the detector happens to suppress it (e.g. a leading-dateline frame, or a `By <year>` deadline — "the bridge will be finished by 2020"). Such a claim is reachable-but-missed; the plan's Task 1.2 schema calls that a `suppression-collateral` miss (see §4). Do NOT mark a sentence `reachable=false` just because you suspect the detector suppresses it — `reachable` is about the year being present, not about whether the detector flags it (that would reintroduce circularity, C2).

**Every label carries both a `stale: true/false` flag and a `reachable: true/false` flag.**

The two recall metrics this produces:
- **Reachable recall** = (stale claims the detector caught) / (all stale claims where reachable=true)
- **Absolute recall** = (stale claims the detector caught) / (all stale claims)

Reachable recall is the operationally meaningful number — it measures how well the detector does within its design envelope. Absolute recall quantifies the full gap including structurally-unreachable claims.

---

## 3. Exclusions — what is NOT genuinely stale

Three categories of sentences must be excluded even when they contain forward-tense language and a past year:

### Exclusion A: Historical narration (DET-1 — by design, NOT a bug)

A sentence that **opens with a temporal frame** identifying a past event or announcement ("In March 2013, …", "On 30 August 2018, …", "In 2021, …") and then uses forward-tense language is narrating what was said or planned *at that time* — not making an unresolved forward prediction. The year is the **dateline of the statement**, not the target of the claim.

**Marker:** The sentence's subject is a date or event, not the thing being predicted.

**Why not stale:** A Wikipedia editor already knows this is historical context; updating it would mean rewriting history, not correcting an outdated claim.

This is the suppression target of the detector's dateline rules (Rule 1 and Rule 4). These are correct *non*-labels. The detector correctly not-flagging them is a true negative, not a miss. See `docs/pitfalls/implementation-pitfalls.md` §DET-1 for the full false-positive catalog.

### Exclusion B: Resolved nearby

A sentence that contains a forward-tense / expectation claim AND that same sentence (or an immediately adjacent sentence) also provides a resolution cue showing the claim was already updated or superseded. Examples: "…was expected to be completed in 2018; however, in late 2010 the design was changed to a tunnel"; "…anticipated starting in 2020, but later moved that to 2023."

**Marker:** Look for "however", "but later", "subsequently", "ultimately", "instead", or an explicit statement that the plan changed — immediately before or after the claim in the article text.

**Why not stale:** The Wikipedia article already acknowledges the update. There is nothing for an editor to correct.

### Exclusion C: Incidental historical years (DET-3 — irreducible detector limit)

A sentence that contains a forward-tense claim but whose **only past year belongs to background context**, not to the forward claim's target. The year might be a founding/built/launch date, a year range for an unrelated milestone, or a parenthetical reference. The claim itself has no explicit past-year target.

**Marker:** Ask "what year is this forward claim supposed to happen?" If the answer is "it doesn't say — only the background year appears," this is an incidental year.

**Why not stale:** The forward claim makes no past-tense deadline; there is nothing to call "late." The incidental year merely provides context. The detector flags these as false positives (scored against the incidental year, not the claim's target).

This is an *irreducible* detector limitation — there is no deterministic way to distinguish an incidental background year from a claim's target year without semantic understanding. Labeling these as stale would inflate the detector's apparent false-negative rate by counting FPs it *should* generate as missed TPs. See `docs/pitfalls/implementation-pitfalls.md` §DET-3.

### Exclusion D: Pure background facts

Founding dates, built/completed dates, launch dates, and similar historical facts stated without a forward claim are never stale. "Built in 1910" is a permanent historical fact, not a prediction. "The bridge opened in 2022" reports a completed event.

**Marker:** No forward-tense verb or expectation marker is present. The sentence is purely past-tense descriptive.

---

## 4. Classifying a stale claim — the `shapeClass` taxonomy

Every `stale=true` entry gets a `shapeClass` (the plan's Task 1.2 schema field) describing the claim's SHAPE — judged from the prose, independent of the detector. `shapeClass` is NOT keyed to `reachable`: a reachable claim (has a year) can still be missed. The categories, and which recall denominator + follow-up they map to:

| `shapeClass` | When it applies | reachable | Miss expected? |
|--------------|-----------------|-----------|----------------|
| `simple` | Has an inline past year AND a forward marker already in the lexicon (`is expected to`, `plans to`, `will`, …) | true | No — the detector SHOULD catch it; a missed `simple` is a **potential bug, escalate** |
| `marker-gap` | Has an inline past year but its forward phrase is NOT in the lexicon ("set to", "on track to", "slated for", …) | true | Yes — fixable by Phase 2 (lexicon expansion) |
| `suppression-collateral` | Has an inline past year + an in-lexicon marker, but a suppression rule drops it (leading dateline, `By <year>` deadline, DET-2) | true | Yes — deferred (touching suppression risks precision); NOT a bug |
| `inline-year-absent` | Genuinely stale but no 4-digit year in the sentence (relies on a relative/cross-sentence date) | false | Yes — needs the semantic lever; NOT a bug |
| `relative-date` | Uses a relative anchor ("next year", "within five years", "by the end of the decade") instead of a 4-digit year | false | Yes — needs the semantic lever; NOT a bug |
| `other` | Fits none of the above (note why) | either | — |

(DET-3 incidental-year sentences are `stale=false` — they never enter this table; the detector flagging one is a precision FP, and the detector correctly NOT flagging one is a true negative. See §3 Exclusion C.)

The recall analysis ranks the misses by `shapeClass`. The only category that signals a **bug** is a missed `simple` claim; every other missed category is an expected, documented gap.

---

## 5. Worked examples from the corpus

All examples use verbatim wikitext sentence text (stripped of citation markup for readability). Each entry cites the fixture file and line where the sentence appears.

---

### Example 1 — STALE, reachable

**Fixture:** `test/fixtures/robotic_combat_vehicle.wikitext`, line 43

**Sentence:** "Testing of the vehicle is expected to begin in 2020."

**Label:** stale=true, reachable=true

**Reason:** Forward expectation claim ("is expected to") with an explicit past target year (2020 < 2026) and no dateline or resolution cue. The sentence begins with "Testing", not a date. A Wikipedia editor would want to check whether testing actually began. The detector can reach this (inline year 2020 present, marker present).

---

### Example 2 — STALE, reachable (biomedical domain)

**Fixture:** `test/fixtures/m72_as01e.wikitext`, line 71

**Sentence (relevant portion):** "It is scheduled to begin in 2024 with results available in 2028."

**Full sentence context:** "The Phase III trial is funded by the Wellcome Trust (up to US$150 million) and the Gates Foundation (the remaining around US$400 million). It is scheduled to begin in 2024 with results available in 2028."

**Label:** stale=true, reachable=true

**Reason:** Explicit scheduling claim ("is scheduled to") with a past target year (2024 < 2026). No temporal frame opens the sentence. An editor reviewing the article in 2026 would want to verify whether the Phase III trial actually began. The detector can reach this (inline year 2024 present).

**Note on 2028:** The "results available in 2028" clause does not make the sentence not-stale — the start date (2024) is already past and is itself the stale claim. The 2028 results date is a future milestone; only the 2024 start is being labeled here.

---

### Example 3 — STALE, reachable (military domain)

**Fixture:** `test/fixtures/littoral_combat_ship.wikitext`, line 70

**Sentence (relevant portion):** "The upgraded RMMVs will be fielded in 2018, and testing will be conducted to see if the Fleet-class common unmanned surface vessel (CUSV) can tow the AQS-20A, and if successful will be used for minehunting by 2020."

**Label:** stale=true, reachable=true

**Reason:** Future-tense delivery claim ("will be fielded") with an explicit past target year (2018 < 2026). The sentence begins with "The upgraded RMMVs" — not a dateline. An editor would want to check whether the RMMVs were actually fielded. The detector can reach this (inline year 2018, marker "will" present).

---

### Example 4 — STALE, NOT reachable (no inline year — DET-2 accepted gap)

**Fixture:** `test/fixtures/sbx-1.wikitext`, line 42

**Sentence:** "The first such vessel is scheduled to be based in Adak Island, Alaska, part of the Aleutian Islands."

**Label:** stale=true, reachable=false

**Reason:** This is a scheduling claim ("is scheduled to be based") that describes a homeport assignment that was later cancelled/changed. The claim is stale — SBX-1 was not permanently based at Adak Island. However, the sentence contains **no 4-digit year**. The detector cannot flag it without an inline past year (the inline-year requirement in DET-2). This miss is expected and is NOT a bug.

This is the canonical not-reachable example. It counts against absolute recall but not reachable recall.

---

### Example 5 — NOT stale (historical narration — DET-1, correct non-label)

**Fixture:** `test/fixtures/ground-based_midcourse_defense.wikitext`, line 47

**Sentence:** "In March 2013, the Obama administration announced plans to add 14 interceptors to the current 26 at Fort Greely in response to North Korean threats."

**Label:** stale=false

**Reason:** The sentence opens with a temporal frame ("In March 2013") that is the dateline of the announcement event. The "plans to add" language reports what the Obama administration said in March 2013 — a historical fact, not an unresolved forward prediction. The year 2013 is the date the statement was made, not a future target. The detector correctly suppresses this (Rule 1: leading dateline frame year matches claim year). Labeling it stale would be wrong.

This illustrates **Exclusion A** (historical narration). See DET-1.

---

### Example 6 — NOT stale (resolved nearby — correct non-label)

**Fixture:** `test/fixtures/neuralink.wikitext`, line 36

**Sentence:** "It anticipated starting experiments with humans in 2020, but later moved that to 2023."

**Label:** stale=false

**Reason:** Although "anticipated starting … in 2020" is a forward expectation with a past target year (2020 < 2026), the **same sentence** immediately provides a resolution cue: "but later moved that to 2023." The article has already updated the plan. There is nothing for a Wikipedia editor to correct — the update is already reflected. The detector correctly suppresses this (Rule 3: resolution cue + resolution verb "moved").

This illustrates **Exclusion B** (resolved nearby).

---

### Example 7 — NOT stale (incidental historical year — DET-3, correct non-label)

**Fixture:** `test/fixtures/gateway_program_northeast_corridor.wikitext`, line 155

**Sentence:** "The Portal Bridge Replacement will replace the existing Portal Bridge, built in 1910, with the Portal North Bridge, which will replace the tracks on the existing Portal Bridge one-by-one, and yield reliability improvements, but not increase capacity."

**Label:** stale=false

**Reason:** The sentence contains forward-tense markers ("will replace") and the year 1910. However, 1910 is the **construction date of the existing Portal Bridge** — background context about the thing being replaced. The forward claim ("will replace") has no explicit past target year; "1910" is not the claim's deadline. The detector would flag this at year 1910 (DET-3 false positive), but it is NOT stale. The year is incidental.

Ask the test: "When is this replacement supposed to happen?" The answer is: the sentence doesn't say. Only a background year (1910) appears. This is **Exclusion C** (incidental historical year). See DET-3.

---

### Example 8 — NOT stale (historical narration of scrapped plan — correct non-label)

**Fixture:** `test/fixtures/fehmarn_belt_fixed_link.wikitext`, line 61

**Sentence:** "The Fehmarn Belt bridge was originally expected to be completed by 2018."

**Label:** stale=false

**Reason:** This sentence appears in a "Bridge proposal" section narrating a **plan that was abandoned** — the very next paragraph of the article explains that in late 2010 the design was changed to an immersed tunnel instead. "Was originally expected to be completed" is past-tense narration of a superseded plan; there is no open prediction for an editor to update. The bridge was never built and the plan no longer exists.

This illustrates both **Exclusion A** (historical narration of an event in the past) and **Exclusion B** (resolved nearby — the subsequent paragraph resolves the open plan). Even though the sentence contains the marker "to be completed by" and the year 2018, neither condition for staleness holds: the claim is not an open prediction and the article resolves it immediately.

**Detector note:** This sentence would likely be caught by the detector ("to be completed by" is a marker, 2018 is a past year, no leading dateline suppression fires). If so, the detector's flag is a false positive (DET-1 / DET-2 boundary case — historical narration not triggered because the sentence begins with "The", not a date frame). The correct label remains not-stale.

---

## 6. Labeler protocol (C2 — preventing circularity)

Follow this sequence for every sentence you evaluate. Deviating from the order reintroduces circularity.

**Step 1: Read the article prose first.**
Open the fixture file and read the article as a whole before labeling anything. Understand the subject, the project's timeline, and what claims are being made. Do not open the detector output or run any tool at this stage.

**Step 2: Label independently.**
For each candidate sentence, apply the definition in §1 and the exclusions in §3. Assign `stale: true/false` and `reachable: true/false` based only on the prose. Record a one-line reason.

- If `stale=true`: note the marker, the target year, and confirm no exclusion applies.
- If `stale=false`: note which exclusion applies (A, B, C, or D) or why the claim is not forward-tense.
- If `reachable=true`: confirm a 4-digit past year appears inline in the same sentence.
- If `reachable=false`: note whether the date is relative, cross-sentence, or absent.

**Step 3: Record your labels before running the detector.**
Commit your labels to a file before proceeding. This is the anti-circularity checkpoint.

**Step 4: Run the detector.**
Run the detector on the fixture and compare its output against your labels. The comparison produces:
- True positives (TP): detector flagged, you labeled stale.
- False negatives (FN): detector did NOT flag, you labeled stale and reachable=true. Investigate each — assign its `shapeClass` (§4): marker-gap or suppression-collateral (expected gaps) — or, if it is a `simple` claim that was still missed, a potential bug to escalate.
- False positives (FP): detector flagged, you labeled not-stale. These are precision failures, already characterized; record but do not re-label to match.
- True negatives (TN): detector did NOT flag, you labeled not-stale. These are correct non-labels.

**Step 5: Classify each FN.**
Every false negative (missed stale claim) should be classified against the `shapeClass` taxonomy in §4. Only FNs that reach "potential bug" require escalation; DET-2 accepted gaps are expected.

---

## 7. Quick-reference checklist for a single sentence

Before labeling a sentence stale, confirm ALL of the following:

- [ ] The sentence contains a forward-tense / expectation marker (not just past-tense description).
- [ ] The claim's target time is in the past relative to asOfYear = 2026 (or there is an explicit past year and no resolution of the claim in the article).
- [ ] The sentence does NOT open with a temporal frame that datelines the statement (Exclusion A).
- [ ] The same sentence (or an immediately adjacent one) does NOT resolve the claim with a "later", "subsequently", "however", or direct update (Exclusion B).
- [ ] The past year in the sentence IS the forward claim's target — not a founding date, built date, or parenthetical background year (Exclusion C / D).

If any check fails, label the sentence not-stale and note the exclusion.

---

## 8. Cross-references

- `docs/pitfalls/implementation-pitfalls.md` §DET-1: Historical dateline narration — the dominant false-positive class; full suppression rule detail.
- `docs/pitfalls/implementation-pitfalls.md` §DET-2: Named, accepted recall gaps (inline-year requirement, earliest-year/dateline interaction, `By <year>` deadline ambiguity).
- `docs/pitfalls/implementation-pitfalls.md` §DET-3: Incidental historical years — the irreducible false-positive class; no safe deterministic fix.
- `docs/design/detector-precision-methodology.md`: The structural pattern catalog, precision accounting, and roadmap for semantic improvements.
- `test/gold/gold-set.json`: The precision gold set; the per-entry `note` field demonstrates the note style for this labeling work.
