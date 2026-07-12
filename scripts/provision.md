# Provisioning — Sam-run only (Cloudflare account + wrangler auth required)

> These commands create real account resources and cost money (Workers Paid).
> Do NOT let an automated agent run them. Run them yourself, in order, once.
> Wrangler is `bunx wrangler` (node is not on PATH; design §6.4). Verify auth first:
> `bunx wrangler whoami`
>
> This file is intentionally `.md`, not `.sh`, so it can never be `chmod +x`-ed and
> auto-run against a live account. Copy-paste each block by hand.

## 1. Create D1 databases (one per environment; both workers share each)

```bash
bunx wrangler d1 create wiki-as-of-now-dev
bunx wrangler d1 create wiki-as-of-now
```

Each prints a `database_id`. Paste the **dev** id into BOTH `env.dev.d1_databases[0].database_id`
slots (root `wrangler.jsonc` and `workers/research/wrangler.jsonc`), replacing
`REPLACE_WITH_DEV_D1_ID`. Paste the **prod** id into both `env.production` slots
(`REPLACE_WITH_PROD_D1_ID`). The two workers MUST point at the same id per env (CC-10).

## 2. Apply migrations remotely (per env)

```bash
bunx wrangler d1 migrations apply wiki-as-of-now-dev --remote --env dev
bunx wrangler d1 migrations apply wiki-as-of-now --remote --env production
```

Applies all `migrations/*.sql` (wrangler globs the whole dir — currently 0001–0003, 0004,
0005, 0008, with 0006–0007 permanently reserved/unused; the 4-digit prefix order is
load-bearing, CC-2). Run once per env. There is no `0009` migration — Phase 6 feedback is
additive `session.feedback` audit rows, not a schema change.

> If wrangler insists on the literal per-env database name for the apply, the dev command is
> `bunx wrangler d1 migrations apply wiki-as-of-now-dev --remote --env dev` (already shown) and
> prod is `bunx wrangler d1 migrations apply wiki-as-of-now --remote --env production`. The
> `--env` flag is what binds the command to the right remote database.

## 3. Create queues (account-global; distinct names per env, design §6.2)

```bash
bunx wrangler queues create research-dev
bunx wrangler queues create research-dlq-dev
bunx wrangler queues create research
bunx wrangler queues create research-dlq
```

Queues are account-global single-consumer, so dev and prod MUST use distinct names
(integration-contract §2.6). The DLQs (`research-dlq*`) are referenced only via
`dead_letter_queue` in the consumer config — they are NOT separate bindings. Create them so
wrangler can route retries-exhausted messages there.

## 4. Put secrets (per worker, per env — interactive prompt, NEVER a flag)

Secrets are prompted, never passed on the command line (they would be visible in `ps` /
shell history — universal pitfall; compliance pre-flight, design §9). Repeat each `--env dev`
block with `--env production` for the prod environment.

### App worker (root `wrangler.jsonc`)

```bash
# Session signing key (required for issuing/verifying the wan_session cookie, Phase 5):
bunx wrangler secret put SESSION_SECRET --env dev
# Single-admin fallback secret (x-admin-secret header; active until OAuth creds land, design §3.6):
bunx wrangler secret put ADMIN_SECRET --env dev
# Google OAuth creds — when they arrive (until then, single-admin mode via ADMIN_SECRET):
bunx wrangler secret put GOOGLE_CLIENT_ID --env dev
bunx wrangler secret put GOOGLE_CLIENT_SECRET --env dev
```

App-worker **vars** (non-secret; set in `wrangler.jsonc` `vars` or via the dashboard, not
`secret put`): `APP_ORIGIN` (OAuth redirect base), `QUOTA_PER_USER_DAILY`, `QUOTA_GLOBAL_DAILY`
(absent → safe defaults).

### Research worker (`workers/research/wrangler.jsonc`)

```bash
# Brave search key — the live search path. Absent → no-search fallback + manual-URL paste
# path keep the real fetch+verify logic running (design §3.6):
bunx wrangler secret put BRAVE_API_KEY -c workers/research/wrangler.jsonc --env dev
# Admin research kill-switch — an explicit truthy value pauses the consumer + scheduler (Phase 5).
# Absent ⇒ research enabled: leave it UNSET at go-live; put it only when research must pause:
bunx wrangler secret put RESEARCH_KILL_SWITCH -c workers/research/wrangler.jsonc --env dev
```

Research-worker **vars** (non-secret): `RESEARCH_PROVIDER` (set to `workers-ai` to flip on the
real provider — a go-live step, NOT here; default stays on the stub, CC-7), `QUOTA_PER_USER_DAILY`,
`QUOTA_GLOBAL_DAILY`.

## 5. After provisioning

Commit the config with the real `database_id`s pasted in (the IDs are not secret).
Then follow `docs/runbooks/go-live.md` for the deploy + smoke-test + cron-enable sequence —
**the cron is enabled LAST, by hand, only after the live Gemma+Brave smoke test passes and
the stub `fake-provider/0` packs are purged.**
