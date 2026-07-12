<!-- ABOUTME: Session handoff for the go-live campaign (2026-07-12) — headline state, in-flight work, seams, guardrails, continuation pointer. -->
<!-- ABOUTME: The living plan (2026-07-12-go-live-plan.md) is authoritative for task state; this doc carries session context the plan doesn't. -->

# Go-live session handoff — 2026-07-12 (~06:45Z)

**Authoritative task state:** [docs/plans/2026-07-12-go-live-plan.md](2026-07-12-go-live-plan.md) — per-phase Execution Status banners are current as of this handoff. Read its **Discoveries** + **Deviations** first. This doc adds only what the plan doesn't carry: session context, seams, guardrails, cleanup inventory.

## Headline state

- **Branch:** `chore/go-live`, 13 commits ahead of `origin/dev` (e66c444), **pushed**. Suite green: 947 node + 27 workerd, tsc + eslint clean. No PR opened yet (that's plan Task 3.6, deliberately after the dev smoke passes).
- **Worktree:** `.claude/worktrees/go-live` (deps installed). A second worktree `laughing-chaplygin-ce1c13` is NOT ours — 35 uncommitted gold-corpus changes from an older session; do not touch, surface to Sam in the final report.
- **Phases:** 1 ✅ (repo fixes) · 2 ✅ (provisioned + migrated) · 3 🚧 (dev live + bootstrapped + partial QA; research smoke BLOCKED-ish, see below) · 4–7 ⬜.
- **Dev env LIVE:** https://wiki-as-of-now-dev.samuel-carson.workers.dev (app + research workers, secrets set, 5 easy-win articles captured, lane surfaces 5/5, worksheets render). Production still serves the old "Hello world" scaffold at https://wikinow.scarson.io — expected until Phase 4.

## The one open problem (start here)

Dev research smoke (plan Task 3.5): every research attempt still ends `research.unavailable`. Three real live-model defects were already found and fixed via TDD (see plan Discoveries: OpenAI-compat envelope `0240ec0`, chat-vs-prompt mode `5faa733`, thinking-burn budget 4096 tokens/60 s `bc05a5b`), each verified against live Gemma via a probe worker. After the LAST deploy (version `5694e670`, ~06:35Z) attempts at 06:41–06:42Z still failed with ~15 s gaps — **too fast for a 4096-token generation**, so either (a) the queue consumer was still on the previous version (propagation lag), or (b) a different failure class remains.

**The next action is cheap and decisive** — codes-only telemetry is now deployed at the AI seam (`a1a0057`):

```bash
cd /Users/sam/Code/wiki-as-of-now/.claude/worktrees/go-live
bunx wrangler tail --env dev -c workers/research/wrangler.jsonc --format json > /tmp/tail.jsonl 2>&1 &
# re-put ADMIN_SECRET (the old value lived in the dead session's scratchpad):
openssl rand -base64 32 > /tmp/admin.txt
tr -d '\n' < /tmp/admin.txt | bunx wrangler secret put ADMIN_SECRET --env dev
curl -sS -H "x-admin-secret: $(cat /tmp/admin.txt)" -X POST https://wiki-as-of-now-dev.samuel-carson.workers.dev/api/research/8   # → 202
# wait ~1-2 min, then read /tmp/tail.jsonl:
#   research.ai_call.failed {reason: <ErrorClassName>}  → the AI call itself rejects; reason names the class
#   research.ai_call.empty  {finish: "length"}          → thinking STILL burns 4096 → raise budget or bound thinking
#   research.completed                                   → it works; verify pack per plan Task 3.5 Step 5
```

(Header-in-argv caveat: `$(cat …)` in the curl header is visible in local `ps` — acceptable for a throwaway dev admin secret you just generated; use a curl `-K` config file if you prefer the stricter pattern.)

Also check first whether packs already exist (`SELECT COUNT(*) FROM research_packs` on dev) — the last enqueues went out ~1 min after the fixed deploy and may have succeeded after version propagation. If a real pack exists (queries>0, model `@cf/google/gemma-4-26b-a4b-it`): the smoke is PASSING — do plan Task 3.5 Step 5 verification and move on.

If Gemma's thinking proves unboundable within sane budgets, the sanctioned fallbacks (in order): probe whether the binding accepts a thinking-control param (none documented — probe empirically); raise maxTokens+timeout once more (cost ~$0.0012/call at 4096); or escalate to Sam about switching the primary model (`MODEL_CONFIG.escalationModel` kimi-k2.6 exists but swapping primaries is a design decision — Review trigger).

## What shipped this session (pointers, not narrative)

- **Plan:** `docs/plans/2026-07-12-go-live-plan.md` (5-round adversarially-reviewed; Living Document Contract active).
- **Commits on `chore/go-live`** (each TDD'd where production code): vitest worktree exclude `cd23036`; deploy.yml env-guard + migrate-by-binding `d5107f2` (root cause: `secrets` context rejected in ANY `if:` — every Deploy run failed at 0 s since June; pitfalls CI-1 corrected, it prescribed the broken pattern); custom domain + APP_ORIGIN `79378da`; runbook corrections `854d2d0`; real D1 ids + CC-10 id-equality drift guard `83a5686`; dev provider flip `8b78d24`; **non-inheritable env bindings** `dd76acb` (wrangler drops `ai`/`images` from named envs — the first env deploy shipped a research worker with NO AI binding; config comments claiming inheritance were provably false and corrected); Gemma envelope `0240ec0`; chat mode `5faa733`; AI-seam telemetry `a1a0057`; thinking budget `bc05a5b`; plan checkpoints `14921d3`/`8619a85`.
- **Pitfalls:** new §6 AI-1 (validate live model envelope/input-mode/reasoning-budget); CI-1 rewritten with empirical truth.
- **Memory:** `toolchain-quirks` (cwd-reset + wrangler CLI forms), `v1-build-status` (campaign state), `plan-review-golive` (review-pattern observations).
- **Cloudflare account state:** dev D1 `9f4d0701-ecb7-428b-a3a2-0222aa7e2a4a`, prod D1 `aa530ffb-16bf-4ab2-8f22-04f2dcc03922` (both migrated, 9 tables); queues `research[-dlq][-dev]` ×4; workers `wiki-as-of-now-dev` + `wiki-as-of-now-research-dev` deployed; dev secrets SET (SESSION_SECRET, ADMIN_SECRET app-side; BRAVE_API_KEY research-side — values were session-scratchpad-only, regenerate+re-put ADMIN_SECRET when needed, Brave key re-pipeable from `brave_api_key.txt`).

## Seams a fresh agent must know

1. **deploy.yml is armed and now VALID.** The moment anything merges to `dev`, the Deploy workflow fires and redeploys the DEV env via CI (repo secrets set 2026-06-29). Green-but-skipped ≠ green-and-executed: verify with `gh run view <id> --log | grep -A2 "Apply D1 migrations"` (plan Task 3.6 Step 3). Its first green EXECUTED run is the empirical proof of the `d5107f2` fix.
2. **The go-live PR (Task 3.6) must not open/merge until the dev research smoke passes** — the branch contains the compliance-relevant AI-seam changes and the plan treats the smoke as their verification.
3. **Production deploy (Phase 4) replaces the scaffold on wikinow.scarson.io** — deploy workers BEFORE their secrets (non-interactive secret-put on a nonexistent worker fails); GOOGLE_* go to production ONLY (dev origin isn't a registered redirect URI).
4. **Production provider flip + cron are separate later PRs off updated dev** (plan Phases 5–6, fresh worktrees `chore/provider-flip`, `chore/research-cron`). Cron interval justification is STALE — plan Phase 6 banner says re-derive from observed smoke timings.
5. **Main checkout** sits on clean `dev` (e66c444) and still lacks the vitest exclude until realigned post-merge — a bare `vitest run` there sweeps worktree copies and shows phantom failures.
6. **Candidates 8/9 dev messages** may be sitting in `research-dlq-dev` (retries exhausted pre-fix, ×3 storms) — fresh enqueues are the retry mechanism; the DLQ contents are inert and purgeable at Phase 7.

## Operational guardrails accumulated (also in toolchain-quirks memory)

- **`cd` into the worktree in EVERY Bash call** — cwd resets to the main checkout between calls; three failures this session came from commands silently running against stale main-checkout configs.
- `wrangler tail <name> --env dev` double-suffixes the name → use `-c workers/research/wrangler.jsonc --env dev`; JSON tail to a file (pretty-printed multi-JSON, not JSONL); `queues info <literal-name>` (no --env); `d1 execute … --json` → `[{results}]`.
- Secrets: stdin-pipe from files only; `secret list` shows names only. Credential files in repo root are git-excluded via `.git/info/exclude` (removal is a Phase 7 step).
- Gate chains honestly: check the FULL vitest summary line, never `tail -3`/grep side-effects (one red suite nearly slipped through mid-session; testing-pitfalls §1 pristine rule bit twice — failure-path tests must spy/assert the new warns).
- Wikipedia-fetching endpoints: pace captures ~1/s; python needs a custom UA (Cloudflare 403s urllib's default).

## Cleanup inventory (Phase 7 of the plan carries these)

1. Delete repo-root credential files ×3 + `.git/info/exclude` block.
2. `bunx wrangler delete --name ai-probe-scratch` — diagnostic worker still deployed (carries a BRAVE_API_KEY secret copy).
3. Optionally purge `research-dlq-dev`.
4. Update memory (v1-build-status final), journal reflection, final report (labels + evidence). Surface: laughing-chaplygin worktree; SoFi 1960 DET-3 residual observed live.

## Visual-QA coverage honesty (plan Task 3.4)

Verified so far: desktop + dark theme only — global nav, queue lane load/summary/selection, anonymous-401 message, worksheet pre-pack rendering (stale marker + honesty banner + mono metadata). **Still owed:** mobile width + light theme passes; source-open gate exercise; "How this was researched →" link + transparency page (need a real pack); enqueue success toast (needs an authed enqueue that reaches 202 — exists — then lane re-render check).

## Adversarial review of this handoff

- **Round 1 — naive fresh agent:** 3 findings applied (added the ADMIN_SECRET regeneration into the next-action block — old value is unrecoverable; spelled out the packs-may-already-exist check; added prod-D1/dev-D1 ids inline).
- **Round 2 — recency bias:** 2 findings applied (the deploy.yml empirical-proof seam and the QA-coverage honesty section were under-documented relative to the late-session Gemma saga).
- **Round 3 — seam auditor:** 2 findings applied (main-checkout vitest phantom-failure seam; smoke-gates-the-PR ordering made explicit).
- **Round 4 — guardrails auditor:** 1 finding applied (gate-chain honesty rule persisted here + memory, it lived only in transcript).
- **Round 5 — loss-averse:** 2 findings applied (ai-probe-scratch worker + its secret copy; DLQ dead messages).
- **Round 6 — live-spend/live-state auditor (session-specific: this session mutated a real Cloudflare account):** 1 finding applied — enumerated every account-state mutation in one place (§What shipped → Cloudflare account state) so the next agent can reconcile `wrangler d1 list`/`queues list`/`deployments list` against expectations and spot drift; confirmed nothing else was created (no KV, no custom-domain changes yet, scaffold untouched).
- **Round 7 — top-to-bottom coherence re-read:** 0 findings. Exit.

## Continuation

The paste-ready continuation prompt is in the session's final chat message (per Sam's request) and is self-contained; this doc + the plan are its referenced artifacts.
