<!-- ABOUTME: Phase 5 build report — auth, quotas, research kill-switch (the security-sensitive phase). -->
<!-- ABOUTME: Tasks + SHAs, test counts, the secrets/env vars Sam must provision, deviations, security judgment calls, UI QA. -->

# Phase 5 build report — Auth, quotas, kill-switch

**Status:** ✅ SHIPPED
**Date:** 2026-06-13
**Branch:** `feat/v1-build`
**SHA range:** `53e483d..d2b7cee` (8 commits)
**Merge classification:** Review — auth/session/secrets (Domain). **Sam merges this PR; the agent does NOT self-merge.**

## Summary

Added the metered-research access layer on top of the deterministic spine, without weakening either
load-bearing compliance invariant (detection stays LLM-free; the audit log stays append-only / codes-only):

- **Identity** — a `users` table (`0004_users.sql`, `WITHOUT ROWID` natural-key `user_id` PK + a unique
  `(identity_provider, identity_subject)` index) and a typed module (`src/db/users.ts`). The `user_id` is an
  opaque hash, never the raw OAuth subject (CC-12).
- **Sessions** — `jose`-signed HS256 session JWTs (`src/auth/session.ts`) carrying **only** the opaque
  `userId` (no email, no sub, no PII). `verifySession` pins `algorithms: ["HS256"]` (no alg-confusion / no
  `none`) and rejects wrong-secret, tampered, expired, and malformed tokens — all proven with **real jose**.
- **Auth mode** — `resolveAuthMode` returns `oauth` when both Google creds exist, else `single-admin`
  (`src/auth/mode.ts`). `verifyAdminSecret` is fail-closed (no `ADMIN_SECRET` → no admin access) with a
  constant-time compare (hardening pass below: hash both inputs, compare fixed-length digests — the original
  length-mismatch early return leaked the secret length via timing). `resolveCurrentUser`
  (`src/auth/current-user.ts`) resolves a request to
  authenticated (session cookie → opaque userId; single-admin header fallback → `u_admin`) or anonymous.
- **OAuth** — gated Arctic Google flow (`src/auth/oauth.ts` + three routes). `makeGoogleClient` returns
  `null` when creds/origin are absent so the routes 404 cleanly (soft gate; single-admin carries self-test).
  The flow uses **PKCE + a state cookie**; the callback re-checks the returned `state` against the stored
  cookie (CSRF defense) before exchanging the code. `deriveUserId` hashes `(provider, sub)` → opaque
  `u_<hex>`; the raw sub/email never become the `user_id` or enter the JWT.
- **Quotas** — `quota_ledger` (`0005_quota_ledger.sql`, `WITHOUT ROWID` composite PK `(claim_key,
  source_revision_id)`, FK → `users`). **The metered unit is research-pack inserts** — one write-once ledger
  row per committed pack. `neurons` / `brave_query_count` are observability stats, never the metered
  quantity. Per-user + global daily caps on a **UTC** calendar-day window (`src/quota/reconcile.ts`,
  `src/quota/config.ts`). The pre-enqueue check is **advisory fast-fail** (count-then-enqueue races, so it
  cannot bound concurrent enqueues); the **authoritative cap is the sequential consumer's count-at-commit**
  (the only race-free point), added in the security hardening pass below. _(Originally this report claimed the
  write-once ledger alone was the authoritative bound; the hardening pass found that untrue — see below.)_
- **Kill-switch** — `RESEARCH_KILL_SWITCH` (`src/research/kill-switch.ts`), default **enabled** (only an
  explicit truthy value disables). It blocks **both** the enqueue route (503) **and** the consumer (the
  worker retries-and-pauses every message so paused work resumes, never drops).
- **Composed enqueue gate** — `gateResearchEnqueue` (`src/app/api/research/gate.ts`) enforces, in order:
  kill-switch → auth → **eligibility (G11, easy_win only, fail-closed to human_only)** → quota → enqueue. It
  **composes with** (does not replace) the Phase 2 safe-lane guardrail; the G11 read is factored into a
  shared `evaluatePersistedEligibility` helper used by both the gate and the retained Phase 2
  `handleResearchEnqueue` primitive, so the guardrail lives in exactly one place.
- **Anonymous browse** — browsing is open; requesting research is gated server-side (401 for anonymous). The
  home page carries a guest-browse signpost (DESIGN.md dark tokens); the UI is advisory only — the server
  gate is authoritative.

## Tasks + SHAs

| Task | Description | SHA |
|------|-------------|-----|
| 5.1 | `users` table (`0004_users.sql`) + schema.sql mirror (+ index parity extension) + typed module | `53e483d` |
| 5.2 | `jose` session JWTs (HS256, no-PII payload, real tamper/expiry tests) + oauth/single-admin mode resolution | `666b366` |
| 5.3 | `quota_ledger` (`0005_quota_ledger.sql`) + write-once reconciliation (per-user/global caps, UTC day) against real D1 | `3bd002b` |
| 5.4 | Research kill-switch flag (default enabled; truthy disables; both states tested) | `773a15c` |
| 5.5 | Composed enqueue gate (kill-switch → auth → G11 → quota → enqueue) wired into the route + `resolveCurrentUser` | `ac602f5` |
| 5.6 | Consumer kill-switch guard + atomic quota-ledger commit with the pack (workers pool, real D1) | `d392ad2` |
| 5.7 | Gated Google OAuth start/callback/logout routes + opaque user-id derivation | `12fd71f` |
| 5.8 | Anonymous browse banner + auth-state helpers (server gate authoritative) | `d2b7cee` |

## Test counts

| Pool | Before (baseline) | After | Delta |
|------|-------------------|-------|-------|
| Node (`vitest run`) | 740 | 810 | +70 |
| Workers (`vitest run -c vitest.workers.config.mts`) | 15 | 17 | +2 |

Final gate (all fresh, this session): `tsc --noEmit` exit 0 · `eslint .` exit 0 · Node 810/810 · workers 17/17.
(The workers pool prints a "close timed out" Miniflare teardown notice after `17 passed` — the documented
pre-existing harness quirk; "Tests closed successfully".)

New / changed test files (real assertions; real `jose`; real D1 via `freshTestExecutor` or Miniflare):

- `test/db/migration.test.ts` (+6) — `0004_users` columns / NULL-PK rejection / unique-identity; `0005_quota_ledger`
  columns / NULL-PK / FK-to-users; the schema-equivalence parity test extended to `type IN ('table','index')`.
- `test/db/users.test.ts` (5, real D1) — upsert→read by id, lookup by (provider, subject), idempotent re-login,
  unknown id / unknown identity → undefined.
- `test/auth/session.test.ts` (7, **real jose**) — round-trip, wrong-secret reject, tampered-payload reject,
  expired reject, malformed reject, missing-userId reject, **no-PII payload** (decode → only `{exp,iat,userId}`,
  no `@`, no `http`).
- `test/auth/mode.test.ts` (7) — oauth vs single-admin (incl. empty-cred), admin verify accept/wrong/empty,
  same-length-wrong reject, fail-closed when unset, stable `u_admin`.
- `test/auth/current-user.test.ts` (8, real jose) — valid session, wrong-secret/expired session → anonymous,
  admin-header authenticates (single-admin only) / wrong-header / ignored-in-oauth-mode, default anonymous,
  session preferred over admin header.
- `test/auth/oauth.test.ts` (6) — factory null on any missing cred/origin, client when present, deriveUserId
  deterministic + opaque (no raw subject) + distinguishes subjects/providers.
- `test/auth/cookies.test.ts` (4) — hardened attribute set (HttpOnly/Secure/SameSite=Lax/Max-Age/Path),
  value URL-encoding, custom path, clear (Max-Age=0).
- `test/quota/reconcile.test.ts` (7, real D1) — one ledger row per pack + usage stored, write-once de-dup on
  re-commit, per-user cap throw, **UTC-day boundary** (yesterday doesn't count), global cap with per-user room,
  error scope, `utcDayKey`.
- `test/quota/config.test.ts` (6) — defaults (absent + empty), valid overrides, non-integer / zero-or-negative /
  non-numeric rejected **at load**.
- `test/research/kill-switch.test.ts` (6) — default enabled, truthy disables, case/whitespace tolerant, falsy
  stays enabled, garbage stays enabled, stable error name.
- `test/app/research-route-gating.test.ts` (6, real D1) — kill-switch→disabled, anonymous→unauthenticated,
  **human_only→ineligible (G11) even past kill-switch+auth**, **no-verdict→ineligible (fail-closed)**,
  easy_win+under-quota→enqueued once, easy_win+at-cap→quota_exceeded.
- `test/app/browse-mode.test.ts` (2) — anonymous browse-only/can't research; authenticated can.
- `test/workers/quota-killswitch.test.ts` (2, **real Miniflare D1**) — a committed pack writes exactly one
  `u_admin` ledger row atomically (stub usage → neurons/brave = 0, honest); kill-switch ON → no pack, no ledger
  row, message retried.
- `test/queue/research-jobs.test.ts` (updated, not net-new) — the three `commitTerminal` callsites updated to the
  3-arg `usage` signature; the composition-proof now asserts the **4-statement** atomic batch (`[upsertUser, pack,
  ledger, audit]`); the orphan-FK rollback test now also asserts the **ledger row rolls back** with the pack.

## Secrets + env vars Sam must provision

**Secrets — set via `bunx wrangler secret put NAME` (NEVER a flag, NEVER committed):**

| Name | Worker | Purpose | If absent |
|------|--------|---------|-----------|
| `SESSION_SECRET` | app (root) | HS256 key for session JWTs (use ≥32 random bytes) | Sessions can't be issued/verified; callback 500s. **Required for any login.** |
| `ADMIN_SECRET` | app (root) | Single-admin self-test secret (sent as the `x-admin-secret` header) | Admin access fails closed (no admin). |
| `GOOGLE_CLIENT_ID` | app (root) | Google OAuth client id | OAuth disabled → routes 404; app runs in single-admin mode. |
| `GOOGLE_CLIENT_SECRET` | app (root) | Google OAuth client secret | (same — both Google creds needed for oauth mode) |
| `RESEARCH_KILL_SWITCH` | **research worker** (`-c workers/research/wrangler.jsonc`) AND/OR app (root) | Pause research. Absent ⇒ enabled. Set to `1`/`true`/`on`/`yes` to disable. | Research enabled (the normal state). Set on BOTH workers to fully pause enqueue + consume. |

**Plain vars (may be `secret put` or a `vars` entry; non-secret but env-provided):**

| Name | Worker | Purpose | Default if absent |
|------|--------|---------|-------------------|
| `APP_ORIGIN` | app (root) | Public origin for the OAuth redirect URI (`<APP_ORIGIN>/api/auth/google/callback`) | OAuth disabled (factory returns null). |
| `QUOTA_PER_USER_DAILY` | app (root) | Per-user daily pack-insert cap | `10` |
| `QUOTA_GLOBAL_DAILY` | app (root) | Global daily pack-insert cap | `50` |

Notes:
- The **research worker** reads its OWN config (CC-9) — set `RESEARCH_KILL_SWITCH` there with
  `bunx wrangler secret put RESEARCH_KILL_SWITCH -c workers/research/wrangler.jsonc` to pause the consumer.
- Invalid `QUOTA_*` (non-integer / ≤0) **fail at load**, not first use (`loadQuotaConfig`).
- The single-admin user (`user_id = u_admin`) is **self-seeded** by the consumer's atomic commit — no manual
  `users` row insert is required before research runs.

## Deviations

- **D-1 — eligibility runs BEFORE quota in the composed gate (plan's stated order), not the reconciliation
  note's quota-before-eligibility shortcut.** The Task 5.5 reconciliation note offered two paths; its
  "Preferred" path put quota before eligibility purely to reuse `handleResearchEnqueue` unchanged, and
  explicitly flagged that ordering as a tolerable compromise. The plan's load-bearing ordering pitfall
  (repeated twice) is **kill-switch → auth → eligibility (G11) → quota → enqueue** — "an ineligible claim
  never consumes a quota check or a slot." I implemented that stated order. To keep G11 in **one** place
  (no duplication) AND keep the Phase 2 `research-enqueue.test.ts` green, the G11 read was factored into a
  new shared helper `src/safelane/persisted-eligibility.ts` (`evaluatePersistedEligibility`, fail-closed to
  human_only), consumed by both `gateResearchEnqueue` and the retained `handleResearchEnqueue` primitive.
  Both gating orders pass the gating test; this one matches the plan's explicit intent. No guardrail weakened.
- **D-2 — the consumer self-seeds the single-admin user inside the atomic commit.** `quota_ledger.user_id`
  FKs to `users`, but the pre-existing `research-worker.test.ts` happy-path (which must stay green) does not
  seed `u_admin`, and production's `users` table is empty after migration. Rather than add a separate
  bootstrap write or edit that test, `commitTerminal` now batches **four** statements from one executor
  (CC-3): `[upsertUserStatement(u_admin, idempotent), insertPackStatement, quotaEntryFor, appendStatement]`.
  The admin upsert is `ON CONFLICT DO UPDATE SET email` so it never clobbers a real user; the whole batch is
  both-or-neither, so an FK failure still rolls everything back. This makes the consumer self-sufficient and
  kept `research-worker.test.ts` green unchanged. (The three Node-pool `research-jobs.test.ts` callsites and
  the composition-proof count were updated to the new 4-statement signature — sanctioned by Task 5.6(d).)
- **D-3 — admin secret is presented via an `x-admin-secret` HEADER, not a query param or flag.** The plan
  said "falls back to admin-secret header" without naming it. Chose a request header (`x-admin-secret`,
  exported as `ADMIN_SECRET_HEADER`) so the secret never lands in a URL / access log / `ps` (universal
  no-secret-in-flags pitfall). The admin-header path is active only in single-admin mode (ignored once
  Google creds make it oauth mode — sessions only).
- **D-4 — OAuth-flow cookies are path-scoped to `/api/auth` and named `oauth_state` / `oauth_verifier`.**
  The plan said "short-lived Secure/HttpOnly/SameSite=Lax cookies" without names/scope. The state + PKCE
  verifier cookies are scoped to `/api/auth` (they're only read by the callback) with a 10-minute Max-Age;
  the session cookie (`wan_session`) is site-wide with a 7-day Max-Age. A shared `src/auth/cookies.ts`
  serializer pins the hardened attribute set in one place.
- **D-5 — the schema.sql cumulative-header comment was refreshed.** It listed only `0001..0003` tables
  (already stale before this phase — Phase 4's seed tables weren't added to it). Since I was editing the
  file, I updated the header to name the full table set and point at the parity test as the source of truth.
  Comment-only; no DDL/behavior change.
- **D-6 — `pnpm`/`bunx wrangler` in the plan ran as `node_modules/.bin/*` under `fnm`.** Per this session's
  environment (`node` not on PATH), tests/typecheck/lint ran via `eval "$(fnm env)"` + `node_modules/.bin/vitest`
  / `tsc` / `eslint`. Same commands, same gate; no behavior change. (Wrangler `secret put` commands above are
  written as `bunx wrangler` per the project convention for Sam to run.)

## Security judgment calls (Domain review)

- **HS256 algorithm pinned on verify** — `verifySession` passes `algorithms: ["HS256"]`; the token header
  never picks the algorithm (defends against `alg: "none"` and alg-confusion). Tested via tamper + wrong-secret.
- **No PII in the JWT or audit log (CC-12)** — the session payload is `{ userId }` only (asserted by decoding
  the token: no `@`, no `http`, keys are exactly `exp`/`iat`/`userId`). `deriveUserId` is the opaque actor; the
  raw `sub`/`email` are stored only in `users` (email for display, subject for re-login lookup) and never in the
  JWT or any audit payload. Spot-checked: the new auth/quota/gate code makes **zero** audit writes; the only
  audit writes remain the pre-existing codes-only research-completion ones.
- **Quota is two-layer** — the pre-enqueue `assertQuotaAvailable` is advisory fast-fail (a count-then-act
  check, the textbook concurrency-bypass shape). **Correction (hardening pass below):** the original report
  claimed the write-once `quota_ledger` row alone was the authoritative bound — that was untrue. The ledger
  rows it counts exist only *after* commit, so a burst of distinct candidates all pass the low-count pre-check
  and all commit. The authoritative cap is now the **sequential consumer's count-at-commit** in
  `handleResearchMessage` (the only race-free point, CC-16); the docstrings and tests were corrected to say so.
- **Kill-switch defaults to ENABLED research** (only a truthy value disables) — research-on is the normal
  state, so an unset/empty value must not silently break research. This deliberately differs from the
  admin-secret fail-closed default (admin is the privileged path; research-on is the normal path).
- **No secret in config / fixtures / flags** — verified: no `SESSION_SECRET`/`ADMIN_SECRET`/`GOOGLE_*` literal
  in `wrangler.jsonc` or `workers/research/wrangler.jsonc`; tests inject secrets through plain `env` objects /
  real `issueSession` calls, never a committed file.
- **OAuth CSRF defense** — PKCE verifier + state cookie; the callback rejects (400) a missing/mismatched
  state before exchanging the code. The live Google round-trip is NOT exercised in tests (no network in unit
  tests) — the factory + state generation + deriveUserId are unit-tested; the live exchange is a Phase 7
  manual smoke test when creds land.

## UI surfaces needing visual QA

No automated render test exists (no jsdom/RTL in the project, by design). One surface changed this phase:

1. **`/` home page** (`src/app/page.tsx`) — a new anonymous-browse signpost banner: `shelf-gray` surface,
   `hairline-gray` border, `dust-gray` text, an iron-gall "Sign in" link to `/api/auth/google`
   (Two-Lanes Rule: iron-gall = navigation). **Verify:** the banner sits below the header, the dark-theme
   tokens read correctly, and the "Sign in" link is the only iron-gall element in the banner (no rust, no
   parchment, no uppercase eyebrow kicker). The OAuth/login round-trip itself is a Phase 7 manual smoke test
   once `GOOGLE_*` + `APP_ORIGIN` are set.

## Boundaries honored

- Detection untouched — zero imports into `src/detector/**`; the deterministic-detection (G10/DET-1) and
  append-only-audit-log (G13) guardrails are intact.
- **G11 safe-lane guardrail preserved and composed, never replaced** — a `human_only` candidate (and a
  missing/corrupt verdict, fail-closed) is still refused after the rewire (asserted by the gating test).
- The metered unit is **pack inserts**, not provider calls — `neurons`/`brave_query_count` are stats columns,
  never the count.
- The ledger row commits in the SAME `db.batch([...])` as the pack (CC-3) — write-once, both-or-neither.
- `processBatch` stays sequential (CC-16); the kill-switch retries (never ack-drops) to pause, not discard.
- No secrets in `wrangler.jsonc` / fixtures / flags; audit stays codes-only / no-PII (CC-12).
- `getCloudflareContext()` only inside handler bodies; every new route exports `dynamic = "force-dynamic"` (CC-11).
- Migrations `WITHOUT ROWID` + explicit NOT-NULL PK (DB-1/CC-1), mirrored byte-identically into schema.sql
  (CC-2, parity test green incl. the new unique index).
- Did not touch `src/detector/**`, `src/research/**` pipeline core, or `src/queue/**` transport core beyond the
  sanctioned `research-jobs.ts` `commitTerminal` extension + the worker kill-switch guard.

## Status

**DONE.**

## Security hardening pass (2026-06-13)

A post-ship security bug-hunt over this phase found four real defects in the just-shipped auth/quota/kill-switch
surface. All four were fixed with strict TDD (a failing security test first, then the minimal fix, then green),
each with real D1 / real jose assertions — never a test of the mock. The full suite stays green
(`tsc` + `eslint` clean; **817 Node + 26 workers**, up from 810 + 17). The Phase 5 banner stays **✅ SHIPPED**;
this is a hardening amendment, not a re-scope.

| # | Severity | Defect | Fix | Commit |
|---|----------|--------|-----|--------|
| 1 | CRITICAL | `POST /api/queue/enqueue-research` was **fully ungated** — anonymous callers could enqueue arbitrary candidate ids (incl. `human_only`/no-verdict) onto the metered path, bypassing kill-switch + auth + the G11 safe-lane guardrail + quota. A second door past the correctly-gated single-candidate route. | Route the batch path through the SAME composed building blocks via `gateEnqueueCandidatesForResearch`, which delegates each candidate to `gateResearchEnqueue` (no G11 duplication): kill-switch → auth (401 anonymous) → per candidate lookup → `evaluatePersistedEligibility` (fail-closed to `human_only`) → quota → enqueue, returning a per-candidate disposition. New workers-pool gating test mirrors `research-route-gating`. | `f68baf2` |
| 2 | HIGH | `ResearchMessage` carried no `userId`, so `commitTerminal` hardcoded every `quota_ledger.user_id` to `u_admin`. In OAuth mode the gate's per-user pre-check reads the real opaque userId and always saw 0 → the **per-user cap never tripped** (masked because no test drove the consumer as a non-admin user). | Thread the enqueuer's `userId` onto the message (gate + batch + `enqueueResearch`) through to `commitTerminal`, which keys the ledger row to `msg.userId ?? SINGLE_ADMIN_USER_ID` and seeds THAT user in the same atomic batch via `seedUserIfAbsentStatement` (ON CONFLICT DO NOTHING — never clobbers a real login). `u_admin` stays only for the cron/seed path. Coupled test drives the REAL commit as a non-admin user and asserts the per-user pre-check then trips. | `bf6ca33` |
| 3 | HIGH | `assertQuotaAvailable` is a producer-side pre-check counting ledger rows that exist only **after** commit, so a burst of distinct candidates all pass the low-count pre-check and all commit, overrunning per-user/global caps unbounded. The cap was enforced **nowhere race-free**. | Enforce the cap at the **sequential consumer's commit** (count-then-insert is race-free, CC-16): `countCommittedPacksOnDay(user+global)` before insert; at/over cap → drop (no pack, no ledger), write a codes-only `research.quota_exceeded` audit, ACK (re-researchable after the UTC day rolls over). Workers-pool test: N+1 distinct easy-wins with cap N → exactly N packs+ledger, the (N+1)th dropped. | `bf6ca33` |
| 4 | LOW | `timingSafeEqual` early-returned on a length mismatch, leaking `ADMIN_SECRET`'s length via timing and contradicting its own "length-constant" comment. | Genuine constant-time compare: hash BOTH inputs to a fixed-length SHA-256 digest, then compare the 32-byte digests byte-by-byte with no early return. `verifyAdminSecret` is now async; its sole caller (`resolveCurrentUser`) awaits it. | `7155ab8` |

### Corrected quota-bound description

The original report (and several code docstrings) claimed *"the authoritative bound is the write-once
quota_ledger row committed atomically with the pack."* **That was untrue.** The write-once ledger guarantees
no double-count on a re-delivered claim, but it does NOT bound the count of *distinct* claims — each commits
its own ledger row. The authoritative cap is the **sequential consumer's count-at-commit** in
`handleResearchMessage` (count the day's committed packs, then insert; race-free only because the consumer is
single-threaded per CC-16). The producer-side `assertQuotaAvailable` is an **advisory fast-fail** that keeps
the queue from filling with work that will be dropped at commit — nothing more. Code docstrings
(`gate.ts`, `reconcile.ts`) and this report were corrected to state this.

### Boundaries honored (hardening pass)

- Detection untouched (no imports into `src/detector/**`); the audit log stays append-only and **codes-only**
  — the new `research.quota_exceeded` audit carries `{ claimKey, scope }` only (no claim text, no userId, G13/CC-12).
- The G11 safe-lane guardrail is enforced on the batch path by reusing `evaluatePersistedEligibility` (not duplicated).
- The metered unit stays **pack inserts**, never provider calls; the consumer commit stays atomic (one `db.batch`, CC-3).
- No `better-sqlite3`/`local-db` imports in worker-bundled code (CC-5); no secrets in fixtures/config/flags.
