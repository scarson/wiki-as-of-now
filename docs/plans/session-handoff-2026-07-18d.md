<!-- ABOUTME: Session handoff — online-eval batch 1 completed (10/10 scored) + advisorySupport calibration proposal drafted, awaiting Sam. -->
<!-- ABOUTME: Fourth session of 2026-07-18 (ran past UTC midnight); successor to session-handoff-2026-07-18c.md. -->

# Session handoff — eval batch 1 complete; advisorySupport proposal awaiting sign-off — 2026-07-18 (fourth session)

Successor to [session-handoff-2026-07-18c.md](session-handoff-2026-07-18c.md) (this session executed the continuation prompt's priority items 1 and 2 and collected item 4's evidence). The standing grants/toolchain in [session-handoff-2026-07-18.md](session-handoff-2026-07-18.md) §Standing grants + §Operational guardrails all still hold.

## Headline state

- **dev tip `b5c0c3f`** = merge of [PR #60](https://github.com/scarson/wiki-as-of-now/pull/60) (docs-only: batch-report completion + calibration proposal). The protocol-rubric amendment and this handoff ship in the follow-up handoff PR, which moves the tip once more. Prod unchanged at release PR #56 — benign docs-only skew, no release needed.
- **No open PRs; no code changes this session** — suites untouched from the 988 node + 65 workers baseline; no migrations; no deploys beyond the automatic dev docs push.
- **Branch namespace:** `dev`/`main` remote (session branch `docs/eval-batch-1-completion` merged + deleted; this handoff's branch follows the same lifecycle). Local archival branch `claude/laughing-chaplygin-ce1c13` still awaiting Sam's deletion approval (standing).
- **Worktree:** `.claude/worktrees/wikinow-eval-batch-1-973503` (this session; disposable once the handoff PR merges).

## What shipped this session (all docs/eval — zero production code)

- **Online-eval batch 1 COMPLETE — 10/10 records scored** ([batch report](online-eval/batch-2026-07-18.md), merged in PR #60). The 3 DLQ'd records (PCI Express 18, Gordie Howe 20, K9 Thunder 38) were re-enqueued through a second same-night Workers AI latency episode using the zero-cost probe pattern and scored against gold records 28/1/17. Batch-final: **stage 3 = 10/10 PASS** (the referent-context feature is validated across every stratum), stage 5 = 4 FOUND / 3 PARTIAL / 3 NOT_FOUND, **stage 6 = 7/17 advisory overclaims (41%)**. Ledger spend verified in D1: the designed 10 rows, split 7 (07-18) + 3 (07-19 UTC) across the day boundary; failed attempts spent nothing.
- **advisorySupport calibration design proposal** ([design doc](../design/2026-07-18-advisory-support-calibration-design.md), merged in PR #60) — continuation-prompt priority 2. Headline measurement: **the flag emitted `true` on all 17 judged pairs — a constant, not a signal — and it drives the claim-level worksheet honesty state** (`honesty-state.ts` lifts to "supported" on any advisory-true card; the PCI pack is the observed all-overclaim case). Recommends an operational definition in the triage prompt (option A); deterministic demotion and graded confidence considered and ruled out with reasons. **Proposal only — the brainstorming hard gate holds: no implementation until Sam approves.**
- **Protocol rubric amendment** ([protocol design doc](../design/2026-07-18-online-eval-protocol-design.md) §4, this handoff's PR): the stale-intermediate-slip boundary case (batch finding 7) is now named in the stage-5 rubric — scores PARTIAL with reasoning — so batch 2 scoring stays comparable.
- **Auto-memories updated:** `research-pack-quality-pattern` (batch-final numbers + constant-flag finding), `workers-ai-latency-episodes` (second episode + the proven probe→fan-out Monitor recovery pattern), `toolchain-quirks` (classifier-outage guidance), MEMORY.md index line refreshed.

## Seams

- **Batch 2 is gated on the calibration change, by design.** The protocol's cadence makes "next research-quality change lands on dev" the batch-2 trigger; the calibration proposal is that change. Order on approval: implement (TDD, codex gate) → merge to dev → run batch 2 (10 fresh ledger rows) → compare stage-6 overclaim rate against the 41% baseline. Don't run batch 2 before the change lands — it would burn a measurement point re-measuring the known baseline.
- **The calibration implementation touches PR #53's hardened prompt surface.** Whoever implements option A must re-read the codex-residual paragraph in [handoff-c](session-handoff-2026-07-18c.md) §Codex review of PR #53 first (prompt-structure decisions there are settled — argue with the written decision, not around it), and the compliance contract per the standing rule (the proposal's compliance-frame section maps the relevant guardrails by name).
- **One-shot-per-revision still holds:** the 10 batch-1 packs are permanent measurement points at their revisions. Batch 2 needs either natural article drift (likely — weeks will pass) or different gold records; the proposal's measurement section assumes the standard batch-2 selection process (protocol §2 strata, records proposed in the batch-2 report before spend).
- **Ledger day-boundary quirk now on record:** an episode-interrupted batch can split its spend across UTC quota days (7+3 here). Caps were never near; noted in the batch report's ledger section so a future reader doesn't misread the per-day counts as two partial batches.
- **The 3 completion packs' enqueue-time context:** all three candidates carried populated `surrounding_text` (verified pre-enqueue), so their stage-3 PASSes attribute to the feature — same attribution discipline as the original 7.

## Priority queue (next session)

1. **Await Sam on the calibration proposal** ([design doc](../design/2026-07-18-advisory-support-calibration-design.md) §Open questions: approve/edit option A wording; batch-2 timing). On approval: implement via TDD (prompt-content assertions beside the triage tests, node pool), codex gate, PR to dev — then run batch 2 per the protocol.
2. **Retrieval-quality design thought** (continuation-prompt items 3+4, now evidence-complete): prefer-official (baike.baidu-over-pr.tsmc.com, batch finding 3) + retrieval misses (messy stratum 0/2; PCI freshness sub-shape; batch finding 4). These interlock — a host-quality/freshness treatment likely addresses both — and should be designed together, compliance contract first (show-your-work and full-candidate-set guardrails bound what presentation may de-emphasize; nothing may be hidden).
3. **Optional, unblocked:** re-capture campaign to backfill `surrounding_text` on high-value dev articles (anonymous capture, throttle-paced 10/60s per IP). Low priority; fresh captures self-heal.
4. **Workers AI resilience** — still evidence-gated. Two same-night episodes are on record (batch finding 6) but may be one upstream incident; the probe pattern costs nothing and worked twice. Revisit only if episodes recur across days.

## Owed by / waiting on Sam (remind, don't block)

- **Calibration proposal sign-off** (queue item 1 above — the only NEW ask this session).
- Anonymous-capture throttle recommendation (standing: keep capture open behind the Rate Limiting binding).
- Optional prod deletion-flow QA (standing; dev fully verified).
- `claude/laughing-chaplygin-ce1c13` local-branch deletion approval (standing).

## Operational guardrails accumulated (beyond handoff-c's — those still hold)

- **Harness permission-classifier outages can run 15+ min and are tool-selective:** Bash blocked while Read/Edit/Write pass. Bank file-level work between Bash retries; read-only tools never need the classifier. (Also in `toolchain-quirks` memory.)
- **The recovery Monitor pattern for latency episodes is proven twice** and worth copying verbatim: persistent Monitor, probe re-enqueue every ~8 min (zero cost), on first pack commit fan out the rest, relapse-guard re-enqueue at ~12 min, emit only transitions. Mint inside the loop (cookies are 1h).
- **`wrangler tail` + worker name + `--env` double-suffixes** (`…-dev-dev`) — was already in `toolchain-quirks` (go-live section); it bit again because the memory wasn't consulted before writing the command. Check the quirks memory before composing wrangler invocations.
- **pcisig.com blocks plain curl** (returned ~60 chars) — for page-content checks during scoring, the pack's own verbatim quotes can serve as page-content evidence when a direct fetch is blocked (the research worker's fetcher succeeded where curl failed).

## Continuation prompt (paste-ready)

> WikiAsOfNow (Cloudflare Workers + Next 16; prod alpha at https://wikinow.scarson.io). **FIRST read `docs/plans/session-handoff-2026-07-18d.md`** — state, seams, queue. Standing grants/toolchain: `session-handoff-2026-07-18.md` §Standing grants + §Operational guardrails (merge authority incl. releases; codex gate on code PRs, prompt-only invocation; TDD both pools; plain-text questions; compliance contract sacrosanct — read before touching research/LLM/audit code; Monitor for CI waits, never name a variable `status`; check `gh pr list` at session start). **Every node Bash call: `eval "$(fnm env)"; fnm use >/dev/null 2>&1; cd "$(git rev-parse --show-toplevel)"`** (Node 26 pin).
>
> **State:** dev tip `b5c0c3f` (PR #60 + handoff PR, all docs). Online-eval batch 1 COMPLETE: 10/10 scored, referent-context validated (10/10 stage-3 PASS); advisorySupport measured constant-true with 7/17 overclaims. Suites baseline 988 node + 65 workers (untouched — no code this session). Prod at release PR #56, benign docs skew.
>
> **Queue:** (1) Sam's sign-off on the advisorySupport calibration proposal (`docs/design/2026-07-18-advisory-support-calibration-design.md` §Open questions) → on approval implement option A (TDD prompt-content tests, codex gate, PR to dev; re-read handoff-c's codex-residual paragraph + the compliance contract first) → then batch 2 per the protocol (10 ledger rows; compare vs the 41% overclaim baseline; batch 2 MUST wait for the change to land). (2) Retrieval-quality design (prefer-official + retrieval-miss findings 3+4 in the batch report — evidence complete, design together, guardrails bound presentation). (3) Optional: surrounding_text re-capture backfill campaign. (4) Workers AI resilience stays evidence-gated.
>
> **Owed by Sam (remind, don't block):** calibration sign-off; throttle-vs-auth-gate standing recommendation; optional prod deletion QA; laughing-chaplygin branch deletion.

## Adversarial review rounds

- **Round 1 — naive fresh agent — 2 findings applied:** "option A" appeared in the queue without its meaning (expanded to "operational definition in the triage prompt" at first queue use); the probe pattern's mint-inside-the-loop detail was transcript-only (added to the guardrail bullet).
- **Round 2 — recency-bias audit — 1 finding applied:** the pre-enqueue `surrounding_text` verification for the 3 completion candidates (done early in the session, load-bearing for stage-3 attribution) was missing from the seams — added.
- **Round 3 — seam auditor — 1 finding applied:** the batch-2-waits-for-the-change ordering was implied by the protocol reference but not stated as a hard order; made explicit with the wasted-measurement rationale.
- **Round 4 — operational guardrails auditor — 1 finding applied:** the tail double-suffix recurrence (memory existed, wasn't consulted) was in the transcript only; added with the check-the-memory-first lesson.
- **Round 5 — loss-averse auditor — 2 findings applied:** the pcisig-blocks-curl workaround (quotes as page evidence) was transcript-only — added to guardrails; the "what I'd add with more time" batch-over-batch advisory table idea lives in the design doc's appendix — confirmed routed there, no duplication needed here (pointer suffices via the design-doc link).
- **Round 6 — measurement-integrity auditor (session-specific: this session's product was scores and rates that batch 2 will be compared against) — 1 finding applied:** verified every number in this handoff against the merged report (10/10, 4/3/3, 7/17=41%, 7+3 ledger split, 988+65 baseline) — one drift found: an early draft of the headline said "batch report + proposal + rubric amendment merged in PR #60" but the rubric amendment ships in the handoff PR, not #60; corrected the headline's parenthetical. Also confirmed the report's interim-25% sentence is explicitly marked interim so the 41% final can't be misquoted as a contradiction.
- **Round 7 — final coherence pass (fresh top-to-bottom read) — 0 material findings:** links resolve to real paths; queue numbering consistent with the continuation prompt; no opaque session shorthand remains.
