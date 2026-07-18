<!-- ABOUTME: Design for the dev-environment-only session mint that lets agents QA authed flows on dev. -->
<!-- ABOUTME: Records the double fail-closed gate, prod-absence proof, and why header auth alone was insufficient. -->

# Dev-only session mint — design

**Date:** 2026-07-18 · **Status:** Shipped with this design's PR · **Approval:** Sam (2026-07-18) approved
implementing and merging this (upgrade from the handoff's "design only, sign-off before implementing") so
agents can QA authed flows — deletion, enqueue — without Sam driving each run.

## Problem

Authed flows (research enqueue, account deletion) could not be exercised end-to-end by an agent:
production runs oauth mode, where `src/auth/current-user.ts` disables the admin-header fallback by
design.

**Discovery that reframed the problem:** the dev deployment (`wiki-as-of-now-dev`) has no Google
credentials configured, so it runs **single-admin mode**, not oauth — the `x-admin-secret` header
fallback is already live there. What that fallback still cannot do:

- mint a **session cookie**, so browser-driven QA (nav chip, account menu, signed-out redirects)
  is impossible — headers can't ride a browser navigation;
- create a **real user row** — header auth resolves to `u_admin` with no `users` row, so flows
  that join through `users` (deletion, quota attribution) don't run at full fidelity;
- exercise **deletion parity** — delete clears the session cookie and expects a profile row to
  remove; header auth has neither.

## Chosen design: `POST /api/dev/mint-session`

A dev-environment-only route that mints a real user + real session, double-gated and fail-closed:

1. **Environment flag:** `DEV_SESSION_MINT === "enabled"`, declared ONLY in the `env.dev` vars
   block of `wrangler.jsonc`. Anything else → uniform 404. A node-pool config test parses
   `wrangler.jsonc` with wrangler's own `unstable_readConfig` and asserts the flag is absent from
   the production env AND the top-level (default) env — so a future config edit that leaks it into
   prod fails CI, not code review.
2. **Secret:** `x-admin-secret` header must pass `verifyAdminSecret` (constant-time; fail-closed
   when `ADMIN_SECRET` is unset). Wrong/missing → the same uniform 404 (no probing signal).
3. `SESSION_SECRET` must be configured (500 otherwise, same as the OAuth callback).

Behavior on success: upsert a user with `identityProvider: "dev-test"`, subject from the optional
JSON body (`{ "subject": "..." }`, `^[a-z0-9][a-z0-9-]{0,63}$`, default `dev-test-user`), email
`<subject>@dev-test.invalid`, `userId = deriveUserId("dev-test", subject)` — the same opaque-hash
path as real users. Issue a 1-hour session (vs 7 days for real logins), return
`{ userId, subject, expiresInSeconds }` plus the hardened `wikinow_session` Set-Cookie.

Deleting a minted account exercises the production deletion path exactly (profile row removed,
ledger attribution NULLed, `account.deleted` audit row appended, cookie cleared); re-minting the
same subject recreates the same `userId` — mirroring real re-login semantics.

## Considered and ruled out

- **Rely on the existing admin-header fallback** — no cookie, no user row, no deletion parity
  (see above); also breaks entirely if dev ever gains OAuth credentials for parity with prod.
- **Configure real Google OAuth on dev and drive the browser flow** — Google sign-in cannot be
  automated by agents (and Sam's Advanced Protection makes even manual runs costly); would also
  put a second set of live Google credentials in play for no product benefit.
- **A prod-reachable mint behind a stronger secret** — rejected outright: item 4's grant is
  explicitly dev-env-only ("config absent from prod entirely"). Prod deletion-flow QA therefore
  still needs Sam (or an explicit future decision); dev-parity QA is the coverage this provides.

## Security posture

- Both gates fail closed; all gate failures return an identical 404, indistinguishable from the
  route not existing (which is exactly the prod state: flag absent → 404 before any secret work).
- The secret comparison is the existing constant-time digest compare (`src/auth/mode.ts`).
- Sessions minted are short-lived (1 h) and scoped to dev's own D1; no PII beyond a synthetic
  `.invalid` email is created. The route performs no Wikimedia access and spends no quota itself.
- CSRF: the route requires a custom header, which a cross-origin page cannot attach without a
  CORS preflight the route never grants.
