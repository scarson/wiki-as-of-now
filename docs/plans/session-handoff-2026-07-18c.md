# Session handoff — claim referent context shipped + released; online-eval protocol designed — 2026-07-18 (third session)

Successor to [session-handoff-2026-07-18b.md](session-handoff-2026-07-18b.md) (same day; this session executed its priority-queue items 1, 2, and 4). The standing grants/toolchain sections in [session-handoff-2026-07-18.md](session-handoff-2026-07-18.md) all still hold.

## Headline state

- **Prod == dev again.** Release [PR #56](https://github.com/scarson/wiki-as-of-now/pull/56) (merge `de30d32`) promoted PRs #53 + #55 — **carries D1 migration 0010** (`stale_candidates.surrounding_text`, additive nullable). Prod deploy succeeded; smoke passed: all pages 200; `surrounding_text` confirmed present on prod D1; **live prod capture exercised** (the candidate INSERT now requires the column — Zumwalt capture returned 3 candidates with populated `surroundingText`).
- **Suites at dev tip (`86d67e8`):** 997 node + 63 workers green at this session's PR #53 tip; tsc + eslint clean. (The concurrent PR #52 merge moved the dev-tip baseline to **988 node + 65 workers** — see the corrected PR-numbering seam below.)
- **Branch namespace:** `dev`/`main` remote plus this handoff's `docs/handoff-0718c`. Session branches (`feat/research-input-context`, `docs/online-eval-protocol`) merged and deleted.
- **Worktrees:** this session used `.claude/worktrees/wikinow-session-handoff-4918e3` (harness-created; safe to delete after this branch merges). `laughing-chaplygin-ce1c13` remains untouched — still Sam's to triage.

## What shipped this session

- **[PR #53](https://github.com/scarson/wiki-as-of-now/pull/53) — claim referent context** (handoff-b queue items 1 + 2, merged to dev `fdfd2f4`):
  - Detector captures `surroundingText` per candidate: the claim + up to one adjacent sentence per side, section-bounded, **neighbor omitted (never truncated) over 1000 code points**; null when the claim stands alone. Deterministic — the detection-stays-deterministic guardrail (G10) untouched.
  - **Migration `0010_candidate_surrounding_text.sql`** + schema.sql byte-parity (see pitfall DB-3, new this session).
  - `articleTitle` (inner-join from `articles` in `getCandidateById` → new `CandidateWithTitle`) + `surroundingText` threaded into `ResearchInput` at **all three build sites**: the composed gate (single + batch routes) and `selectResearchSeeds`. Null passage ⇒ optional field *absent* (no JSON null on queue messages). `claimKey` unchanged — context is not claim identity.
  - Gemma query-gen + triage prompts share a `claimBlock` with `Article:`/`Context:` lines as data, **whitespace-flattened** so article text can't forge prompt line structure.
  - Both query bounds of the bounded-LLM-role guardrail (G9) — pipeline `applyQueryBound` (authority) and the provider self-bound (pre-search cost saver) — now also drop `[placeholder]` template residue (`hasPlaceholderResidue`) and full context-sentence echoes (`echoesContextSentence`), a lifted assertion being the same neutrality violation as a claim restatement.
  - **Live-verified on dev:** capture of "Zumwalt-class destroyer" → 3 candidates with populated `surrounding_text`; the flagged gun-removal claim carries its preceding railgun-funding sentence — exactly the referent Gemma was missing.
- **[PR #55](https://github.com/scarson/wiki-as-of-now/pull/55) — online-eval protocol design** (queue item 4, docs only): [2026-07-18-online-eval-protocol-design.md](../design/2026-07-18-online-eval-protocol-design.md). Batches of 10 stratified gold records (4 pronoun-subject / 4 named-entity control / 2 messy-sourcing) through the real capture→enqueue→queue path on dev; funnel-staged scoring; advisorySupport calibration pairs captured per card (this **absorbs queue item 5's** data-collection half). **No spend until Sam signs off its §6 open questions.**
- **[PR #56](https://github.com/scarson/wiki-as-of-now/pull/56) — release** of the above to prod (migration 0010).
- **Pitfall DB-3** added to [implementation-pitfalls](../pitfalls/implementation-pitfalls.md): `ALTER TABLE ADD COLUMN` forces the verbatim `, col TYPE)` splice in schema.sql (byte-parity is against `sqlite_master`'s stored text). TOC + summary table + changelog updated.
- **Auto-memories updated:** `research-pack-quality-pattern` (fix shipped + how it gets measured), `toolchain-quirks` (the `fnm use` requirement — see guardrails).

## Codex review of PR #53 — how the P1s were handled (read before touching these prompts)

Codex returned 2×P1 + 1×P2. Applied: context-echo filter in both bounds (P1), 1000-code-point neighbor bound (P2), whitespace-flattening of prompt data lines (the actionable kernel of the "instruction channel" P1). **Documented residual, not a bug:** claim context sharing the single-string prompt with instructions is inherent to the feature handoff-b pre-approved and identical in kind to the pre-existing `claimText` interpolation; mitigations are the established ones (data labeling, deterministic output bounds, in-set URL filter, verbatim check, human-open gate) and there is no second channel in the Workers AI text seam. Full reasoning in the PR #53 body. A future reviewer re-flagging this should argue with that written decision, not rediscover it.

## Seams

- **Pre-migration candidate rows have NULL `surrounding_text`** until their page is re-captured (capture replaces a page's candidate set). Research quality improvements apply only to *freshly captured* articles; the online eval's protocol §3 step 2 (capture before enqueue) handles this for eval runs. Don't read old dev packs as evidence about the new pipeline.
- **The eval protocol's attribution note:** stage-3 query-quality scoring should record whether the enqueued input actually carried context (protocol appendix, last bullet) — otherwise feature-vs-chance attribution is muddy.
- **One shot per (claimKey, sourceRevisionId):** packs are write-once and seeder/consumer skip existing ones — an eval batch is a measurement *point*; re-runs need natural revision drift or Sam approving a dev-only pack-deletion tool (protocol §6 Q1 — data-integrity surface, deliberately not decided by the agent).
- **This handoff's branch targets dev**, so prod tip `de30d32` doesn't contain it (same benign skew as handoff-b noted for itself).
- **PR numbering — CORRECTED (this doc originally called the gap "GitHub numbering"):** [PR #52](https://github.com/scarson/wiki-as-of-now/pull/52) (capture rate limit moved to the Workers Rate Limiting binding, Sam-approved) and its release [PR #54](https://github.com/scarson/wiki-as-of-now/pull/54) were merged by a **concurrent session** mid-session here. Consequences: the suite baseline moved to **988 node + 65 workers** (the 11 in-memory throttle unit tests were deleted with the module; binding tests are workers-pool); handoff-b's description of the throttle as "in-memory per-isolate" is superseded by the binding design (correction log in [capture-throttle design](../design/2026-07-18-capture-throttle-design.md)); and the release PR #56 above sat on top of #52's already-released changes. Two sessions merging to dev concurrently worked out cleanly this time (no file overlap), but the collision risk is real — check `gh pr list` for in-flight PRs at session start.
- **Smoke residue:** the Zumwalt-class destroyer article was captured on BOTH dev and prod this session as the end-to-end smoke (3 candidates each at live revision `1358444594`, `surrounding_text` populated). Normal product-flow rows, not test pollution — but a future D1 reader should know why they're fresh.

## Blocked / owed by Sam (unchanged from handoff-b unless noted)

- **ADMIN_SECRET value for dev** (`~/.wikinow/dev-admin-secret`, `chmod 600`, or approve rotation) — still absent (checked this session); blocks live authed QA **and now also the first online-eval batch** (protocol §3 step 1).
- **Online-eval §6 sign-off** (NEW) — re-run mechanism, first-batch record list, cadence: [protocol design §6](../design/2026-07-18-online-eval-protocol-design.md). No metered spend until then.
- **Capture throttle-vs-auth-gate preference** (standing).
- **Prod deletion-flow QA** (standing; mint is dev-only by design).
- **`laughing-chaplygin-ce1c13` worktree triage** (standing).

## Priority queue (next session)

1. **Live authed QA on dev** (handoff-b item 3; runbook in handoff-b §Ready-to-dispatch) — blocked on the ADMIN_SECRET value.
2. **First online-eval batch** — blocked on Sam's §6 sign-off AND the secret. Once both land: follow protocol §3; write `docs/plans/online-eval/batch-YYYY-MM-DD.md`.
3. **advisorySupport calibration analysis** — blocked on batch data (the protocol captures the pairs; the analysis + any threshold/prompt change is the follow-on).
4. **Optional, unblocked:** re-capture campaign for high-value dev articles to backfill `surrounding_text` (anonymous capture, throttled 10/60s per IP — pace it). Low priority; fresh captures self-heal.

## Operational guardrails accumulated (beyond handoff-b's — those all still hold)

- **`fnm use` after `eval "$(fnm env)"` in EVERY node Bash call** — `fnm env` alone activates the default Node 26; the repo pins 24 (`.nvmrc`), and better-sqlite3's prebuilt binary is Node-version-locked. Mismatch symptom: whole node pool fails with `NODE_MODULE_VERSION 137 vs 147`. Also applies to the initial `pnpm install`. (Memory `toolchain-quirks` updated.)
- **`codex review --base <branch>` rejects a prompt argument** (installed CLI): use prompt-only `codex review "<preamble + 'diff vs origin/dev'>"`.
- **zsh: `===` as an echo/argument token errors ("== not found")** — quote separators in compound commands.
- The release PR's inherited `deploy` check (from the head SHA's dev push) appeared again on #56 — expected, per handoff-b guardrails.

## Continuation prompt (paste-ready)

> WikiAsOfNow (Cloudflare Workers + Next 16; prod alpha at https://wikinow.scarson.io). **FIRST read `docs/plans/session-handoff-2026-07-18c.md`** — state, seams, and the priority queue. Its predecessors carry the standing grants/toolchain (`session-handoff-2026-07-18.md` §Standing grants + §Operational guardrails; all still hold: merge authority incl. releases, codex gate on code PRs (prompt-only invocation — `--base` rejects a prompt), TDD both pools, Workflow standing-approved ~20 agents `model:'opus'` + adversarial verify, plain-text questions, compliance contract sacrosanct, Monitor for CI waits, never name a Monitor variable `status`). **Every node Bash call: `eval "$(fnm env)"; fnm use` + `cd "$(git rev-parse --show-toplevel)"`** — fnm env alone gives Node 26, repo pins 24, better-sqlite3 breaks otherwise.
>
> **State:** PR #53 (claim referent context: surroundingText capture + migration 0010 + prompt context + query-bound hardening) and #55 (online-eval protocol doc) merged to dev; release PR #56 promoted both to prod (deploy succeeded; smoke passed incl. a live prod capture — details in the handoff headline). 997 node + 63 workers green at dev tip. Only `dev`/`main` remote. Fresh worktree: `git worktree add .claude/worktrees/<slug> -b feat/<topic> origin/dev` + `pnpm install --frozen-lockfile` (with fnm use first). Don't touch `laughing-chaplygin-ce1c13`.
>
> **Queue:** (1) live authed QA via POST /api/dev/mint-session — BLOCKED on Sam's dev ADMIN_SECRET value in `~/.wikinow/dev-admin-secret` (runbook: handoff-b §Ready-to-dispatch); (2) first online-eval batch per `docs/design/2026-07-18-online-eval-protocol-design.md` — BLOCKED on Sam's §6 sign-off + the same secret; metered (10 permanent ledger rows/batch, global cap 50/day); (3) advisorySupport calibration analysis — blocked on batch data; (4) optional unblocked: re-capture campaign to backfill surrounding_text (anonymous, throttle-paced).
>
> **Owed by Sam (remind, don't block):** dev ADMIN_SECRET value (or approve rotation); online-eval protocol §6 sign-off; throttle-vs-auth-gate preference; prod deletion-flow QA; laughing-chaplygin triage.

## Adversarial review rounds

- **Round 1 — naive fresh agent — 2 findings applied:** bare guardrail numbers ("G9", "G10") replaced with name-plus-anchor references per the compliance doc's own referencing rule; the context-echo bound got its one-line rationale inline instead of assuming the reader knows why an echo is a violation.
- **Round 2 — recency-bias audit — 0 material findings:** mid-session decisions (passage format, null-elision, claimKey identity, the three enqueue sites) were already in the shipped list; the branch-switch working-tree scare was transient with no durable impact.
- **Round 3 — seam auditor — 1 finding applied:** the prod smoke plan was extended to exercise a live capture, because the candidate INSERT now requires the new column — deploy-applies-migrations-first makes it safe in theory, and the smoke proved it in practice (recorded in the headline).
- **Round 4 — operational guardrails auditor — 0 findings:** the three new guardrails (`fnm use`, codex prompt-only invocation, zsh `===`) were already routed to the guardrails section, the continuation prompt, and (for fnm) the `toolchain-quirks` memory before review began.
- **Round 5 — loss-averse auditor — 2 findings applied:** the pitfalls TOC/summary-table drift was only half-fixed (DB row updated, CI row and missing CI-3/CI-4 appendix rows were not) — completed; the Zumwalt smoke residue on both environments' D1 was transcript-only — added to seams.
- **Round 6 — compliance/prompt-surface auditor (session-specific: first Gemma prompt change since the compliance contract) — verified, 0 changes:** confirmed `surroundingText` persists only as deterministic source text on candidates (never model output); packs still store only queries/cards/dispositions per the logging the bounded-LLM-role guardrail requires; audit payloads unchanged (codes only); the privacy statement "only public web content and the editor's queries go to the LLM provider" still holds (the passage is public Wikipedia content). The codex-residual paragraph exists precisely so a future reviewer argues with a written decision.
- **Round 7 — top-to-bottom coherence pass — 1 finding applied:** the headline's smoke placeholder was still unfilled at first pass (deploy hadn't finished); filled with the verified results before commit. Final full pass: zero material findings.
