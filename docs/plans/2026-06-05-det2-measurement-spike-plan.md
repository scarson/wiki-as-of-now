<!-- ABOUTME: Implementation plan for the DET-2 measurement spike — curate the dateline-suppressed candidate set, score the deterministic guard, write the go/no-go report. -->
<!-- ABOUTME: Measurement only (deterministic, LLM-free, no detector change). Decides whether to build cut 2. -->

# DET-2 measurement spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure the DET-2 (dateline-suppressed) recall prize and the deterministic reporting-verb guard's precision, and produce a go/no-go recommendation on building cut 2 — without changing the detector.

**Architecture:** A measurement spike. Enumerate (via a throwaway script) the currently-suppressed "leading dateline + later governed target" sentences across the 136 fixtures, hand-label each (`genuine-target` / `narration` / `other`), record whether the deterministic reporting-verb guard fires, and commit a labeled gold set (`test/gold/det2-candidates.json`) + a structural test. Then compute the guard's confusion matrix and write a go/no-go report into the methodology doc. No change to `detect.ts` / `governs.ts` / `suppress.ts` or any gold positive/negative.

**Tech Stack:** TypeScript (Node 24 per `.nvmrc`), Vitest, `wtf_wikipedia` (parse only). pnpm@11.5.1. Same toolchain as cut 1.

**Design spec (authoritative):** `docs/design/2026-06-05-det2-measurement-spike-design.md` — read it before any task; §3 (candidate definition), §4 (labeling rubric + guard), §6 (pre-registered decision criteria) are load-bearing.

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

**Overall:** ✅ Built — spike complete, **recommendation: NO-GO on cut 2** (recall prize 2/136 fixtures; deterministic guard precision 0.125). PR [#8](https://github.com/scarson/wiki-as-of-now/pull/8) → `dev`. See methodology §9.

| Phase | Status | Ship SHA(s) | Notes |
|---|---|---|---|
| 1 — Measure DET-2 + decide | ✅ Built (`84441fd`…`ad1c32e`) | `84441fd`…`ad1c32e` | 47 candidates: 2 genuine / 41 narration / 4 other; guard 2 TP / 14 FP (precision 0.125). **NO-GO**. PR [#8](https://github.com/scarson/wiki-as-of-now/pull/8) → `dev`; methodology §9 |

---

## Source documents (read before executing)

- **`docs/design/2026-06-05-det2-measurement-spike-design.md`** — the spec. §3 candidate definition, §4 labeling rubric + the reporting-verb guard, §6 decision criteria.
- **`src/detector/detect.ts`** — `detectStaleClaims` + Step 3's marker/year selection (highest-strength marker, first on ties; `chosenYear = min(governedYears(...))`). The scan MUST mirror this marker choice so `governedYears` is called with the same `chosenMarker` the detector would use.
- **`src/detector/markers.ts`** — `findExpectationMarkers`, `extractYears`, `MARKER_STRENGTH`.
- **`src/detector/governs.ts`** — `governedYears(sentence, marker, pastYears)` (cut 1; keeps a leading-dateline year eligible, drops incidental years).
- **`src/detector/suppress.ts`** — `DATELINE_REGEX` (exported; group 1 is the frame year) and `REPORTING_VERB` (the guard's verb list).
- **`test/detector/det3-fp.test.ts`** + **`test/gold/det3-fp-set.json`** — the cut-1 analog to MIRROR for the JSON shape, the per-fixture parse cache, and the structural test (incl. the substring-occurs check and the min-count guard).
- **`docs/pitfalls/testing-pitfalls.md`** §1 (pristine output) + §9 (gold honesty) and **`docs/pitfalls/implementation-pitfalls.md`** DET-1/DET-2.

## Execution strategy (recommendation)

**Subagent-driven** (`superpowers:subagent-driven-development`): Task 1.1 is judgment-heavy hand-labeling (genuine-target vs narration) that benefits from a fresh subagent + an independent honesty review — the same shape as cut 1's Task 1.1, which this mirrors. Task 1.2 (scoring + report) is small and sequential after 1.1. Two tasks, one shared gold file produced then consumed — not a parallel-agents candidate.

---

## Phase 1 — Measure the DET-2 opportunity and decide

**Execution Status:** ✅ BUILT 2026-06-05 — Task 1.1 (`84441fd`) curated 47 candidates (reviewed HONEST); Task 1.2 wrote the go/no-go. **Recommendation: NO-GO on cut 2** (prize 2, deterministic guard precision 0.125); LLM-layer moot (prize too small to justify a contract amendment). Redirect: inline-year-absent recall class or cut-1 named-entity residual. Full result: methodology §9.

### Task 1.1 — Curate `test/gold/det2-candidates.json` + structural test

**Files:** Create `test/gold/det2-candidates.json`, `test/detector/det2-candidates.test.ts`.

```
BEFORE starting work:
1. Invoke superpowers:test-driven-development
2. Read docs/pitfalls/testing-pitfalls.md (§1 pristine, §9 gold honesty) and the spec §3/§4.
```

- [ ] **Step 1: Scan the corpus (throwaway script, deleted before commit).** Write a script run via `npx tsx <file>` (NOT bare node — the project's ESM imports are extensionless) that, for every `test/fixtures/*.wikitext`, parses (`parseArticle({title: name, revisionId: 1, wikitext})`) and finds **DET-2 candidates** — sentences where ALL hold (mirror `detect.ts` Step 3 exactly for the marker/year choice):
  ```ts
  const markers = findExpectationMarkers(text);
  if (markers.length === 0) continue;
  // chosenMarker: highest MARKER_STRENGTH, first on ties (mirror detect.ts Step 3)
  let chosenMarker = markers[0];
  for (let i = 1; i < markers.length; i++)
    if ((MARKER_STRENGTH[markers[i]] ?? 0) > (MARKER_STRENGTH[chosenMarker] ?? 0)) chosenMarker = markers[i];
  const dateline = DATELINE_REGEX.exec(text);
  if (!dateline) continue;
  const frameYear = Number(dateline[1]);
  const pastGoverned = governedYears(text, chosenMarker, extractYears(text).filter(y => y < 2026));
  if (pastGoverned.length === 0) continue;
  const anchor = Math.min(...pastGoverned);
  if (anchor !== frameYear) continue;                       // anchored to the dateline year today
  const laterTargets = pastGoverned.filter(y => y > frameYear);
  if (laterTargets.length === 0) continue;                  // a later governed target exists
  // and it must be CURRENTLY SUPPRESSED (not flagged today):
  // build a per-fixture Set of detectStaleClaims(parsed, 2026) sentenceTexts; skip if text is in it
  ```
  Print each candidate's `fixture`, `sentenceText`, `frameYear`, `laterTargets`, and the `chosenMarker`. Delete the script before committing (verify `git status`).

- [ ] **Step 2: Hand-label each candidate (spec §4).** Read each sentence and assign `label` ∈ {`genuine-target`, `narration`, `other`} per the rubric: `genuine-target` = a live forward expectation (article's own voice) whose target year (a `laterTargets` value) is now past, with the dateline as context; `narration` = the dateline dates a past announcement/decision/selection/award event; `other` = resolved-nearby / target actually future / dateline year == target / too ambiguous (record the reason). Also record `hasReportingVerb`: does a `REPORTING_VERB` (from `suppress.ts`) occur in the span from the end of the `DATELINE_REGEX` match to the start of `chosenMarker`? Entry shape (mirror det3-fp-set.json):
  ```json
  {
    "fixture": "<actual fixture>.wikitext",
    "sentenceSubstring": "<verbatim substring unique to the flagged sentence>",
    "datelineYear": 2015,
    "targetYear": 2020,
    "label": "genuine-target",
    "hasReportingVerb": false,
    "note": "<why this label; for 'other', the reason>"
  }
  ```
  (If a candidate has multiple `laterTargets`, record the one that is the marker's actual forward target as `targetYear`; note the others.) HONESTY (testing-pitfalls §9): label from the sentence, never to inflate the prize.

- [ ] **Step 3: Handle the empty/tiny case.** If the scan finds **0** candidates, write `[]` to the JSON and a one-line note; the structural test's min-count guard becomes `>= 0` and Task 1.2's report records "DET-2 is moot for this corpus." Do NOT fabricate candidates.

- [ ] **Step 4: Write the structural test** `det2-candidates.test.ts` (mirror `det3-fp.test.ts`, per-fixture parse cache):
  - every entry has all fields; `label` ∈ the 3 allowed values; `hasReportingVerb` is boolean; `datelineYear`/`targetYear` are numbers with `targetYear > datelineYear`; `sentenceSubstring` non-empty AND occurs in the named fixture's parsed sentence text.
  - **currently-suppressed invariant:** for every entry, the live detector (`detectStaleClaims(parseArticle(...), 2026)`) does NOT flag the sentence (no candidate's `sentenceText` includes the entry's `sentenceSubstring`). This is what makes them DET-2 *candidates* (suppressed today); it will be flipped to "now flagged" only if cut 2 ships.
  - **min-count composition guard:** `expect(entries.length).toBeGreaterThanOrEqual(<actual count>)` (hardcode the real number — `>= 0` if empty) so the set can't be silently emptied (testing-pitfalls §9).

```
BEFORE marking this task complete:
1. Review the test against docs/pitfalls/testing-pitfalls.md (pristine output; structural test bites — prove it by temporarily corrupting an entry, then restore).
2. Confirm the scan script is deleted and NOT staged (git status shows only the 2 intended files).
3. Run `pnpm test` (green + pristine), `pnpm exec tsc --noEmit` (clean), `pnpm lint` (clean).
```

- [ ] **Step 5: Commit + push.**
```bash
git add test/gold/det2-candidates.json test/detector/det2-candidates.test.ts
git commit -m "test(detector): curate DET-2 dateline-suppressed candidate set (Task 1.1)"
git push -u origin claude/wikiasofnow-detector-phase2-ZP1uQ
```
(Push — this is hand-labeled work; an ephemeral-container resume loses unpushed commits. End the commit message with `https://claude.ai/code/session_01RYwwKwvgJPa1E6jvHXs17H`.)

### Task 1.2 — Score the guard + write the go/no-go report

**Files:** Modify `docs/design/detector-precision-methodology.md` (append a "## DET-2 measurement (spike)" subsection). No production code. (TDD does not apply — docs.)

- [ ] **Step 1: Compute the confusion matrix** from `det2-candidates.json` (a throwaway `npx tsx` tally, deleted; or by hand if the set is tiny): over the `genuine-target` + `narration` entries only (exclude `other`), using the guard rule "re-anchor iff NOT `hasReportingVerb`":
  - TP = `genuine-target` & `!hasReportingVerb`; FN = `genuine-target` & `hasReportingVerb`;
  - FP = `narration` & `!hasReportingVerb`; TN = `narration` & `hasReportingVerb`.
  - Guard precision = TP/(TP+FP); guard recall = TP/(TP+FN).

- [ ] **Step 2: Write the report subsection** in the methodology doc with: the candidate count; the label breakdown (genuine-target / narration / other); the confusion matrix + guard precision/recall; 2-3 representative verbatim examples of each label; any `REPORTING_VERB` the `narration` set showed the guard missing; and **the go/no-go recommendation mapped explicitly to the spec §6 criteria** (no/tiny prize → stop; meaningful prize + clean guard → build deterministic cut 2; meaningful prize + stubborn gap → escalate the LLM-layer compliance question). This is a reasoning artifact — capture the labeling judgment calls and the tense-signal observation (spec §8 open uncertainty) if it looked predictive. Link to `test/gold/det2-candidates.json` and the spike spec.

- [ ] **Step 3: Update the plan** banner → shipped; record the recommendation in the Execution Status. If the recommendation is "build cut 2", note it as the unblocker for a future cut-2 plan; if "stop" or "escalate", say so with the reason.

- [ ] **Step 4:** Run `pnpm test` (green), `pnpm exec tsc --noEmit`, `pnpm lint` (docs-only, but confirm nothing broke).

- [ ] **Step 5: Commit + push** `docs(detector): DET-2 measurement spike result + go/no-go (Task 1.2)` (end with the session URL; `git push`).

```
After completing Phase 1 (both tasks):
Review the batch. MINIMUM 3 review rounds (persist each to docs/plans/det2-review/round-N.md):
  Round 1 — candidate-set honesty: independently re-verify a sample of the labels (genuine-target vs narration), the currently-suppressed invariant, and that the scan didn't miss obvious candidates or include non-suppressed ones.
  Round 2 — guard scoring correctness: recompute the confusion matrix from the labels; confirm precision/recall and the report's numbers match the JSON.
  Round 3 — decision soundness + compliance: does the go/no-go follow from the numbers per §6? Is the LLM-layer correctly framed as a deferred compliance-amendment decision (not silently adopted)? Detection unchanged (no edit to detect/governs/suppress)?
If round 3 still finds issues, keep going until clean.
```

---

## Self-review notes (plan author)

- **Spec coverage:** §3 candidate definition → Task 1.1 Step 1 (the exact predicate); §4 labeling + guard → Task 1.1 Step 2 + Task 1.2 Step 1; §5 deliverables → the JSON + test (1.1) + report (1.2); §6 decision criteria → Task 1.2 Step 2 (explicit mapping) + the empty-case in Task 1.1 Step 3.
- **No detector change:** the plan touches only `test/gold/`, `test/detector/`, and a methodology doc subsection; `REPORTING_VERB`/`DATELINE_REGEX`/`governedYears` are READ, never modified. Stated in the architecture header and the Task 1.2 file list.
- **Cross-task:** 1.1 produces the JSON; 1.2 reads it. Sequential, different files. No conflict.
- **Why this matters (living-doc discipline):** see `/writing-plans-enhanced` Step 5.
