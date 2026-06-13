# Go-live runbook (Sam-run, human-confirmed at each gate)

> Phase 7 prepared everything below. This runbook is the ordered, human-confirmed
> sequence to take WikiAsOfNow live. Each step is a gate — do not advance until the
> prior step is confirmed. Wrangler is `bunx wrangler` (design §6.4).
>
> **The cron is enabled LAST and only by a human.** Enabling it before the real
> provider is verified and stub packs are purged re-introduces the StubResearchProvider
> PK-poisoning hazard (CC-7) and can double-spend metered LLM budget (design §3.5).
>
> Every step here is **Sam-only** — it touches a real Cloudflare account, real secrets,
> or real spend. No automated agent runs any command in this file.

## Pre-flight (confirm before starting)
- [ ] Workers Paid plan active (queues require it — design §6.2).
- [ ] `bunx wrangler whoami` shows the correct account.
- [ ] **Disconnect Worker Builds** in the dashboard so its git-connected auto-deploy
      can't race CI/wrangler (design §6.4). **Do this before the first deploy.**
- [ ] `WorkersAiResearchProvider` is wired and env-gated (Phase 1) — the workerd test
      that hardwires `fake-provider/0` still runs on the stub path (design §3.5). The
      deployed default stays on the stub until step 8 flips `RESEARCH_PROVIDER`.

## 1. Provision (see scripts/provision.md)
- [ ] Create dev + prod D1; paste real `database_id`s into all four config slots
      (`REPLACE_WITH_DEV_D1_ID` / `REPLACE_WITH_PROD_D1_ID` in both wrangler configs).
- [ ] Create the four queues (`research-dev`, `research-dlq-dev`, `research`, `research-dlq`).
- [ ] Commit the configs with real D1 ids (ids are not secret).

## 2. Apply migrations remotely
- [ ] `bunx wrangler d1 migrations apply wiki-as-of-now-dev --remote --env dev`
- [ ] `bunx wrangler d1 migrations apply wiki-as-of-now --remote --env production`

## 3. Put secrets (interactive; never a flag — see scripts/provision.md for the full set)
App worker (per env): `SESSION_SECRET`, `ADMIN_SECRET` (single-admin fallback until OAuth,
design §3.6), and `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` when OAuth creds arrive.
Research worker (per env): `BRAVE_API_KEY` (absent → the no-search fallback + manual-URL
paste path keep the real fetch+verify logic running, design §3.6) and `RESEARCH_KILL_SWITCH`.
- [ ] App-worker secrets put for dev and production.
- [ ] Research-worker secrets put for dev and production.

## 4. Disconnect Worker Builds
- [ ] Confirmed disconnected (pre-flight) before the first deploy.

## 5. FIRST deploy — both workers (dev first, then production)
- [ ] `pnpm exec opennextjs-cloudflare deploy --env dev`
- [ ] `bunx wrangler deploy -c workers/research/wrangler.jsonc --env dev`
- [ ] Verify dev, then repeat with `--env production`.
- [ ] (After the deploy-token secrets are added, CI's `deploy.yml` does this on push;
      the first deploy is done by hand to confirm the topology.)

## 6. Smoke-test LIVE Gemma + Brave
- [ ] Trigger one real research run end-to-end against **Gemma** (`@cf/google/gemma-...`)
      via `env.AI` on the deployed research worker (query-gen → triage → verbatim check).
      Confirm a real evidence card with a verified verbatim quote + real URL is produced.
- [ ] With `BRAVE_API_KEY` present, confirm **Brave** search returns real resolving URLs
      (not the fallback path). Without the key, confirm the manual-URL path still works.
- [ ] Confirm the audit log wrote codes-only rows (no PII — CC-12) and the research pack
      recorded the full `model_version` (G12 disclosure).

## 7. Purge stub packs
- [ ] Run `scripts/purge-stub-packs.ts` against the live D1 to **purge stub** packs:
      delete every `model_version = 'fake-provider/0'` research pack so stub packs don't
      permanently block real research for their `(claim_key, source_revision_id)` pairs
      (CC-7; design §3.5). The script reports the count removed; verify before and after.

## 8. Flip the provider, then the cron — LAST, human-confirmed
- [ ] Only after steps 1–7 are green. Set `RESEARCH_PROVIDER=workers-ai` on the research
      worker (per env) so `selectResearchProvider` returns the real provider instead of the
      stub, and redeploy the research worker. Confirm a fresh run produces a real pack.
- [ ] Then **enable the cron** LAST: add a `triggers.crons` block to
      `workers/research/wrangler.jsonc` (per env) and redeploy the research worker.
- [ ] **The cron interval MUST exceed the worst-case batch drain time** so a new batch is
      never seeded while the prior batch is still draining (design §3.5). Pick the interval
      from observed smoke-test drain time, with margin.
- [ ] Confirm the first scheduled run seeds and drains cleanly; watch the DLQ stays empty.

## Rollback
- [ ] To pause research: remove the `triggers.crons` block and redeploy (the cron stops;
      the queue drains and idles). The admin research kill-switch `RESEARCH_KILL_SWITCH`
      (Phase 5) is the in-app stop. Workers themselves stay deployed.
