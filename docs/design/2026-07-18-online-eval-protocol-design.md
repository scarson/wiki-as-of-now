<!-- ABOUTME: Protocol for the small-N online (live-pipeline) research eval — the metered counterpart to the offline gold-answer eval. -->
<!-- ABOUTME: Defines batch size, record selection, run mechanics on dev, the scoring rubric, and the spend/ledger discipline. -->

# Online research eval — small-N manual protocol

**Status:** Draft for Sam's review — no metered spend happens until this protocol is approved.
**Depends on:** the dev `ADMIN_SECRET` value (session mint) for authed enqueue; [PR #53](https://github.com/scarson/wiki-as-of-now/pull/53) (claim referent context) being the pipeline under test.
**Companion:** the offline eval (`test/research/gold-answer-eval.test.ts`, 30 evidenced records, 100% acceptance against pinned snapshots) verifies the *verify/extract* path. This protocol measures what the offline eval cannot: does the **live** pipeline — Gemma query-gen → Brave search → fetch → triage — actually *find* the gold answers? (The ground-truth-corpus design names this the "online (manual eval)".)

## 1. What is being measured

The funnel, stage by stage, per gold record:

| Stage | Metric | Deterministic or judged |
|---|---|---|
| 1. Live match | live article still contains the gold claim sentence and the detector re-finds it | deterministic |
| 2. Eligibility | candidate is `easy_win` at the live revision | deterministic |
| 3. Query quality | queries are neutral AND name the claim's referent (not generic/pronoun-blind) | judged (rubric §4) |
| 4. Retrieval | any card's URL canonicalizes to a gold-evidence host (or an equally authoritative source for the same fact) | deterministic assist + judged |
| 5. Answer found | some card's verbatim quote states the gold `outcome`/current state | judged, quote-anchored |
| 6. Advisory calibration | per card: `advisorySupport` vs the human judgment from stage 5 | recorded for queue item 5 |

Stages 1–2 measure corpus rot and the safe lane, not the research layer; they are recorded so a "0 answers found" result is never misread when the real cause was "claim no longer on the live page."

## 2. Batch size, selection, spend

- **N = 10 records per batch** (of the 32 gold records; 30 are evidenced). One `researchClaim` run each → at most **10 quota-ledger rows per batch** — 20% of the global 50/day cap, leaving normal headroom. Ledger rows are permanent by design; a batch permanently spends 10 of them. Never run more than one batch per day.
- **Stratified selection**, fixed per batch and recorded in the batch report:
  - 4 × **pronoun/definite-article subject** claims ("The dam…", "the Authority…") — the case the referent-context feature exists for; direct before/after comparison with the 2026-07-12 pack review findings.
  - 4 × **named-entity subject** claims — the control stratum (these already worked; a regression here is a red flag).
  - 2 × **messier sourcing** claims (gold evidence is trade press or a followed-through citation) — probes retrieval breadth, not just the easy official-source hits.
- **One shot per (claimKey, sourceRevisionId).** Packs are write-once and the seeder/consumer skip existing packs, so a claim **cannot be re-run at the same live revision**. A batch is therefore a measurement *point*, not an iterable experiment: run a batch only after a meaningful pipeline change, and compare batch-over-batch. (Deleting packs to enable re-runs is explicitly out of scope here — it touches data-integrity surface and is Sam's call; see §6.)

## 3. Run mechanics (all on dev — prod is never used for evals)

1. **Mint a session** on dev (`POST /api/dev/mint-session` with the admin-secret header file, per the handoff runbook). Blocked until the `ADMIN_SECRET` value lands in `~/.wikinow/dev-admin-secret`.
2. **Capture each selected article** via the public capture flow so dev D1 holds live-revision candidates + eligibility verdicts. Capture is unmetered but throttled (10/60s per IP) — pace the loop.
3. **Match** each gold `sentenceSubstring` against the persisted candidates (stage 1; record misses with the live-revision diff reason).
4. **Enqueue** the matched candidate ids with the minted session (stages 2→5 run in the queue consumer exactly as production traffic would).
5. **Read the packs** from dev D1 (`research_packs` by claimKey) and score per §4. The pack's `queries_json`, `cards_json`, and `dispositions_json` are the entire evidence base — no other instrumentation needed (show-your-work pays off here).

## 4. Scoring rubric (per record, recorded in the batch report)

- **Query quality (stage 3), judged against the pack's logged queries:** PASS = at least half the queries name the claim's specific referent (entity, program, place) and none presuppose the answer; PARTIAL = referent named but queries otherwise generic; FAIL = generic/pronoun-blind or placeholder residue. (The G9 bounds should make FAIL-by-presupposition structurally rare — a FAIL here is a bug report, not just a score.)
- **Answer found (stage 5):** FOUND = a card's verbatim quote states the gold current state (the human confirms by opening the source — same act the product asks of editors); PARTIAL = a card points at a page that contains the answer but the quote extracted doesn't state it; NOT_FOUND otherwise. Score against `outcome`/`supersededBy`, not the exact gold quote — the live web may state the same fact in different words on a different page than the 2026-06 snapshot. **Named boundary case (from batch 1, Gordie Howe):** a quote that states the gold outcome *kind* (e.g., documents the slip past the claim's date) while asserting an intermediate landing date that has itself since lapsed scores **PARTIAL** with the reasoning recorded — it resolves the staleness question as posed but writing from it would introduce fresh staleness, and rubric-strict FOUND requires the current state. Keeps batch-over-batch scoring comparable.
- **Advisory calibration (stage 6):** for every card, record the pair (`advisorySupport`, human verdict). **Human-verdict vocabulary (operational — amended 2026-07-19 alongside the [advisorySupport calibration design](2026-07-18-advisory-support-calibration-design.md), so the rubric and the model's flag share one definition and calibration measures the model, not rubric divergence):** `resolving` = the card's verbatim quote itself states the claim's current status as of after the claim's anchor year (the event happened; the date moved to a stated new timeframe; the plan was cancelled, superseded, paused, or failed; or the work is explicitly described as still pending at a later date); `related-only` = on-topic but non-resolving — including *expectation echoes* (quotes restating the claim's own timeframe as still planned) and *lapsed intermediate projections* (a stated new date that has itself since passed); `unrelated` otherwise. (Batch 1's pairs were originally recorded as supports/related-only/unrelated and are re-annotated under this vocabulary in the batch-1 report's amendment — the re-annotated figures are the batch-2 comparison baseline.) Report a per-card **confusion matrix** (`advisorySupport` × verdict) with normalized rates, plus **cards-per-pack vs the prior batch** — a drop in proposed related cards alongside "better" calibration is the selection-loss signature and counts as a failure. No threshold is enforced by this protocol.

## 5. Reporting

Each batch produces `docs/plans/online-eval/batch-YYYY-MM-DD.md`: the selection (record ids + strata), the funnel table, per-record scores with claimKeys and pack ids, ledger spend (rows consumed, brave/neuron stats), and a findings list. Load-bearing findings additionally go to pitfalls + auto-memory per the three-layer rule.

## 6. Open questions for Sam (decide before the first batch)

1. **Re-run mechanism:** accept "one shot per revision" (batches compare across natural article-revision drift), or approve an explicit dev-only pack-deletion tool for eval claims (data-integrity surface — recommended only if batch-over-batch comparison proves too slow; the ledger's write-once no-double-count semantics mean a re-run at the same revision would reuse the existing ledger row rather than double-charging).
2. **Stratum membership:** the concrete 10-record list is proposed in the first batch report before any spend — approve or swap records there.
3. **Cadence:** proposed default is one batch after each research-quality change lands on dev (the referent-context PR is the natural first trigger), not calendar-driven.

## Appendix — reasoning trail

- **Why N=10, not all 30:** the constraint is not model cost but the *permanent* ledger row per pack and the 50/day global cap shared with real usage. 10 gives per-stratum signal (4/4/2) while keeping a full batch under a fifth of the daily cap. Rejected: N=30 "run everything" — burns 60% of a day's cap for marginal signal beyond the strata, and makes batch-over-batch comparison three times as expensive.
- **Why drive the real capture→enqueue→queue path instead of a bespoke eval harness:** a harness invoking `researchClaim` directly (Workers AI REST + Brave key locally) would bypass the eligibility gate, the consumer's quota accounting, and the exact prompt/config the product runs — measuring a sibling pipeline, not the product. Rejected for fidelity; the price is the mint dependency and the capture throttle pacing.
- **Why judged stages at all (vs fully automated scoring):** stage 5's question — "does this quote state the gold current state?" — is precisely the judgment the product reserves for humans (the support-checking guardrail makes the machine's view advisory). Automating it with an LLM judge would put a model in the referee's chair for a metric whose purpose is to audit models. Deterministic assists (URL canonicalization, quote presence) narrow the judgment; they don't replace it.
- **Why funnel stages for corpus rot:** in the 2026-07-12 pack review, interpretation effort was wasted distinguishing "pipeline failed" from "input differed." Recording stages 1–2 makes the denominator explicit.
- **Uncertainty — live-revision drift rate:** unknown what fraction of the 30 evidenced claims still exist verbatim on live Wikipedia (~4 weeks after corpus verification). If stage-1 match drops below ~6 of 10, the batch loses power; the mitigation is swapping in other gold records at selection time, and the drift rate itself is a finding worth recording.
- **Uncertainty — capture-side surrounding text:** live capture re-detects candidates, so post-PR-#53 rows carry `surroundingText`; gold fixtures pre-date it. Stage-3 scoring should note whether the enqueued input actually carried context (it will for freshly captured articles), so query-quality deltas attribute to the feature, not to chance.
