# Auth-State UI Wiring (PR-A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the UI reflect real authentication state — a global nav auth chip with sign-out, a dynamic home banner, and a proactive sign-in gate on the queue research action — fed by one client fetch, plus the `wan_session` → `wikinow_session` cookie rename and GitHub community links.

**Architecture:** A tiny `force-dynamic` `GET /api/auth/state` (reusing `resolveCurrentUser`, `no-store`) is fetched once on mount by a client `AuthStateProvider` mounted in the root layout. It holds a tri-state `status: "unknown" → "anonymous" | "authenticated"` exposed via `useBrowseAuthState()`. Three consumers (nav chip, home banner, queue gate) read the hook and render through the already-tested `browse-mode.ts` helpers. This client-fetch shape is deliberate: the app's `force-static` compliance pages (`/about`, `/privacy`) neutralize a root-layout `cookies()` read to an empty store (confirmed against Next 16.2.6 source by Claude + `/codex`), so server-read would render "signed out" to signed-in users there.

**Tech Stack:** Next.js 16.2.6 (App Router, React 19.1.7), `@opennextjs/cloudflare` on Cloudflare Workers, D1, jose HS256 sessions, vitest 4 (Node pool `vitest.config.ts` + workerd pool `vitest.workers.config.mts`).

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

Copied verbatim from the design spec ([2026-07-13-auth-state-ui-wiring-design.md](../design/2026-07-13-auth-state-ui-wiring-design.md)). Every task's requirements implicitly include these.

- **Do NOT modify the gate chain or session issuance** (`src/app/api/research/gate.ts`, `src/app/api/auth/google/callback/route.ts`) — reuse only. The **one** sanctioned exception is the cookie-name constant value in Phase 1.
- **Compliance:** touch none of the guardrails — detection stays deterministic/LLM-free, the audit log stays append-only, the citation/G5 path is untouched. All banner/queue copy stays accurate (anonymous may browse; research requires sign-in; the server 401 is authoritative). Do NOT gate `feedback` or `sources/open`.
- **`resolveCurrentUser` is the only auth resolver** — reuse it; never re-implement cookie/JWT verification.
- **Auth is presentation state, not the authorization boundary.** The server 401 stays authoritative; UI checks are advisory. The queue 401 handler is defense-in-depth and MUST NOT be removed.
- **Testing convention:** `src/app/**` is excluded from coverage ([vitest.config.ts](../../vitest.config.ts)); the codebase has no React-component test harness. Pure logic gets vitest TDD; thin components are verified by `tsc` + `eslint` + browser QA. This is a deliberate, convention-matching deviation from blanket component-testing, flagged for the review gate.
- **Merge:** each PR gets a `/codex` review before Claude merges on green CI (Sam's standing grant for this initiative). PR-A body carries `## Merge classification` = `Review — domain (auth)` for Phase 1 if split, else `Routine` for the UI phases; use judgment per the handoff.

---

## Execution Status

**Overall:** Not started.

| Phase | Status | Ship SHA(s) | Notes |
|---|---|---|---|
| 1 — Cookie rename | ⬜ Not started | — | isolated, Review (auth) |
| 2 — /api/auth/state endpoint | ⬜ Not started | — | — |
| 3 — AuthStateProvider + hook | ⬜ Not started | — | — |
| 4 — Nav auth chip + sign-out | ⬜ Not started | — | — |
| 5 — Dynamic home banner | ⬜ Not started | — | — |
| 6 — Queue proactive gate | ⬜ Not started | — | — |
| 7 — GitHub community links | ⬜ Not started | — | unrelated, isolated |

---

## Phase 1 — Cookie rename `wan_session` → `wikinow_session`

**Execution Status:** ⬜ NOT STARTED

**Nature:** a constant-value rename (refactor), not a feature — so it's a fixture update + full-suite-green + grep-clean, not a red→green cycle. It touches session-issuance code, so it's **Review (auth)** and lands as its own isolated commit ahead of the UI work.

**Files:**
- Modify: `src/auth/current-user.ts:8` (the single `SESSION_COOKIE` constant)
- Modify: `test/auth/cookies.test.ts` (4 literal `"wan_session"` fixtures)
- Modify: `scripts/provision.md` (operational doc names `wan_session` at ~`:63` — the `/codex` review caught this; my original `src/ test/` grep missed it)

**Interfaces:**
- Produces: `SESSION_COOKIE === "wikinow_session"`, imported unchanged by the callback, logout, and resolver (they reference the constant, so the value propagates).

- [ ] **Step 1: Change the constant value**

In `src/auth/current-user.ts:8`:
```ts
export const SESSION_COOKIE = "wikinow_session";
```

- [ ] **Step 2: Update the generic serializer fixtures**

In `test/auth/cookies.test.ts`, replace the four `"wan_session"` literals with `"wikinow_session"` (they're arbitrary sample names for `serializeCookie`/`clearCookie`; updating them keeps a grep clean):
```ts
const c = serializeCookie("wikinow_session", "tok.en", { maxAgeSeconds: 3600 });
expect(c).toContain("wikinow_session=tok.en");
// ...
const c = clearCookie("wikinow_session");
expect(c).toContain("wikinow_session=;");
```

- [ ] **Step 3: Run the auth suites — expect green**

Run: `node_modules/.bin/vitest run test/auth`
Expected: PASS (issue→verify→clear round-trips still green under the new name; `current-user.test.ts` uses the `SESSION_COOKIE` constant so it follows automatically).

- [ ] **Step 3b: Update the operational doc**

In `scripts/provision.md`, replace the `wan_session` reference (~`:63`) with `wikinow_session`. First read the surrounding lines to confirm it's a *current* operational reference (a live runbook naming the cookie), not a historical note; if historical, leave it. Do NOT rewrite `docs/design/*` or `docs/plans/*` mentions of `wan_session` — those legitimately reference the old name in the rename's own history.

- [ ] **Step 4: Grep-clean verification**

Run: `grep -rn "wan_session" src/ test/ scripts/`
Expected: **no output** (zero matches). `docs/` is intentionally excluded — the design/plan docs reference the old name historically. If any remain in `src/ test/ scripts/`, fix them.

- [ ] **Step 5: Full suite + typecheck**

Run: `node_modules/.bin/vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/auth/current-user.ts test/auth/cookies.test.ts scripts/provision.md
git commit -m "refactor(auth)!: rename session cookie to wikinow_session

BREAKING CHANGE: existing wan_session cookies no longer resolve; signed-in
users are logged out once and re-authenticate. Single constant drives
issue/verify/clear, so the rename propagates through all callers."
```

**Before marking this phase complete:** confirm the grep returns nothing, the full suite is green, and the commit subject uses the `refactor(auth)!` breaking marker.

---

## Phase 2 — `GET /api/auth/state` endpoint

**Execution Status:** ⬜ NOT STARTED

**Files:**
- Create: `src/app/api/auth/state/route.ts`
- Create (test): `test/workers/auth-state-route.test.ts` (workers pool — mirrors [sources-open-route.test.ts](../../test/workers/sources-open-route.test.ts))

**Interfaces:**
- Produces: `GET /api/auth/state` → `200 {"authenticated": boolean}`, header `cache-control: private, no-store`. Consumed by the provider in Phase 3.
- Consumes: `resolveCurrentUser(request, env)` from `@/auth/current-user`; `getCloudflareContext` from `@opennextjs/cloudflare`.

**BEFORE starting work:**
1. Invoke `/superpowers:test-driven-development`.
2. Read `docs/pitfalls/testing-pitfalls.md` and `docs/pitfalls/implementation-pitfalls.md` (note AI-2: never pass detached global `fetch` in Workers — not triggered here, but the workerd-binding family is relevant).
Follow TDD: write failing test → implement → verify green.

- [ ] **Step 1: Write the failing test**

Create `test/workers/auth-state-route.test.ts` (mock `getCloudflareContext` to supply `SESSION_SECRET`; mint real sessions with `issueSession`):
```ts
// ABOUTME: Workers-pool test for GET /api/auth/state — the client-readable auth signal.
// ABOUTME: Asserts authenticated/anonymous projection from a real jose session and the no-store cache header.
import { describe, it, expect, vi } from "vitest";
import { issueSession } from "../../src/auth/session";

const SESSION_SECRET = "auth-state-route-test-secret-32-bytes-xx";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: { SESSION_SECRET } }),
}));

const { GET } = await import("../../src/app/api/auth/state/route");

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://x/api/auth/state", { method: "GET", headers });
}

describe("GET /api/auth/state", () => {
  it("returns authenticated:true for a valid session cookie", async () => {
    const token = await issueSession({ userId: "u_real" }, SESSION_SECRET, { ttlSeconds: 3600 });
    const res = await GET(req({ cookie: `wikinow_session=${token}` }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ authenticated: true });
  });

  it("returns authenticated:false when no session cookie is present", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ authenticated: false });
  });

  it("never caches the per-user signal", async () => {
    const res = await GET(req());
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/vitest run -c vitest.workers.config.mts test/workers/auth-state-route.test.ts`
Expected: FAIL — cannot resolve `../../src/app/api/auth/state/route` (module not created yet).

- [ ] **Step 3: Write the endpoint**

Create `src/app/api/auth/state/route.ts`:
```ts
// ABOUTME: GET /api/auth/state — the client-readable auth signal for the UI ({authenticated}), never cached.
// ABOUTME: Reuses resolveCurrentUser; force-dynamic + no-store so a per-user signal is never statically cached.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { resolveCurrentUser } from "@/auth/current-user";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const { env } = getCloudflareContext();
  // SESSION_SECRET isn't in the generated CloudflareEnv types (CC-9); read it through the
  // runtime view of the same object, mirroring the research/feedback routes.
  const auth = await resolveCurrentUser(request, env as unknown as Parameters<typeof resolveCurrentUser>[1]);
  return new Response(JSON.stringify({ authenticated: auth.kind === "authenticated" }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
    },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/vitest run -c vitest.workers.config.mts test/workers/auth-state-route.test.ts`
Expected: PASS (all three).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → PASS.
```bash
git add src/app/api/auth/state/route.ts test/workers/auth-state-route.test.ts
git commit -m "feat(auth): add GET /api/auth/state endpoint

force-dynamic, Cache-Control private/no-store, reuses resolveCurrentUser.
Returns {authenticated} for the client auth-state provider."
```

**BEFORE marking this task complete:**
1. Review tests against `docs/pitfalls/testing-pitfalls.md` (real jose sessions, not stubbed verification — matches `current-user.test.ts`).
2. Verify coverage: authenticated, anonymous, and the no-store header are all asserted.
3. Run the workers suite and confirm green: `node_modules/.bin/vitest run -c vitest.workers.config.mts`.

---

## Phase 3 — `AuthStateProvider` + `useBrowseAuthState`

**Execution Status:** ⬜ NOT STARTED

**Files:**
- Create: `src/app/auth-state.tsx` (client context + provider + hook)
- Modify: `src/app/layout.tsx` (wrap nav + children in the provider)

**Interfaces:**
- Consumes: `GET /api/auth/state` (Phase 2); `BrowseAuthState` from `@/app/browse-mode`.
- Produces: `useBrowseAuthState(): { status: BrowseAuthStatus; setAnonymous: () => void }` where `BrowseAuthStatus = "unknown" | "anonymous" | "authenticated"`. Consumed by Phases 4, 5, 6.

**Testing note (convention):** this is client React wiring under `src/app/**` (excluded from coverage, no component-test harness). Verify by `tsc` + `eslint` + the browser QA in Phase 4. No unit test — matches the codebase convention; flagged for the review gate.

- [ ] **Step 1: Create the provider + hook**

Create `src/app/auth-state.tsx`:
```tsx
// ABOUTME: Client auth-state context — one fetch of /api/auth/state on mount, tri-state unknown→anonymous|authenticated.
// ABOUTME: The single client-side source of auth truth for the nav chip, home banner, and queue gate (advisory; server 401 is authoritative).
"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { BrowseAuthState } from "@/app/browse-mode";

export type BrowseAuthStatus = "unknown" | BrowseAuthState;

interface AuthStateValue {
  status: BrowseAuthStatus;
  /** Flip to anonymous immediately after a successful sign-out (no refetch needed). */
  setAnonymous: () => void;
}

const AuthStateContext = createContext<AuthStateValue>({ status: "unknown", setAnonymous: () => {} });

export function useBrowseAuthState(): AuthStateValue {
  return useContext(AuthStateContext);
}

export function AuthStateProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<BrowseAuthStatus>("unknown");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/state", { headers: { accept: "application/json" } })
      .then((r) => (r.ok ? (r.json() as Promise<{ authenticated?: boolean }>) : { authenticated: false }))
      .then((b) => { if (!cancelled) setStatus(b.authenticated ? "authenticated" : "anonymous"); })
      .catch(() => { if (!cancelled) setStatus("anonymous"); });
    return () => { cancelled = true; };
  }, []);

  const setAnonymous = useCallback(() => setStatus("anonymous"), []);

  return <AuthStateContext.Provider value={{ status, setAnonymous }}>{children}</AuthStateContext.Provider>;
}
```

- [ ] **Step 2: Mount the provider in the root layout**

In `src/app/layout.tsx`, import the provider and wrap the nav + `{children}` (the provider must wrap BOTH so the nav chip and page consumers share one context). Add the import:
```tsx
import { AuthStateProvider } from "./auth-state";
```
Wrap the body content:
```tsx
<body className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} antialiased`}>
  <AuthStateProvider>
    <nav className="border-b border-hairline-gray bg-shelf-gray">
      {/* ...existing nav unchanged for now; NavAuthChip added in Phase 4... */}
    </nav>
    {children}
  </AuthStateProvider>
</body>
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/app/auth-state.tsx src/app/layout.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/auth-state.tsx src/app/layout.tsx
git commit -m "feat(ui): AuthStateProvider + useBrowseAuthState in root layout

Client context fetches /api/auth/state once on mount; tri-state
unknown→anonymous|authenticated feeds the nav chip, banner, and queue gate."
```

---

## Phase 4 — Nav auth chip + sign-out

**Execution Status:** ⬜ NOT STARTED

**Files:**
- Create: `src/app/components/NavAuthChip.tsx`
- Modify: `src/app/layout.tsx` (render `<NavAuthChip />` in the nav)

**Interfaces:**
- Consumes: `useBrowseAuthState()` (Phase 3); `browseModeLabel` from `@/app/browse-mode`; `POST /api/auth/logout` (existing).

**Testing note:** client component under `src/app/**`; verified by `tsc` + `eslint` + the browser QA below (the live site is signed in this session). No unit test — matches convention.

- [ ] **Step 1: Create the chip**

Create `src/app/components/NavAuthChip.tsx`:
```tsx
// ABOUTME: Global nav auth chip — reserved-width unknown state, "Sign in" link when anonymous, label + sign-out when authenticated.
// ABOUTME: Sign-out POSTs /api/auth/logout then flips the shared auth state to anonymous (advisory UI; server 401 stays authoritative).
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useBrowseAuthState } from "@/app/auth-state";
import { browseModeLabel } from "@/app/browse-mode";

export function NavAuthChip() {
  const { status, setAnonymous } = useBrowseAuthState();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Reserve width so the nav doesn't shift when the fetch resolves (widest resolved
  // state is "Browsing as a guest" + Sign in).
  if (status === "unknown") {
    return <span className="ml-auto inline-block w-48" aria-hidden="true" />;
  }

  if (status === "anonymous") {
    return (
      <span className="ml-auto flex items-center gap-3 text-sm">
        <span className="text-dust-gray">{browseModeLabel(status)}</span>
        <a href="/api/auth/google" className="text-iron-gall underline-offset-2 hover:underline">
          Sign in
        </a>
      </span>
    );
  }

  async function signOut() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        setAnonymous();
        router.refresh();
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ml-auto flex items-center gap-3 text-sm">
      <span className="text-dust-gray">{browseModeLabel(status)}</span>
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        className="text-iron-gall underline-offset-2 hover:underline disabled:opacity-50"
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {failed && (
        <span role="alert" className="text-oxidized-rust">
          Sign-out failed — retry
        </span>
      )}
    </div>
  );
}
```

(Design fidelity: the anonymous branch now renders `browseModeLabel` + Sign in per design §3.3, so the reserved `unknown` width is `w-48`. Sign-out surfaces network + non-2xx failures per design §5 while keeping the user visually signed in.)

- [ ] **Step 2: Render it in the nav**

In `src/app/layout.tsx`, import and place the chip at the end of the nav's inner flex row (the `ml-auto` pushes it right):
```tsx
import { NavAuthChip } from "./components/NavAuthChip";
```
```tsx
<div className="mx-auto flex max-w-3xl items-baseline gap-6 px-6 py-3">
  <Link href="/" className="...">WikiAsOfNow</Link>
  <div className="flex gap-5 text-sm">
    <Link href="/queue" className="...">Easy-win lane</Link>
    <Link href="/about" className="...">About</Link>
  </div>
  <NavAuthChip />
</div>
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/app/components/NavAuthChip.tsx src/app/layout.tsx`
Expected: PASS.

- [ ] **Step 4: Browser verification (the real test for this convention)**

Build/preview and drive the live behavior (this is where the wiring is proven — see design §7). Confirm on a **signed-in** session: nav shows "Signed in" + "Sign out"; clicking Sign out flips to "Sign in" without a full reload; on `/about` (force-static) the chip still shows the correct signed-in state (the whole reason for the client-fetch design). Confirm on **anonymous**: nav shows "Sign in".

- [ ] **Step 5: Commit**

```bash
git add src/app/components/NavAuthChip.tsx src/app/layout.tsx
git commit -m "feat(ui): global nav auth chip with sign-out

Reserved-width unknown state; Sign in link when anonymous; browseModeLabel
+ sign-out button when authenticated. Sign-out POSTs /api/auth/logout and
flips shared state to anonymous."
```

**After completing Phases 2–4 (the mechanism group):** review from multiple perspectives (minimum 3 rounds): (1) correctness — does the chip show the right state on static `/about` AND dynamic pages? (2) no-regression — is the existing nav layout intact, no horizontal overflow? (3) security — is auth still server-authoritative (the endpoint only *reports* state; no gate weakened)? If round 3 still finds issues, keep going until clean.

---

## Phase 5 — Dynamic home banner

**Execution Status:** ⬜ NOT STARTED

**Files:**
- Modify: `src/app/page.tsx:74-83` (replace the hardcoded banner)

**Interfaces:**
- Consumes: `useBrowseAuthState()` (Phase 3). `page.tsx` is already `"use client"` and a descendant of the provider, so it can call the hook directly.

**Testing note:** client component; verified by `tsc` + `eslint` + browser QA. No unit test — matches convention.

- [ ] **Step 1: Add the hook import + consume it**

In `src/app/page.tsx`, add:
```tsx
import { useBrowseAuthState } from "./auth-state";
```
Inside `Home()`, add near the other hooks. **`Home()` already declares a lookup `status` at `page.tsx:32`, so alias the auth status to avoid a name collision** (this was a `/codex` blocker):
```tsx
const { status: authStatus } = useBrowseAuthState();
```

- [ ] **Step 2: Replace the hardcoded banner (lines 74–83)**

Replace the static banner block with a status-driven one. The **outer wrapper reserves height** so content below doesn't jump when the state resolves; the bordered banner and its copy render only once `authStatus` is known (no wrong-state flash):
```tsx
<div className="mb-8 min-h-[3.25rem]">
  {authStatus !== "unknown" && (
    <div className="rounded-md border border-hairline-gray bg-shelf-gray px-4 py-3 text-sm text-dust-gray">
      {authStatus === "anonymous" ? (
        <>
          Browsing as a guest — detected claims are open to read.{" "}
          <a href="/api/auth/google" className="text-iron-gall underline-offset-2 hover:underline">
            Sign in
          </a>{" "}
          to request research on a claim.
        </>
      ) : (
        <>You&apos;re signed in — select a claim and request research on it.</>
      )}
    </div>
  )}
</div>
```

- [ ] **Step 3: Typecheck + lint + browser**

Run: `npx tsc --noEmit && npx eslint src/app/page.tsx` → PASS.
Browser: signed-in home shows the "You're signed in" copy (no false "guest"); anonymous shows the guest + Sign in copy.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(ui): drive home banner from real auth state

Replaces the hardcoded guest banner; adaptive copy per auth state, renders
nothing until state resolves. Fixes the reported always-guest bug."
```

---

## Phase 6 — Queue proactive sign-in gate

**Execution Status:** ⬜ NOT STARTED

**Files:**
- Modify: `src/app/queue/page.tsx` (the "Research selected" control area, ~`:214-224`)

**Interfaces:**
- Consumes: `useBrowseAuthState()` (Phase 3); `canRequestResearch` from `@/app/browse-mode`. `queue/page.tsx` is `"use client"` and a provider descendant.

**Constraint (defense in depth):** the existing 401 handler (`researchSelected`, ~`:105-116`) MUST stay — it's the authoritative backstop for a cookie that expires mid-session. This task ADDS a proactive affordance; it does not remove the 401 path.

**Testing note:** `canRequestResearch` is already unit-tested; the wiring is verified by `tsc` + `eslint` + browser QA.

- [ ] **Step 1: Consume the hook (aliased)**

In `src/app/queue/page.tsx`, add the imports + hook. **`queue/page.tsx` already declares a lane-loading `status` at `:43`, so alias the auth status** (this was a `/codex` blocker):
```tsx
import { useBrowseAuthState } from "@/app/auth-state";
import { canRequestResearch } from "@/app/browse-mode";
```
```tsx
const { status: authStatus } = useBrowseAuthState();
```

- [ ] **Step 2: Guard the handler (covers the keyboard path)**

The research action fires from BOTH the button and the `r`/`R` keyboard shortcut (`:142-145`), so gating only the button leaves the keyboard path POSTing for anonymous users (a `/codex` finding). Guard inside `researchSelected` itself, at the very top, using the same message setter the existing 401 branch uses (read the function to find it — it sets the `aria-live` message):
```tsx
async function researchSelected() {
  if (authStatus !== "authenticated") {
    setMessage("Sign in to request research on these candidates."); // reuse the existing message state setter
    return;
  }
  // ... existing body unchanged, INCLUDING the 401 handler (backstop for a session that
  // expired after this check but before the server sees the request).
}
```
Add `authStatus` to `researchSelected`'s dependency array if it is wrapped in `useCallback` (check the source). This is the real enforcement; the Step-3 button three-way is the up-front affordance.

- [ ] **Step 3: Gate the research control (up-front affordance)**

Where the "Research selected (n)" button + `aria-live` message render (~`:214-224`), replace the single button with a three-way on `authStatus`. `"unknown"` → disabled button (no pre-resolution click); a resolved status where `canRequestResearch(authStatus)` is false → the sign-in affordance instead of a doomed POST; otherwise → the button unchanged. `className="..."` means keep the button's **existing** classes verbatim:
```tsx
{authStatus === "unknown" ? (
  <button type="button" disabled className="..." /* existing button classes */>
    Research selected ({selected.size})
  </button>
) : canRequestResearch(authStatus) ? (
  <button
    type="button"
    onClick={researchSelected}
    disabled={selected.size === 0}
    className="..." /* existing button classes */
  >
    Research selected ({selected.size})
  </button>
) : (
  <a href="/api/auth/google" className="text-sm text-iron-gall underline-offset-2 hover:underline">
    Sign in to request research
  </a>
)}
```
`canRequestResearch` (from `browse-mode.ts`, already unit-tested) is `true` only for `"authenticated"`, so a resolved-anonymous user gets the sign-in affordance.

- [ ] **Step 4: Typecheck + lint + browser**

Run: `npx tsc --noEmit && npx eslint src/app/queue/page.tsx` → PASS.
Browser: **signed-in** — select a claim, "Research selected" enqueues (200 + "Queued 1 for research." toast) exactly as before; the `r` shortcut also works. **Anonymous** — the button is replaced by "Sign in to request research"; neither the button nor the `r` shortcut POSTs (the handler guard returns early with the sign-in message). Confirm the existing 401 handler still exists in `researchSelected`.

- [ ] **Step 5: Commit**

```bash
git add src/app/queue/page.tsx
git commit -m "feat(ui): proactive sign-in gate on queue research action

Anonymous users see a Sign in affordance instead of firing a doomed 401
(button + r/R keyboard path both guarded); authenticated flow unchanged.
Existing 401 handler retained as the authoritative backstop."
```

**After completing Phases 5–6 (the consumer group):** review (minimum 3 rounds): (1) copy accuracy — every banner/gate string stays true about the anon/auth model? (2) no-regression — signed-in enqueue still returns 200 + toast (closes the go-live QA item)? (3) the 401 backstop is intact? Keep going until clean.

---

## Phase 7 — GitHub community links on the About page

**Execution Status:** ⬜ NOT STARTED

**Files:**
- Modify: `src/app/about/page.tsx` (add a "Feedback & community" section)

**Interfaces:** none (static external links). Unrelated to auth; isolated commit.

**Testing note:** static JSX addition to a `force-static` page; verified by `tsc` + `eslint` + browser.

- [ ] **Step 1: Add the section**

In `src/app/about/page.tsx`, add a section (place near the end, before any footer) with two external links (`rel="noopener noreferrer"`, new tab):
```tsx
<section aria-label="Feedback and community" className="mb-8">
  <h2 className="mb-3 font-serif text-lg font-medium text-ink-white">Feedback &amp; community</h2>
  <ul className="list-disc space-y-1 pl-5 text-sm text-body-gray">
    <li>
      General feedback and questions:{" "}
      <a href="https://github.com/scarson/wiki-as-of-now/discussions" target="_blank" rel="noopener noreferrer" className="text-iron-gall underline-offset-2 hover:underline">
        GitHub Discussions
      </a>
    </li>
    <li>
      Bug reports:{" "}
      <a href="https://github.com/scarson/wiki-as-of-now/issues" target="_blank" rel="noopener noreferrer" className="text-iron-gall underline-offset-2 hover:underline">
        GitHub Issues
      </a>
    </li>
  </ul>
</section>
```

- [ ] **Step 2: Typecheck + lint + browser**

Run: `npx tsc --noEmit && npx eslint src/app/about/page.tsx` → PASS.
Browser: `/about` shows the two links; each opens the correct GitHub URL in a new tab.

- [ ] **Step 3: Commit**

```bash
git add src/app/about/page.tsx
git commit -m "feat(about): link GitHub Discussions and Issues

General feedback -> Discussions, bugs -> Issues. External links, new tab."
```

---

## Finalization

- [ ] **Full verification:** `node_modules/.bin/vitest run && node_modules/.bin/vitest run -c vitest.workers.config.mts && npx tsc --noEmit && npx eslint .` — all green.
- [ ] **Build sanity:** `npm run build` (this is `next build`, per package.json — NOT the OpenNext package step) succeeds — catches RSC/client-boundary and `force-static` interaction errors at build time. For a full Cloudflare-packaging check, `npm run preview` runs `opennextjs-cloudflare build` — optional here since PR-A adds no new bindings.
- [ ] **Open PR** with `## Merge classification`. Phase 1 (cookie rename) is auth-domain → note **Review — domain (auth)**; the UI phases are **Routine**. Because they ride one PR, classify the PR **Review — domain (auth)** (the stricter wins) and gate on `/codex`.
- [ ] **`/codex` review**, address findings, then merge on green CI per Sam's grant. Update this plan's Execution Status table + banners with the merge SHA.

## Notes for the executor
- **Do the phases in order** — 3 depends on 2; 4/5/6 depend on 3. 1 and 7 are independent and could go first/last.
- **The browser QA is not optional** for the component phases — it's the verification of record for this codebase's convention. The signed-in `/about` check (Phase 4 Step 4) is the specific thing the whole client-fetch design exists to get right; do not skip it.
- **If `getCloudflareContext()` or the fetch behaves unexpectedly at build/runtime**, that's a discovery — record it in a top-of-plan Discoveries subsection, don't silently work around it.
