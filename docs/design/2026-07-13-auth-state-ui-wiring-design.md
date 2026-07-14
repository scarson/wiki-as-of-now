<!-- ABOUTME: Design spec for wiring real authentication state into the WikiAsOfNow UI — a single server-read auth signal fed through a client context to every auth-aware surface (nav chip + sign-out, home banner, queue research gate), plus a session-cookie rename and GitHub community links. -->
<!-- ABOUTME: Read alongside src/auth/current-user.ts + src/auth/session.ts (session contract, reused not modified), src/app/browse-mode.ts (presentation helpers, finally wired), src/app/layout.tsx / page.tsx / queue/page.tsx (consumers). -->

# Auth-state UI wiring — design

**Status:** approved design (brainstorm complete), implementation plan to follow.
**Author:** Claude + Sam, 2026-07-13.
**Depends on:** nothing new server-side; reuses the existing session primitives
(`src/auth/session.ts` `verifySession`, `src/auth/current-user.ts` `SESSION_COOKIE`)
and the tested-but-unwired presentation helpers (`src/app/browse-mode.ts`).
**Off-limits (reused, never modified):** the gate chain
(`src/app/api/research/gate.ts`) and session issuance
(`src/app/api/auth/google/callback/route.ts`) — except the deliberate cookie-name
change in §3.6, which is the one sanctioned edit to session-issuance code.

## 1. Why this exists

Signing in works end-to-end — verified in production on 2026-07-13: an authenticated
`POST /api/queue/enqueue-research` returned **200** with the "Queued 1 for research."
toast, while the server gate rejects the same call for anonymous users with **401**.
The session is issued, stored, and honored. **It is simply invisible to the UI.**

The home page banner hardcodes `"Browsing as a guest — … Sign in to request research"`
([src/app/page.tsx:74-83](../../src/app/page.tsx)) with no reference to real auth
state, so it asserts "guest" even to a signed-in user. That is the reported bug.

The deeper problem is structural. **Server-side**, auth state has a clean single
source of truth: `resolveCurrentUser(req, env)` → `AuthContext`, funneled through by
every gated route. **Client-side, there is no shared way for a React component to
learn "am I signed in?"** — so each surface improvises. The tell that a shared
mechanism was always intended: `src/app/browse-mode.ts` (`BrowseAuthState`,
`browseModeLabel`, `canRequestResearch`) is fully written and tested but **imported
nowhere** — a presentation layer waiting for a state source that was never built.

This spec builds that state source once and wires every genuinely auth-aware surface
to it.

## 2. Scope — the three real consumers (and what is deliberately excluded)

A full inventory of every client surface that touches a gated endpoint (evidence in
Appendix A) found the auth-aware surface set is **smaller and more precise** than the
handoff assumed. Only **one** surface actually hits a 401-gated endpoint today.

**In scope — the three consumers of shared auth state:**

| Consumer | File | What changes |
|---|---|---|
| Global nav auth chip + **sign-out** | `src/app/layout.tsx` | New: label via `browseModeLabel` + sign-out button (authed) / sign-in link (anon) |
| Home banner | `src/app/page.tsx:74-83` | Hardcoded → driven by real state (adaptive copy) |
| Queue "Research selected" gate | `src/app/queue/page.tsx` | Proactive `canRequestResearch` gate + up-front sign-in prompt; existing 401 handler kept |

**Explicitly excluded — and why excluding them is correct, not a shortcut:**

- **`POST /api/feedback`** is **not** auth-gated. It records codes-only session-outcome
  telemetry (`edit_made` / `no_edit` / `abandoned` + optional claim id) over the
  append-only audit log, tolerating anonymous actors as `"system"`
  ([route.ts:32-33](../../src/app/api/feedback/route.ts), compliance G13/CC-12). It
  has **no UI caller at all** — a latent measurement hook, not a feedback box. Gating
  it would contradict the compliance-intentional anonymous path.
- **`POST /api/sources/open`** is **not** auth-gated either — an intentionally
  anonymous-friendly per-source audit affordance (actor `"system"` when anonymous).
  Gating it would be wrong.
- **Worksheet "request research on this claim"** does not exist. The single-candidate
  route `POST /api/research/[candidateId]` is 401-gated but has **zero UI callers**;
  research is requested only from the batch queue page. Surfacing it is a *feature*,
  not auth-state wiring.

These exclusions are recorded in [future-features.md](future-features.md) (§ added by
this work) so the latent telemetry/worksheet hooks are not lost.

**Also in scope (unrelated but folded in per Sam's request):**

- §3.6 — rename the session cookie `wan_session` → `wikinow_session`.
- §3.7 — GitHub community links (Discussions + Issues) on the About page.

## 3. The design

### 3.1 The shared mechanism — one fetch, one context, one hook

```
        root layout.tsx (server component, NO cookie read)
                          │ renders
        <AuthStateProvider>          (client Context, "use client")
             │  on mount: fetch GET /api/auth/state → { authenticated }
             │  holds status: "unknown" → "anonymous" | "authenticated"
             ▼
   ┌─────────┼───────────────────────────┐
   ▼         ▼                            ▼
<NavAuthChip/>   {children → page.tsx}   {children → queue/page.tsx}
useBrowseAuthState()  banner: useBrowse…()   button: useBrowse…()
```

**Why a client fetch and not a root-layout server read.** The obvious approach — read
the session cookie in the root layout (server) and pass state down — is silently broken
by this app's static compliance pages. `/about` (and the planned `/privacy`) set
`export const dynamic = "force-static"`; under that flag Next 16 replaces `cookies()`
with an **empty store** for the whole route *including the root layout*, with no build
error. So a root-layout cookie read would render "signed out" on every static page even
for a signed-in user. This was confirmed against Next.js 16.2.6 source by two
independent models (see the design-review note in §3.2). `cacheComponents`/PPR could fix
it but is an app-wide caching-model migration (it disables the `dynamic` / `revalidate`
/ `fetchCache` segment exports this repo relies on) — far too much churn for a boolean
nav indicator. Route groups only move the duplication; middleware hint cookies create a
second, forgeable UI-state source.

So auth state is fetched **client-side**, which works uniformly on static and dynamic
pages alike — the honest fit, since auth here is *presentation* state, not the
authorization boundary (the server 401 stays authoritative).

**New units:**

- **`GET /api/auth/state`** — a tiny route: `export const dynamic = "force-dynamic"`,
  calls the existing `resolveCurrentUser(request, env)`, returns `{ authenticated:
  boolean }` with header `Cache-Control: private, no-store` (never cache a per-user
  signal). Reuses the resolver; does **not** touch the gate chain.
- **`AuthStateProvider` + `useBrowseAuthState()`** — a `"use client"` Context. The
  provider fetches `/api/auth/state` once on mount and holds a **tri-state**
  `BrowseAuthStatus`: `"unknown"` (pre-fetch) → `"anonymous"` | `"authenticated"`. The
  hook returns it. Consumers map the two resolved states through `browseModeLabel` /
  `canRequestResearch` from `browse-mode.ts`; while `"unknown"` they render a neutral,
  reserved-width placeholder — no wrong CTA, no layout shift.

The tri-state is load-bearing: rendering `"anonymous"` before the fetch resolves would
flash "Sign in" at a signed-in user. `"unknown"` renders neutral so the chip settles
into the right state without a wrong-CTA flash. (Refinement from the `/codex` review.)

### 3.2 Why this is robust (and what it costs)

- **Uniform correctness:** the same client fetch drives the nav on static `/about`,
  static `/privacy`, and every dynamic page — no per-route-mode correctness gaps.
- **Keeps the compliance pages static:** `/about` and `/privacy` stay `force-static`;
  PR-B's privacy page keeps its clean build-time markdown read, so this decision makes
  PR-B **simpler**, not harder.
- **No `getCloudflareContext`-in-root-layout question:** the layout reads nothing; the
  secret is read only inside the `/api/auth/state` route, exactly like every other route.
- **Cost:** one same-origin request per app mount, and a brief `"unknown"` → resolved
  transition in the small corner chip (mitigated by the neutral placeholder + reserved
  width). Acceptable for presentation state.

**Design-review note (2026-07-13):** this replaced an earlier root-layout server-read
design after grounding the plan in the actual stack surfaced the `force-static`
interaction. Both Claude and an independent `/codex` consult confirmed the mechanism
(Next.js 16.2.6 source) and independently chose this client-fetch approach over the
all-dynamic alternative and over PPR.

### 3.3 Consumer — global nav chip + sign-out

The nav ([layout.tsx:46-60](../../src/app/layout.tsx)) gains a right-aligned
`NavAuthChip` (`"use client"`, consumes `useBrowseAuthState()`):

- **Anonymous:** muted `browseModeLabel` ("Browsing as a guest") + a **Sign in** link
  to the existing `/api/auth/google`.
- **Authenticated:** `browseModeLabel` ("Signed in") + a **Sign out** button.

**Sign-out** POSTs the existing `POST /api/auth/logout` (already clears the cookie;
POST-only, not prefetchable), then the `AuthStateProvider` sets its status to
`"anonymous"` (and `router.refresh()` re-runs any server components) so every consumer
flips at once — no full reload, no manual per-surface state juggling.

### 3.4 Consumer — dynamic home banner

The hardcoded banner ([page.tsx:74-83](../../src/app/page.tsx)) becomes a consumer of
`useBrowseAuthState()` with adaptive, always-true copy:

- **Anonymous:** "Browsing as a guest — detected claims are open to read. Sign in to
  request research on a claim." (retains the onboarding value of today's copy).
- **Authenticated:** e.g. "You're signed in — select a claim and request research."
  (no false "guest" assertion, no dangling "Sign in" pointer).

The sign-in/out *control* lives in the nav chip (§3.3); the banner is contextual copy,
not a second control — single source of truth for the action stays in the nav.

### 3.5 Consumer — queue "Research selected" proactive gate

Today the button fires blindly and only discovers the gate via a 401
([queue/page.tsx:88-127](../../src/app/queue/page.tsx)). It gains `canRequestResearch`
awareness:

- **Anonymous:** the research control does not POST into a guaranteed 401. Instead it
  presents a clear up-front "Sign in to request research" affordance (link to
  `/api/auth/google`) in place of firing. Selection UI stays usable (browsing is
  open); only the request action is gated.
- **Authenticated:** unchanged behavior.
- **Defense in depth — the existing 401 handler stays.** `canRequestResearch` is
  advisory UI only; the server gate remains authoritative (a cookie can expire
  mid-session). The 401 branch (`:105-116`) is the backstop and is **not** removed —
  this is a deliberate layered check, not a DRY violation.

### 3.6 Session cookie rename — `wan_session` → `wikinow_session`

Everything reads one constant, `SESSION_COOKIE`
([current-user.ts:8](../../src/auth/current-user.ts)); issue/verify/clear all import
it, so the change is a **single string value** plus four generic serializer fixtures
in `test/auth/cookies.test.ts` (updated so a grep for the old name comes back clean).

- **Breaking for live sessions:** after deploy the code looks for `wikinow_session`;
  any existing `wan_session` cookie no longer resolves, so currently-signed-in users
  (i.e. Sam) are logged out once and re-authenticate. Acceptable at current usage.
- **Classification:** touches session-issuance/auth code → **Review — domain (auth)**,
  and lands as its **own isolated commit** ahead of the UI work, so the auth-core diff
  is reviewable in isolation.

### 3.7 GitHub community links on the About page

The About page (`/about`) gains a small "Feedback & community" section with two
external links (`rel="noopener noreferrer"`):

- General feedback → **Discussions**: `https://github.com/scarson/wiki-as-of-now/discussions`
- Bugs / issues → **Issues**: `https://github.com/scarson/wiki-as-of-now/issues`

Unrelated to auth; lands as its own commit. Placement may move to a global footer if
Sam prefers more prominence (noted for spec review).

## 4. Data flow

1. **Mount →** root `layout.tsx` (server, no cookie read) renders the client
   `<AuthStateProvider>` wrapping the nav + `{children}`. Provider status starts
   `"unknown"`.
2. **Fetch →** on mount the provider `fetch`es `GET /api/auth/state`; the route runs
   `resolveCurrentUser` and returns `{ authenticated }`; status resolves to
   `"anonymous"` | `"authenticated"`.
3. **Consume →** `NavAuthChip`, home banner, queue button each call
   `useBrowseAuthState()`; while `"unknown"` they render a neutral placeholder, then map
   the resolved state through `browseModeLabel` / `canRequestResearch`.
4. **Sign in →** link to `/api/auth/google` (unchanged OAuth start).
5. **Sign out →** `NavAuthChip` POSTs `/api/auth/logout` → provider sets `"anonymous"`
   (+ `router.refresh()`) → all consumers flip at once.

## 5. Error handling & edge cases

- **Pre-fetch / in-flight:** status `"unknown"` → neutral reserved-width placeholder;
  never a wrong CTA, never layout shift.
- **`/api/auth/state` fetch fails** (network/5xx): provider falls closed to
  `"anonymous"`. The user can still sign in; no crash.
- **Expired/invalid cookie:** `resolveCurrentUser` treats it as anonymous (it never
  throws), so the endpoint returns `{ authenticated: false }`.
- **State says authed but cookie expired mid-session:** UI offers the action; the
  server returns 401; the existing queue 401 handler (§3.5) surfaces "Sign in…". The
  advisory layer degrades gracefully to the authoritative layer.
- **Sign-out network failure:** button reports a transient error and stays signed-in
  visually (no optimistic flip before the server confirms); user can retry.

## 6. Compliance check

This work touches **none** of the sacrosanct guardrails
([docs/policy/wikipedia-genai-compliance.md](../policy/wikipedia-genai-compliance.md)):
detection stays deterministic/LLM-free, the audit log stays append-only, and the
citation/G5 path is untouched. Two adjacencies are handled deliberately: (a) all
banner/queue copy remains **accurate** about the model (anonymous may browse; research
requires sign-in; the server 401 is authoritative), and (b) `feedback` /
`sources/open` stay anonymous-friendly (§2) rather than being newly gated. The cookie
rename is an auth-mechanism change, not a guardrail change.

## 7. Testing strategy (TDD)

The codebase has **no React-component test harness** (no `.test.tsx`, no jsdom/RTL) —
all UI is thin glue over tested pure logic (e.g. `browse-mode.ts`). This work follows
that established pattern rather than introducing a component-test layer for a few thin
components (which would be a larger, unasked-for infra change). So: **pure logic gets
vitest TDD; thin components are verified by TypeScript + the browser QA pass** (the live
site is already being driven in this session). This is a deliberate deviation from the
design's first instinct to "component-test" the chip/banner/button; called out for the
review gate.

- **`GET /api/auth/state`:** authenticated request (valid session cookie) →
  `{ authenticated: true }`; anonymous → `{ authenticated: false }`; response carries
  `Cache-Control: private, no-store`. Reuses `resolveCurrentUser` (already tested).
- **`browse-mode.ts`:** already covered; now exercised through real consumers.
- **Queue gate:** the anonymous-vs-authenticated decision is `canRequestResearch`
  (tested); the plan verifies the wiring (anonymous shows the sign-in affordance and
  does not POST; authenticated enqueues) via TypeScript + browser, with the **401
  backstop path retained** (never removed).
- **Cookie rename:** existing `cookies.test.ts` updated; issue→verify→clear round-trip
  green under the new name.
- Provider/hook/chip/banner: verified by `tsc`, `eslint`, and browser QA (matches the
  codebase's no-component-test convention).
- Test output must stay pristine; any expected error is captured and asserted.

## 8. Implementation sequencing (isolated, CI-passing commits)

1. `refactor(auth)!: rename session cookie to wikinow_session` — **Review (auth)**;
   breaking (re-login). Isolated.
2. `feat(auth): add GET /api/auth/state endpoint` — `force-dynamic`, `no-store`,
   reuses `resolveCurrentUser`.
3. `feat(ui): AuthStateProvider + useBrowseAuthState, mounted in root layout` — fetches
   the endpoint on mount; tri-state `unknown → anonymous | authenticated`.
4. `feat(ui): nav auth chip with sign-out` — wires `browse-mode.ts` label.
5. `feat(ui): drive home banner from real auth state`.
6. `feat(ui): proactive sign-in gate on queue research action`.
7. `feat(about): link GitHub Discussions and Issues` — unrelated, isolated.

Steps 2–6 are the auth-state feature (likely **Routine** on green CI, with auth-adjacent
judgment per the handoff); Steps 1 and 7 are isolated for clean review/history.

## Appendix A — surface inventory evidence

Full client-surface audit (2026-07-13). Only `/queue`'s "Research selected" hits a
401-gated endpoint today. `/api/feedback` and `/api/sources/open` resolve the user
only to tag an actor id and tolerate anonymous (`actor = "system"`) — not gated. The
single-candidate research route 401s but has no UI caller. `browse-mode.ts` is imported
nowhere. (Details in §2; the inventory is the basis for the exclusion decisions.)

## Appendix B — reasoning, alternatives considered, dead ends

**Client fetch (chosen) vs. root-layout server read (rejected after review).** The
first design read the cookie in the root layout to avoid any flash. Grounding the plan
in the actual stack (Next 16, `force-static` `/about`) surfaced that a root-layout
`cookies()` read is silently neutralized to an empty store on static routes — the nav
would show "signed out" to a signed-in user on `/about` and `/privacy`, no build error.
Two independent models (Claude + `/codex`) confirmed the mechanism against Next 16.2.6
source and both picked the client fetch. The residual "flash" is now a small
neutral-state settle in a corner chip (tri-state `unknown`), not a wrong-CTA flash — and
the approach keeps the compliance pages static, which the server-read approach could not.
This is the §Thinking-documentation "considered and reversed" record: the earlier
recommendation was wrong for a concrete, cited reason.

**Global nav (chosen) vs. homepage-only banner (rejected).** Sam's call, and correct:
a sign-out reachable only from the home page is UX that reads as broken — users expect
to sign out from wherever they are (notably `/queue`, where research is requested).
The nav is the honest global home for auth state.

**Home banner: dynamic (chosen) vs. remove vs. static-neutral.** Once the shared hook
exists, making the banner dynamic is nearly free and preserves onboarding value
without a second source of truth for the *control* (which stays in the nav). Removing
it would drop useful first-visit context; a static-neutral rewrite was a reasonable
middle option but strictly worse than dynamic once the hook is in hand.

**Scope: boil the lake, correctly bounded.** The starting assumption (~4–5 auth-aware
surfaces) was wrong. Wiring `feedback`/`sources-open` would have *broken*
compliance-intentional anonymous paths — a case where the "complete" option is fewer
surfaces, not more. The inventory (Appendix A) turned "boil the lake" from a vague
maximalism into three precise consumers.

**One context fed by one fetch.** The three consumers include two client-component
*pages* (`page.tsx`, `queue/page.tsx`) that a root layout cannot prop-drill into, so a
client context is required regardless. Feeding it from a single `/api/auth/state` fetch
(rather than N per-surface fetches) keeps one mechanism and one round-trip.

**What I'm still uncertain about.** (1) Exact queue-button treatment when anonymous
(disable vs. replace-with-prompt) — spec picks replace-with-prompt; open to refinement
during implementation without changing the architecture. (2) The precise neutral
placeholder for the `"unknown"` chip state (blank vs. skeleton) — a visual-polish detail
settled during implementation.

**What I'd add with more time.** Surfacing the latent telemetry endpoint and the
worksheet "request research" affordance — both real, both out of scope here, both now
recorded in `future-features.md`.
