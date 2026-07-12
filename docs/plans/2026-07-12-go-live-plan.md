<!-- ABOUTME: Go-live implementation plan — takes the merged v1 app from "ready to deploy" to live at https://wikinow.scarson.io with the research cron enabled. -->
<!-- ABOUTME: Delta plan on top of docs/runbooks/go-live.md (which stays authoritative for ordering); adds the deploy.yml fix, domain/vars wiring, drift-test updates, bootstrap, QA. -->

# WikiAsOfNow Go-Live Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended for THIS plan — see §Execution strategy recommendation: live-credential state is session-bound) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy WikiAsOfNow (merged v1, PR #20) to Cloudflare — dev env verified end-to-end, production live at https://wikinow.scarson.io with Google OAuth, real Gemma+Brave research, content bootstrapped, and the research cron enabled LAST — leaving the site testable by anonymous users.

**Architecture:** Two Workers (OpenNext app worker `wiki-as-of-now[-dev]` + queue/cron research worker `wiki-as-of-now-research[-dev]`) sharing one D1 per env, connected by account-global queues (`research[-dev]` + DLQs). Ordering authority: `docs/runbooks/go-live.md` (provision → migrate → secrets → deploy dev → verify → deploy prod → smoke → purge stubs → flip provider → cron LAST). This plan adds the repo deltas that runbook execution surfaced: the deploy.yml startup failure, custom-domain/vars wiring, drift-guard test updates, the content-bootstrap step the runbook lacks, and live visual QA.

**Tech Stack:** Cloudflare Workers + D1 + Queues + Workers AI (Gemma `@cf/google/gemma-4-26b-a4b-it`), OpenNext/Next.js, wrangler 4.x via `bunx wrangler` (app build via `pnpm exec opennextjs-cloudflare` — pnpm 11.5.1 now on PATH at `/opt/homebrew/bin/pnpm`, matching `packageManager`), Brave Search API, vitest (node pool + workerd pool).

## Authorization note (Rule #1 record)

`scripts/provision.md` and `docs/runbooks/go-live.md` mark provisioning/deploy steps "Sam-only — no automated agent runs any command in this file." **Sam explicitly authorized agent execution of the full go-live in this session (2026-07-12):** "Your task is to finish the app to 'deployed to Cloudflare and testable by users'. You have merge authority on all PRs - no human review required… I generally don't want to have to intervene." Sam additionally answered the four go-live questions: Brave key + Google OAuth creds provided via repo-root files (delete after use, never commit), production URL `https://wikinow.scarson.io`, full go-live including cron. This grant is session-scoped; the runbook's Sam-only default stands for future sessions.

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

## Global Constraints

- **Compliance contract is inviolable** (`docs/policy/wikipedia-genai-compliance.md`): detection stays deterministic/LLM-free; audit log append-only; G11 safe-lane (easy_win only on the metered lane); codes-only audit rows (no PII).
- **Wrangler is `bunx wrangler`** (never `npx`). App-worker build/deploy is `pnpm exec opennextjs-cloudflare …`. Node via `eval "$(fnm env)"; fnm use 24`.
- **Secrets NEVER on a command line, in logs, in test output, or committed.** Put via stdin pipe from a file (`… | bunx wrangler secret put NAME …`) or interactive prompt. Credential source files: repo-root `brave_api_key.txt`, `google_oauth_clientid.txt`, `google_oauth_client_secret.txt` (git-excluded via `.git/info/exclude`; DELETE in Phase 7; never commit).
- **`RESEARCH_PROVIDER` var goes in per-env blocks ONLY, never top-level** of `workers/research/wrangler.jsonc` — the workerd vitest pool and CC-7 stub-default contract load the top-level config (`test/workers/test-env.ts:10-11`).
- **The cron is enabled LAST, production only, after provider flip + purge + smoke** (`docs/runbooks/go-live.md` steps 6–8).
- **Deploy commits follow Conventional Commits; every PR body carries `## Merge classification`.** Agent merges per Sam's session-wide grant; classification stays honest (`Review — …; merged by agent per Sam's 2026-07-12 session grant`).
- **deploy.yml text must never contain the substrings `triggers`, `crons`, or `--enable-cron`** (drift guard `test/config/wrangler-config.test.ts:270-272`) — watch comment wording when editing.
- **Quotas stay on code defaults** (per-user 10/day, global 50/day — `src/quota/config.ts:8-9`). Known consequence: cron-seeded messages attribute to the single-admin id, so effective cron yield is ≤10 packs/UTC-day; excess drops as ACKed `quota_exceeded` (DLQ stays empty). Raising yield later = set `QUOTA_PER_USER_DAILY` on the research worker env block.
- **Do NOT touch compliance-critical code anywhere in this plan:** `src/detector/**`, `src/safelane/**`, `src/db/audit-log.ts`, the research gate chain (`src/app/api/research/gate.ts`, `src/queue/research-jobs.ts`). Go-live is config + docs + (at most) scoped fixes to the four QA surfaces in Task 3.4. If a defect appears to require touching the compliance chain, STOP and escalate.
- **PR naming used below:** "the go-live PR" (chore/go-live → dev, Phases 1–3), "the provider-flip PR" (chore/provider-flip → dev, Phase 5), "the cron PR" (chore/research-cron → dev, Phase 6), "the release PR" (dev → main, Phase 7). Real PR numbers get recorded in the Execution Status table when opened.

## Execution strategy recommendation

**Inline execution in the orchestrating session** (superpowers:executing-plans style), not subagent-per-task: every phase after Phase 1 depends on live Cloudflare state (provisioned ids, secrets, deployed workers) and on session-scoped authority (Sam's go-live grant, credential files, authenticated wrangler). Fresh subagents would re-derive that context and re-cross the authorization boundary each time. Subagents ARE used for: adversarial plan review (before execution), visual-QA fix implementation if fixes are independent, and post-deploy verification sweeps.

## Execution Status

**Overall:** 1/7 phases shipped (pending batch-review verdict), Phase 2 in progress.

| Phase | Status | Ship SHA(s) | Notes |
|---|---|---|---|
| 1 — Repo fixes (CI guard, vitest, domain/vars, docs) | ✅ Shipped (pre-PR) | `cd23036` `d5107f2` `79378da` `854d2d0` | full gate green (tsc/eslint/940 node/27 workerd); independent diff review in flight |
| 2 — Provision + real D1 ids | ✅ Shipped | `83a5686` | dev D1 `9f4d0701…`, prod D1 `aa530ffb…`, 4 queues; both migrated (9 tables each); `apply DB` binding form proven |
| 3 — Secrets + dev deploy + bootstrap + QA + dev research smoke | ⬜ Not started | — | — |
| 4 — Production deploy + OAuth + bootstrap | ⬜ Not started | — | — |
| 5 — Provider flip (production) + purge | ⬜ Not started | — | — |
| 6 — Cron enable (production, LAST) + first-tick watch | ⬜ Not started | — | — |
| 7 — Promote dev→main, cleanup, report | ⬜ Not started | — | — |

### Deviations
- **Task 2.0 Step 3 (Worker Builds):** the runbook's dashboard-disconnect pre-flight was replaced by an empirical check — `wrangler deployments list --name wiki-as-of-now` shows no deployment since the 2026-06-12 scaffold upload across dozens of pushes, so no git-connected auto-build exists to disconnect. Standing watch: any deployment not made by this session or an expected Deploy-workflow run → STOP.

### Discoveries
- **deploy.yml startup failure root cause (empirical):** GitHub rejects `secrets` in STEP-level `if:` too — every run since 2026-06-21 failed at 0s with `Unrecognized named-value: 'secrets'` (lines 42/45/48/51). Pitfalls CI-1's prescribed fix was wrong; correction is part of Phase 1.
- **deploy.yml migrate step is broken for dev pushes:** `d1 migrations apply wiki-as-of-now --env dev` can't resolve — env.dev's database_name is `wiki-as-of-now-dev`. Fix: apply by binding `DB` (env-agnostic).
- **`opennextjs-cloudflare deploy` does not build** — runbook step 5 needs a preceding `build` (verified against `@opennextjs/cloudflare` dist).
- **`scripts/purge-stub-packs.ts` has no CLI entry** — runbook step 7 executes as `wrangler d1 execute` SQL identical to the tested function.
- **pnpm now on PATH** (11.5.1 == pinned `packageManager`) — local OpenNext build verified working this session; phase-7.md's "CI is the only OpenNext gate" note is stale.
- **Stale worktrees made the local node suite sweep 3× duplicate tests** — two clean merged worktrees removed; `laughing-chaplygin-ce1c13` left untouched (35 uncommitted gold-corpus changes — surfaced to Sam in the final report); vitest exclude added in Phase 1.
- **wrangler does NOT inherit bindings into named envs** — the v1 config comments claimed `ai` was inherited; the first real `--env dev` deploy shipped the research worker with NO AI binding (wrangler warned at deploy time). Fixed at `dd76acb`: `ai` (+ `images` on the app) re-declared in every env block, comments corrected, drift test pins env-level bindings. The June "Phase 7" config tests never caught this because no env deploy had ever run.
- **DET-3 residual observed live:** SoFi Stadium claim flagged at year 1960 ("played their inaugural season in 1960" — incidental year). Documented residual FP class; detector untouched (compliance boundary).
- **Live Gemma 4 broke three fixture-blind assumptions in the AI seam** (found by the runbook's deferred real-model smoke test, fixed at `0240ec0` + `5faa733`): (1) the model returns OpenAI-compatible envelopes, not the legacy `{ response }` shape; (2) raw `prompt` mode bypasses the chat template, so the instruction-tuned model free-continues the text — every JSON gate failed and packs committed as `no_proposals` with zero queries; (3) it is a reasoning model whose thinking shares the `max_tokens` budget — at 1024, `content` came back null (`finish_reason: length`) with ~1k tokens of reasoning. Fixes: chat-messages mode, tolerant envelope extraction (message.content → choices[].text → response), maxTokens 2048. One defect-artifact `no_proposals` pack was deleted from the DEV research_packs table (data table, not the append-only audit log) to unblock re-research of that claim.

---

## Phase 1 — Repo fixes: deploy.yml guard, vitest exclude, domain/vars wiring, doc corrections

**Execution Status:** ✅ SHIPPED at `cd23036`/`d5107f2`/`79378da`/`854d2d0` on 2026-07-12 (branch `chore/go-live`, pre-PR; merges with the go-live PR in Task 3.6)

All work in worktree `.claude/worktrees/go-live` on branch `chore/go-live`. BEFORE starting: invoke `superpowers:test-driven-development`; read `docs/pitfalls/testing-pitfalls.md` (§1 pristine output, §6 config validation) and `docs/pitfalls/implementation-pitfalls.md` §4 (CI-1..CI-3).

### Task 1.1: vitest node pool must not sweep `.claude/worktrees/**`

**Files:** Modify `vitest.config.ts` (exclude list). Test: the suite run itself (config change — TDD scope exclusion per CLAUDE.md; verification is behavioral).

- [ ] **Step 1: Reproduce** — from the MAIN checkout (which has a live worktree): `node_modules/.bin/vitest run 2>&1 | tail -3` shows >937 tests / failures from `.claude/worktrees/...` paths.
- [ ] **Step 2: Fix** — in the WORKTREE's `vitest.config.ts` change the exclude line to:
```ts
    exclude: ["**/node_modules/**", "**/dist/**", "test/workers/**", ".claude/**"],
```
- [ ] **Step 3: Verify behaviorally IN THE WORKTREE** (the worktree has no nested worktrees, so the sweep can't reproduce there unaided): create `.claude/worktrees/dummy/test/dummy.test.ts` inside the worktree containing a single deliberately-failing test (`import { it, expect } from "vitest"; it("planted", () => { expect(1).toBe(2); });`), run `node_modules/.bin/vitest run 2>&1 | tail -3` → the suite is green and reports the repo's own test count (planted file NOT picked up), then delete the dummy directory. Also confirm the main checkout still reproduces the failure (proving the fix is the exclude, not luck).
- [ ] **Step 4: Commit** — `git add vitest.config.ts && git commit -m "fix(test): exclude .claude worktrees from the node vitest sweep"`

### Task 1.2: deploy.yml — env-mapped dormancy guard + migrate-by-binding (TDD)

**Files:** Modify `test/config/wrangler-config.test.ts:246-256, 265-269` FIRST, then `.github/workflows/deploy.yml`, then `docs/pitfalls/implementation-pitfalls.md` (CI-1).

**Context:** Empirical root cause (GH run 29179389863): `Unrecognized named-value: 'secrets'` — the `secrets` context is rejected in step-level `if:` (the doc-comment claim in deploy.yml:5-9 and pitfalls CI-1 is wrong). The token is ALREADY mapped to job `env:` (deploy.yml:17-19); the `env` context IS valid in step `if:`. Also: the migrate step's positional arg `wiki-as-of-now` cannot resolve under `--env dev` (database_name there is `wiki-as-of-now-dev`); the binding name `DB` resolves in every env.

- [ ] **Step 1: Rewrite the dormancy-guard test (failing first).** Replace the body of `it("is dormant until the deploy token secret exists", …)` (lines 246-256) with:
```ts
  it("is dormant until the deploy token secret exists", () => {
    // GitHub forbids `secrets.*` in ANY `if:` expression (job OR step level) — the file is
    // rejected at parse with "Unrecognized named-value: 'secrets'" (observed: run 29179389863).
    // The working dormancy pattern: map the secret into job-level env:, then guard each
    // deploy step with the env context, which IS available in step-level if:.
    expect(deploy).toMatch(/CLOUDFLARE_API_TOKEN:\s*\$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
    // Line-anchored so a comment mentioning the guard can never satisfy the count.
    const guardCount = (deploy.match(/^\s*if: \$\{\{ env\.CLOUDFLARE_API_TOKEN != '' \}\}/gm) ?? []).length;
    expect(guardCount).toBeGreaterThanOrEqual(4);
    // No `if:` expression anywhere may reference the secrets context (parse-time rejection).
    for (const line of deploy.split("\n")) {
      if (/^\s*if:/.test(line)) expect(line).not.toMatch(/secrets\./);
    }
  });
```
- [ ] **Step 2: Update the migrate assertion** (line 268) from `/d1 migrations apply .*--remote/` to pin the binding form:
```ts
    expect(deploy).toMatch(/d1 migrations apply DB --remote/);
```
- [ ] **Step 3: Run to confirm failures** — `node_modules/.bin/vitest run test/config/wrangler-config.test.ts` → the two edited tests FAIL against current deploy.yml (guard regex count 0; `apply DB` absent).
- [ ] **Step 4: Fix deploy.yml.** (a) Replace all four step guards `if: ${{ secrets.CLOUDFLARE_API_TOKEN != '' }}` → `if: ${{ env.CLOUDFLARE_API_TOKEN != '' }}`. (b) Migrate step run line → `pnpm exec wrangler d1 migrations apply DB --remote --env ${{ steps.env.outputs.name }}`. (c) Rewrite the header comment lines 4-9 to describe the env-mapped guard truthfully. Comment wording constraints: never introduce the substrings `triggers`/`crons`/`--enable-cron` (whole-file guard at test line ~271); the Step-1 per-line `if:` scan anchors on `/^\s*if:/` so `#`-prefixed comment lines are exempt from the secrets check — but keep comments honest anyway:
```yaml
# Dormancy: GitHub rejects the `secrets` context inside ANY `if:` expression — the workflow
# file fails validation at parse time ("Unrecognized named-value: 'secrets'"). The working
# pattern: map the secret into job-level env:, then guard each deploy step on the mapped
# env value (the env context IS valid in step-level if:). With the secret absent the
# steps skip cleanly, so the workflow stays green until armed.
```
  (Comment paraphrases the guard rather than quoting it — the drift test counts line-anchored guard occurrences, and a quoted literal in a comment must never be countable.)
- [ ] **Step 5: Verify green** — `node_modules/.bin/vitest run test/config/wrangler-config.test.ts` → all pass, output pristine.
- [ ] **Step 6: Correct pitfalls CI-1** (`docs/pitfalls/implementation-pitfalls.md`): rewrite the entry to state (Flaw) `secrets.*` is rejected in ALL `if:` expressions — job-level silently never ran historically, step-level fails the whole file at parse (0-second startup_failure, exact error quoted); (Fix) job-level `env:` mapping + step `if: ${{ env.TOKEN != '' }}`; (Lesson) verify context availability empirically — the contexts docs are easy to misread, and a workflow that fails in 0s with no jobs is a parse-time context error. Also update BOTH §4.C review-checklist bullets that currently prescribe the step-level `secrets.` guard (lines ~230-231), and add a 2026-07-12 Appendix A changelog entry naming the observed error + run id.
- [ ] **Step 7: Commit** — `git add test/config/wrangler-config.test.ts .github/workflows/deploy.yml docs/pitfalls/implementation-pitfalls.md && git commit -m "fix(ci): deploy pipeline env-mapped dormancy guard + migrate by binding"` (subject note: test assertions strengthened, not weakened).

### Task 1.3: wire custom domain + APP_ORIGIN into the app worker production env (TDD)

**Files:** Modify `test/config/wrangler-config.test.ts` (new `it` blocks in the per-env describe) FIRST, then `wrangler.jsonc`.

- [ ] **Step 1: Write failing tests** (inside the existing per-env describe, after the cron test):
```ts
  it("production app worker serves the custom domain with APP_ORIGIN matching (go-live)", () => {
    const app = readJsonc("wrangler.jsonc");
    const prod = envOf(app, "production");
    expect(prod.routes).toEqual([{ pattern: "wikinow.scarson.io", custom_domain: true }]);
    expect(prod.vars?.APP_ORIGIN).toBe("https://wikinow.scarson.io");
  });
  it("dev app worker stays on workers.dev with no custom routes or APP_ORIGIN", () => {
    const app = readJsonc("wrangler.jsonc");
    expect(envOf(app, "dev").routes).toBeUndefined();
    expect(envOf(app, "dev").vars?.APP_ORIGIN).toBeUndefined();
  });
  it("RESEARCH_PROVIDER never appears in the research worker top-level config (CC-7 / workerd pool)", () => {
    const research = readJsonc("workers/research/wrangler.jsonc");
    expect(research.vars?.RESEARCH_PROVIDER).toBeUndefined();
  });
```
  Extend the local `EnvBlock`/config interfaces in the test file with optional `routes?: { pattern: string; custom_domain?: boolean }[]` and `vars?: Record<string, string>` as needed for tsc.
- [ ] **Step 2: Run to confirm the first test fails** (`routes` undefined today); the other two pass (guards).
- [ ] **Step 3: Edit `wrangler.jsonc` env.production** — add below `"name": "wiki-as-of-now",`:
```jsonc
			// Production serves ONLY the custom domain (OAuth redirect origin must match exactly).
			"routes": [{ "pattern": "wikinow.scarson.io", "custom_domain": true }],
			"vars": { "APP_ORIGIN": "https://wikinow.scarson.io" },
```
- [ ] **Step 4: Verify green + dry-run** — config suite green; then `pnpm exec opennextjs-cloudflare build` (the app-worker dry-run needs `.open-next/worker.js` to exist — never assume a stale build) and `bunx wrangler deploy --dry-run --env production 2>&1 | tail -5` parses (D1 placeholder id is accepted by --dry-run; output otherwise clean).
- [ ] **Step 5: Commit** — `git commit -m "feat(deploy): production custom domain wikinow.scarson.io + APP_ORIGIN var"` with the two files.

### Task 1.4: runbook + provision doc corrections (docs only, no TDD)

**Files:** Modify `docs/runbooks/go-live.md` (step 5: build before deploy; step 7: purge via `wrangler d1 execute` SQL; step 3 note: kill-switch stays UNSET — absent ⇒ enabled, truthy ⇒ paused). Modify `scripts/provision.md` §4 note for RESEARCH_KILL_SWITCH same semantics. **Constraint:** preserve every phrase pinned by the ordering guard (`test/config/wrangler-config.test.ts:275-306`) and every `bunx wrangler …` command substring pinned at lines 189-217 (notably keep the literal `bunx wrangler secret put RESEARCH_KILL_SWITCH` line present as the "how to pause" documentation).

- [ ] **Step 0: Edit go-live.md step 3 + provision.md §4** — add the one-line semantics note to each RESEARCH_KILL_SWITCH mention: absent ⇒ research enabled; any truthy value pauses the consumer + scheduler; at go-live it stays UNSET (the `secret put` command line stays in both docs as the how-to-pause reference — the provision-sync test pins it).
- [ ] **Step 1: Edit go-live.md step 5** — replace ONLY the two deploy command bullets; the "Verify dev, then repeat with `--env production`" gate and the deploy-token/CI note bullets stay:
```bash
pnpm exec opennextjs-cloudflare build            # deploy does NOT build; build once, reuse per env
pnpm exec opennextjs-cloudflare deploy --env dev
bunx wrangler deploy -c workers/research/wrangler.jsonc --env dev
```
- [ ] **Step 2: Edit go-live.md step 7** — replace the "Run `scripts/purge-stub-packs.ts` against the live D1" sentence with the executable form below (the script exports a library function with no CLI; this SQL is semantically identical to what it runs — the function binds the sentinel as a parameter). The committed prose MUST retain the exact lowercase phrase "purge stub" in the step body (the ordering guard does a case-sensitive `indexOf("purge stub")`, and the heading "Purge stub packs" does NOT match it):
```bash
bunx wrangler d1 execute wiki-as-of-now --remote --env production \
  --command "SELECT COUNT(*) AS n FROM research_packs WHERE model_version = 'fake-provider/0';"
bunx wrangler d1 execute wiki-as-of-now --remote --env production \
  --command "DELETE FROM research_packs WHERE model_version = 'fake-provider/0';"
```
  followed by prose: "Re-run the SELECT; `n` must be 0. This is the purge stub gate — verify before and after." Also REMOVE the original step's trailing sentence "The script reports the count removed; verify before and after." — it describes executing the script, which no longer happens, and the new prose carries the verify-before-and-after instruction. (Nothing in the committed runbook is a meta-instruction from this plan.)
- [ ] **Step 3: Run config suite** — the provision-sync + runbook-ordering guards stay green.
- [ ] **Step 4: Commit** — `git commit -m "docs(runbooks): executable purge step, build-before-deploy, kill-switch semantics"`.

### Phase 1 batch review

After completing Tasks 1.1–1.4: review the batch from multiple perspectives (config-correctness, drift-guard coverage, doc-truthfulness). Minimum 3 review rounds; keep going past 3 if a round still finds substantive issues. Full local gate: `tsc --noEmit`, `eslint .`, node pool, workerd pool — all green, output pristine.

---

## Phase 2 — Provision Cloudflare + commit real D1 ids

**Execution Status:** ✅ SHIPPED at `83a5686` on 2026-07-12. Pre-flight: account confirmed; queues-create succeeded (Workers Paid proven); scaffold worker's newest deployment still 2026-06-12 (no auto-build race — Worker Builds dashboard-disconnect step replaced by this empirical check, recorded in Deviations).

**Context:** Wrangler OAuth (samuel.carson@gmail.com, account 0387b81a63e32850b33e897e1268fe2a) verified with d1/queues/workers write scopes. NOTHING provisioned yet (`d1 list`/`queues list` show no wiki-* resources). The `wiki-as-of-now` worker that EXISTS is a 2026-06-12 "Hello world" scaffold already bound to wikinow.scarson.io — production deploy intentionally replaces it.

### Task 2.0: runbook pre-flight gates (Workers Paid, Worker Builds, account)

- [ ] **Step 1:** `bunx wrangler whoami` shows the account above.
- [ ] **Step 2 (Workers Paid):** the queues-create commands in Task 2.1 are themselves the empirical check — Queues requires the paid plan; if any `queues create` fails with a plan error, STOP (hard blocker for Sam).
- [ ] **Step 3 (Worker Builds — runbook pre-flight, deviation recorded):** the dashboard-disconnect step cannot be performed or verified from the CLI. Run `bunx wrangler deployments list --name wiki-as-of-now` and confirm the newest deployment is still the 2026-06-12 scaffold upload — zero deployments across dozens of repo pushes since means no git-connected auto-build is racing us. Record in Deviations; during Phases 3–6, if a deployment appears on either worker that is neither (a) made by this session's wrangler nor (b) attributable to a repo Deploy-workflow run this plan expects (every dev-branch PR merge fires deploy.yml and redeploys the dev workers under the CI token identity — Task 3.6 Step 3 calls this out), STOP and investigate.

### Task 2.1: create D1 ×2 + queues ×4

- [ ] **Step 1:** `bunx wrangler d1 create wiki-as-of-now-dev` → record printed `database_id` (call it DEV_ID).
- [ ] **Step 2:** `bunx wrangler d1 create wiki-as-of-now` → record PROD_ID.
- [ ] **Step 3:** `bunx wrangler queues create research-dev && bunx wrangler queues create research-dlq-dev && bunx wrangler queues create research && bunx wrangler queues create research-dlq`.
- [ ] **Step 4: Verify** — `bunx wrangler d1 list` shows both DBs; `bunx wrangler queues list` shows all four queues.

### Task 2.2: commit real ids under a rewritten drift guard (TDD)

**Files:** Modify `test/config/wrangler-config.test.ts:146-153` FIRST, then both wrangler configs.

- [ ] **Step 1: Rewrite the placeholder test** (it currently pins the literal `REPLACE_WITH_*` strings AND is the only id-level CC-10 coupling — the rewrite must keep that invariant):
```ts
  it("per-env D1 ids are real, shared across workers (CC-10), and distinct across envs", () => {
    const app = readJsonc("wrangler.jsonc");
    const research = readJsonc("workers/research/wrangler.jsonc");
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const devId = envOf(app, "dev").d1_databases?.[0].database_id;
    const prodId = envOf(app, "production").d1_databases?.[0].database_id;
    expect(devId).toMatch(uuid);
    expect(prodId).toMatch(uuid);
    expect(envOf(research, "dev").d1_databases?.[0].database_id).toBe(devId);
    expect(envOf(research, "production").d1_databases?.[0].database_id).toBe(prodId);
    expect(devId).not.toBe(prodId);
    // The top-level (default/Miniflare) ids stay the all-zeros placeholder — CI dry-run target.
    expect(app.d1_databases?.[0].database_id).toBe("00000000-0000-0000-0000-000000000000");
  });
```
- [ ] **Step 2: Run to confirm it fails** (ids are still `REPLACE_WITH_*`). Note: the test file's `WranglerConfig` interface has no top-level `d1_databases` member (only `EnvBlock` does) — extend it with `d1_databases?: { database_name?: string; database_id?: string }[]` so `tsc --noEmit` stays green.
- [ ] **Step 3: Paste DEV_ID/PROD_ID** into the four env slots (`wrangler.jsonc` env.dev/env.production + `workers/research/wrangler.jsonc` env.dev/env.production). Top-level all-zeros ids stay.
- [ ] **Step 4: Verify green**, then commit both configs + test: `git commit -m "feat(deploy): provisioned per-env D1 ids (drift guard now pins CC-10 id equality)"`.

### Task 2.3: migrate both remote DBs

- [ ] **Step 1:** `bunx wrangler d1 migrations apply DB --remote --env dev` (run in worktree; binding resolves env.dev → wiki-as-of-now-dev). Expected: lists 0001–0005 + 0008, applies all, no errors.
- [ ] **Step 2:** same with `--env production`.
- [ ] **Step 3: Verify** — `bunx wrangler d1 execute wiki-as-of-now-dev --remote --env dev --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\_cf\_%' ESCAPE '\' AND name != 'd1_migrations' ORDER BY name;"` lists exactly: articles, audit_log, eligibility_verdicts, quota_ledger, research_packs, seed_list_entries, seed_lists, stale_candidates, users. Same for production.

---

## Phase 3 — Secrets, dev deploy, bootstrap, visual QA, dev research smoke

**Execution Status:** 🚧 IN PROGRESS — claimed 2026-07-12T05:50Z (branch `chore/go-live`, 11 commits, suite green 947 node + 27 workerd, tsc/lint clean). Tasks 3.1–3.3 DONE (dev live at wiki-as-of-now-dev.samuel-carson.workers.dev; secrets set; 5 easy-win articles bootstrapped, lane surfaces 5/5, worksheets render). Task 3.4 QA: nav/queue/anonymous-401/worksheet-pre-pack PASS in browser; transparency + source-gate re-check still pending a real pack. Task 3.5 (dev research smoke) IN PROGRESS — three live-model defects root-caused and fixed via TDD (`0240ec0` envelope, `5faa733` chat mode, `bc05a5b` thinking budget 4096/60s + `a1a0057` codes-only AI-seam telemetry), but as of 06:42Z candidates 8/9 still cycle `research.unavailable` with ~15s attempt gaps — too fast for a 4096-token generation, so suspect queue-consumer version lag (deploy 5694e670 at ~06:35Z) or a new failure class. NEXT STEP: `bunx wrangler tail --env dev -c workers/research/wrangler.jsonc --format json` (from the worktree), re-enqueue candidate 8 (`POST /api/research/8`, x-admin-secret from scratchpad admin_secret_dev.txt — regenerate + re-put if scratchpad is gone), and read the codes-only warn: `research.ai_call.failed{reason}` vs `research.ai_call.empty{finish}` names the failing stage in one shot. If packs exist when you arrive (packs count >0 with real queries/cards), the smoke may have self-resolved after version propagation — verify Task 3.5 Step 5 checks and proceed.

### Task 3.1: first dev deploy (hand-run, per runbook step 5 — BEFORE secrets: `wrangler secret put` on a nonexistent worker prompts to create a draft, which fails non-interactively)

- [ ] **Step 1:** in the worktree: `pnpm exec opennextjs-cloudflare build` (verified working this session) then `pnpm exec opennextjs-cloudflare deploy --env dev`. Expected: uploads `wiki-as-of-now-dev`, prints the workers.dev URL (record it: DEV_URL).
- [ ] **Step 2:** `bunx wrangler deploy -c workers/research/wrangler.jsonc --env dev`. Expected: uploads `wiki-as-of-now-research-dev` with queue consumer `research-dev` + AI binding. (Deploying before its secrets is safe: queue is empty and the provider defaults to the stub until Task 3.5.)
- [ ] **Step 3: Verify** — `curl -s DEV_URL/` returns the homepage HTML (lookup form + anonymous-browse banner); `curl -s DEV_URL/queue` renders; a bogus worksheet URL 404s. `bunx wrangler tail wiki-as-of-now-dev --format json` in a short window shows no startup errors.

### Task 3.2: dev secrets

Generated values live only in scratchpad files (never argv/echo; scratchpad is session-isolated). Each `secret put` creates a new worker version immediately — no redeploy needed.

- [ ] **Step 1:** `openssl rand -base64 32 > "$SCRATCH/session_secret_dev.txt"` ; `openssl rand -base64 32 > "$SCRATCH/admin_secret_dev.txt"` (SCRATCH = the session scratchpad dir).
- [ ] **Step 2 (app worker dev):** `tr -d '\n' < "$SCRATCH/session_secret_dev.txt" | bunx wrangler secret put SESSION_SECRET --env dev` ; same pattern for `ADMIN_SECRET`. Do NOT set GOOGLE_* on dev (absence = single-admin mode, by design).
- [ ] **Step 3 (research worker dev):** `tr -d '\n' < brave_api_key.txt | bunx wrangler secret put BRAVE_API_KEY -c workers/research/wrangler.jsonc --env dev` (run from the MAIN checkout root where the credential file lives, or reference it by absolute path). Do NOT set RESEARCH_KILL_SWITCH (absent ⇒ research enabled; any truthy value pauses — `src/research/kill-switch.ts`).
- [ ] **Step 4: Verify names only** — `bunx wrangler secret list --env dev` shows SESSION_SECRET + ADMIN_SECRET; `bunx wrangler secret list -c workers/research/wrangler.jsonc --env dev` shows BRAVE_API_KEY. (Names, never values.)

### Task 3.3: bootstrap dev content (the step the runbook lacks)

Detection happens ONLY via the two anonymous capture endpoints (`src/ingest/lookup.ts:lookupAndPersist`); the cron cannot populate an empty site.

- [ ] **Step 1 (discovery):** `curl -s DEV_URL/api/seed-lists/military-procurement | python3 -c "import json,sys; d=json.load(sys.stdin); print([e['articleTitle'] for e in d['entries'][:15]])"` — the entry field is `articleTitle` (`src/db/seed-lists.ts:94-99`), not `title`. Also hit `infrastructure-megaprojects`.
- [ ] **Step 2 (capture):** for ~15–20 titles across both topics: `curl -sS -X POST DEV_URL/api/queue/capture -H 'content-type: application/json' -d '{"target":"<title>"}'` — inspect each response's `eligibility` + `candidateCount`. Continue until ≥5 articles return `easy_win` with `candidateCount > 0`, expanding to at most 40 total captures. If 40 captures still yield <5, proceed with whatever exists (minimum 1) and record the hit-rate in Deviations — thin content is a launch observation, not a blocker. (BLP/recently-edited/dispute-templated articles will come back human_only/deferred — expected, that's G11 working. Pace captures ~1/s; each one fetches from live Wikimedia.)
- [ ] **Step 3 (verify user-testable state):** `curl -s -X POST DEV_URL/api/easy-win` → `summary.surfaced > 0`; pick a candidateId from `/api/articles/<pageId>/candidates` and confirm `DEV_URL/worksheet/<candidateId>` renders the claim + stale marker + honesty banner (no evidence cards yet — packs come later).

### Task 3.4: live visual QA of the four deferred .tsx surfaces (browser, dev env)

The v1 build verified these only by tsc/lint/`next build` (phase-7.md "Visual QA" column). QA in the in-app browser at desktop + mobile widths, light + dark:

- [ ] `src/app/layout.tsx` global nav — bar alignment with `max-w-3xl`, iron-gall link colour, keyboard focus ring, hover underline.
- [ ] `src/app/queue/page.tsx` — easy-win lane load, enqueue toast copy "Queued N for research, M skipped.", signed-out 401 message (anonymous "Research selected" attempt), 503 wording n/a (kill-switch off).
- [ ] `src/app/worksheet/components/WorksheetClient.tsx` — source-open gate confirms + unlocks; "How this was researched →" link appears ONLY once a pack is surfaced (re-check after Task 3.5).
- [ ] `src/app/articles/[id]/transparency/page.tsx` — renders selected/dropped/queries for a surfaced pack (after Task 3.5).
- [ ] Any defect found: smallest scoped fix in the worktree — TDD (failing test → fix → green) where the defect is behaviorally assertable (component logic, copy, conditional rendering); purely visual defects (spacing, alignment, colour) get the fix + before/after visual re-verification on the redeployed dev env, documented in the task notes. Do NOT restyle beyond the defect or refactor adjacent components. Batch-review fixes before commit.

### Task 3.5: dev research smoke — live Gemma + Brave end-to-end

**Ordering note:** flip dev's provider BEFORE any dev enqueue so no stub packs are ever created remotely (stub packs would PK-block the real research for those claims — CC-7).

- [ ] **Step 1 (TDD, config):** extend the Task 1.3 test block: assert `envOf(research, "dev").vars?.RESEARCH_PROVIDER === "workers-ai"` (and production still undefined at this step) → fails → add to `workers/research/wrangler.jsonc` env.dev: `"vars": { "RESEARCH_PROVIDER": "workers-ai" },` → green. Commit `feat(research): flip dev env to the workers-ai provider`.
- [ ] **Step 2:** redeploy research worker dev (`bunx wrangler deploy -c workers/research/wrangler.jsonc --env dev`).
- [ ] **Step 3 (enqueue via single-admin):** write a curl config in scratchpad containing `header = "x-admin-secret: <value from admin_secret_dev.txt>"` (build it with shell substitution — value never in argv), then `curl -sS -K "$SCRATCH/admin.cfg" -X POST DEV_URL/api/research/<candidateId>` → expect 202. Use the candidateId already verified in Task 3.3 Step 3.
- [ ] **Step 4 (observe):** `bunx wrangler tail wiki-as-of-now-research-dev --format pretty` — watch query-gen → triage → verbatim; record wall-clock per message. `bunx wrangler queues info research-dev` → backlog drains to 0; `research-dlq-dev` stays empty.
- [ ] **Step 5 (verify pack + compliance):** D1 checks (codes only, no PII):
```bash
# research_packs is WITHOUT ROWID (no rowid column) — order by evaluated_at. Column is `status`, not `state`.
bunx wrangler d1 execute wiki-as-of-now-dev --remote --env dev --command \
  "SELECT model_version, status, json_array_length(cards_json) AS cards FROM research_packs ORDER BY evaluated_at DESC LIMIT 3;"
bunx wrangler d1 execute wiki-as-of-now-dev --remote --env dev --command \
  "SELECT event_type, actor FROM audit_log ORDER BY id DESC LIMIT 10;"
```
  Expect `model_version` = the real Gemma id (starts `@cf/google/gemma`), NOT `fake-provider/0`; a verified card with a real URL; audit rows codes-only. Then confirm the worksheet shows the evidence card + G12 model disclosure + transparency page (closes Task 3.4's last two checkboxes).
- [ ] **Step 6 (stub hygiene):** `SELECT COUNT(*) FROM research_packs WHERE model_version='fake-provider/0'` on dev → expect 0 (provider was flipped before first enqueue). If >0: purge per runbook step 7 SQL and note the deviation.

### Task 3.6: open the go-live PR (chore/go-live → dev) and merge

- [ ] **Step 1:** full local gate green (tsc, eslint, node pool, workerd pool, `pnpm exec opennextjs-cloudflare build`, research dry-run `bunx wrangler deploy --dry-run --env="" -c workers/research/wrangler.jsonc`).
- [ ] **Step 2:** push; open PR with body: what shipped (Phases 1–3), evidence, and `## Merge classification`: `Review — deploy topology/CI/infra config; merged by agent per Sam's 2026-07-12 session-wide merge-authority grant`.
- [ ] **Step 3:** wait for CI green (the orchestrating session's background monitor primitive over `gh run list`/`gh pr checks` — never foreground sleep-polling). **Expected side effect on merge:** the now-fixed deploy.yml fires on the dev push and CI re-deploys the dev env (idempotent over the hand deploy). VERIFY the Deploy run goes green **with its deploy steps actually executed, not skipped** — the repo secrets CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID were confirmed set on 2026-06-29 (`gh secret list`), so a run whose guarded steps show as skipped means the guard is broken, and a "green" run alone proves nothing (`gh run view <id> --log | grep -A2 "Apply D1 migrations"` shows real output). This empirically proves the Task 1.2 fix.
- [ ] **Step 4:** `gh pr merge --merge --delete-branch`. Record merge SHA in the status table.

---

## Phase 4 — Production deploy, OAuth, bootstrap

**Execution Status:** ⬜ NOT STARTED

**Ordering note (mirrors Task 3.1's lesson):** deploy each worker BEFORE putting its secrets — `wrangler secret put` on a nonexistent worker prompts to create a draft and fails non-interactively. The app-worker name (`wiki-as-of-now`) exists today only as the Hello-world scaffold; the research prod worker (`wiki-as-of-now-research`) does not exist at all until Task 4.1 Step 2.

### Task 4.1: deploy production (replaces the Hello-world scaffold on wikinow.scarson.io)

- [ ] **Step 1:** realign the MAIN checkout to the merged tip per git-strategy (`git fetch origin dev && git reset --hard origin/dev` — the canonical dev realign; deps already installed there), then from the main checkout: `pnpm exec opennextjs-cloudflare build && pnpm exec opennextjs-cloudflare deploy --env production`. The config's `routes` custom-domain entry binds wikinow.scarson.io (the attachment already exists on this worker name — expect wrangler to adopt/confirm it; if it prompts interactively or errors on the existing record, capture the exact message, resolve via the documented non-interactive flag if one exists, and record the resolution in Deviations).
- [ ] **Step 2:** `bunx wrangler deploy -c workers/research/wrangler.jsonc --env production`. (Creates `wiki-as-of-now-research`; safe pre-secrets: prod queue is empty and the provider defaults to the stub until Phase 5.)
- [ ] **Step 3: Verify** — `curl -s https://wikinow.scarson.io/` returns the app homepage (NOT "Hello world"); `/queue` renders; `/about` renders (G6/G7 transparency copy). At this instant the app runs single-admin (no GOOGLE_* yet) — Task 4.2 flips it to oauth mode.

### Task 4.2: production secrets

- [ ] **Step 1:** `openssl rand -base64 32 > "$SCRATCH/session_secret_prod.txt"` (distinct from dev) → pipe to `bunx wrangler secret put SESSION_SECRET --env production`.
- [ ] **Step 2:** `tr -d '\n' < google_oauth_clientid.txt | bunx wrangler secret put GOOGLE_CLIENT_ID --env production` ; `tr -d '\n' < google_oauth_client_secret.txt | bunx wrangler secret put GOOGLE_CLIENT_SECRET --env production` (paths relative to the MAIN checkout root). Both present ⇒ oauth mode; ADMIN_SECRET deliberately NOT set — the x-admin-secret path is inert in oauth mode (`src/auth/current-user.ts:38-42`).
- [ ] **Step 3:** `tr -d '\n' < brave_api_key.txt | bunx wrangler secret put BRAVE_API_KEY -c workers/research/wrangler.jsonc --env production`. No RESEARCH_KILL_SWITCH (absent ⇒ enabled).
- [ ] **Step 4:** `bunx wrangler secret list --env production` / research-config variant — names only.

### Task 4.3: OAuth redirect verification (no sign-in completion — agent cannot authenticate)

- [ ] **Step 1:** `curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://wikinow.scarson.io/api/auth/google` → expect 302 to `accounts.google.com/...` with `redirect_uri=https://wikinow.scarson.io/api/auth/google/callback` and `client_id=<the registered id>` (URL-decoded check; asserting the id's PRESENCE is fine — it is public in the redirect).
- [ ] **Step 2:** in the browser, confirm the sign-in button renders and clicking reaches Google's chooser (stop there; completing sign-in is Sam's, not the agent's).

### Task 4.4: bootstrap production content

- [ ] Same as Task 3.3 against `https://wikinow.scarson.io`: prime both seed-list topics, capture titles until ≥8 easy_win articles with candidates exist (same loop bound + deviation rule as Task 3.3 Step 2: at most 40 captures, then proceed with what exists), verify `/queue` lane surfaces them and a worksheet renders anonymously. (Research packs arrive via the cron in Phase 6 — worksheets legitimately show the no-pack honesty banner until then.)

---

## Phase 5 — Production provider flip + stub purge (runbook steps 7–8a)

**Execution Status:** ⬜ NOT STARTED

**Depends on:** the go-live PR merged (Phase 3 Task 3.6). Work in a FRESH worktree off the updated dev: `git fetch origin dev && git worktree add .claude/worktrees/provider-flip -b chore/provider-flip origin/dev && cd .claude/worktrees/provider-flip && pnpm install --frozen-lockfile`.

- [ ] **Step 1 (TDD):** update the Task 3.5 config test: production `vars.RESEARCH_PROVIDER === "workers-ai"` too (top-level still undefined) → fails → add to research config env.production: `"vars": { "RESEARCH_PROVIDER": "workers-ai" },` → green.
- [ ] **Step 2 (purge gate):** production stub count via runbook step 7 SQL → expect 0 (no research was ever enqueued on prod with the stub). If >0, DELETE + re-verify 0.
- [ ] **Step 3:** commit `feat(research): flip production to the workers-ai provider`; push and open the provider-flip PR (chore/provider-flip → dev), classification `Routine — config var flip, drift-guard tested; merged by agent per Sam's session grant`; merge on green CI. The dev-push Deploy run redeploys dev (no-op) — production redeploy of the research worker happens by hand: `bunx wrangler deploy -c workers/research/wrangler.jsonc --env production`, run from the provider-flip worktree (its file content is identical to the merged tip) or the realigned main checkout.
- [ ] **Step 4:** verify via `wrangler tail` that no stub activity occurs; production research stays idle until the cron (no session-auth enqueue path exists for the agent on prod — by design).

---

## Phase 6 — Enable the research cron (production, LAST) + watch the first tick

**Execution Status:** ⬜ NOT STARTED

**Interval decision:** `0 */6 * * *` (every 6 h). Justification recorded per runbook: worst-case serial drain of one 50-message seed batch ≈ 3.2 h (50 × ~232 s ceiling: 2×28 s AI-call budgets ×2 stages + 12×10 s fetch timeouts + Brave calls; `src/research/model-config.ts`, `src/research/source-fetch.ts:51`); 6 h > 3.2 h with margin, and Queues autoscaling makes realistic drain minutes. Effective yield is quota-bounded at ≤10 packs/UTC-day (Global Constraints note).

**Depends on:** the provider-flip PR merged + a real pack confirmed on dev (Task 3.5). Fresh worktree: `git fetch origin dev && git worktree add .claude/worktrees/research-cron -b chore/research-cron origin/dev && cd .claude/worktrees/research-cron && pnpm install --frozen-lockfile`.

- [ ] **Step 1 (TDD):** update the cron drift test (`wrangler-config.test.ts:177-186`): research env.production crons becomes `["0 */6 * * *"]`; env.dev + app worker + top-level stay `[]` (dev intentionally gets NO cron — it's a verification env; scheduled spend belongs to production only. Deviation from the runbook's per-env phrasing, recorded in Deviations).
- [ ] **Step 2:** add to research config env.production: `"triggers": { "crons": ["0 */6 * * *"] },` → test green.
- [ ] **Step 3:** commit `feat(research): enable the production research cron (6-hourly, above worst-case drain)`; push and open the cron PR (chore/research-cron → dev), classification `Routine — the runbook's cron-enable step, gated on completed steps 1-7; merged by agent per Sam's session grant`; merge on green; hand-redeploy the research worker `--env production` from the research-cron worktree (content identical to the merged tip) or the realigned main checkout.
- [ ] **Step 4 (first tick):** schedule a check just after the next 6-hour UTC boundary (the orchestrating session's background monitor / scheduled-wakeup primitive — never foreground sleep): `bunx wrangler queues info research` backlog rose then drained to 0; `research-dlq` EMPTY; D1: new `research_packs` rows with real Gemma model_version; `quota_exceeded` audit rows are EXPECTED for seeds past the daily cap (ACKed drops, not failures). Worksheets for researched claims now show evidence cards + transparency page.

---

## Phase 7 — Promote dev→main, cleanup, memory, report

**Execution Status:** ⬜ NOT STARTED

- [ ] **Step 1:** open the release PR dev→main (per git-strategy §Branch model), classification `Review — release promotion; merged by agent per Sam's 2026-07-12 session grant`. CI green → merge (`--merge`, keep main's history). **Expected side effect:** deploy.yml fires on main → full CD to production (migrate no-op, build, deploy both workers). Verify the run is green **with the guarded steps executed, not skipped** (same check as Task 3.6 Step 3), and the site still serves — this proves production CD.
- [ ] **Step 2 (cleanup):** `rm brave_api_key.txt google_oauth_clientid.txt google_oauth_client_secret.txt` (repo root) + scratchpad secret files; remove their `.git/info/exclude` block; verify `git status` clean.
- [ ] **Step 3 (memory/journal):** update `v1-build-status` memory (go-live shipped: URLs, PR numbers, cron, quota-yield note, laughing-chaplygin worktree caveat); journal reflection per CLAUDE.md trigger (what failed unexpectedly, what took longer).
- [ ] **Step 4 (report):** final completion report with status label (DONE / DONE_WITH_CONCERNS), per-claim evidence (URLs, SHAs, test output, tail/queue observations), deferred items (e.g., Sam completing a real Google sign-in; raising cron yield; runbook Sam-only default retained).

---

## Appendix — reasoning capture (per CLAUDE.md §Thinking documentation)

**Why a delta plan instead of re-planning the runbook:** the runbook + Phase 7 report are adversarially-reviewed artifacts; duplicating them inline would create version skew (Cross-references rule). This plan carries only orientation + the deltas execution surfaced.

**Considered and ruled out:**
- *Activating deploy.yml as the only deploy path (no hand deploys):* rejected — the runbook's hand-first rule exists to confirm topology before CD, and the deploy.yml fix itself needs empirical proof.
- *Setting ADMIN_SECRET on production as break-glass:* rejected — provably inert in oauth mode (`src/auth/current-user.ts:38-42`); setting it would imply a capability that doesn't exist.
- *Cron on both envs (runbook letter):* rejected for dev — doubles scheduled metered spend for zero verification value; dev's research path is verified via HTTP enqueue in Task 3.5. Recorded as a deviation.
- *`corepack`-based build fallback:* not viable (corepack absent from fnm node 26); moot since Homebrew pnpm matches the pin.
- *Raising quotas for a bigger launch splash:* rejected — Sam chose code defaults; ≤10 packs/day is the compliance-conservative posture; one-line change later.

**Still uncertain:** (1) whether wrangler adopts the pre-existing wikinow.scarson.io custom-domain attachment silently or needs a confirm flag — Task 4.1 Step 1 verifies empirically and the executor should expect a possible interactive prompt (`--yes`-style flag or dashboard fallback documented in the Deviations if hit); (2) Queues autoscaling behavior on the first tick (drain minutes vs hours) — the 6-h interval absorbs either; (3) whether the `wiki-as-of-now` scaffold worker has residual settings (env vars/domains beyond wikinow) — `wrangler deploy` replaces code+config it owns; Task 4.1 Step 3 checks serving behavior.

**Things almost missed** (caught in plan review rounds): the deploy.yml header comment would keep the old `if:`+`secrets.` substring satisfying the old regex (test now scans per-line `if:` only); the placeholder-id test was the ONLY CC-10 id-equality guard; `opennextjs-cloudflare deploy` not building; the migrate-by-name dev-env resolution failure; RESEARCH_PROVIDER top-level → Miniflare pool poisoning; cron yield quota interaction (≤10/day, not 50). Round-2 adversarial review (independent cold-read) additionally caught: production secrets ordered before the production research worker existed (the same footgun Round 1 fixed for dev); an unanchored guard-count regex the new header comment would have satisfied; the ordering guard's case-sensitive `indexOf("purge stub")` vs the step heading's capital P; the seed-list entry field being `articleTitle` not `title`; and that a "green" Deploy run proves nothing unless the guarded steps actually EXECUTED (skipped-but-green is the dormancy design).
