<!-- ABOUTME: Implementation plan for the marker-governs-year lever (cut 1 — DET-3 incidental-year precision slice). -->
<!-- ABOUTME: Curate the DET-3 FP set, build the governs.ts year-eligibility filter discriminator-by-discriminator, gate on precision+recall. -->

# Marker-governs-year (cut 1: DET-3 precision slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the detector anchoring a stale-claim candidate to a year the marker does not govern (incidental years), eliminating the DET-3 false-positive class — without dropping any real forward target.

**Architecture:** A new pure module `src/detector/governs.ts` exposes `governedYears(sentence, marker, pastYears) → number[]`, which filters each past year by its local grammatical role (cross-clause aside, noun-modifier, named-entity, parenthetical/range), returning only anchorable targets and KEEPING a leading-dateline year eligible (deferred to suppress Rule 1, so DET-2 stays out of scope). The orchestrator `detect.ts` Step 3 swaps `Math.min(...pastYears)` for `Math.min(...governedYears(...))` and skips the sentence when no year is anchorable. Nothing else in the pipeline changes.

**Tech Stack:** TypeScript (Node 24 per `.nvmrc`), Vitest, `wtf_wikipedia` (parse only — unchanged here). pnpm@11.5.1. Same toolchain as the detector foundation + recall work.

**Design spec (authoritative):** `docs/design/2026-06-05-marker-governs-year-design.md` — read it before any task; §2.1 (the participle crux) and §2.2 (leading-dateline preservation) are load-bearing.

---

## Living Document Contract

This plan is a living document. Every executing agent MUST update it as
execution progresses, not only at completion.

- **On phase claim:** the executor MUST flip the banner to 🚧 IN PROGRESS
  with a claim timestamp (ISO 8601 UTC) and the active branch name. The
  banner MUST NOT include an expected-completion estimate — agents cannot
  reliably estimate their own wall-clock, and a fabricated duration
  becomes a stale anchor that misleads future readers. Followers
  encountering a 🚧 banner determine liveness by observable signals (PR
  existence, recent branch commits), not by arithmetic on expected times.
  See Step 5's stale-claim reclaim protocol.
- **On phase ship:** the executor MUST update that phase's **Execution
  Status** banner with the shipped commit SHA(s) and date. If a PR is
  open, the PR number and URL MUST appear in the top-of-plan Execution
  Status table.
- **On phase defer:** the executor MUST update the banner with ⏸ status
  AND a prose description of the unblock condition + a link to the
  likely-unblocker artifact (plan page, task, or PR whose own Execution
  Status banner will signal completion). Prose + link is durable across
  paraphrases and scope edits; exact-string coordination between agents
  is not.
- **On PR merge:** the executor MUST record the merge SHA in the banner
  + the top-of-plan Execution Status table.
- **On deviation from the written plan** (scope edits, structural
  refactors, dropped tasks, reordered phases): the executor MUST
  inline-document the deviation in the affected task AND summarize it
  in the top-of-plan Execution Status as a "Deviations" subsection.
  Deviation state MUST NOT live only in PR notes or status reports.
- **On discovery** (pre-existing drift surfaced during execution, new
  bugs found, architectural issues noted): the executor MUST add a
  "Discoveries" subsection at the top of the plan with pointers to the
  files/lines affected. Follow-up dispatches read this subsection to
  avoid duplicate discovery work.

The plan SHOULD reflect reality at the end of every session that touches
it. Anything worth putting in a status report to the user is worth
putting in the plan.

Rationale: `/writing-plans-enhanced` Step 5. Writing at ship time is
cheap; reconstruction by downstream readers is expensive, compounds
across dispatches, and fails silently when state is split across PR
notes and commit messages.

---

## Execution Status

**Overall:** In progress. Phase 1 shipped; Phase 2 claimed.

| Phase | Status | Ship SHA(s) | Notes |
|---|---|---|---|
| 1 — Curate DET-3 FP set | ✅ Shipped (`3d7661e`) | `3d7661e` | 23 DET-3 FPs; all 5 sub-shapes ≥2 (noun-mod 9, paren 6, cross-clause 3, named-entity 3, range 2) → all discriminators build; reviewed HONEST |
| 2 — Build governs filter (gated) | 🚧 In progress (branch `claude/wikiasofnow-detector-phase2-ZP1uQ`) | — | Task 2.1 (`39039e6`), Task 2.2 cross-clause, Task 2.3 noun-modifier shipped; remaining discriminators 2.4–2.5 |
| 3 — Document + finalize | ⬜ Not started | — | methodology/pitfalls/spec/plan; report any recall give-back |

### Deviations

- **Task 2.2 — `DATELINE_REGEX` exported (one word).** Added `export` to the existing `const DATELINE_REGEX` in `src/detector/suppress.ts` so `governs.ts`'s leading-dateline guard reuses Rule 1's exact frame (§2.2) instead of duplicating it. Behavior-preserving; the spec's "no change to suppress.ts" meant no *logic* change. `suppress.test.ts` + precision gate stayed green.
- **Task 2.2 — cross-clause predicate broadened beyond the plan's seed "participle + clause boundary".** Two of the three curated `cross-clause-aside` FPs are not clean `<participle> in <year>` asides: tesla_semi's `2017` is a **non-leading dateline** ("… expected … 997 km. In 2017, Tesla projected …" — the parser merged two sentences; the period is the clause boundary, no comma between marker and year), and gateway's mid-`2025` is in a **leading subordinate clause** ("Though tunneling had still not begun by mid-2025, … scheduled to …"). The plan's seed predicate (comma/`;`/`—`/relative-pronoun boundary + aside participle) only caught the Portal-Bridge `1910` case. Added two precise, generalizable sub-mechanisms to `isCrossClauseAside`: `NONLEADING_DATELINE` (`. In/By/During/On/As of <year>` with the marker in the earlier clause) and `LEADING_SUBORDINATE` (`^Though|Although|While|Whilst|Whereas` with the year before the first comma and the marker after). Also added `updated` to `ASIDE_PARTICIPLE` (required by the plan's own synthetic mixed-case KEEP test "the IRDS, updated in 2019, …"; CLAUSE_BOUNDARY-guarded so the forward form "expected to be updated in 2027" survives — locked by a new KEEP test). All three sub-mechanisms validated against every KEEP case + the precision gate; no gold positive dropped, precision held at 0.9706, zero newly-flagged corpus sentences. The discriminator also generalized to one additional correct DET-3 drop (high_speed_2 `2008`, "—which was completed in 2008—", a `stale:false`-class incidental, not a labeled positive).
- **Task 2.2 — det3-fp structural test strengthened (Task 1.1 reviewer NIT).** Added `flaggedOnAnchorYear(subShape)` cross-verification so each not-yet-hardened sub-shape asserts the detector flags its sentence ON the curated `anchorYear` (a wrong anchorYear can no longer pass silently).
- **Task 2.3 — noun-modifier discriminator: the plan's `targetPrepBefore` guard was empirically insufficient and was replaced by a marker-position + bare-vs-determined-frame split.** The plan's starter treated "a temporal preposition before the year → KEEP". That over-keeps the real label FPs ("in the 2021 update of the IRDS …", "during the 2021 AI Day event, … will", "During the 2025 … shutdown, … expected to …", "factor in the 2021 … by-election … planned to") — all of which carry a temporal preposition yet must DROP — so a pure preposition test cannot separate them from the README over-drop KEEPs ("a boost in the 2022 midterm elections", "not be felt before the 2024 election"). The actual discriminator found empirically is **marker position relative to the year**: in the KEEP cases the marker precedes the year inside its own clause (the year is the marker's forward complement); in the DROP cases the marker follows the year (the year-noun sits in a leading/embedded aside). Implemented as: a determiner/possessive/cap-noun label is incidental UNLESS (a) a **bare** "`<prep> <year>`" frame with NO determiner introduces it (always a temporal window — "by 2023 SpaceX will fly", "After 2020 the Army planned"; this also un-broke the uncurated new_glenn "after 2019 New Glenn will also receive" which the determiner-less cap-noun rule alone would have over-dropped), OR (b) a "`<prep> the <year> <noun>`" frame whose **marker precedes the year** (the marker's own complement — the two README KEEPs). Also added `POSSESSIVE_BEFORE` (`'s`) for the "Science's 2020 survey" FP. All 9 curated noun-modifier FPs drop (0 residual); both README over-drop KEEPs preserved; precision held 0.9706 (33 TP / 1 FP, no new gold FP); reachable recall 1.0 (no give-back); corpus flag-diff = 9 FP sentences removed, **0 newly-flagged sentences**, plus one beneficial anchor-shift (flamanville `2016`→`2017`: the incidental report-date dateline "in December 2016 The Economist reported …" was dropped, re-anchoring to the marker's real target "the regulator will rule … mid-2017"). `noun-modifier` hard-gated to `expect([])` in det3-fp.test.ts.

---

## Source documents (read before executing)

- **`docs/design/2026-06-05-marker-governs-year-design.md`** — the approved design. §2.1 participle crux, §2.2 leading-dateline preservation, §3 test strategy, §4 guardrails.
- **`src/detector/detect.ts`** — the orchestrator; Step 3 line `const chosenYear = Math.min(...pastYears);` is the single change point.
- **`src/detector/markers.ts`** — `extractYears` (values) and `MARKER_STRENGTH`. `governs.ts` needs year *positions*, so it adds its own `yearOccurrences` (do NOT change `extractYears`).
- **`src/detector/suppress.ts`** — `DATELINE_REGEX` (Rule 1) is the behavior `governs.ts` §2.2 defers to; read it so the leading-dateline predicate stays consistent.
- **`test/detector/precision.test.ts`** + **`test/gold/gold-set.json`** — the 73-entry precision gate (≥0.9, currently ~0.97). MUST stay green.
- **`test/detector/recall.test.ts`** + **`test/gold/recall-set.json`** — the recall harness + 0.90 reachable-recall floor. MUST stay green.
- **`docs/pitfalls/implementation-pitfalls.md`** DET-2/DET-3 and **`docs/pitfalls/testing-pitfalls.md`** (esp. §1 pristine output, §9 gold honesty / composition guard / generalize-not-overfit) — read before coding/testing.

## Execution strategy (recommendation)

**Subagent-driven** (`superpowers:subagent-driven-development`), fresh subagent per task with review between tasks. Rationale: the tasks are sequential (Phase 2 all edits `governs.ts`) but each is a self-contained, gated unit that benefits from an independent review against the precision/recall contract — exactly the quality-gate shape subagent-driven handles best. The cross-clause task (2.2) is the precision-critical one and warrants focused per-task review. This is NOT a parallel-agents candidate (single shared file, ordered dependencies).

**Push after every task's commit** (`git push -u origin <branch>`). This work runs in an ephemeral container that is re-cloned on resume — an unpushed commit (and any hand-labeled gold) is lost on reclaim. Pushing per task is the durability boundary.

---

## Phase 1 — Curate the DET-3 false-positive set (measurement first)

**Execution Status:** ✅ SHIPPED at `3d7661e` on 2026-06-05. 23 DET-3 FPs curated; reviewed HONEST (all entries independently re-verified, 0 disputed). Distribution: noun-modifier 9, parenthetical 6, cross-clause-aside 3, named-entity 3, range 2 — all ≥2, so Phase 2 builds all five discriminators. 3 mixed cases + a noun-modifier over-drop risk ("the 2022 midterm elections") recorded as Task 2.3 KEEP targets.

Why first: DET-3 FPs are currently *unlabeled* (the precision methodology left them out). We cannot prove the lever works or guard against regressions without them, and the curated set's sub-shape distribution decides which discriminators are worth building (design §3, YAGNI).

### Task 1.1 — Assemble `test/gold/det3-fp-set.json` + README + reporting test

**Files:**
- Create: `test/gold/det3-fp-set.json`
- Create: `test/gold/det3-fp-set-README.md`
- Create: `test/detector/det3-fp.test.ts`

```
BEFORE starting work:
1. Invoke superpowers:test-driven-development
2. Read docs/pitfalls/testing-pitfalls.md (esp. §9 gold honesty) and the design §3.
```

- [ ] **Step 1: Scan the corpus for incidental-anchor candidates (throwaway script).**
  Write a deleted-before-commit script (`npx tsx` in-repo, NOT bare node — the project's ESM imports are extensionless) that runs the CURRENT detector over every `test/fixtures/*.wikitext` and prints each flagged candidate's `sentenceText`, `year` (anchor), and fixture. For each, judge by reading the sentence: is the anchor `year` the marker's actual target, or incidental? Collect the incidental ones.

- [ ] **Step 2: Hand-verify + label each FP, classify its sub-shape.**
  For every confirmed incidental-anchor FP, record an entry. Sub-shape ∈ {`cross-clause-aside`, `noun-modifier`, `named-entity`, `parenthetical`, `range`}. Entry shape (ILLUSTRATIVE format only — every real entry comes from the Step 1 corpus scan, with a `fixture` that actually exists in `test/fixtures/`; do NOT hardcode this example):
```json
{
  "fixture": "<actual fixture from the scan>.wikitext",
  "sentenceSubstring": "will replace the Portal Bridge, built in 1910",
  "anchorYear": 1910,
  "subShape": "cross-clause-aside",
  "stale": false,
  "note": "1910 is the bridge's construction date in a participial aside; the marker 'will' governs no year"
}
```
  Honesty rules (testing-pitfalls §9): label from the sentence, not to make a number look good; a sentence is a DET-3 FP only if the anchor year is genuinely not the marker's target. If a sentence has BOTH an incidental earliest year AND a real later target (the "mixed case"), it is NOT an FP for this set (the detector *should* flag it, just at the target) — note these separately in the README (fixture + both years), do NOT add them as `stale:false`, and carry each real mixed case forward as a `governedYears(...)` KEEP test in the relevant Phase 2 task so the discriminators are proven not to suppress the real target. If the corpus has zero mixed cases, say so in the README (the synthetic mixed-case KEEP test in Task 2.2 still applies).

- [ ] **Step 3: Write the README** (`det3-fp-set-README.md`): how the set was built (scan + hand-verify), the sub-shape counts (the distribution that drives Phase 2 scope), the mixed-case observations, and the honesty protocol followed. State the count per sub-shape explicitly — Phase 2 builds a discriminator only for sub-shapes with ≥2 instances (YAGNI); record which sub-shapes clear that bar.

- [ ] **Step 4: Write the test** `det3-fp.test.ts`. Structure it so Phase 2 can harden one sub-shape at a time. Provide a shared helper:
```ts
// flaggedFpEntries(subShape) → the curated entries of that sub-shape that the
// detector currently flags (by sentenceText.includes(sentenceSubstring), per-fixture cached).
```
  - A **structural test**: every entry has all fields; `stale === false`; `subShape` ∈ {cross-clause-aside, noun-modifier, named-entity, parenthetical, range}; `anchorYear` is a number; `sentenceSubstring` is non-empty AND occurs in the named fixture's parsed sentence text (mirror `recall.test.ts`'s substring check).
  - A **min-count composition guard** (testing-pitfalls §9 — a gate over a set that can be silently emptied is no gate): assert `entries.length >= <the curated count from Step 2>` (hardcode the actual number) so a future edit cannot pass the FP gate by deleting entries. State the number in the README too.
  - A **reporting block** (passes unconditionally for now): in a SINGLE labeled `console.log`, log `flaggedFpEntries(s).length` for each sub-shape `s` (baseline — expected: all entries flagged, since these are the *current* detector's FPs). Phase 2 Tasks 2.2–2.5 each replace their sub-shape's reporting line with a hard assertion `expect(flaggedFpEntries("<sub-shape>")).toEqual([])`.

```
BEFORE marking this task complete:
1. Review the test against docs/pitfalls/testing-pitfalls.md (pristine single-block output; structural test bites — prove it by temporarily corrupting an entry, then restore).
2. Confirm the scan script is deleted and NOT staged (git status clean except the 3 intended files).
3. Run `pnpm test` (green + pristine), `pnpm exec tsc --noEmit` (clean), `pnpm lint` (clean).
```

- [ ] **Step 5: Commit.**
```bash
git add test/gold/det3-fp-set.json test/gold/det3-fp-set-README.md test/detector/det3-fp.test.ts
git commit -m "test(detector): curate DET-3 false-positive set (Task 1.1)"
```

**After completing this task:** push the branch (`git push -u origin <branch>`) so the curated set survives a container resume — it is hand-labeled work that is expensive to reconstruct.

---

## Phase 2 — Build the `governs.ts` year-eligibility filter (gated, discriminator-by-discriminator)

**Execution Status:** 🚧 IN PROGRESS — claimed 2026-06-05 (UTC), branch `claude/wikiasofnow-detector-phase2-ZP1uQ`. All five discriminators build (Task 1.1 distribution). Subagent-driven, sequential (single shared file).

All Phase 2 tasks modify `src/detector/governs.ts` (and its test), so they are **strictly sequential** — never parallelize them (they edit the same file). Each task is precision-gated and recall-gated.

```
PITFALL WARNING for every Phase 2 task (docs/pitfalls/implementation-pitfalls.md DET-2/DET-3):
- The filter only REMOVES years, but that can SHIFT the anchor to a later year — and
  suppress.ts Rules 1/3/4 are all year-dependent (Rule 1 matches the dateline year, Rule 4
  matches the reporting-date year). So dropping an incidental year can make a sentence that
  was SUPPRESSED at the old anchor flag at the NEW anchor. The §2.2 leading-dateline guard
  neutralizes this for Rule 1; Rules 3/4 are not guarded, so you MUST corpus-flag-diff every
  task: run the detector over all fixtures before and after, and inspect any sentence that is
  NEWLY flagged (flagged after, not before). A newly-flagged sentence is acceptable ONLY if it
  is a genuine stale claim the old anchor wrongly hid; if it is a new false positive, the
  discriminator dropped a year that was load-bearing for a suppression rule — tighten it.
- A discriminator that drops a REAL target year (precision-gate or recall-floor red, or a gold
  POSITIVE no longer flagged) is over-aggressive: tighten the predicate, do NOT weaken the gate.
  See the assertion-rigor note below.
- The cross-clause predicate (Task 2.2) MUST NOT fire on "expected to be completed in 2024"
  (no clause boundary between marker and year) — design §2.1. Both directions are locked tests.
```

```
ASSERTION RIGOR (every Phase 2 task): the precision gate (precision.test.ts, ≥0.9),
the recall floor (recall.test.ts, ≥0.90), and the DET-3 FP assertions are the contract.
If a gate goes red, the fix is a more precise discriminator, NEVER a weakened assertion
or a deleted gold entry (testing-pitfalls §9).

CRITICAL — the precision gate is a RATIO and does NOT by itself protect labeled
positives. The lever filters years, so it could make a labeled gold POSITIVE in
test/gold/gold-set.json stop being flagged (a dropped real target) while the ratio
≥0.9 still passes. So every Phase 2 task MUST additionally verify, with a throwaway
`npx tsx` check (deleted, not committed), that the set of flagged gold POSITIVES is
UNCHANGED from before the task — run the detector over the gold-set positives before
and after and diff the flagged sentences. ANY gold positive that stops being flagged
is a dropped real target: tighten the discriminator, do NOT accept it.

A tiny recall give-back (down to the 0.90 floor, i.e. at most one reachable recall-SET
entry) is permitted ONLY if it buys a large precision gain, is a genuinely ambiguous
sentence, AND is reported in the commit subject (e.g. "recall 1.0→0.909, gives back
<fixture> <shape>") — never silent. A gold-POSITIVE drop is NOT covered by this
allowance — those must stay flagged. If you cannot keep BOTH (a) precision.test.ts
green with its current value (33 TP / 1 FP ≈ 0.97, i.e. no new gold FP) AND (b) every
gold positive still flagged, without dropping a real target, STOP and raise to the
dispatching agent.
```

### Task 2.1 — Scaffold `governs.ts` (identity filter) and wire into `detect.ts`

Establishes the seam with ZERO behavior change (identity filter returns all past years), so every gate stays green before any discriminator exists.

**Files:**
- Create: `src/detector/governs.ts`
- Create: `test/detector/governs.test.ts`
- Modify: `src/detector/detect.ts` (Step 3)

```
BEFORE starting work: invoke superpowers:test-driven-development; read the design §2 and docs/pitfalls/testing-pitfalls.md.
```

- [ ] **Step 1: Write failing tests** in `governs.test.ts`:
```ts
// ABOUTME: Unit tests for the marker-governs-year eligibility filter.
import { describe, it, expect } from "vitest";
import { yearOccurrences, governedYears } from "../../src/detector/governs";

describe("yearOccurrences", () => {
  it("returns each 4-digit year with its character span, in order", () => {
    const occ = yearOccurrences("built in 1910 and 2024");
    expect(occ).toEqual([
      { value: 1910, start: 9, end: 13 },
      { value: 2024, start: 18, end: 22 },
    ]);
  });
});

describe("governedYears (identity baseline — before discriminators)", () => {
  it("returns all past years when none are incidental", () => {
    // "is expected to deliver in 2020" — 2020 is a plain target
    expect(governedYears("X is expected to deliver in 2020", "is expected to", [2020])).toEqual([2020]);
  });
  it("returns distinct values only", () => {
    expect(governedYears("expected in 2020, again in 2020", "expected to", [2020])).toEqual([2020]);
  });
});
```

- [ ] **Step 2: Run to verify they fail** — `pnpm vitest run test/detector/governs.test.ts` → FAIL ("governedYears is not a function").

- [ ] **Step 3: Implement the scaffold** `src/detector/governs.ts`:
```ts
// ABOUTME: Year-eligibility filter — returns the past years a forward marker grammatically governs.
// ABOUTME: Deterministic and LLM-free; drops incidental years (side-clause asides, noun/label/range years).

/** A 4-digit year with its character span in the sentence. */
export interface YearOccurrence {
  value: number;
  start: number;
  end: number;
}

const YEAR_PATTERN = /\b(?:19\d\d|20\d\d)\b/g;

/** Finds every 4-digit year (1900–2099) with its character offsets, in appearance order. */
export function yearOccurrences(sentence: string): YearOccurrence[] {
  const out: YearOccurrence[] = [];
  YEAR_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = YEAR_PATTERN.exec(sentence)) !== null) {
    out.push({ value: Number(m[0]), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/**
 * Returns the subset of `pastYears` that `marker` grammatically governs — the
 * anchorable target years. Incidental years are dropped (design §2). A leading
 * sentence-initial dateline year is intentionally KEPT eligible (deferred to
 * suppress.ts Rule 1; design §2.2) so this stays a DET-3-only precision change.
 */
export function governedYears(sentence: string, marker: string, pastYears: number[]): number[] {
  const markerIndex = markerPosition(sentence, marker);
  const past = new Set(pastYears);
  const eligible = yearOccurrences(sentence).filter(
    occ => past.has(occ.value) && !isIncidental(sentence, markerIndex, occ)
  );
  return [...new Set(eligible.map(o => o.value))];
}

/**
 * Word-boundary character offset of `marker` in `sentence` (case-insensitive),
 * or -1. Word-boundary-matched to stay consistent with findExpectationMarkers —
 * a plain indexOf would match "will" inside "willing" and misplace the marker.
 */
function markerPosition(sentence: string, marker: string): number {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`\\b${escaped}\\b`, "i").exec(sentence);
  return m ? m.index : -1;
}

/** Composes the role discriminators. Built up across Phase 2; identity for now. */
function isIncidental(_sentence: string, _markerIndex: number, _occ: YearOccurrence): boolean {
  return false;
}
```

- [ ] **Step 4: Run governs tests to verify pass** — `pnpm vitest run test/detector/governs.test.ts` → PASS.

- [ ] **Step 5: Wire into `detect.ts` Step 3.** Add the import and replace the year-choice line. Change:
```ts
import { findExpectationMarkers, extractYears, MARKER_STRENGTH } from "./markers";
```
to also import the filter:
```ts
import { findExpectationMarkers, extractYears, MARKER_STRENGTH } from "./markers";
import { governedYears } from "./governs";
```
Replace the existing first comment line of Step 3 — `// Step 3: choose the strongest marker (first on ties) and the earliest past year.` — with `// Step 3: choose the strongest marker (first on ties) and the earliest GOVERNED past year.` Leave the existing `NB:` dateline-interaction comment block UNCHANGED — it stays accurate because governs.ts keeps the leading-dateline year eligible (§2.2), so the "In 2015, … in 2020" sentence still anchors to 2015 and Rule 1 still suppresses it. Then replace:
```ts
      const chosenYear = Math.min(...pastYears);
```
with:
```ts
      // governedYears drops incidental years (DET-3) but keeps a leading dateline
      // year for Rule 1 (governs.ts §2.2). No governed past year ⇒ the marker
      // targets nothing past ⇒ skip the sentence.
      const anchorable = governedYears(text, chosenMarker, pastYears);
      if (anchorable.length === 0) continue;
      const chosenYear = Math.min(...anchorable);
```

- [ ] **Step 6: Run the FULL suite — identity filter must not change ANY behavior.**
  Run: `pnpm test`. Expected: ALL green (precision ≥0.97 unchanged, recall floor 1.0 unchanged, det3-fp reporting baseline unchanged). Then `pnpm exec tsc --noEmit` (clean) and `pnpm lint` (clean).
  If any gate moved, the identity filter is not actually identity — STOP and fix before proceeding.

- [ ] **Step 7: Commit.**
```bash
git add src/detector/governs.ts test/detector/governs.test.ts src/detector/detect.ts
git commit -m "feat(detector): add governs.ts year-eligibility seam (identity, no behavior change) (Task 2.1)"
```

### Task 2.2 — Cross-clause aside discriminator (+ leading-dateline preservation) — THE CRUX

Implements the §2.1 cross-clause predicate and the §2.2 leading-dateline guard together (they interact: the dateline guard runs first and exempts the dateline year).

**Files:**
- Modify: `src/detector/governs.ts`
- Modify: `test/detector/governs.test.ts`
- Modify: `test/detector/det3-fp.test.ts` (turn the cross-clause baseline into a hard assertion)

```
BEFORE starting work: invoke superpowers:test-driven-development; re-read design §2.1 + §2.2.
```

- [ ] **Step 1: Write failing tests** (`governs.test.ts`) — both directions of the participle trap + the dateline guard + the flagship DET-3 case:
```ts
describe("governedYears — cross-clause aside (§2.1) + dateline guard (§2.2)", () => {
  it("DROPS an incidental year in a trailing participial aside", () => {
    // marker 'will'; 1910 is in ", built in 1910"
    expect(governedYears("It will replace the Portal Bridge, built in 1910", "will", [1910])).toEqual([]);
  });
  it("DROPS an incidental year in an embedded aside before the marker", () => {
    expect(governedYears("The bridge, completed in 1998, will be replaced", "will", [1998])).toEqual([]);
  });
  it("KEEPS a target year in the marker's own clause (no boundary between)", () => {
    // 'completed in 2024' is the marker's complement, NOT an aside
    expect(governedYears("It is expected to be completed in 2024", "is expected to", [2024])).toEqual([2024]);
  });
  it("KEEPS the mixed case's real target, dropping the incidental", () => {
    // "the IRDS, updated in 2019, is expected to ship in 2026" → drop 2019, keep 2026
    expect(
      governedYears("the IRDS, updated in 2019, is expected to ship in 2026", "is expected to", [2019, 2026])
    ).toEqual([2026]);
  });
  it("KEEPS a leading-dateline year eligible (deferred to suppress Rule 1, §2.2)", () => {
    // 2015 stays eligible so detect picks min(2015,2020)=2015 and Rule 1 suppresses as today
    expect(
      governedYears("In 2015, X is expected to deliver in 2020", "is expected to", [2015, 2020])
    ).toEqual([2015, 2020]);
  });
  it("locates the marker by word boundary, not substring (no 'will' inside 'willing')", () => {
    // The real marker 'will' governs 2024 (no boundary between); the earlier 'willing'
    // must not be mistaken for the marker and shift markerIndex into the wrong clause.
    expect(
      governedYears("Though willing to wait, it will be completed in 2024", "will", [2024])
    ).toEqual([2024]);
  });
});
```

- [ ] **Step 2: Run to verify the DROP/mixed tests fail** (KEEP tests already pass under identity) — `pnpm vitest run test/detector/governs.test.ts`.

- [ ] **Step 3a: Export the dateline frame from `suppress.ts` for reuse (no logic change).** The §2.2 guarantee ("a leading-dateline year stays eligible, deferred to Rule 1") only holds if `governs.ts` detects the leading dateline EXACTLY as Rule 1 does. So reuse Rule 1's regex rather than duplicating it. In `src/detector/suppress.ts`, add `export` to the existing const (and nothing else):
```ts
export const DATELINE_REGEX = new RegExp(
```
This is a deliberate, behavior-preserving deviation from the spec's "no change to suppress.ts" (the spec meant no *logic* change). Confirm `suppress.test.ts` and the precision gate stay green after the export. Record this one-word deviation in the plan's Deviations subsection.

- [ ] **Step 3b: Implement the dateline guard + cross-clause predicate** in `governs.ts`. First add the import at the TOP of the file (with the other top-level imports — NOT mid-file):
```ts
import { DATELINE_REGEX } from "./suppress";
```
Then replace the identity `isIncidental` with:
```ts
function isIncidental(sentence: string, markerIndex: number, occ: YearOccurrence): boolean {
  if (isLeadingDatelineYear(sentence, occ)) return false; // §2.2 — defer to suppress Rule 1
  return isCrossClauseAside(sentence, markerIndex, occ);
  // Further discriminators are OR-ed in by later tasks.
}

/**
 * True when `occ` IS the leading sentence-initial dateline year that suppress.ts
 * Rule 1 handles. Reuses Rule 1's DATELINE_REGEX so the two never diverge (§2.2).
 */
function isLeadingDatelineYear(sentence: string, occ: YearOccurrence): boolean {
  const m = DATELINE_REGEX.exec(sentence);
  if (!m) return false;
  // DATELINE_REGEX is anchored (^) and captures the frame year in group 1.
  const yearStart = m.index + m[0].lastIndexOf(m[1]);
  return occ.start === yearStart;
}

/**
 * Past-participle verbs that head an aside ("…, built in 1910"): the year belongs
 * to the aside, not the marker. SEED list only — extend it to exactly the
 * participles the Task 1.1 curated `cross-clause-aside` entries exhibit, one at a
 * time, re-running the precision gate after each addition (a broad speculative
 * list widens the precision surface for no curated benefit — design §6, YAGNI).
 */
const ASIDE_PARTICIPLE =
  /\b(?:built|constructed|opened|founded|established|completed)\s+(?:in\s+)?$/i;

/** Clause boundaries that separate an aside from the marker's clause (§2.1). */
const CLAUSE_BOUNDARY = /[,;—]|\b(?:which|who|that|where)\b/i;

function isCrossClauseAside(sentence: string, markerIndex: number, occ: YearOccurrence): boolean {
  if (markerIndex < 0) return false;
  const lo = Math.min(markerIndex, occ.start);
  const hi = Math.max(markerIndex, occ.start);
  if (!CLAUSE_BOUNDARY.test(sentence.slice(lo, hi))) return false; // §2.1: boundary between marker and year
  const localBefore = sentence.slice(Math.max(0, occ.start - 40), occ.start);
  return ASIDE_PARTICIPLE.test(localBefore); // the year is governed by an aside participle
}
```
NOTE (testing-pitfalls §9, generalize-not-overfit): the seed `ASIDE_PARTICIPLE` list is intentionally minimal. Before adding a verb, confirm a curated cross-clause entry needs it AND that it is NOT a common forward-target verb that could appear as a marker complement (e.g. `delivered`, `tested`, `deployed`, `completed` all appear in "expected to be `<verb>` in `<year>`"). The `CLAUSE_BOUNDARY` test is what makes `completed` safe in the seed list (a target "expected to be completed in 2024" has no boundary between marker and year) — preserve that invariant for any verb you add, and add a governs.test.ts KEEP case proving the verb's target form survives.

- [ ] **Step 4: Run governs tests** → PASS (all six). Re-run any that fail and tighten the predicate; do NOT loosen the KEEP assertions.

- [ ] **Step 5: Turn the cross-clause baseline into a hard gate** in `det3-fp.test.ts`: replace the cross-clause reporting line with `expect(flaggedFpEntries("cross-clause-aside")).toEqual([])`.

- [ ] **Step 6: Run the full gates.** `pnpm test` → precision ≥0.97 (no real positive dropped), recall floor green (report any give-back per the assertion-rigor note), det3-fp cross-clause entries now unflagged. `pnpm exec tsc --noEmit` clean; `pnpm lint` clean.

```
BEFORE marking complete: review tests vs docs/pitfalls/testing-pitfalls.md; confirm precision did NOT drop and any recall give-back is in the commit subject. If precision dropped, a real target was misclassified — tighten, don't weaken.
```

- [ ] **Step 7: Commit** (state precision/recall in the subject):
```bash
git add src/detector/governs.ts test/detector/governs.test.ts test/detector/det3-fp.test.ts
git commit -m "feat(detector): governs cross-clause discriminator — DET-3 asides dropped, precision held (Task 2.2)"
```

### Task 2.3 — Noun-modifier discriminator

Drops "the `<year>` `<noun>`" / "`<year>` `<Noun>`" label years (design §2 row 2). Same TDD shape as 2.2.

**Files:** Modify `src/detector/governs.ts`, `test/detector/governs.test.ts`, `test/detector/det3-fp.test.ts`.

- [ ] **Step 1: Failing tests** (`governs.test.ts`):
```ts
describe("governedYears — noun-modifier", () => {
  it("DROPS 'the <year> <noun>' label", () => {
    expect(governedYears("the 2021 update of the IRDS will ship", "will", [2021])).toEqual([]);
  });
  it("DROPS '<year> <Noun>' attributive label", () => {
    expect(governedYears("the 2024 Update is expected to add features", "is expected to", [2024])).toEqual([]);
  });
  it("KEEPS a target year after a forward preposition", () => {
    expect(governedYears("production is expected to begin in 2024", "is expected to", [2024])).toEqual([2024]);
  });
});
```

- [ ] **Step 2: Run → the DROP tests fail.**

- [ ] **Step 3: Implement.** Add `|| isNounModifier(sentence, occ)` to `isIncidental`, and:
```ts
function isNounModifier(sentence: string, occ: YearOccurrence): boolean {
  const after = sentence.slice(occ.end, occ.end + 24);
  if (!/^\s+[A-Za-z]/.test(after)) return false; // a word must follow the year
  const before = sentence.slice(Math.max(0, occ.start - 16), occ.start);
  const determinerBefore = /\b(?:the|a|an|its|their|this|that|each|every|same|our|his|her)\s+$/i.test(before);
  const capNounAfter = /^\s+[A-Z][a-z]+/.test(after); // "2024 Update"
  // A forward preposition immediately before the year means it's a target, not a label.
  const targetPrepBefore = /\b(?:in|by|for|until|through|during)\s+$/i.test(before);
  return !targetPrepBefore && (determinerBefore || capNounAfter);
}
```
NOTE (empirical): verify against the curated `noun-modifier` entries; the `targetPrepBefore` guard is what protects real targets like "in 2024 the program" — keep it.

- [ ] **Step 4: Run governs tests → PASS.**
- [ ] **Step 5: Hard-gate** the `noun-modifier` sub-shape in `det3-fp.test.ts` (assert unflagged).
- [ ] **Step 6: Full gates green** (precision ≥0.97, recall floor, det3-fp). tsc + lint clean.
- [ ] **Step 7: Commit** `feat(detector): governs noun-modifier discriminator (Task 2.3)`.

### Task 2.4 — Named-entity discriminator — CONDITIONAL

**Build this task ONLY if** Task 1.1's curated set has ≥2 `named-entity` entries (per its README distribution). If fewer, SKIP this task: mark its banner `⏸ DEFERRED pending ≥2 named-entity FPs in the curated set (Task 1.1 README shows <2)`, note it in Deviations, and proceed to Phase 3.

**Files:** Modify `src/detector/governs.ts`, `test/detector/governs.test.ts`, `test/detector/det3-fp.test.ts`.

- [ ] **Step 1: Failing tests** (use the ACTUAL curated entries; examples):
```ts
describe("governedYears — named-entity", () => {
  it("DROPS '<ProperNoun> <year>'", () => {
    expect(governedYears("announced at CES 2025 that it will ship", "will", [2025])).toEqual([]);
  });
  it("does NOT treat a month as a named entity", () => {
    // 'March 2013' is a date, not an entity — handled elsewhere; here it must NOT be dropped as named-entity
    expect(governedYears("delivery is expected to slip to March 2013", "is expected to", [2013])).toEqual([2013]);
  });
});
```

- [ ] **Step 2: Run → DROP test fails.**
- [ ] **Step 3: Implement.** Add `|| isNamedEntity(sentence, occ)`:
```ts
const MONTH_NAME =
  /^(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)$/i;

function isNamedEntity(sentence: string, occ: YearOccurrence): boolean {
  const m = /(\b[A-Z][A-Za-z0-9.&-]+)\s+$/.exec(sentence.slice(Math.max(0, occ.start - 24), occ.start));
  if (!m) return false;
  if (MONTH_NAME.test(m[1])) return false; // months are dates, not entities
  return true;
}
```
NOTE (empirical): if the curated set shows real targets being dropped (e.g. a forward target preceded by a proper noun), tighten by also requiring the proper noun to be a known acronym/product pattern; verify against the precision gate.

- [ ] **Step 4: governs tests PASS.** **Step 5: hard-gate** `named-entity` in det3-fp.test.ts. **Step 6: full gates green.** **Step 7: Commit** `feat(detector): governs named-entity discriminator (Task 2.4)`.

### Task 2.5 — Parenthetical / range discriminator — CONDITIONAL

**Build this task ONLY if** Task 1.1's curated set has ≥2 `parenthetical` or `range` entries combined. Else SKIP with the same `⏸ DEFERRED` banner + Deviations note.

**Files:** Modify `src/detector/governs.ts`, `test/detector/governs.test.ts`, `test/detector/det3-fp.test.ts`.

- [ ] **Step 1: Failing tests:**
```ts
describe("governedYears — parenthetical / range", () => {
  it("DROPS a parenthetical year", () => {
    expect(governedYears("the game (2003) will get a sequel", "will", [2003])).toEqual([]);
  });
  it("DROPS a year that is part of a range", () => {
    expect(governedYears("planned to run 2024–2030 across phases", "planned to", [2024, 2030])).toEqual([]);
  });
  it("KEEPS a plain target year", () => {
    expect(governedYears("planned to launch in 2024", "planned to", [2024])).toEqual([2024]);
  });
});
```

- [ ] **Step 2: Run → DROP tests fail.**
- [ ] **Step 3: Implement.** Add `|| isParentheticalOrRange(sentence, occ)`:
```ts
function isParentheticalOrRange(sentence: string, occ: YearOccurrence): boolean {
  const before = sentence.slice(0, occ.start);
  const opens = (before.match(/\(/g) || []).length;
  const closes = (before.match(/\)/g) || []).length;
  const inParens = opens > closes && /^[^(]*\)/.test(sentence.slice(occ.end));
  if (inParens) return true;
  const around = sentence.slice(Math.max(0, occ.start - 8), occ.end + 8);
  return /\d{4}\s*[–-]\s*\d{4}/.test(around) || /\bfrom\s+\d{4}\s+to\s+\d{4}\b/i.test(around);
}
```

- [ ] **Step 4: governs tests PASS.** **Step 5: hard-gate** the sub-shapes in det3-fp.test.ts. **Step 6: full gates green.** **Step 7: Commit** `feat(detector): governs parenthetical/range discriminator (Task 2.5)`.

```
After completing Phase 2:
Review the batch from multiple perspectives. MINIMUM 3 review rounds (persist each to
docs/plans/governs-review/round-N.md):
  Round 1 — precision preservation: independently confirm the precision gate value and
    that NO real positive was dropped; sample corpus flags before/after for any new FP class.
  Round 2 — recall integrity: confirm the recall floor holds; quantify any give-back and
    confirm it is reported, not silent; confirm no recall-set entry was lost beyond the stated give-back.
  Round 3 — discriminator soundness + honesty: re-read each predicate against the curated
    set; confirm the leading-dateline guard (§2.2) keeps DET-2 out of scope (the "In 2015 …
    in 2020" sentence is still suppressed, NOT re-flagged at 2020); confirm det3-fp gates assert
    "flags none" for every built sub-shape.
If round 3 still finds substantive issues, keep going until clean.
```

---

## Phase 3 — Document and finalize

**Execution Status:** ⬜ NOT STARTED

### Task 3.1 — Update methodology, pitfalls, spec status, and plan

**Files:**
- Modify: `docs/design/detector-precision-methodology.md` — DET-3 now addressed by the governs lever: record the curated-set before/after FP count + the precision effect in §3 (the DET-3 paragraph) and §4 (precision accounting); record any recall give-back in §7 (the recall section) only if the reachable recall actually changed
- Modify: `docs/pitfalls/implementation-pitfalls.md` (DET-3 — mark the cross-clause + noun-modifier shapes handled by `governs.ts`; state what residual remains, e.g. uncurated rare shapes)
- Modify: `docs/design/2026-06-05-marker-governs-year-design.md` (Status → shipped; note which conditional discriminators were built vs deferred)
- Modify: this plan (banners → shipped; Deviations/Discoveries)

- [ ] **Step 1:** Methodology: in §3 (DET-3 paragraph) and §4 (precision accounting), record that the marker-governs-year lever (cut 1) now drops incidental anchors; give the curated-set before/after (e.g. "N DET-3 FPs → 0 flagged") and the post-change precision number. If the reachable recall changed (a give-back), record that in §7. Do NOT duplicate the design doc — link to it (`docs/design/2026-06-05-marker-governs-year-design.md`) for the mechanism.
- [ ] **Step 2:** Pitfalls DET-3: add that cross-clause asides and noun-modifier years are now handled deterministically by `governs.ts` (year-eligibility filter), with the residual (any rare sub-shape left uncurated, and the deferred DET-2 recovery) named and pointed at the design doc §5.
- [ ] **Step 3:** Flip the design spec Status to shipped + list built/deferred discriminators. Flip the plan banners to ✅ with SHAs; fill Deviations (any skipped conditional task) and Discoveries.
- [ ] **Step 4:** Run `pnpm test` (green), `pnpm exec tsc --noEmit`, `pnpm lint` — docs-only, but confirm nothing broke.
- [ ] **Step 5: Commit** `docs(detector): record marker-governs-year cut 1 result (DET-3 closed)`.

**After Phase 3:** open a PR → `dev` with a `## Merge classification` of **Review — domain** (changes the precision-critical year-anchoring core). Include the curated-set before/after, the precision/recall numbers, and any recall give-back. Then offer to watch the PR.

---

## Self-review notes (plan author)

- **Spec coverage:** §2 mechanism → Task 2.1 (seam) + 2.2–2.5 (discriminators); §2.1 crux → Task 2.2 locked tests; §2.2 dateline guard → Task 2.2 + Round 3; §3 curated set → Task 1.1; §3 gates → every Phase 2 task; §4 guardrails → assertion-rigor block; §5 out-of-scope → 2.2 dateline guard keeps DET-2 out.
- **Cross-task conflict:** all `governs.ts` edits are sequential (Phase 2 tasks 2.1→2.5), never parallel.
- **Type consistency:** `governedYears(sentence, marker, pastYears)`, `yearOccurrences(sentence)`, `YearOccurrence{value,start,end}`, and the private `isIncidental`/`is*` predicates are named identically everywhere they appear.
- **Empirical honesty:** Tasks 2.4/2.5 are explicitly conditional on Task 1.1's distribution (YAGNI); discriminator regexes are flagged as starting points to refine against the curated set, never speculatively widened.
