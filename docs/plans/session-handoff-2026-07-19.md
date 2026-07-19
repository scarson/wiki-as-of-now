<!-- ABOUTME: Session handoff — advisorySupport calibration implemented and MEASURED (option A failed); stage-6 vocabulary amended; eval batch 2 run at 9/10. -->
<!-- ABOUTME: Successor to session-handoff-2026-07-18d.md; the session where Sam's four-item calibration sign-off was executed end to end. -->

# Session handoff — calibration shipped and measured; option A failed, option D is Sam's call — 2026-07-19

Successor to [session-handoff-2026-07-18d.md](session-handoff-2026-07-18d.md). Standing grants/toolchain in [session-handoff-2026-07-18.md](session-handoff-2026-07-18.md) §Standing grants + §Operational guardrails all still hold.

## Headline state

- **Sam approved all four open questions** in the [advisorySupport calibration design](../design/2026-07-18-advisory-support-calibration-design.md) (option A wording, option B′, batch-2 timing, directional measurement). This session executed all four end to end.
- **Three PRs merged to dev:** [#63](https://github.com/scarson/wiki-as-of-now/pull/63) (options A + B′, code), [#64](https://github.com/scarson/wiki-as-of-now/pull/64) (stage-6 vocabulary + batch-1 re-annotation), [#65](https://github.com/scarson/wiki-as-of-now/pull/65) (batch-2 report — **verify merge state; it was green and pending merge at handoff**).
- **Suites: 992 node + 65 workers, green.** Baseline moved from 988 → 992 (4 new prompt-content tests). Lint clean. Codex gate on #63: **PASS, zero findings**.
- **Prod unchanged** (release PR #56); dev carries all of the above. Benign docs+dev skew, no release needed for a research-prompt change until Sam wants it live.

## The measurement result that matters

**Option A did not work.** Batch 2 ([report](online-eval/batch-2026-07-19.md)): **24 of 24 cards `advisorySupport=true`, zero `false`.** Across both batches the model has had **12 opportunities to emit `false` and taken none**. The overclaim rate fell 59% → 8%, but that is **confounded** — retrieval improved sharply (9/9 FOUND vs batch 1's 4/10), so only 2 cards warranted `false` and the model got both wrong. A rate-only report would have said "calibration works"; the confusion matrix is what exposed it.

**Before concluding, the stale-deploy explanation was ruled out:** the dev deploy built `7f21bf3` (the #63 merge), that commit contains the hardened prompt string, the research-worker deploy completed 05:23:22Z, and the first pack committed 05:35:42Z.

**Guard rails held:** no selection loss (2.67 cards/pack vs 1.7 — the propose-anyway instruction worked even though the label didn't move); resolving recall 100%; stage 3 9/9 PASS (cumulative 19/19 across both batches — the referent-context feature keeps holding).

## The decision waiting for Sam

**Option D — replace the `advisorySupport` boolean with a categorical `resolving / related-only / unrelated`.** The calibration design designates this as the next step under exactly the condition batch 2 produced ("if the model still refuses to emit `false`"). It was deliberately **not implemented**: it changes the write-once `cards_json` card shape and ripples through `isProposalsShape`, `EvidenceCard`, `honesty-state.ts`, and the worksheet badge — a serialization-contract and data-integrity surface, which is a Review trigger under git-strategy §Merge authority. Sam decides; batch 2 is the evidence.

Worth noting when deciding: **option B′ is already absorbing the damage.** All 24 cards would have lifted the claim-level state to "supported" under the old copy; the banner now reads "model suggests support — verify sources", and because presentation is computed at read time this covers every historical constant-era pack too.

## Seams

- **Batch 2 scored 9/10 — the Littoral combat ship record (cand 68) never committed** and carries to batch 3. Spend was 9 ledger rows, one under the designed 10. No pack exists for it, so a future re-enqueue is clean.
- **Open thread — the LCS failure (cause still unexplained, but the evidence is now settled).** Worker tail: `research.ai_call.failed {"reason":"AbortError"}`, wallTime 78 s, no search activity. **Within-batch selectivity is real** — 9 siblings succeeded in the same minutes while LCS alone failed. **A control probe (Rivian cand 56, different article) was run to test the "broad episode" alternative and also failed** (17:21–17:25Z), so a broad Workers AI episode is in progress *at that later time* and cannot diagnose the original. The 11.5 h gap between them has no events because no attempts ran. Claim-input size is ruled out (cand 68 is small: 116-char sentence, 432-char context). Next step if it recurs: worker tail correlated with a live attempt, to place the abort in `generateQueries` vs `triage`. Control probe cost nothing.
- **The `Today:` prompt line is triage-only by design** (query-gen has a negative test asserting its absence). If a future change adds it to query-gen, that test will fail — it is a decision, not an oversight.
- **Definition edge case for whoever writes option D:** the LRDR cards resolve their claim via a 2020 cancellation, *earlier* than the claim's 2025 anchor year. The current wording ("current status … as of a time after the claim's anchor year") reads as forbidding that; a pre-anchor cancellation genuinely resolves a stale future-tense claim. Drop the temporal qualifier from the cancellation/supersession clause.

## Priority queue (next session)

1. **Sam's call on option D** (above). On approval: TDD, codex gate, and plan the card-shape migration for write-once packs — historical packs keep the boolean, so every reader needs to handle both shapes.
2. **Retrieval-quality design** (prefer-official + retrieval-miss), now with **three** weak-host data points across two batches: `baike.baidu.com` (batch 1), `handwiki.org` and `usthadian.com` (batch 2). Compliance contract first — the show-your-work and full-candidate-set guardrails bound what presentation may de-emphasize; nothing may be hidden.
3. **Batch 3** after the next research-quality change lands; it inherits the LCS record.
4. **Optional, unblocked:** `surrounding_text` re-capture backfill campaign.
5. **Workers AI resilience** — third episode now on record, and the first showing within-batch selectivity. Still evidence-gated, but accumulating faster than batch 1 implied. **Note for batch 3: an episode was active at 17:25Z on 2026-07-19** — probe before committing to a batch run.

## Owed by / waiting on Sam (remind, don't block)

- **Option D decision** (the one new ask this session).
- Anonymous-capture throttle recommendation (standing).
- Optional prod deletion-flow QA (standing).
- `claude/laughing-chaplygin-ce1c13` local-branch deletion approval (standing).

## Operational guardrails accumulated

- **D1 rejects LIKE patterns longer than ~50 chars** ("LIKE or GLOB pattern too complex") and compound SELECTs at ~10 `UNION ALL` terms ("too many terms"). Use `instr(col, 'needle') > 0` and one query per term. (Also in the `toolchain-quirks` memory.)
- **A probe monitor must actually re-enqueue inside the loop, not just log "still outstanding"** — a first attempt this session only reported, wasting a cycle. Mint the session inside the loop too (cookies are 1 h).
- **`mktemp` in the shared system temp dir collides** across sessions ("File exists"); use the session scratchpad path for temp files.
- **Check the deploy before diagnosing the model.** "The change didn't work" and "the change wasn't deployed" look identical in the data; the SHA-plus-timestamp check takes one command and was what made batch 2's negative result trustworthy.

## Continuation prompt (paste-ready)

> WikiAsOfNow (Cloudflare Workers + Next 16; prod alpha at https://wikinow.scarson.io). **FIRST read `docs/plans/session-handoff-2026-07-19.md`** — state, seams, queue. Standing grants/toolchain: `session-handoff-2026-07-18.md` §Standing grants + §Operational guardrails (merge authority incl. releases; codex gate on code PRs, prompt-only invocation; TDD both pools; plain-text questions; compliance contract sacrosanct — read before touching research/LLM/audit code; Monitor for CI waits, never name a variable `status`; check `gh pr list` at session start). **Every node Bash call: `eval "$(fnm env)"; fnm use >/dev/null 2>&1; cd "$(git rev-parse --show-toplevel)"`** (Node 26 pin).
>
> **State:** dev carries PRs #63 (advisorySupport option A + B′), #64 (stage-6 vocabulary + batch-1 re-annotation), #65 (batch-2 report — confirm it merged). Suites 992 node + 65 workers green. **Option A FAILED its own criterion: 24/24 cards still `advisorySupport=true`, 0 falses in 12 chances across two batches; the 59%→8% overclaim drop is confounded by improved retrieval.** Option B′ (honest "model suggests support — verify sources" banner) shipped and covers historical packs at read time.
>
> **Queue:** (1) Sam's call on **option D** — categorical `resolving / related-only / unrelated` replacing the boolean; NOT implemented because it changes the write-once `cards_json` shape (Review trigger). (2) Retrieval-quality design (prefer-official; three weak-host data points: baike.baidu, handwiki, usthadian). (3) Batch 3 after the next research-quality change; it inherits the un-run Littoral combat ship record. (4) Optional `surrounding_text` backfill. (5) **Workers AI:** an episode was active 17:21–17:25Z on 2026-07-19 (a control probe on a second article failed too) — probe before spending on batch 3. The LCS job's within-batch selective failure is real but unexplained; tail a live attempt to place the abort in `generateQueries` vs `triage`.
>
> **Owed by Sam (remind, don't block):** option D decision; throttle-vs-auth-gate recommendation; optional prod deletion QA; laughing-chaplygin branch deletion.
