# Session handoff — PR-B/PR-C shipped + released; eval loop next — 2026-07-18

## Headline state

- **Prod == dev.** Release [PR #45](https://github.com/scarson/wiki-as-of-now/pull/45) promoted everything; live at https://wikinow.scarson.io (all pages 200; D1 migration `0009` applied to production, `quota_ledger.user_id` verified nullable). Dev preview: https://wiki-as-of-now-dev.samuel-carson.workers.dev (auto-deploys every dev push).
- **Branch namespace is CLEAN.** 30 remote + 13 local branches and 7 worktrees deleted this session after per-branch merged/superseded verification (recovery SHAs in the session transcript). Remaining: `dev`, `main`, and the `laughing-chaplygin-ce1c13` worktree (35 uncommitted files of unknown provenance — left for Sam; do NOT delete or reuse it).
- **No worktree is prepared for the next session.** Start by creating one: `git worktree add .claude/worktrees/<slug> -b <branch> origin/dev` + `pnpm install --frozen-lockfile`.
- **Suites:** 957 node + 46 workers tests green at dev tip.

## What shipped this session (PRs #38–#45, all merged)

- **#38** beads runtime-config drift committed (dev working tree cleaned).
- **#39 PR-C** — Wikipedia deep links: `src/wikipedia/article-url.ts` helpers (TDD), worksheet linked title (+`title` column in `loadWorksheetView`), queue/article-page links + keyboard guard. **#40** plan merge-SHA record.
- **#41** release 1 (PR-C batch → prod).
- **#42 PR-B** — privacy + account deletion, executed against [the plan](2026-07-13-privacy-and-account-deletion-plan.md) with all 10 round-2 findings addressed. Policy decision resolved **option A (disclose)** — Sam-delegated; rationale in the [design's](../design/2026-07-13-privacy-and-account-deletion-design.md) Appendix ("Disclose the stored Google identifier vs. stop storing it"). Codex found a real P1 (SameSite=Lax sibling-subdomain CSRF) + P2 (replay-guard race) — both fixed with tests.
- **#43** — `/privacy` 500'd on the deployed worker only: worker bundle has **no filesystem outside the app tree**. Fixed by build-time inline via `next.config.ts` `env`. Pitfall **CI-4** in [implementation-pitfalls](../pitfalls/implementation-pitfalls.md); auto-memory `workerd-bundle-no-fs`.
- **#44** — alpha polish batch: 16 verified findings fixed (origin guards on quota-spending routes via shared `src/auth/origin-guard.ts`, batch cap 50 + dedupe + client chunking, feedback 500-vs-400 fix, `sourceRevisionId` validation, NavAuthChip alert lifecycle, empty-`§` guard, clipboard failure feedback, palette-consistent error banner, exact-height banner reservation, nav Privacy link, home/capture Wikipedia links, 4 docs-drift fixes). Sourced from a 5-lens Workflow hunt (22 opus agents; 17/17 findings survived adversarial verification).
- **#45** release 2 (PR-B + fix + polish → prod, migration 0009).

## Corrections to in-session chat claims

- The three `claude/corpus-rest-{a,b,c}` branches were reported in chat as "unmerged gold-corpus data." **Wrong on inspection:** every answer record AND every source transcription on them already exists on dev (re-landed via the corpus-pilot line; "full 32-record corpus complete" is merged). All three deleted (SHAs `691a06b`/`d41bbc4`/`f04d902`). **The corpus is complete on dev — no merge work remains.**

## Standing grants & working rules (Sam, this session — carry forward until revoked)

1. **Merge authority on everything, including dev→main releases.** Sam 2026-07-18: "You have merge authority on everything in this session until I say otherwise. Prod is an alpha deployment with no users but us." Releases no longer wait for a per-release go. Still flag D1 migrations prominently in release PR bodies. Product-behavior decisions (what a feature does, who can use it) are NOT covered — propose, don't unilaterally change.
2. **/codex gate on every code PR before merge** (standing grant since PR-A). Skipping is acceptable only for pure docs/config diffs — say so in the report. P1 → fix before merge; P2 → fix or justify.
3. **Workflow tool: standing opt-in.** Use it for discovery/review fan-outs; keep agent counts reasonable (~20 agents for a full-repo hunt was the accepted scale); **model routing: default `opus` for subagents (set `model: 'opus'` explicitly)**; adversarially verify every finding before acting on it (the verify stage is why 17/17 held up).
4. **Checkpointing discipline:** small CI-passing conventional commits, each logical unit its own commit; plans follow the Living Document Contract (claim banner → per-phase ship SHAs → Discoveries/Deviations → merge SHA); load-bearing findings go to all three layers (docs/pitfalls entry + auto-memory + plan Discoveries); end any substantial session with the handoff skill → `docs/plans/session-handoff-YYYY-MM-DD.md`.
5. **Communication:** plain-text questions only, never the AskUserQuestion tool. Bias to action — no mid-plan "should I continue?" checkpoints. Wrap-ups report DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT.
6. **Compliance invariants** ([wikipedia-genai-compliance](../policy/wikipedia-genai-compliance.md)): detection stays deterministic and LLM-free; audit log append-only. Read that doc before touching detection, research, LLM, audit-log, or citation code.

## Operational guardrails (accumulated; don't re-discover)

- Toolchain: `eval "$(fnm env)"` + `cd "$(git rev-parse --show-toplevel)"` at the start of every Bash call (cwd and env reset); tests via `node_modules/.bin/vitest run` (node pool) and `-c vitest.workers.config.mts` (workers pool); `bunx wrangler` never npx. Auto-memories: `toolchain-quirks`, `workerd-bundle-no-fs`, `git-base-dev`, `nextjs-force-static-cookies`.
- Codex mechanics: `source ~/.claude/skills/gstack/bin/gstack-codex-probe`; `codex review` with the filesystem-boundary preamble + "diff vs origin/dev" instruction; **redirect stdout to a unique temp file** (`/tmp/...-$$.txt` — the skill's `mktemp` template collided once); `_gstack_codex_timeout_wrapper 540`, Bash timeout 560000ms. Typical clean run ~4 min.
- CI waits: Monitor tool with a `gh pr checks <n> --json name,bucket` poll loop — never bash sleep. Before merging after a re-push, confirm the passing check is for the current head SHA (`gh pr view <n> --json headRefOid,statusCheckRollup`).
- Any fs-reading or bundling-sensitive route MUST be exercised under `pnpm exec opennextjs-cloudflare preview -- --port NNNN` before shipping — both builds passing proves nothing (pitfall CI-4).
- Live 500 debugging: `bunx wrangler tail --env dev --format json > file` then parse (pretty-printed multi-line JSON, not JSONL).
- D1 state checks: `bunx wrangler d1 execute DB --remote --env {dev|production} --json --command "..."`.
- `gh pr merge --merge` (never squash/rebase); `--delete-branch` fails while `dev` is checked out in a worktree — delete the remote branch manually with `git push origin --delete <branch>`.

## Priority queue (next session)

1. **Detector recall floor + tuning** — the eval harness ALREADY EXISTS: `test/detector/precision.test.ts` (gate ≥ 0.9, enforced) and `test/detector/recall.test.ts` (report-only; its header says "no hard floor — Task 2.2 sets that"). Read [ground-truth-corpus design](../design/2026-06-21-ground-truth-corpus-design.md) + [build plan](2026-06-21-ground-truth-corpus-build-plan.md) first, find Task 2.2's intent, run the recall report, set the floor, then work the misses it exposes (marker set / suppression / scoring — deterministic changes only, precision gate stays green).
2. **Research-answer eval** — `test/gold/answers.json` (32 Sam-verified answer records + source transcriptions under `test/gold/sources/`) is consumed by NO eval today; it exists to judge the research pipeline's outputs. Check the build plan for its intended eval phases; build the research-side eval. Also qualitatively review the existing live packs on dev D1 (a handful of `quota_ledger` rows exist) against their sources.
3. **Anonymous capture throttle** — `POST /api/queue/capture` still triggers live Wikimedia fetches + DB writes with no gate or rate limit (the one polish finding deliberately not fixed). Default: add a modest per-IP throttle that keeps anonymous capture open (no product-behavior change → within grant; Review-classified, codex-gated). Auth-gating instead is Sam's call — flag in the report.
4. **Authed test path (design first, Sam sign-off BEFORE implementing)** — authed flows (enqueue, delete) can only be live-QA'd by Sam because oauth mode disables the admin-header fallback (`src/auth/current-user.ts`). Design a dev-environment-only session-mint (e.g. gated by `ADMIN_SECRET`, config absent from prod entirely). Auth surface → explicitly outside the autonomous grant.
5. **Research pack end-to-end quality review** — enqueue a fresh candidate and read the pack critically against sources. Blocked on a signed-in session (item 4, or Sam-assisted).

## Owed by / waiting on Sam

- **Deletion-flow QA on prod** (sign in → Delete account → confirm gone + signed out; re-login mints a fresh account). Only Sam can.
- **`laughing-chaplygin-ce1c13` worktree disposition** — 35 uncommitted files; inspect or authorize deletion.
- **Capture preference** — throttle (default, will proceed) vs auth-gate.

## Seams

- The **capture throttle (item 3)** and the **authed test path (item 4)** both touch request-gating code near `src/auth/` — if both proceed, sequence them (throttle first; it's independent) rather than parallel-branching over the same files.
- **Item 5 depends on item 4** (or on Sam lending a session). Don't burn metered quota on repeated end-to-end runs — the global daily cost cap counts every `quota_ledger` row, and rows are never deleted.
- The polish-hunt Workflow script lived in the (ephemeral) session directory and is gone with it. The pattern that mattered: N lens-scoped finder agents → schema'd findings → one adversarial verifier per finding, `model: 'opus'` throughout. Re-derive from this description; don't hunt for the file.

## Continuation prompt (paste-ready)

> WikiAsOfNow (Cloudflare Workers + Next 16; prod alpha live at https://wikinow.scarson.io, users = Sam + Claude only). **FIRST read `docs/plans/session-handoff-2026-07-18.md`** — it has the full state, grants, and guardrails; this prompt is the summary.
>
> **State:** prod == dev (release PR #45; migration 0009 applied and verified). 957 node + 46 workers tests green. Branch namespace clean (only `dev`/`main` remote). Create a fresh worktree: `git worktree add .claude/worktrees/<slug> -b feat/<topic> origin/dev` then `pnpm install --frozen-lockfile`. Do NOT touch the `laughing-chaplygin-ce1c13` worktree (uncommitted unknown work, Sam's to triage).
>
> **Working mode (Sam's standing grants, until revoked):** you have merge authority on everything including dev→main releases — prod is an alpha; still flag D1 migrations prominently in release PRs, and product-behavior changes (who can use what) remain propose-first. Feature PRs target `dev` (never main directly); conventional commits; `gh pr merge --merge` (never squash); PR bodies carry `## Merge classification`; delete remote branches manually after merge. Every code PR gets a **/codex review** before merge (stdout to a unique `$$`-suffixed temp file, 540s timeout wrapper, 560000ms Bash timeout; P1 = fix before merge). **TDD** for all production code — failing test observed red first, both vitest pools. **Workflow tool is standing-approved** for discovery/review fan-outs: keep it to ~20 agents for a full hunt, set `model: 'opus'` on subagents explicitly (Sam's default routing), and adversarially verify every finding before acting. **Checkpointing:** small CI-passing commits; plans follow the Living Document Contract (claim banners, per-phase ship SHAs, Discoveries/Deviations, merge SHA); load-bearing discoveries go three places (docs/pitfalls + auto-memory + plan); end the session with the handoff skill. Questions to Sam in plain text only (never the AskUserQuestion tool); don't stop mid-plan to ask permission to continue. Compliance invariants are sacrosanct (`docs/policy/wikipedia-genai-compliance.md`): detection deterministic/LLM-free, audit log append-only — read it before touching detection/research/audit code.
>
> **Toolchain (memories: `toolchain-quirks`, `workerd-bundle-no-fs`):** every Bash call starts `eval "$(fnm env)"` + `cd "$(git rev-parse --show-toplevel)"`; tests via `node_modules/.bin/vitest run` and `-c vitest.workers.config.mts`; `bunx wrangler` never npx; CI waits via the Monitor tool polling `gh pr checks` (never sleep), and re-verify the head SHA before merging after a re-push; any fs-reading/bundling-sensitive route must be proven under `opennextjs-cloudflare preview` (real workerd) before shipping; dev preview lives at https://wiki-as-of-now-dev.samuel-carson.workers.dev; D1 via `bunx wrangler d1 execute DB --remote --env {dev|production} --json`.
>
> **Priority queue:**
> **1. Detector recall floor + tuning.** The harness exists: `test/detector/precision.test.ts` (enforced ≥ 0.9 gate) and `test/detector/recall.test.ts` (report-only — "no hard floor; Task 2.2 sets that"). Read `docs/design/2026-06-21-ground-truth-corpus-design.md` + `docs/plans/2026-06-21-ground-truth-corpus-build-plan.md` (find Task 2.2), run the recall report, set the floor, then fix what the misses expose — marker/suppression/scoring changes only (deterministic; precision gate must stay green). The gold corpus is COMPLETE on dev (32 records in `test/gold/answers.json`; the old corpus-rest branches were superseded and deleted).
> **2. Research-answer eval.** `test/gold/answers.json` + `test/gold/sources/` are Sam-verified research ground truth consumed by no eval today. Check the corpus build plan for the intended eval phases and build the research-side eval; also qualitatively review the existing packs on dev D1 against their sources.
> **3. Anonymous capture throttle.** `POST /api/queue/capture` does live Wikimedia fetches + DB writes with no gate or rate limit. Add a modest per-IP throttle that keeps anonymous capture open (Review-classified, codex-gated, TDD). Auth-gating instead is Sam's product call — flag it.
> **4. Authed test path — design ONLY, Sam sign-off before implementing.** Authed flows can't be QA'd by agents (oauth mode disables the admin-header fallback in `src/auth/current-user.ts`). Design a dev-env-only session-mint (e.g. `ADMIN_SECRET`-gated, config absent from prod). Auth surface = outside the autonomous grant.
> **5. Research pack end-to-end quality review** — blocked on item 4 or a Sam-lent session; mind the metered global daily cost cap (ledger rows are never deleted).
>
> **Owed by Sam (remind, don't block):** prod deletion-flow QA (sign in → Delete account → verify); `laughing-chaplygin-ce1c13` worktree triage; capture throttle-vs-gate preference.

## Adversarial review rounds

- **Round 1 — naive fresh agent — 3 findings applied:** added the worktree-creation command (no prepared worktree exists — earlier draft assumed one); expanded "codex gate" with concrete mechanics instead of the bare skill name; spelled out where the eval harness files live rather than "the eval harness".
- **Round 2 — recency-bias audit — 2 findings applied:** restored the early-session items (beads drift #38, PR-C #39–#41) to the shipped list, which the first draft compressed away; added the PR-B option-A decision *location* (design Appendix) so the rationale is findable without the transcript.
- **Round 3 — seam auditor — 2 findings applied:** added the item-3/item-4 file-collision seam (both touch auth-adjacent gating); added the quota-cap warning on repeated end-to-end research runs (ledger rows are permanent, the global cap counts all of them).
- **Round 4 — operational guardrails auditor — 1 finding applied:** the head-SHA-before-merge check (learned when #44's CI raced a re-push) was only in the transcript; added to guardrails + prompt.
- **Round 5 — loss-averse auditor — 2 findings applied:** documented the corpus-branch correction explicitly (chat said "unmerged data"; inspection proved superseded — a future reader of the chat log would otherwise hunt for deleted branches); noted the polish-hunt Workflow pattern since its script file dies with the session directory.
- **Round 6 — autonomy-grant boundary auditor (session-specific: this session's character was Sam progressively widening delegation) — 3 findings applied:** made the grant's edges explicit in both rules and prompt (migrations still flagged, product-behavior changes propose-first, auth surface excluded); reclassified item 4 from "build it" to "design only, sign-off required"; capture item states its default and the escape hatch rather than presenting a blocked question.
- **Round 7 — top-to-bottom coherence pass — 1 finding applied:** the priority queue in the doc body and the prompt had drifted (body said "merge corpus first" from the pre-correction draft); aligned both to the corrected five items. Final full pass: zero material findings.
