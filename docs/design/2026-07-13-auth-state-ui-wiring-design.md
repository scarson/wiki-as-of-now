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

### 3.1 The shared mechanism — one read, one context, one hook

```
                    root layout.tsx (server component)
                              │
              getBrowseAuthState()  ← reads wikinow_session cookie,
                              │        runs verifySession → BrowseAuthState
                              ▼
        <AuthStateProvider state={…}>   (client Context, "use client")
                              │
              ┌───────────────┼────────────────────────┐
              ▼               ▼                         ▼
        <NavAuthChip/>   {children → page.tsx}   {children → queue/page.tsx}
        useBrowseAuthState()  banner: useBrowse…()   button: useBrowse…()
```

**Why a context and not prop-drilling or per-page fetch.** In the App Router a root
layout cannot pass props into separate route-segment pages; it only wraps them as
`children`. Both consumer pages (`page.tsx`, `queue/page.tsx`) are `"use client"` and
so cannot call the server helper themselves. A client Context provider seeded by a
**single** server read is therefore the idiomatic seam: no per-surface cookie logic,
no `whoami` round-trip, and **no flash** of the wrong state before hydration. This is
not gratuitous indirection — it is the minimum structure that lets one server read
reach three client consumers.

**New units:**

- **`getBrowseAuthState()`** — server helper. Reads the session cookie via
  `next/headers` `cookies()`, runs the existing `verifySession`, returns
  `BrowseAuthState` (`"anonymous"` | `"authenticated"`). This is the render-tree
  mirror of `resolveCurrentUser`, built on the same `verifySession` primitive — it
  does **not** touch or duplicate the gate chain. Structured so the verify decision is
  unit-testable without `next/headers` (the cookie-string → state logic is a pure
  function; the `next/headers` read is a thin adapter around it).
- **`AuthStateProvider` + `useBrowseAuthState()`** — a `"use client"` Context that
  carries the server-seeded `BrowseAuthState`. The hook returns it; consumers combine
  it with `browseModeLabel` / `canRequestResearch` from `browse-mode.ts`.

Reading the cookie in the root layout makes rendering dynamic — already true for this
app (D1-backed, `force-dynamic` worksheet), so no static-generation regression.

### 3.2 The one real risk — server-component secret access — and the fallback

`verifySession(token, secret)` needs `SESSION_SECRET`. Routes read it from the
Cloudflare env via `getCloudflareContext()` (the secret isn't in the generated
`CloudflareEnv` types — see the runtime-view cast in
[feedback/route.ts:27-32](../../src/app/api/feedback/route.ts)). **Step 1 of
implementation is to confirm `getCloudflareContext()` works from a root-layout server
component on this OpenNext/Workers build** — this is the load-bearing unknown, and it
echoes the project's workerd-binding pitfalls (see `docs/pitfalls/`).

**Fallback if the direct read is awkward:** a tiny `GET /api/auth/state` route (calls
`resolveCurrentUser`, returns `{ authenticated: boolean }`) feeds the provider via a
client fetch. Same architecture, same three consumers, same hook — only the *seeding*
changes (fetch instead of direct read), at the cost of one round-trip and a brief
flash. We commit to the direct read only after Step 1 confirms it; otherwise we take
the fallback without re-litigating the design.

### 3.3 Consumer — global nav chip + sign-out

The nav ([layout.tsx:46-60](../../src/app/layout.tsx)) gains a right-aligned
`NavAuthChip` (`"use client"`, consumes `useBrowseAuthState()`):

- **Anonymous:** muted `browseModeLabel` ("Browsing as a guest") + a **Sign in** link
  to the existing `/api/auth/google`.
- **Authenticated:** `browseModeLabel` ("Signed in") + a **Sign out** button.

**Sign-out** POSTs the existing `POST /api/auth/logout` (already clears the cookie;
POST-only, not prefetchable), then calls `router.refresh()` so the root server read
re-runs against the now-cleared cookie and every consumer updates at once — no full
reload, no manual state juggling.

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

1. **Request →** root `layout.tsx` (server) calls `getBrowseAuthState()` → reads
   `wikinow_session`, `verifySession` → `BrowseAuthState`.
2. **Seed →** `<AuthStateProvider state={…}>` wraps nav + `{children}` (plain string,
   trivially serializable server→client).
3. **Consume →** `NavAuthChip`, home banner, queue button each call
   `useBrowseAuthState()` and render via `browseModeLabel` / `canRequestResearch`.
4. **Sign in →** link to `/api/auth/google` (unchanged OAuth start).
5. **Sign out →** `NavAuthChip` POSTs `/api/auth/logout` → `router.refresh()` → step 1
   re-runs against the cleared cookie → all consumers flip to anonymous.

## 5. Error handling & edge cases

- **Expired/invalid cookie:** `verifySession` fails → `getBrowseAuthState` returns
  `"anonymous"` (fail-closed). Never throws into render.
- **State says authed but cookie expired mid-session:** UI offers the action; the
  server returns 401; the existing queue 401 handler (§3.5) surfaces "Sign in…". The
  advisory layer degrades gracefully to the authoritative layer.
- **Sign-out network failure:** button reports a transient error and stays signed-in
  visually (no optimistic flip before the server confirms); user can retry.
- **Missing `SESSION_SECRET` at render:** treated as `"anonymous"` (fail-closed);
  covered by Step 1 verification and the §3.2 fallback.

## 6. Compliance check

This work touches **none** of the sacrosanct guardrails
([docs/policy/wikipedia-genai-compliance.md](../policy/wikipedia-genai-compliance.md)):
detection stays deterministic/LLM-free, the audit log stays append-only, and the
citation/G5 path is untouched. Two adjacencies are handled deliberately: (a) all
banner/queue copy remains **accurate** about the model (anonymous may browse; research
requires sign-in; the server 401 is authoritative), and (b) `feedback` /
`sources/open` stay anonymous-friendly (§2) rather than being newly gated. The cookie
rename is an auth-mechanism change, not a guardrail change.

## 7. Testing strategy (TDD throughout)

- **`getBrowseAuthState` pure logic:** cookie-string present & verifies → authenticated;
  absent/invalid/expired → anonymous. Tested without `next/headers`.
- **`AuthStateProvider` / `useBrowseAuthState`:** provided value round-trips to a
  consumer; default outside a provider is `"anonymous"` (fail-closed).
- **`NavAuthChip`:** renders correct label + control per state; sign-out click POSTs
  `/api/auth/logout` and triggers refresh.
- **Home banner:** correct adaptive copy per state; no "guest" assertion when authed.
- **Queue button:** anonymous → sign-in affordance, no enqueue POST attempted;
  authenticated → enqueues as before; **401 backstop path retained** and still tested.
- **Cookie rename:** existing `cookies.test.ts` updated; issue→verify→clear round-trip
  green under the new name.
- **`browse-mode.ts`:** already covered; now exercised through real consumers.
- Test output must stay pristine (no unhandled-rejection noise from the fail-closed
  paths); any expected error is captured and asserted.

## 8. Implementation sequencing (isolated, CI-passing commits)

1. `refactor(auth)!: rename session cookie to wikinow_session` — **Review (auth)**;
   breaking (re-login). Isolated.
2. `feat(auth): add getBrowseAuthState server read` — after Step-1 secret-access
   verification (§3.2); fallback endpoint only if needed.
3. `feat(ui): AuthStateProvider + useBrowseAuthState, seeded in root layout`.
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

**Server-read (chosen) vs. client `whoami` fetch (rejected).** A `GET /api/session`
consumed by client fetch keeps `page.tsx` untouched but reintroduces exactly the wart
we're fixing — a visible flash of the wrong state before the fetch resolves — plus a
new public endpoint and a round-trip. Server-read at the root has none of these. The
`whoami` shape survives only as the §3.2 *fallback* if server-component secret access
proves unworkable.

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

**Context vs. React `cache()` / server-only helper.** We could call
`getBrowseAuthState()` in each server component and dedupe with React `cache()`. But
the two consuming *pages* are client components, so a client context is required
regardless; adding `cache()` would be a second mechanism for the same fact. One
context, seeded once, is simpler.

**What I'm still uncertain about.** (1) Whether `getCloudflareContext()` resolves in a
root-layout server component on this OpenNext build — the §3.2 verification gates the
whole approach; the fallback de-risks it. (2) Exact queue-button treatment when
anonymous (disable vs. replace-with-prompt) — spec picks replace-with-prompt; open to
refinement during implementation without changing the architecture.

**What I'd add with more time.** Surfacing the latent telemetry endpoint and the
worksheet "request research" affordance — both real, both out of scope here, both now
recorded in `future-features.md`.
