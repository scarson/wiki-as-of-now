<!-- ABOUTME: Design proposal for calibrating the advisorySupport flag after online-eval batch 1 measured a 41% overclaim rate (related-background and expectation-echo cards). -->
<!-- ABOUTME: Records the evidence, the root-cause analysis, the options considered (A/B/B'/C/D) with dispositions, and the recommended hardened prompt-definition fix — awaiting Sam's sign-off. -->

# advisorySupport calibration — design proposal

**Status:** Proposal for Sam's review — no implementation until sign-off. **Revised after a cross-model review** (codex `gpt-5.6-sol` @ xhigh, 2026-07-19: 9 P1 + 3 P2 against the first draft; per-finding dispositions in the appendix's cross-model round).
**Date:** 2026-07-18 · **Scope:** the triage prompt in `src/research/workers-ai-provider.ts` + the flag's doc comments in `src/research/provider.ts` (option A); a small presentation-copy companion in the worksheet (option B′); `src/worksheet/honesty-state.ts` logic unchanged.
**Evidence base:** [online-eval batch 1](../plans/online-eval/batch-2026-07-18.md), stage-6 advisory pairs, per the [online-eval protocol](2026-07-18-online-eval-protocol-design.md).

## Problem

Online-eval batch 1 judged every (advisorySupport, human verdict) pair across the committed packs. Batch-final result: **7 of 17 pairs (41%) were overclaims** — cards marked `advisorySupport=true` whose verbatim quote does *not* state the claim's current state. They come in two shapes. The first, **related background**:

- **M72/AS01E** — a funding-announcement card (real program, doesn't say whether the Phase 3 trial started).
- **3 nm process** — an N3E-2023 card (adjacent TSMC node, not the N3 volume-production question).
- **RQ-21 Blackjack** — the insitu.com product page (right aircraft, no word on the sensor tests).

This matches the San Jose–Gilroy pattern from the 2026-07-12 pack review; batch 1 quantified it.

The batch-completion records added a second overclaim shape, **expectation echo**: the PCI Express pack's four cards all carry `advisorySupport=true` on quotes that *restate the claim's own pre-release expectation* ("remains on track for full release in 2025", "targeted for 2025") — none states what has since happened (the spec's June 2025 release).

**Why it matters more than a badge.** `advisorySupport` is not only a per-card chip: `deriveHonestyState` / `honestyFromSurfaced` (`src/worksheet/honesty-state.ts`) lift the claim-level worksheet state to **"supported"** if *any* card carries `advisorySupport=true`. In the three original overclaims a genuinely supporting card co-existed, so the claim-level state happened to be right. The PCI Express completion pack removed that luck: **every** card is a non-resolving overclaim, so the worksheet would present the claim as "supported" with zero cards resolving anything — the exact failure mode miscalibration predicts, now observed rather than hypothetical.

## Compliance frame (read before weighing options)

Per the [compliance contract](../policy/wikipedia-genai-compliance.md) (sacrosanct):

- The **support-checking guardrail** (its G8 anchor): the model's support assessment is **advisory only**; support is the human's judgment, made by opening the source. Any fix must keep the flag advisory — better calibrated, never adjudicative.
- The **bounded-LLM-role guardrail** (G9): the advisory assessment is part of triage jobs (b)/(c). A calibration fix must not add a fourth job.
- The **show-your-work** and **full-candidate-set guardrails** (G6/G7): no option may hide or drop cards; only ordering/labeling honesty is in play.
- The **detection-stays-deterministic guardrail** (G10) and the audit log (G13) are untouched by every option below.

A better-calibrated advisory flag *strengthens* the contract: the current inflation nudges the editor toward rubber-stamping — the throughput-vs-verification tension the contract names explicitly.

**Where the claim-level "supported" state sits (cross-model finding, addressed).** The codex reviewer flagged that `honesty-state.ts` converts any model `true` into the claim-level "supported" state before any human judgment, and read that as contradicting human adjudication. The disposition here is partial: deciding what to *surface and how to rank it* is explicitly the tool's job under the human-verification guardrail ("the tool decides what to surface and how to rank it — transparently; it never decides what gets cited"), and the open-the-source gate is unchanged by every option below — so the conversion is presentation, not adjudication. But the reviewer is right on two counts: the first draft's "guardrails untouched" phrasing overclaimed, and a state named plainly "supported" launders an advisory signal into what reads as a verdict. Option B′ below fixes the presentation honesty without touching the state machine.

## Root-cause hypothesis

The triage prompt gives the flag no operational definition. The entire instruction today (`workers-ai-provider.ts`, triage prompt) is:

> advisorySupport is your advisory guess; a human verifies.

Nothing says a guess *about what* — and (per the cross-model review, adopted as the primary mechanism) the response shape makes `true` the path of least resistance regardless: **selection and labeling are coupled.** The triage task's framing is "triage pages for whether they appear to resolve a dated claim," and the model both *selects* up to five proposals and *labels its own selections* in one response. Having selected a page as apparently-resolving, labeling it `true` is self-consistent — this alone predicts 17/17 `true` with no further hypothesis needed. Two secondary readings of the undefined flag explain *which* non-resolving pages get selected at all:

- **Topical relevance** — "is this page relevant to the claim's topic?" — the notion the rest of the triage task rewards. Explains the related-background overclaims (right program, wrong question).
- **Claim-text support** — "does this quote support the *Claim:* line above?" — the literal reading of the field name against the prompt's own data labels. Explains the expectation-echo overclaims: "remains on track for full release in 2025" genuinely supports the sentence "The specification is expected to be finalized in 2025" — while saying nothing about whether it is stale.

Neither reading is the product's question ("what has since happened to this dated expectation?"). The observable fact is stark either way: **across all 17 batch-1 pairs the model emitted `true`** — as currently prompted, the flag is a constant, not a signal, and every downstream consumer (the per-card badge, the claim-level honesty state) is reading noise shaped like confidence. (The first draft also cited "zero underclaims" as evidence for definition-absence; the reviewer correctly called that vacuous — a constant emits no underclaims by construction — and it is withdrawn.) The coupling mechanism has a design consequence the fix must handle explicitly: if `true` becomes rare, the model's easiest "improvement" is to *stop proposing* non-resolving pages rather than label them `false` — silent selection loss that would erode the full-candidate-set guardrail while making calibration look better. The hardened wording below counters this directly.

## Option A — operational definition in the triage prompt (recommended, hardened per the cross-model review)

Replace the one-liner with an operational definition. Proposed wording (final string subject to normal review):

> advisorySupport = true ONLY if the proposedQuote itself states the current status of the claim's dated expectation, as of a time after the claim's anchor year — the event happened; the date moved to a stated NEW timeframe; the plan was cancelled, superseded, paused, or failed; or the work is explicitly described as still pending at a date after the anchor year.
> advisorySupport = false for quotes saying the plan is still expected, on track, targeted, or scheduled for the SAME timeframe the claim already names — those restate the expectation, they do not resolve it.
> advisorySupport = false for background on the same program, funding, related products, or adjacent events, even when clearly relevant.
> STILL propose relevant pages when advisorySupport = false. The flag is a label, not a filter — never drop a page because it does not resolve the claim.
> advisorySupport is your advisory guess; a human verifies.

Two supporting changes ride along:

- **A `Today: <ISO date>` data line in the triage prompt's claim block** (triage only, not query-gen). The reviewer's point is correct: "current status" is not executable when the model has an anchor year but no as-of date — "Opening this spring" from a 2024 article is indistinguishable from a live update without one. The date is a deterministic data field (same category as `Anchor year:`), grants no new job, and makes "a stated NEW timeframe" checkable against something.
- **Doc-comment updates in `src/research/provider.ts`**: `EvidenceCard.advisorySupport` currently reads "whether this card appears to support the claim" — under the new semantics it must read "whether the quote appears to state the claim's current status; related-but-nonresolving cards carry false." The reviewer is right that "one prompt string" understated this semantic surface.

- **Change surface:** one prompt string + one deterministic prompt data line + doc comments; no schema change; no pack-shape change; `honesty-state.ts` logic untouched (presentation copy is option B′). TDD via prompt-content assertions beside the existing triage tests (node pool) — noting honestly that such tests verify *wording*, not calibration behavior; calibration is only measurable online (measurement below). Codex gate as a normal code PR to dev.
- **Guardrail posture:** flag stays advisory (support-checking guardrail); still inside triage jobs (b)/(c) (bounded-LLM-role); the propose-anyway instruction actively defends the full-candidate-set guardrail against selection loss.
- **Failure direction if it overcorrects:** genuine supports marked false push the claim-level state to "possible_update_weak_support" — the *honest* degradation state, which exists for exactly this. Under-claiming costs editor attention; over-claiming costs verification integrity. The asymmetry favors the conservative wording.
- **Measurement (rebuilt per the review):**
  - **Instrument:** batch 2 of the online-eval protocol (this change is the protocol's own trigger). Report a **per-card confusion matrix** — `advisorySupport` (true/false) × human verdict (resolving / related-only / unrelated) — with normalized rates, not raw counts. Also report **cards-per-pack** vs batch 1: a drop in proposed related cards alongside "better" calibration is the selection-loss signature, and counts as a failure, not a success.
  - **Success:** overclaim rate (advisory-true ∧ human-non-resolving) falls materially from the re-annotated batch-1 baseline; the model emits `false` at all (any `false` breaks the constant); human-resolving cards labeled true (recall of true supports) does not fall below batch 1's; cards-per-pack does not collapse.
  - **Attribution limits, stated plainly:** batch 2 differs from batch 1 in claims, revisions, live search results, and sources, and batch 1's errors cluster (4 of 7 in one pack) — a live batch is *external validation*, not a controlled experiment. The clean instrument would be a paired replay of frozen triage inputs (same pages, old vs new prompt), which requires persisting fetched page text per run — a data-capture and storage decision that is Sam's call (open question below). Without it, treat batch-over-batch rates as directional.
  - **Baseline re-annotation prerequisite:** see "Stage-6 ground truth" below — the 7/17 figure moves under the strict definition and must be re-derived before it serves as the comparison baseline.

## Stage-6 ground truth — operational definition + batch-1 re-annotation (prerequisite for measurement)

The cross-model review caught an inconsistency in the evidence base itself: the batch-1 "supports" bucket includes pairs that do not meet the strict current-status test this proposal asks of the model — GCV's "related/supports-adjacent" verdict, Blackjack's c4isrnet precursor-award quote, and Gordie Howe's lapsed intermediate projection. If the human rubric and the model's definition diverge, the calibration measurement measures the divergence, not the model.

Fix: the protocol's stage-6 judgment gets the **same operational definition** as the flag (human verdict `resolving` = quote states the current status per the option-A test; `related-only` = on-topic but non-resolving, including expectation echoes and lapsed projections; `unrelated`), recorded as a protocol amendment. Batch 1's 17 pairs are then **re-annotated under that definition with the original verdicts preserved alongside** (transparent amendment, not a silent rewrite). Under the strict test the batch-1 overclaim count likely *rises* (the three pairs above move from "supports" to "related-only" while their advisory value stays `true`), i.e. the first draft's 41% was, if anything, an undercount. This re-annotation happens before batch 2 so the baseline is scored by the same rule as the comparison.

## Option B — deterministic demotion at the claim-level aggregation (still deferred; rejection narrowed) + B′ presentation-honesty companion (recommended)

Require, for the claim-level "supported" state, `advisorySupport=true` AND a deterministic corroboration signal on the same card (e.g., the quote contains the anchor year or a later year).

The first draft ruled this out by refuting the year-token heuristic (which falsely demotes the year-less Gordie Howe gold quote — that counterexample stands). The cross-model review correctly noted that refuting one crude heuristic does not refute the *class* of aggregation-level safeguards, and that the card badge and the claim-level state are separate risks. Both points are accepted. The class stays **deferred** rather than adopted because every deterministic corroboration signal proposed so far is a text heuristic with false-demotion modes, and batch 2 will show whether prompt-level calibration suffices before aggregation logic is added. What is adopted now instead:

**Option B′ — presentation honesty at the claim level (recommended alongside A).** Keep `honesty-state.ts` logic as is; change the *presented copy* of the "supported" state so its advisory provenance is explicit — e.g. "model suggests support — verify sources" rather than a bare "supported". One UI-copy change; no state-machine change; no card hidden or demoted. This is the honest fix for the launder-into-a-verdict problem the reviewer flagged, and the first draft's "considered and dropped — UI copy change" reasoning ("relabeling bad data") no longer applies once option A makes the flag mean something.

## Option C — graded confidence + threshold (ruled out)

Replace the boolean with a graded confidence and threshold the presentation.

Ruled out because: (a) it changes the `cards_json` shape inside write-once packs — historical packs would carry a different card shape than new ones, complicating every reader for marginal gain; (b) the calibration base does not exist — 17 judged pairs cannot set a threshold, and a small model's numeric confidence is pseudo-precision; (c) more model-output surface to gate and audit, against YAGNI. Nothing about option A forecloses this later if evidence ever justifies it.

## Option D — categorical label: `resolving / related-only / unrelated` (cross-model suggestion; the structural fix if A fails)

Replace the boolean with the three-way category the human rubric already uses. Real merits the review is right about: it matches the observed confusion exactly, it is not pseudo-precision (unlike numeric confidence), and it dissolves the selection-loss incentive — a related page gets an honest category instead of a label the model is tempted to avoid emitting. Costs: it changes the `cards_json` card shape inside write-once packs (mixed historical shapes for every reader), and it ripples through `isProposalsShape`, `EvidenceCard`, `honesty-state.ts`'s mapping, and the worksheet badge — a materially larger change than A. Position: **the designated next step if batch 2 shows A-hardened insufficient** (in particular, if the model still refuses to emit `false` or selection loss appears despite the propose-anyway instruction). Sam may also elect to jump straight here; the measurement plan is identical either way.

## Recommendation

**Option A (hardened) + B′ now; B deferred; C rejected; D designated as the next step if batch 2 fails A.** A-hardened is the smallest change that makes the flag mean something, now with the expectation-echo negation, the `Today` anchor, and the anti-selection-loss instruction the first draft lacked; B′ makes the claim-level presentation honest about its advisory provenance for one line of copy. The stage-6 re-annotation is a measurement prerequisite, not an option.

## Open questions for Sam

1. **Approve option A's hardened wording** (or edit it)? Implementation: prompt string + `Today:` triage data line + provider.ts doc comments, TDD'd, normal code PR.
2. **Approve B′** (claim-level "supported" copy → "model suggests support — verify sources" or similar)? One UI-copy change riding the same PR.
3. **Batch 2 timing:** run as soon as the change lands on dev (protocol default), or hold?
4. **Frozen triage-input capture** for a true paired replay (persist fetched page text per run, dev-only): worth the storage and capture-surface change, or accept directional batch-over-batch measurement? Default if unanswered: accept directional; note the limit in the batch-2 report.

## Existing packs — scope of the bad flags (verified 2026-07-19)

Write-once packs keep their booleans; a prompt change only affects future packs. Verified live counts: **dev 14 packs** (four 2026-07-12 smoke packs + the ten eval-batch packs), **prod 15 packs** (thirteen from the seed-list research runs of 2026-07-13/14, one from the 2026-07-14 era, plus one committed by the nightly seeder at 00:07 UTC tonight — the freshly captured Zumwalt candidate, whose two cards are justified trues under the strict definition: both state the slipped 2027/FY27 timeframe). Every historical card carries the constant-true-era flag. No destructive remediation is proposed (packs are immutable by design; the audit trail stays intact): **option B′ is the remediation** — presentation is computed at read time, so the honest "model suggests support — verify" copy applies to historical packs the moment it ships. Prod exposure is bounded (alpha; users = Sam + Claude).

## Process note

Drafted in an autonomous session under the CLAUDE.md autonomous-mode valve: the brainstorming skill's dialogue checkpoints could not run live, so clarifying questions are enumerated above instead, and the skill's hard gate holds — **no implementation until Sam approves this design.**

## Appendix — reasoning trail

- **Investigation order:** compliance contract re-read first (per standing rule) → triage prompt read → discovery that the flag has no operational definition → `honesty-state.ts` read → discovery that the flag is load-bearing for the claim-level worksheet state, which raised the stakes from "badge cosmetics" to "presented confidence."
- **Root-cause evolution:** the first draft argued definition-absence over "small model can't judge support" from the errors' one-directionality and two coherent shapes. The cross-model round exposed that the one-directionality argument was circular (a constant emits no underclaims) and supplied the stronger mechanism — selection/labeling coupling — now adopted as primary, with the two readings demoted to explaining *which* non-resolving pages get selected. The capability-ceiling alternative remains disfavored for the same reason as before: the errors form clean shapes, not noise — but batch 2's any-`false`-at-all criterion is the real test.
- **Considered, dropped, then revived as B′ — UI copy change:** the first draft dropped it ("relabeling bad data"); once option A makes the flag mean something, honest presentation copy becomes the cheap claim-level remediation, and it retroactively covers historical constant-era packs at read time.
- **Considered and dropped — offline eval coverage:** the offline gold-answer eval replays *gold* evidence through a fake provider, so it structurally cannot measure live advisory calibration; the online protocol is the only measurement instrument. This is why the proposal leans on batch cadence rather than a new test harness.
- **Uncertainties:** (1) sample size — the overclaim rate rests on 17 pairs; batch 2 grows the base but confidence intervals stay wide; treat rates as directional. (2) Gemma's instruction-following on a nuanced negative definition ("even when clearly relevant → false") is unproven; the measurement plan is the check, and the failure direction is the safe one. (3) Whether the outcome enumeration is complete — it started from the gold corpus's outcome vocabulary (`event_occurred`, `slipped_still_pending`, `superseded`) and was broadened per the cross-model round (paused, failed, still-pending-past-deadline); genuinely novel resolution shapes may still fall outside it, which the human verdict catches and batch reports should note.
- **What I'd add with more time:** a batch-over-batch advisory-calibration table in the online-eval report template, so the rate trend is one glance rather than a re-derivation each batch.

### Cross-model review round (codex `gpt-5.6-sol`, xhigh reasoning, 2026-07-19) — 9 P1 + 3 P2 against the first draft

Requested by Sam after the first draft merged. Dispositions:

- **Accepted outright, revision applied:** selection/labeling coupling as the primary mechanism + "zero underclaims" withdrawn as vacuous (root-cause section rewritten); explicit expectation-echo negation in the wording; `Today:` date anchor (current-status not executable without one); broadened outcome enumeration (paused/failed/still-pending-past-deadline); the propose-anyway anti-selection-loss instruction; measurement rebuilt (confusion matrix, normalized rates, recall + cards-per-pack guards, attribution limits stated, frozen-replay named as a Sam decision); stage-6 ground-truth inconsistency (GCV / Blackjack-c4isrnet / Gordie Howe pairs) → operational stage-6 definition + transparent batch-1 re-annotation as a measurement prerequisite; `provider.ts` doc-comment surface added to the change list; prompt-content tests acknowledged as wording-only verification; pack-remediation scope verified live (dev 14 / prod 15) and B′ named as the read-time remediation.
- **Accepted with narrowed scope:** option B's rejection narrowed from "the class" to "every proposed deterministic corroboration heuristic so far"; the class stays deferred pending batch 2, and the presentation-honesty companion (B′) is adopted now. Option D (categorical `resolving / related-only / unrelated`) added as the designated next step — the reviewer is right that it matches the human rubric and dissolves the selection-loss incentive; its write-once-shape cost keeps it sequenced behind A rather than rejected.
- **Partially disputed, documented in the compliance-frame section:** "option A does not keep the flag advisory downstream" — the claim-level conversion is surface-and-rank presentation (explicitly the tool's job under the human-verification guardrail; the open-the-source gate is untouched), not adjudication. Conceded within it: the first draft's "guardrails untouched" overclaimed, and a state labeled bare "supported" launders advisory provenance — hence B′.
