<!-- ABOUTME: Phase 7 build report — provision & deploy PREP (config, CI gates, dormant deploy pipeline, go-live runbook). -->
<!-- ABOUTME: Records config/CI/docs changes + SHAs, what is deferred to Sam, the exact go-live command sequence. Authored 2026-06-13. -->

# Phase 7 build report — Provision & deploy prep

**Status:** ✅ SHIPPED on 2026-06-13 (branch `feat/v1-build`, commits `bb1f14d`…`e0119fb`, 7 commits). Sam-gated steps remain (provision, deploy, secret-put, cron-enable).
**Suite:** tsc + lint clean · 895 Node (+38) · 26 workerd (unchanged) · research worker `--dry-run` bundles credential-free · bundle backstop clean.
**Verification ceiling (honest):** this phase is **"ready to deploy," NOT "deployed."** No real provisioning, deploy, secret-put, or cron-enable ran — those need Sam's Cloudflare account + credentials and are the human go-live steps in `docs/runbooks/go-live.md`.
**Merge classification:** **Review — architecture (deploy topology + CI gates + public-facing infra config).** This phase wires the per-env deploy topology, the CI build/dry-run gate, and a deploy pipeline; agent does NOT self-merge.

---

## Tasks shipped (in order)

| Task | What | Commit | Tests added |
|---|---|---|---|
| 7.1 | Pin Workers AI binding on app + research workers (verify-only; Phase 1 already landed it) | `bb1f14d` | 4 |
| 7.2 | Per-env dev/prod blocks on both wrangler configs | `42e8ace` | 11 |
| 7.3 | Research-bundle-cleanliness backstop (static import-graph walk) | `517972c` | 4 |
| 7.4 | Sam-run `bunx wrangler` provisioning command reference + drift guard | `121cbb5` | 5 |
| 7.5 | CI: OpenNext build + both-worker dry-run + bundle backstop | `e96a01b` | 4 |
| 7.6 | Dormant dev→main deploy pipeline (gated on deploy-token secret) | `8efbe94` | 5 |
| 7.7 | Go-live runbook (ordered, human-confirmed; cron LAST) | `e0119fb` | 5 |
| 7.8 | Phase verification gate | — | — |

**Total Phase 7 tests: 38** (Node pool 857 → 895). All live in `test/config/`.

---

## Files created

**Config / build tooling:**
- `scripts/check-research-bundle-clean.mjs` — build-time backstop. `findForbiddenImports(entryFile)` does a static, depth-bounded import-graph walk from `workers/research/index.ts`, resolving relative imports, and flags any reachable module whose source carries a quote-bounded `better-sqlite3` / `local-db` import specifier. Quote-boundary regex deliberately ignores prose mentions (e.g. `src/db/client.ts` documents the better-sqlite3 adapter in comments but never imports it — confirmed the walker traverses into it and stays clean). Defense-in-depth second layer behind the ESLint `no-restricted-imports` rule (CC-5 / design §5.6). CLI exits non-zero on any violation.
- `scripts/provision.md` — Sam-run `bunx wrangler` command reference: `d1 create` (per env), `d1 migrations apply --remote` (per env), `queues create` (the four account-global queues), `secret put` (the real Phase-5 secret names, per worker per env). Deliberately `.md` not `.sh` so no agent can `chmod +x` and auto-run it against a live account.
- `docs/runbooks/go-live.md` — the ordered, human-confirmed go-live checklist (see "Exact go-live sequence" below). Every step is Sam-only.
- `.github/workflows/deploy.yml` — the **dormant** dev→main deploy pipeline. `main` push → production, `dev` push → dev (preview). Both workers; migrations applied before deploy. Inert until Sam adds the deploy-token secret.

**Tests (Node pool, `test/config/`):**
- `test/config/wrangler-config.test.ts` — the umbrella config-shape + drift-guard suite (34 cases): AI binding on both workers, per-env blocks (names, queues, DLQ wiring, D1 placeholders, SSRF flag, no `nodejs_compat`, no cron yet), provision.md sync, CI-gate shape, deploy-pipeline shape + dormancy guard, runbook ordering.
- `test/config/research-bundle-clean.test.ts` — exercises the backstop (4 cases): real entry clean; planted direct `better-sqlite3` import caught; transitive `local-db` import caught two hops deep; a clean small graph stays clean (proves it does not over-fire).

## Files modified

- `wrangler.jsonc` (root / app worker) — added `env.dev` + `env.production` blocks (per-env worker name, per-env self-reference service, per-env D1 placeholder + name, per-env queue producer). Top-level/default bindings left intact.
- `workers/research/wrangler.jsonc` — added `env.dev` + `env.production` blocks (per-env worker name, per-env D1 placeholder + name, per-env queue producer + consumer + DLQ name). Top-level/default bindings left intact so the workers vitest pool keeps resolving.
- `.github/workflows/ci.yml` — appended (after the existing test steps): `node scripts/check-research-bundle-clean.mjs`, `pnpm exec opennextjs-cloudflare build`, `pnpm exec wrangler deploy --dry-run --env=""` (app), and the same `-c workers/research/wrangler.jsonc` (research). No real deploy in the PR job.
- `package.json` — added `"check:bundle": "node scripts/check-research-bundle-clean.mjs"`.

**No code touched in `src/detector/**` or any prior-phase application logic. The AI binding was already present on both configs (Phase 1); Task 7.1 was verify-only — no config edit.**

---

## What is deferred to Sam (Sam-only; nothing here ran)

All of the following require Sam's Cloudflare account + credentials and are documented, copy-pasteable steps — none executed in this phase:
1. **Provision** — `bunx wrangler d1 create` (dev + prod), `bunx wrangler queues create` (the four queues), paste real `database_id`s into the four `REPLACE_WITH_*_D1_ID` slots. (`scripts/provision.md`)
2. **Migrate** — `bunx wrangler d1 migrations apply --remote` per env.
3. **Secrets** — `bunx wrangler secret put` each secret (interactive; never a flag). App worker: `SESSION_SECRET`, `ADMIN_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Research worker: `BRAVE_API_KEY`, `RESEARCH_KILL_SWITCH`. Vars: `APP_ORIGIN`, `QUOTA_PER_USER_DAILY`, `QUOTA_GLOBAL_DAILY`, `RESEARCH_PROVIDER`.
4. **Disconnect Worker Builds** in the dashboard before the first deploy.
5. **First deploy** both workers by hand (dev then prod).
6. **Smoke-test** live Gemma + Brave end-to-end.
7. **Purge stub packs** (`scripts/purge-stub-packs.ts` — deletes `model_version = 'fake-provider/0'` packs; CC-7).
8. **Flip** `RESEARCH_PROVIDER=workers-ai`, then **enable the cron LAST** (interval > worst-case batch drain).
9. **Add GitHub repo secrets** `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` to activate the dormant `deploy.yml`.

---

## Exact go-live command sequence (the runbook in brief; full version in `docs/runbooks/go-live.md`)

```bash
# 0. Pre-flight
bunx wrangler whoami                       # correct account
#    Disconnect Worker Builds in the dashboard.

# 1. Provision (paste the printed database_ids into the four REPLACE_WITH_*_D1_ID slots)
bunx wrangler d1 create wiki-as-of-now-dev
bunx wrangler d1 create wiki-as-of-now
bunx wrangler queues create research-dev
bunx wrangler queues create research-dlq-dev
bunx wrangler queues create research
bunx wrangler queues create research-dlq

# 2. Migrate (remote, per env)
bunx wrangler d1 migrations apply wiki-as-of-now-dev --remote --env dev
bunx wrangler d1 migrations apply wiki-as-of-now --remote --env production

# 3. Secrets (interactive prompt; repeat each with --env production)
bunx wrangler secret put SESSION_SECRET --env dev
bunx wrangler secret put ADMIN_SECRET --env dev
bunx wrangler secret put GOOGLE_CLIENT_ID --env dev          # when OAuth creds arrive
bunx wrangler secret put GOOGLE_CLIENT_SECRET --env dev      # when OAuth creds arrive
bunx wrangler secret put BRAVE_API_KEY -c workers/research/wrangler.jsonc --env dev
bunx wrangler secret put RESEARCH_KILL_SWITCH -c workers/research/wrangler.jsonc --env dev

# 4. First deploy — both workers (dev first, verify, then --env production)
pnpm exec opennextjs-cloudflare deploy --env dev
bunx wrangler deploy -c workers/research/wrangler.jsonc --env dev

# 5. Smoke-test LIVE Gemma + Brave end-to-end (confirm a real verified evidence card).

# 6. Purge stub packs (delete model_version = 'fake-provider/0' from live D1).

# 7. Flip the provider, THEN enable the cron (LAST, human-confirmed)
#    Set RESEARCH_PROVIDER=workers-ai on the research worker; redeploy; confirm a real pack.
#    Then add triggers.crons to workers/research/wrangler.jsonc (interval > worst-case
#    batch drain) and redeploy the research worker.
```

---

## Deviations (also summarized in the top-of-plan Deviations subsection, D-1..D-4 / Phase 7)

- **Phase 7 / D-1 — AI-binding config test asserts the real shipped shape, not the plan's idealized `{ binding: "AI" }`.** The Phase-1 deviation D4 added `remote: true` to both AI bindings (`{ "binding": "AI", "remote": true }`). The plan's Task 7.1 test sketch (`expect(cfg.ai).toEqual({ binding: "AI" })`) would fail against the config that actually ships. Per testing-pitfalls §6 (test the real shipped config), the test asserts `cfg.ai?.binding === "AI"` — pinning the binding without freezing the `remote` flag. No config edit was needed (verify-only path; the bindings were already correct).
- **Phase 7 / D-2 — the dormancy guard is a STEP-level `if:`, not the plan's JOB-level `if:`.** GitHub Actions forbids the `secrets` context in a job-level `if:` (only `github`/`needs`/`vars`/`inputs` are available there — verified against the GitHub Actions contexts docs). The plan sketch's `jobs.deploy.if: ${{ secrets.CLOUDFLARE_API_TOKEN != '' }}` would silently never run. Corrected to a step-level `if: ${{ secrets.CLOUDFLARE_API_TOKEN != '' }}` on each deploy/migrate step (the secrets context IS available at step level), with the token mapped to job `env:`. Steps skip cleanly when the secret is absent. The Task 7.6 dormancy test was written to assert the step-level form and to defend against a job-level `secrets.` guard regressing in.
- **Phase 7 / D-3 — deploy-pipeline branch→env test asserts the real DRY mapping, not literal `--env production`.** The plan sketch resolves the branch to an env once (`Resolve environment` step → `name=production` for `main`, else `name=dev`) and feeds every deploy `--env ${{ steps.env.outputs.name }}`, so the literal strings `--env production` / `--env dev` never appear. Rather than denormalize the pipeline into duplicated literal-env branches to satisfy a cosmetic regex, the Task 7.6 test asserts the real mechanism (the resolve step emits `name=production`/`name=dev`, gated on `github.ref_name == main`, and deploys consume `--env ${{ steps.env.outputs.name }}`). Same class of reconciliation the plan itself blesses for the Task 7.5 CI-invocation regex.
- **Phase 7 / D-4 — secret names in the provisioning doc + runbook follow the real Phase-5 code, not the plan sketch's `ADMIN_FLAG`.** The plan's Task 7.4 sketch used `ADMIN_FLAG`; the shipped Phase-5 code uses `ADMIN_SECRET` (an `x-admin-secret` header — Phase 5 deviation D-3) plus `SESSION_SECRET`. `scripts/provision.md` and the runbook document the real names (`SESSION_SECRET`, `ADMIN_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` on the app worker; `BRAVE_API_KEY`, `RESEARCH_KILL_SWITCH` on the research worker), matching the orchestrator's enumerated Phase-5 secret list, and the drift guard pins them.

### Operational notes (environment quirks worth knowing for the next deploy session)
- The OpenNext build (`opennextjs-cloudflare build`) internally shells out to `pnpm build`. In this build session `pnpm` is not on PATH (the fnm/`node`-not-on-PATH quirk, Phase 5 D-6), so the full OpenNext build could not complete locally — but the underlying `next build` runs credential-free and succeeds, and the research worker `--dry-run` bundles credential-free. CI (which has the pnpm toolchain via `pnpm/action-setup`) is the authoritative gate for the OpenNext build + app-worker dry-run; the research-worker dry-run was verified end-to-end in-session.
- After adding `env` blocks, `wrangler deploy --dry-run` emits a "no target environment specified" WARNING. `--env=""` (target the top-level/default config) silences it and keeps CI output pristine (testing-pitfalls §1). Both the CI steps and the in-session verification use `--env=""`.
- The dormant `deploy.yml` only triggers on `dev`/`main` pushes — it does not fire on the `feat/v1-build` feature branch, and when it eventually fires without the deploy-token secret the guarded steps skip (green, not red).

---

## Integration-review fixes

The final holistic integration review of the v1 build surfaced six cross-phase seam/wiring
defects. All six are fixed below (TDD where testable); the suite stayed green throughout
(895 Node + 27 workerd — the workerd count rose from 26 with FIX 2's new server-resolved-actor
test; tsc + lint clean; `next build` compiles all pages).

| # | Sev | Fix | Commit | Visual QA |
|---|-----|-----|--------|-----------|
| 1 | HIGH | Queue page parses the batch route's `{ results: [{ outcome }] }` shape (was reading `accepted`/`skipped`, so a successful enqueue always rendered "Queued 0"); also surfaces the 401/503 cases the now-auth-gated route returns. | `ea26726` | `/queue` — enqueue toast wording + 401/503 messages |
| 2 | HIGH (compliance) | `source.opened` resolves `actor` SERVER-SIDE via `resolveCurrentUser` (authenticated → userId, else "system"), mirroring the feedback route. Removed `actor` from the request body, from `ConfirmInput`, and from the `SourceOpenGate`/`WorksheetClient`/worksheet-page prop chain. Closes a CC-12/G13 hole where a client-supplied string was written verbatim into the append-only `audit_log`. Failing-first workers test asserts the audit row records the server-resolved actor. | `45a78f5` | `/worksheet/[candidateId]` — source-open gate still confirms + unlocks |
| 3 | MEDIUM | Wired the orphaned show-your-work transparency page (G6/G7 — selected evidence + full dropped-candidate set + LLM query log) — added an iron-gall "How this was researched →" Link next to the Evidence heading, rendered only when a pack surfaced. Previously zero inbound links → unreachable. | `eed6642` | `/worksheet/[candidateId]` (link placement/style) → `/articles/[id]/transparency` (target renders) |
| 4 | MEDIUM | Added a minimal global nav (`WikiAsOfNow` / "Easy-win lane" → `/queue` / "About" → `/about`) to the root layout so the second user journey and About have a cross-page entry point. Styled per DESIGN.md: iron-gall links (Two Lanes Rule), hairline-bordered shelf-gray bar, keyboard-reachable via the existing global iron-gall `:focus-visible` ring. | `58247b3` | global nav on every page — alignment, focus ring, hover |
| 5 | LOW | Extended the produce→commit→surface round-trip workers test to ALSO read the committed pack through the worksheet's surfacing read (`surfaceResearchPack` over `getSurfaceablePack`) at the live revision, asserting surfaced state/cards/dispositions/queries/modelVersion match the committed pack — covering the full chain through the read the UI consumes (was only reading via `getPack` directly). | `650e22c` | n/a (test only) |
| 6 | LOW | Confirmed `readAuditTrail` / `summarizeFeedback` (`src/db/audit-queries.ts`) are global/admin-scoped reads, NOT a fit for the per-claim (pack-scoped) transparency page — wiring them there would surface unrelated audit rows/actors. Retained as tested infrastructure for a future admin/transparency surface; recorded in the plan's `### Discoveries` subsection. No code change. | (plan note in same commit as this report) | n/a (note only) |

**.tsx surfaces needing visual QA** (verified by tsc + eslint + `next build`, not by automated rendering):
- `src/app/layout.tsx` — new global nav (FIX 4): bar alignment with page `max-w-3xl`, iron-gall link colour, keyboard focus ring, hover underline.
- `src/app/queue/page.tsx` — enqueue result toast (FIX 1): "Queued N for research, M skipped." copy, plus the new signed-out (401) and disabled (503) messages.
- `src/app/worksheet/components/WorksheetClient.tsx` — "How this was researched →" Link (FIX 3) next to the Evidence heading: placement/wrapping at narrow widths, iron-gall mono style; and the source-open gate still confirms+unlocks after the FIX 2 prop removal.
- `src/app/articles/[id]/transparency/page.tsx` — the now-reachable transparency target (FIX 3): renders selected/dropped/queries for a real surfaced pack.
