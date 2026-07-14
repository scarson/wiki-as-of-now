<!-- ABOUTME: Post-go-live session handoff (2026-07-13) — live-state snapshot, the auth-state UI investigation (next agent's first task), seams, guardrails, cleanup residue. -->
<!-- ABOUTME: The go-live plan (2026-07-12-go-live-plan.md) is CLOSED (all 7 phases ✅ incl. first cron tick); this doc carries what comes after. -->

# Post-go-live handoff — 2026-07-13 (~00:45Z)

**Predecessor artifacts:** [docs/plans/2026-07-12-go-live-plan.md](2026-07-12-go-live-plan.md) — the go-live plan, fully closed (all 7 phase banners ✅, first cron tick verified); [go-live-handoff-2026-07-12.md](go-live-handoff-2026-07-12.md) — the prior session's handoff (its "one open problem" is resolved; read only for history). This doc is the live one.

## Headline state

- **Production LIVE and user-testable:** https://wikinow.scarson.io (dev: https://wiki-as-of-now-dev.samuel-carson.workers.dev). `origin/dev` = `origin/main`-equivalent tip `367dffe`; main promoted at `492aa35` (PR #31). All go-live PRs merged: [#28](https://github.com/scarson/wiki-as-of-now/pull/28) `bbb9b2f`, [#29](https://github.com/scarson/wiki-as-of-now/pull/29) `ebd9447`, [#30](https://github.com/scarson/wiki-as-of-now/pull/30) `b97ca71`, [#31](https://github.com/scarson/wiki-as-of-now/pull/31) `492aa35`, [#32](https://github.com/scarson/wiki-as-of-now/pull/32) `8c0345d`, [#33](https://github.com/scarson/wiki-as-of-now/pull/33) `367dffe`. Suite at tip: 950 node + 27 workerd, tsc/eslint clean.
- **CD is armed and proven both ways:** any push to `dev` redeploys the DEV env; any push to `main` redeploys PRODUCTION (run 29204626964 proved the guarded steps execute). A merged docs-only PR still triggers a (harmless, idempotent) redeploy.
- **Research cron live on production:** `0 */8 * * *` (ticks 00:00/08:00/16:00 UTC). First tick verified green — 10 packs (exactly the 10/day per-user quota cap, all attributed to the single-admin id), 4 with evidence cards, real Gemma, DLQ provably empty. Production worksheets render cron-produced evidence + transparency pages anonymously.
- **OAuth:** Sam fixed the Google-side redirect-URI registration the same night (the go-live plan's Phase 4 banner note about `redirect_uri_mismatch` is now HISTORICAL). Sign-in completes and redirects home — which surfaced the next problem, below.

## FIRST TASK: post-sign-in state is invisible — verify the session, then wire auth state into the UI

**Sam's report (2026-07-13, verbatim symptom):** "Login appears to work but after logging in all I see is: … Browsing as a guest — detected claims are open to read. Sign in to request research on a claim."

**Recon already done (this session, code-reading — trust but verify):**

1. **The homepage guest banner is UNCONDITIONAL.** `src/app/page.tsx:78-83` renders "Browsing as a guest …" as static JSX in a `"use client"` component. It never checks the session. The comment above it says "advisory only" — it was shipped as fixed copy.
2. **The auth-state helpers exist but have ZERO production consumers.** `src/app/browse-mode.ts` (`browseModeLabel` → "Signed in", `canRequestResearch`) is imported only by `test/app/browse-mode.test.ts` (verify: `grep -rln "browse-mode" src/ test/`). Shipped at `d2b7cee` ("feat(ui): anonymous browse banner + auth-state helpers") — helpers and hardcoded banner landed together; wiring never happened.
3. **No surface anywhere renders authenticated state** — the nav (`src/app/layout.tsx`) has no account indicator, sign-out link, or session read.
4. **The callback itself looks correct** (`src/app/api/auth/google/callback/route.ts`): state+PKCE checks → userinfo → `upsertUser` → `issueSession` (7-day TTL) → `Set-Cookie` (HttpOnly/Secure/SameSite=Lax, Path=/, via `src/auth/cookies.ts`) → 302 to `/`. Sam reaching the homepage WITHOUT an error JSON means the callback returned its happy-path 302.

**Working hypothesis (high confidence, NOT yet verified):** sign-in worked; the session cookie is set and valid; the UI simply has no way to show it. I.e. a v1 scope gap, not an auth failure.

**Verification (do this FIRST — it's one browser action):** have Sam (or any signed-in browser) open https://wikinow.scarson.io/queue → Load lane → select a candidate → "Research selected (1)". Signed-in expectation: **202 + the success toast** ("Queued 1 for research."). If that happens, the session works end-to-end AND this closes the go-live QA's one unexercised item (the enqueue toast — see the plan's Phase 3 banner). If it instead shows "Sign in to request research on these candidates." (the 401 message), the hypothesis is WRONG — the cookie/session layer is genuinely broken; go to the fallback checks below.

- Quota note so a failed enqueue isn't misread: Sam's OAuth user is a DIFFERENT userId from the single-admin id the cron uses. Per-user cap (10/day) is fresh for him; global cap 50/day has 10 used. A quota rejection today would be surprising — do not confuse a 429-ish quota response with the 401.
- Fallback checks if the 401 appears for a signed-in user: (a) confirm the callback's `Set-Cookie` reached the browser (devtools → Application → Cookies → the session cookie name is in `src/auth/current-user.ts` `SESSION_COOKIE`); (b) confirm the enqueue request carries the cookie; (c) `src/auth/current-user.ts` verification path (HMAC via SESSION_SECRET, user lookup in the prod `users` table — check a row exists: `bunx wrangler d1 execute wiki-as-of-now --remote --env production --json --command "SELECT COUNT(*) AS n FROM users;"`); (d) codes-only warns in a `wrangler tail` of the APP worker during a sign-in.

**The fix (after verification):** wire auth state into the UI — smallest reasonable shape: a server read of the session (server component or `/api/me`-style endpoint returning only `{ authenticated: boolean }` — never email/userId to the client beyond what display needs) feeding the existing `browse-mode.ts` helpers; banner swaps to "Signed in" copy (and the sign-in link becomes sign-out or disappears); consider the nav indicator. TDD per CLAUDE.md (the helpers already have tests; the wiring needs behavioral tests). **Do NOT rebuild the helpers — they exist and are tested.** Scope discipline: this is UI-state display, not the auth mechanism; do not touch `gate.ts`/session issuance/cookie attributes for a display bug. Merge classification judgment: display-only wiring is arguably `Routine`, but it's auth-adjacent — if in doubt classify `Review — auth-adjacent UI` and let Sam glance at it.

**Also missing (same family, spotted during recon):** there is no sign-OUT path at all (no route clears the session cookie). Worth bundling with the fix or queueing as a follow-up.

## Operational state a fresh agent must know

1. **Merge authority:** Sam's blanket merge grant was SCOPED TO THE GO-LIVE SESSIONS ("this grant is session-scoped" — plan §Authorization note). Future sessions fall back to CLAUDE.md §Keeping a clean git graph defaults: agents auto-merge `Routine` PRs on green CI; domain triggers (auth! security, schema, interfaces) → `Review` for Sam. The auth-state fix sits near that line — see classification note above.
2. **Secrets and the permission classifier:** the auto-mode classifier blocks `wrangler secret put` and `wrangler queues purge` unless Sam has NAMED the specific entry in chat. If new secret work comes up, batch one plain-text question naming everything (plain text — Sam: never the AskUserQuestion tool). All go-live secrets are SET (names verified): app prod = SESSION_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (oauth mode; no ADMIN_SECRET — deliberately inert); research prod = BRAVE_API_KEY; dev = SESSION_SECRET, ADMIN_SECRET (rotated this session; value died with the session scratchpad — rotate again if needed, with Sam's naming), BRAVE_API_KEY. Credential files are DELETED from the repo root; values live only in Cloudflare now.
3. **Toolchain:** every quirk is in the `toolchain-quirks` user memory — headline ones: `cd` into a worktree in EVERY Bash call (cwd resets); `eval "$(fnm env)"` for node; `bunx wrangler` never npx; foreground `sleep >60s` is blocked (use Monitor); Cloudflare 403s python-urllib's default UA (even on our own domains — set a custom User-Agent); in-app-browser screenshots are 2× CSS pixels (click by `ref`); `wrangler tail` needs `-c <config> --env <e>` form, JSON to a file.
4. **workerd receiver rule (pitfalls AI-2):** never pass a detached global `fetch` (or any platform global) to be invoked through a property — workerd throws `TypeError: Illegal invocation`. Wrap in a lambda; receiver contracts are pinned by tests in `test/research/brave-search.test.ts` + `test/research/source-fetch.test.ts`.
5. **Compliance boundaries stand:** no touching `src/detector/**`, `src/safelane/**`, `src/db/audit-log.ts`, or the research gate chain without escalation (`docs/policy/wikipedia-genai-compliance.md`).
6. **Cron behavior at steady state:** ticks at 00/08/16 UTC seed up to 50 candidates; commits are quota-capped (10/day, attributed to the single-admin id); `research.quota_exceeded` audit rows are EXPECTED and healthy; quota-dropped claims re-research after the UTC day rolls. New packs only appear when new content is captured or the day rolls — an "idle" tick is normal, not a failure.

## Cleanup residue (optional, none blocking)

- `research-dlq-dev`: ~8 inert dead messages from the pre-fix retry storms; purge was classifier-blocked (needs Sam to name it) — or leave forever, they cost nothing.
- Worktrees under `.claude/worktrees/`: `go-live`, `provider-flip`, `research-cron`, `go-live-final`, `first-tick-docs`, `handoff-0713` are all MERGED and removable (`git worktree remove <path>`). **Do NOT touch `laughing-chaplygin-ce1c13`** — another session's ~35 uncommitted gold-corpus changes.
- Brave key rotation (optional): the key's bytes appeared hex-dumped in the 2026-07-12 session transcript during debugging; it works and the file is deleted — rotate in the Brave dashboard if transcript exposure matters.
- wrangler 4.98 → 4.110 update available.
- `.beads/config.yaml`: an uncommitted daemon modification in the main checkout was discarded by a `git reset --hard` realign on 2026-07-12 (agent error, surfaced to Sam); tracked version intact — mentioning so a future beads oddity has a lead.

## Known product observations (not defects to fix without asking)

- **DET-3 residual FP class** visible live: SoFi Stadium "played their inaugural season in 1960" flagged (incidental year). Documented in the plan's Discoveries; detector is compliance-frozen — surface patterns to Sam, don't patch.
- **"provider unavailable" honesty banner on no-pack worksheets** is the spec's designed mapping (not_found → provider_unavailable, spec §18.5) even when research simply hasn't run — reads oddly but is per spec; a wording change would be a product decision for Sam.

## Priority queue

1. **Verify the signed-in session end-to-end** (one authed enqueue on /queue → 202 + toast). Closes the toast QA item too.
2. **Wire auth state into the UI** using the existing `browse-mode.ts` helpers (+ decide sign-out). TDD; classification per note above.
3. (If #1 fails) systematic-debugging on the cookie/session layer — fallback checks listed above.
4. Optional residue: DLQ purge (Sam-named), worktree cleanup, Brave rotation, wrangler bump.

## Continuation prompt (paste-ready)

> WikiAsOfNow is live at https://wikinow.scarson.io (go-live complete — see docs/plans/2026-07-12-go-live-plan.md, all banners ✅). Read docs/plans/go-live-handoff-2026-07-13.md first. Your first task is its "FIRST TASK" section: Sam signs in with Google successfully but the UI still says "Browsing as a guest" — recon says the banner is hardcoded (src/app/page.tsx:78) and the tested browse-mode.ts helpers were never wired to any surface, so the session is probably fine and invisible. Verify with one authed enqueue on /queue (expect 202 + the "Queued 1 for research." toast — that also closes the last go-live QA item), then wire auth state into the UI (TDD, smallest change, do NOT touch the gate chain or session issuance; consider adding sign-out). Toolchain gotchas: user memory `toolchain-quirks`; workerd fetch rule: pitfalls AI-2. Merge rules: CLAUDE.md defaults (the go-live session's blanket grant expired) — Routine auto-merge on green CI, auth-adjacent judgment per the handoff.

## Adversarial review of this handoff

- **Round 1 — naive fresh agent:** 3 findings applied (added the exact grep to re-verify the unwired helpers; spelled out where SESSION_COOKIE's name lives; added the users-table count command with the right DB name).
- **Round 2 — recency bias:** 2 findings applied (merge-authority expiry was buried mid-session — promoted to Operational state #1; the quota-attribution subtlety from the first-tick verification added to the verification step so a 401 isn't misread).
- **Round 3 — seam auditor:** 2 findings applied (CD-fires-on-every-merge seam made explicit — a docs PR redeploys dev; the toast QA item and the session verification are the SAME action — cross-referenced so it's closed once, not twice).
- **Round 4 — guardrails auditor:** 1 finding applied (plain-text-questions preference and classifier naming requirement were transcript-only in combination — now together in Operational state #2).
- **Round 5 — loss-averse:** 2 findings applied (missing sign-out route observation was only in my recon notes — added as "same family"; the .beads/config.yaml discard would be invisible archaeology for a future beads issue — added to residue).
- **Round 6 — session-specific: live-production-state auditor** (this session mutated a real production account users now touch): 2 findings applied — enumerated the full secret-name inventory per worker/env so the next agent never probes blind, and added the steady-state cron expectations ("idle tick is normal") so a healthy quiet tick isn't misdiagnosed as a failure.
- **Round 7 — top-to-bottom coherence re-read:** 0 findings. Exit.
