<!-- ABOUTME: Design spec for the DET-2 measurement spike — quantify the dateline-suppressed recall prize and the deterministic re-anchoring precision cost before committing to cut 2. -->
<!-- ABOUTME: Measurement only (deterministic, LLM-free); produces a labeled gold set + a go/no-go report. No detector change. -->

# DET-2 measurement spike — is dateline recall recovery worth it?

**Status:** approved design, 2026-06-05. **Scope:** a measurement-only spike. It does NOT change the detector — it quantifies the opportunity and risk of the deferred **cut 2 (DET-2 recall recovery)** so we can make an evidence-based go/no-go decision. Companion to `docs/design/2026-06-05-marker-governs-year-design.md` (cut 1) §5 and `docs/design/detector-precision-methodology.md` §3 (the DET-2 residual).

**Goal (one sentence):** measure how many genuine stale claims the detector currently loses to leading-dateline suppression (the recall prize) and how precisely a purely deterministic re-anchoring with a reporting-verb guard could recover them (the precision cost) — and decide, against pre-registered criteria, whether to build cut 2.

## 1. Background — the DET-2 residual and why we measure first

The detector anchors each candidate to the earliest past year. For "In 2015, X is expected to deliver in 2020", the earliest year is the dateline (2015), `suppress.ts` Rule 1 fires (leading frame year == anchor year), and the sentence is suppressed — losing the real 2020 forward target. Cut 1's `governs.ts` deliberately KEEPS that leading-dateline year eligible (§2.2) so the sentence stays suppressed; **cut 2** would re-anchor to the governed target (2020) instead, recovering the claim.

Two reasons this needs measuring before building (cut-1 design §5):

- **It is precision-RISKY by nature.** Unlike cut 1 (which only *removed* incidental years and could only help precision), re-anchoring *re-flags* currently-suppressed sentences. The methodology (§3) warns this "re-flags a large set of genuinely-ambiguous historical-announcement sentences and *lowers* precision." "In 2015, X **is expected to** deliver in 2020" (live claim — recover) and "In 2015, the Navy **announced** it would deliver in 2020" (historical narration — leave suppressed) look nearly identical.
- **We are blind to the payoff.** The 12-fixture recall set is already at reachable recall 1.0 and contains no dateline-suppressed-target examples, so the current gate cannot measure either the recall prize or the precision cost.

**On the LLM-reviewer idea (deferred behind the data).** An LLM that judged which re-flagged sentences are "really stale" would be *detection*, which the compliance contract requires to stay deterministic and LLM-free (the detection-is-deterministic guardrail), and would sit outside the LLM's boxed three research jobs (the bounded-LLM-role guardrail) — it would also reintroduce the opacity the contract is built to avoid. So cut 2's detection stays deterministic. This spike measures the **deterministic** ceiling first; only if a stubborn precision gap remains does an LLM layer become a live question, and that is a compliance-amendment decision (explicit human sign-off + change-log), not a casual feature.

## 2. What the spike measures

For the set of sentences DET-2 re-anchoring would change, two numbers:

1. **Recall prize** — count of **genuine-target** sentences (a live forward expectation whose target year is now past, currently lost to dateline-suppression).
2. **Deterministic-guard precision cost** — if we re-anchor unless the dateline clause contains a reporting/announcement verb, how many **narration** sentences slip through as false positives (narration with no reporting verb), and how many genuine targets the guard wrongly keeps suppressed (genuine-target that happens to contain a reporting verb).

## 3. Mechanism — detector-output-driven scan (approach A)

Enumerate exactly the sentences cut 2 would flip, deterministically. A sentence is a **DET-2 candidate** when all hold (computed with the *current, post-cut-1* detector primitives — `parseArticle`, `findExpectationMarkers`, `extractYears`, `governedYears`, `suppress.ts` `DATELINE_REGEX`):

- it contains a forward **marker** (`findExpectationMarkers` non-empty), AND
- it opens with a **leading dateline** (`DATELINE_REGEX` matches) whose captured frame year is the current anchor (the earliest governed past year), AND
- it contains a **later governed past year** — a year `> datelineYear`, `< asOfYear` (2026), that `governedYears` does NOT drop (a real target, not an incidental DET-3 year), AND
- it is **currently suppressed** (the full detector does not flag it today — confirm via `detectStaleClaims`).

This is precisely the set whose behavior cut 2 would change (re-anchor from `datelineYear` to the later governed target). The scan is run by a throwaway script (deleted) over all 136 `test/fixtures/*.wikitext`.

(Approach B — an exhaustive end-to-end recall read of N fixtures for a true absolute-recall denominator — was considered and rejected as more work than the go/no-go decision needs; A enumerates the decision-relevant set precisely. See §6.)

## 4. Labeling rubric

Each candidate is hand-labeled (reading the sentence, before scoring the guard) into one of:

- **`genuine-target`** — the sentence asserts, in the article's own voice, a forward expectation whose target year is now past, where the leading dateline is temporal *context* rather than the date of an announcement. Test: would an editor see a stale claim worth fixing? E.g. "In 2015, the radar **is expected to** achieve full operational capability **by 2020**." (FOC-by-2020 now past, reads live).
- **`narration`** — the leading dateline dates a past **announcement/decision/selection/award/report** event; the forward statement is what was said/decided *then*, not a live claim now. E.g. "In 2015, the Navy **selected** Lockheed to deliver the first ship **in 2020**." / "In 2015, Boeing **announced** it **would deliver** in 2020."
- **`other`** — resolved nearby (the article states the outcome / cancellation), OR the later year is actually future (≥ asOfYear), OR dateline year == target year (no real DET-2), OR genuinely too ambiguous to call. Recorded with the reason; excluded from the prize/cost denominators but kept for honesty.

**The deterministic guard under test.** Re-anchor to the later governed target **unless** a reporting/announcement verb appears in the **dateline clause** — defined computably as the span from the end of the `DATELINE_REGEX` frame match to the start of the marker (`findExpectationMarkers` position). Reuse `suppress.ts`'s existing `REPORTING_VERB` list (announced/reported/stated/said/selected/awarded/ordered/signed/unveiled/…); extend it only if the labeled `narration` set shows a recurring verb it misses (record any such verb). For each candidate, record `hasReportingVerb` (does a `REPORTING_VERB` occur in that span?). Then the confusion matrix against the labels:

| | guard says re-anchor (no reporting verb) | guard says keep suppressed (reporting verb) |
|---|---|---|
| **genuine-target** | TP (recovered correctly) | FN (recall lost by the guard) |
| **narration** | **FP (precision cost)** | TN (correctly kept suppressed) |

Guard **precision** = TP / (TP + FP); guard **recall** = TP / (TP + FN). The **FP count is the headline precision cost** — the narration sentences a deterministic cut 2 would wrongly re-flag.

## 5. Output (committed — the apparatus cut 2 needs)

- **`test/gold/det2-candidates.json`** — every DET-2 candidate: `{fixture, sentenceSubstring, datelineYear, targetYear, label, hasReportingVerb, note}`. A structural test (`test/detector/det2-candidates.test.ts`, mirroring the cut-1 det3-fp test) validates the set is well-formed, each `sentenceSubstring` occurs in its fixture, each candidate is currently suppressed by the live detector, and a min-count guard.
- **A report** appended to `docs/design/detector-precision-methodology.md` (a new "DET-2 measurement" subsection) with: candidate count, the label breakdown (genuine-target / narration / other), the guard confusion matrix + precision/recall, representative examples of each label, and **the go/no-go recommendation against the §6 criteria**. This is a methodology/reasoning artifact — capture the labeling judgment calls and any narration the guard missed.

## 6. Pre-registered decision criteria (so the spike is decisive)

Decide BEFORE seeing the numbers what they must show. The prize gate is `genuine-target` count; the build-vs-escalate gate is the deterministic guard's precision (its FP count — narration the guard would wrongly re-flag).

- **No / tiny prize** — the scan finds **0** DET-2 candidates (DET-2 is moot for this corpus), OR fewer than **~5** `genuine-target` candidates → the recall upside is too small to justify touching the precision-critical anchor; **stop**, record the finding, redirect effort (e.g. the inline-year-absent recall class, or tightening cut 1's named-entity residual).
- **Meaningful prize (≥ ~5 genuine-targets) + clean guard** — the guard's FP count is low enough that re-flagging the genuine targets (and the few narration FPs the guard misses) keeps the gold precision gate ≥ 0.9 → **proceed to build deterministic cut 2**; the candidate set becomes its gate. No LLM.
- **Meaningful prize + stubborn precision gap** — the guard leaves many `narration` FPs (narration sentences with no reporting verb in the dateline clause), so a deterministic re-anchoring would meaningfully dent precision → the deterministic ceiling is too low; **escalate the LLM-layer question** as an explicit compliance-amendment decision, now backed by real precision numbers, before any further build.

The `~5` threshold is a soft judgment line (is the prize worth touching the precision-critical core at all?), not a hard cutoff — report the actual count and reason explicitly if it lands near the boundary.

## 7. Scope / guardrails

- **Measurement only.** No change to `detect.ts`, `governs.ts`, `suppress.ts`, or any gold positive/negative. The `REPORTING_VERB` list is *read* for guard evaluation, not modified in production code.
- **Deterministic, LLM-free, compliance-neutral** — no model, no network, no detection change. The spike itself touches none of the guardrails.
- **The candidate set is hand-labeled honestly** (testing-pitfalls gold-honesty rules): label from the sentence, never to inflate the prize; a candidate is `genuine-target` only if it genuinely reads as a live, now-past forward claim.

## 8. Reasoning — considered and ruled out

- **Approach B (exhaustive recall read)** — gives a true absolute-recall denominator but costs far more reading for no extra decision value; the go/no-go turns on the size of the *changed* set and the guard's precision, both of which A measures directly. If cut 2 proceeds and we later want an honest absolute-recall number, that is a follow-up.
- **Building cut 2 first, measuring via its own gate** — rejected: it commits effort to a precision-risky change before knowing the prize, and the methodology's whole discipline is measure-before-tune.
- **An LLM relevance-filter in the spike** — out of scope and out of bounds (see §1): detection stays deterministic; the spike measures the deterministic ceiling so the LLM question, if it arises, is a separate, data-backed compliance decision.

### Open uncertainties (revisit during execution)
- The genuine-target vs narration call is judgment-heavy and sometimes genuinely ambiguous; the `other` bucket + recorded reasons keep that honest. A second labeler (review) should re-judge a sample.
- The reporting-verb guard is the obvious deterministic discriminator, but marker tense ("is expected" vs "was expected") may be a second signal worth recording during labeling even if not in the v1 guard — note it if it looks predictive.
