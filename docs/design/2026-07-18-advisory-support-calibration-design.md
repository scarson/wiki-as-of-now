<!-- ABOUTME: Design proposal for calibrating the advisorySupport flag after online-eval batch 1 measured a 41% overclaim rate (related-background and expectation-echo cards). -->
<!-- ABOUTME: Records the evidence, the root-cause hypothesis, three options with rejection reasons, and the recommended prompt-definition fix — awaiting Sam's sign-off. -->

# advisorySupport calibration — design proposal

**Status:** Proposal for Sam's review — no implementation until sign-off.
**Date:** 2026-07-18 · **Scope:** the triage prompt in `src/research/workers-ai-provider.ts` (option A); `src/worksheet/honesty-state.ts` named as a stake, not a change surface.
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

## Root-cause hypothesis

The triage prompt gives the flag no operational definition. The entire instruction today (`workers-ai-provider.ts`, triage prompt) is:

> advisorySupport is your advisory guess; a human verifies.

Nothing says a guess *about what*. Two readings fill the void, and each explains one observed overclaim shape:

- **Topical relevance** — "is this page relevant to the claim's topic?" — the notion the rest of the triage task rewards. Explains the related-background overclaims (right program, wrong question).
- **Claim-text support** — "does this quote support the *Claim:* line above?" — the literal reading of the field name against the prompt's own data labels. Explains the expectation-echo overclaims perfectly: "remains on track for full release in 2025" genuinely supports the sentence "The specification is expected to be finalized in 2025" — while saying nothing about whether it is stale.

Neither reading is the product's question ("what has since happened to this dated expectation?"). The failure is systematic definition-absence, not random model noise: zero overclaims occurred on cards whose quote states an outcome, and zero underclaims (supports marked false) were observed. Sharper still: **across all 17 batch-1 pairs the model emitted `true`** — as currently prompted, the flag is a constant, not a signal, and every downstream consumer (the per-card badge, the claim-level honesty state) is reading noise shaped like confidence.

## Option A — operational definition in the triage prompt (recommended)

Replace the one-liner with an operational definition. Proposed wording (final string subject to normal review):

> advisorySupport = true ONLY if the proposedQuote itself states what has since happened to the claim's dated expectation — the event occurred, the date moved, or the plan was cancelled or superseded. Quotes giving background on the same program, funding, related products, or adjacent events = false, even when clearly relevant. advisorySupport is your advisory guess; a human verifies.

- **Change surface:** one prompt string; no schema change; no pack-shape change; `honesty-state.ts` untouched. TDD via prompt-content assertions beside the existing triage tests (node pool); codex gate as a normal code PR to dev.
- **Guardrail posture:** flag stays advisory (support-checking guardrail); still inside triage jobs (b)/(c) (bounded-LLM-role); no card hidden (show-your-work / full-candidate-set).
- **Failure direction if it overcorrects:** genuine supports marked false push the claim-level state to "possible_update_weak_support" — the *honest* degradation state, which exists for exactly this. Under-claiming costs editor attention; over-claiming costs verification integrity. The asymmetry favors the conservative wording.
- **Measurement:** batch 2 of the online-eval protocol (this change is the protocol's own trigger — "one batch after each research-quality change"). Compare the stage-6 overclaim rate against batch 1's 41% baseline (7/17). Success: overclaims (both shapes) drop to 0–1 across the batch without a collapse in true supports.

## Option B — deterministic demotion at the claim-level aggregation (ruled out for now)

Require, for the claim-level "supported" state, `advisorySupport=true` AND a deterministic corroboration signal on the same card (e.g., the quote contains the anchor year or a later year).

Ruled out because: (a) **it falsely demotes real supports** — the Gordie Howe gold quote ("Opening this spring, the Gordie Howe International Bridge will transform…") contains no year token at all; a live gold-corpus counterexample, not a hypothetical; (b) it fixes one aggregation site while the per-card badge stays wrong — the editor still sees a miscalibrated flag on the card they're about to open; (c) a crude heuristic wearing a deterministic badge is *worse* for auditability than an honest advisory — it invites exactly the misplaced trust the show-your-work guardrail exists to prevent. **Revisit** only if batch 2 shows wording alone insufficient, and then as an aggregation-level rule, never by hiding cards.

## Option C — graded confidence + threshold (ruled out)

Replace the boolean with a graded confidence and threshold the presentation.

Ruled out because: (a) it changes the `cards_json` shape inside write-once packs — historical packs would carry a different card shape than new ones, complicating every reader for marginal gain; (b) the calibration base does not exist — 17 judged pairs cannot set a threshold, and a small model's numeric confidence is pseudo-precision; (c) more model-output surface to gate and audit, against YAGNI. Nothing about option A forecloses this later if evidence ever justifies it.

## Recommendation

**Option A now; B and C deferred pending batch-2 measurement.** Smallest reasonable change, aimed at the observed root cause, measurable by the already-approved protocol, guardrails untouched.

## Open questions for Sam

1. **Approve option A** (and the proposed wording, or edit it)? Implementation is one TDD'd prompt change + a normal code PR.
2. **Batch 2 timing:** the protocol's default cadence makes this change the trigger for the next 10-ledger-row batch. Run it as soon as the change lands on dev, or hold?

## Process note

Drafted in an autonomous session under the CLAUDE.md autonomous-mode valve: the brainstorming skill's dialogue checkpoints could not run live, so clarifying questions are enumerated above instead, and the skill's hard gate holds — **no implementation until Sam approves this design.**

## Appendix — reasoning trail

- **Investigation order:** compliance contract re-read first (per standing rule) → triage prompt read → discovery that the flag has no operational definition → `honesty-state.ts` read → discovery that the flag is load-bearing for the claim-level worksheet state, which raised the stakes from "badge cosmetics" to "presented confidence."
- **Why the definition-absence hypothesis over "small model can't judge support":** the errors are one-directional (all overclaims, no underclaims) and fall into exactly two coherent shapes (related background, expectation echo), each the natural product of one plausible reading of the undefined flag. A capability ceiling would look noisier — misses in both directions, no clean shapes. A missing definition predicts exactly this signature: the model substitutes the nearest concept the prompt makes available (relevance, or literal claim-text support).
- **Considered and dropped — UI copy change:** rewording the per-card badge (e.g., "model's guess: appears to resolve") without recalibrating the flag would relabel bad data. Presentation copy can be revisited after the flag means what it says.
- **Considered and dropped — offline eval coverage:** the offline gold-answer eval replays *gold* evidence through a fake provider, so it structurally cannot measure live advisory calibration; the online protocol is the only measurement instrument. This is why the proposal leans on batch cadence rather than a new test harness.
- **Uncertainties:** (1) sample size — the overclaim rate rests on 17 pairs; batch 2 grows the base but confidence intervals stay wide; treat rates as directional. (2) Gemma's instruction-following on a nuanced negative definition ("even when clearly relevant → false") is unproven; the measurement plan is the check, and the failure direction is the safe one. (3) Whether "the event occurred / date moved / cancelled or superseded" enumerates enough outcome shapes — it mirrors the gold corpus's outcome vocabulary (`event_occurred`, `slipped_still_pending`, `superseded`), which is the best available taxonomy today.
- **What I'd add with more time:** a batch-over-batch advisory-calibration table in the online-eval report template, so the rate trend is one glance rather than a re-derivation each batch.
