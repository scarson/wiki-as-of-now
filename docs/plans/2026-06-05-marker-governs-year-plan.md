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

**Overall:** Not started.

| Phase | Status | Ship SHA(s) | Notes |
|---|---|---|---|
| 1 — Curate DET-3 FP set | ⬜ Not started | — | measurement-first; produces the gate's denominator |
| 2 — Build governs filter (gated) | ⬜ Not started | — | discriminator-by-discriminator; each gated on precision+recall |
| 3 — Document + finalize | ⬜ Not started | — | methodology/pitfalls/spec/plan; report any recall give-back |

---

## Source documents (read before executing)

- **`docs/design/2026-06-05-marker-governs-year-design.md`** — the approved design. §2.1 participle crux, §2.2 leading-dateline preservation, §3 test strategy, §4 guardrails.
- **`src/detector/detect.ts`** — the orchestrator; Step 3 line `const chosenYear = Math.min(...pastYears);` is the single change point.
- **`src/detector/markers.ts`** — `extractYears` (values) and `MARKER_STRENGTH`. `governs.ts` needs year *positions*, so it adds its own `yearOccurrences` (do NOT change `extractYears`).
- **`src/detector/suppress.ts`** — `DATELINE_REGEX` (Rule 1) is the behavior `governs.ts` §2.2 defers to; read it so the leading-dateline predicate stays consistent.
- **`test/detector/precision.test.ts`** + **`test/gold/gold-set.json`** — the 73-entry precision gate (≥0.9, currently ~0.97). MUST stay green.
- **`test/detector/recall.test.ts`** + **`test/gold/recall-set.json`** — the recall harness + 0.90 reachable-recall floor. MUST stay green.
- **`docs/pitfalls/implementation-pitfalls.md`** DET-2/DET-3 and **`docs/pitfalls/testing-pitfalls.md`** — read before coding/testing.

---

## Phase 1 — Curate the DET-3 false-positive set (measurement first)

**Execution Status:** ⬜ NOT STARTED

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
  For every confirmed incidental-anchor FP, record an entry. Sub-shape ∈ {`cross-clause-aside`, `noun-modifier`, `named-entity`, `parenthetical`, `range`}. Entry shape:
```json
{
  "fixture": "portal_bridge.wikitext",
  "sentenceSubstring": "will replace the Portal Bridge, built in 1910",
  "anchorYear": 1910,
  "subShape": "cross-clause-aside",
  "stale": false,
  "note": "1910 is the bridge's construction date in a participial aside; the marker 'will' governs no year"
}
```
  Honesty rules (testing-pitfalls §9): label from the sentence, not to make a number look good; a sentence is a DET-3 FP only if the anchor year is genuinely not the marker's target. If a sentence has BOTH an incidental earliest year AND a real later target (the "mixed case"), it is NOT an FP for this set (the detector *should* flag it, just at the target) — note these separately in the README but do not add them as `stale:false`.

- [ ] **Step 3: Write the README** (`det3-fp-set-README.md`): how the set was built (scan + hand-verify), the sub-shape counts (the distribution that drives Phase 2 scope), the mixed-case observations, and the honesty protocol followed. State the count per sub-shape explicitly — Phase 2 builds a discriminator only for sub-shapes with ≥2 instances (YAGNI); record which sub-shapes clear that bar.

- [ ] **Step 4: Write the reporting test** `det3-fp.test.ts`:
  - A **structural test**: every entry has all fields; `stale === false`; `subShape` is one of the allowed values; `anchorYear` is a number; `sentenceSubstring` is non-empty AND occurs in the named fixture's parsed sentence text (mirror `recall.test.ts`'s substring check).
  - A **reporting test** (passes unconditionally for now): runs the current detector per fixture and logs, in a SINGLE labeled `console.log`, how many FP-set entries are currently flagged (baseline — expected: all of them) and the per-sub-shape breakdown. Phase 2 turns these into hard assertions.

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

**Execution Status:** ⬜ NOT STARTED

All Phase 2 tasks modify `src/detector/governs.ts` (and its test), so they are **strictly sequential** — never parallelize them (they edit the same file). Each task is precision-gated and recall-gated.

```
PITFALL WARNING for every Phase 2 task (docs/pitfalls/implementation-pitfalls.md DET-2/DET-3):
- The lever may only REMOVE anchorable years. If a change makes the detector flag a
  sentence it did NOT flag before, that is a bug — investigate, do not accept it.
- A discriminator that drops a REAL target year (precision-gate or recall-floor red)
  is over-aggressive: tighten the predicate, do NOT weaken the gate. See the assertion-rigor note below.
- The cross-clause predicate (Task 2.2) MUST NOT fire on "expected to be completed in 2024"
  (no clause boundary between marker and year) — design §2.1. Both directions are locked tests.
```

```
ASSERTION RIGOR (every Phase 2 task): the precision gate (≥0.9), the recall floor
(≥0.90), and the DET-3 FP assertions are the contract. If a gate goes red, the fix
is a more precise discriminator, NEVER a weakened assertion or a deleted gold entry.
A tiny recall give-back (down to the 0.90 floor) is permitted ONLY if it buys a large
precision gain AND is reported in the commit subject (e.g. "recall 1.0→0.909, gives
back <fixture> <shape>") — never silent. If you cannot keep precision ≥0.97 without
dropping a real target, STOP and raise to the dispatching agent.
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
  const markerIndex = sentence.toLowerCase().indexOf(marker.toLowerCase());
  const past = new Set(pastYears);
  const eligible = yearOccurrences(sentence).filter(
    occ => past.has(occ.value) && !isIncidental(sentence, markerIndex, occ)
  );
  return [...new Set(eligible.map(o => o.value))];
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
Replace:
```ts
      const chosenYear = Math.min(...pastYears);
```
with:
```ts
      // Anchor to a year the marker actually governs, not the earliest by position.
      // Drops incidental years (DET-3); keeps a leading dateline year for Rule 1
      // (governs.ts §2.2). No governed year ⇒ the marker targets nothing past ⇒ skip.
      const anchorable = governedYears(text, chosenMarker, pastYears);
      if (anchorable.length === 0) continue;
      const chosenYear = Math.min(...anchorable);
```
(Update the Step-3 doc comment above it if needed; keep the existing dateline-interaction comment — it is still accurate.)

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
});
```

- [ ] **Step 2: Run to verify the DROP/mixed tests fail** (KEEP tests already pass under identity) — `pnpm vitest run test/detector/governs.test.ts`.

- [ ] **Step 3: Implement the dateline guard + cross-clause predicate** in `governs.ts`. Replace the identity `isIncidental` with:
```ts
function isIncidental(sentence: string, markerIndex: number, occ: YearOccurrence): boolean {
  if (isLeadingDatelineYear(sentence, occ)) return false; // §2.2 — defer to suppress Rule 1
  return isCrossClauseAside(sentence, markerIndex, occ);
  // Further discriminators are OR-ed in by later tasks.
}

/** A sentence-initial temporal frame ending in the captured dateline year (mirrors suppress.ts Rule 1 intent). */
const LEADING_DATELINE = /^(?:In|By|During|As of|On)\s+(?:\S+\s+){0,3}?(19\d\d|20\d\d)\b/i;

function isLeadingDatelineYear(sentence: string, occ: YearOccurrence): boolean {
  const m = LEADING_DATELINE.exec(sentence);
  if (!m) return false;
  const yearStart = m[0].lastIndexOf(m[1]); // m.index is 0 (anchored)
  return occ.start === yearStart;
}

/** Past-participle verbs that head an aside ("…, built in 1910"). Year is the aside's, not the marker's. */
const ASIDE_PARTICIPLE =
  /\b(?:built|opened|founded|established|completed|launched|commissioned|introduced|acquired|formed|created|designed|developed|constructed|finished|delivered|retired|decommissioned|enacted|passed|adopted|published|released|signed|won|awarded|unveiled|installed|deployed|tested|approved|manufactured|produced)\s+(?:in\s+)?$/i;

/** Clause boundaries that separate an aside from the marker's clause. */
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
NOTE (empirical refinement): the `ASIDE_PARTICIPLE` verb list and the 40-char window are starting values. Extend the list ONLY for participles the Task 1.1 curated cross-clause entries actually exhibit; do not speculatively add verbs (each added verb widens the precision surface). Verify every change against the precision gate.

- [ ] **Step 4: Run governs tests** → PASS (all six). Re-run any that fail and tighten the predicate; do NOT loosen the KEEP assertions.

- [ ] **Step 5: Turn the cross-clause baseline into a hard gate** in `det3-fp.test.ts`: assert the detector flags NONE of the `subShape === "cross-clause-aside"` entries. (Replace that sub-shape's reporting line with an assertion.)

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
- Modify: `docs/design/detector-precision-methodology.md` (§3 / §7 — DET-3 now addressed by the governs lever; record the before/after FP count from the curated set and any recall give-back)
- Modify: `docs/pitfalls/implementation-pitfalls.md` (DET-3 — mark the cross-clause + noun-modifier shapes handled by `governs.ts`; state what residual remains, e.g. uncurated rare shapes)
- Modify: `docs/design/2026-06-05-marker-governs-year-design.md` (Status → shipped; note which conditional discriminators were built vs deferred)
- Modify: this plan (banners → shipped; Deviations/Discoveries)

- [ ] **Step 1:** Methodology: in §3 (DET-3 paragraph) and the §7 recall accounting, record that the marker-governs-year lever (cut 1) now drops incidental anchors; give the curated-set before/after (e.g. "N DET-3 FPs → 0 flagged") and the post-change precision/recall numbers. Do NOT duplicate the design doc — link to it (`docs/design/2026-06-05-marker-governs-year-design.md`) for the mechanism.
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
