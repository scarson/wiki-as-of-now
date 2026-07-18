# Privacy Policy + Account Deletion (PR-B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a formal Privacy Policy (rendered at `/privacy`) and basic self-serve account deletion that erases a signed-in user's personal data while preserving service-wide metering.

**Architecture:** The policy is authoritative markdown at `docs/policy/privacy-policy.md`, rendered at a `force-static` `/privacy` route via a build-time file read + `markdown-to-jsx`. Deletion is a `force-dynamic` `POST /api/account/delete` (auth-gated) that atomically **deletes the `users` row** (the email/PII) and **nulls `quota_ledger.user_id`** (keeping the row for the global cost cap), appends `account.deleted`, and clears the cookie. Migration `0009` makes `quota_ledger.user_id` nullable. Separately, anonymous audit actions are relabeled `system` → `AnonUser`.

**Tech Stack:** Next 16.2.6 App Router on Cloudflare Workers (`@opennextjs/cloudflare`), D1, jose sessions, `markdown-to-jsx` (new dep), vitest (Node + workerd pools). Depends on PR-A (merged): `NavAuthChip`, `useBrowseAuthState`/`setAnonymous`, `/api/auth/state`, `wikinow_session` all exist.

## Living Document Contract

This plan is a living document. Every executing agent MUST update it as
execution progresses, not only at completion.

- **On phase claim:** flip the banner to 🚧 IN PROGRESS with a claim timestamp (ISO 8601 UTC) and the active branch name. No expected-completion estimate. Followers determine liveness by observable signals (PR existence, recent branch commits).
- **On phase ship:** update that phase's **Execution Status** banner with the shipped commit SHA(s) and date; if a PR is open, put PR number + URL in the top-of-plan table.
- **On phase defer:** ⏸ status + a prose unblock condition + a link to the likely-unblocker artifact.
- **On PR merge:** record the merge SHA in the banner + top-of-plan table.
- **On deviation:** inline-document it in the affected task AND summarize in a top-of-plan "Deviations" subsection.
- **On discovery:** add a top-of-plan "Discoveries" subsection with file/line pointers.

The plan SHOULD reflect reality at the end of every session that touches it. Rationale: `/writing-plans-enhanced` Step 5.

## Global Constraints

From the design ([2026-07-13-privacy-and-account-deletion-design.md](../design/2026-07-13-privacy-and-account-deletion-design.md), revised after `/codex` + Sam's decisions).

- **Never delete/mutate `audit_log` rows (G13).** Deletion only *appends* `account.deleted`.
- **Never delete `quota_ledger` rows.** A **global daily cost cap** counts *all* rows (`countPacksGlobalOnDay` has no `user_id` filter, [quota-ledger.ts:36](../../src/db/quota-ledger.ts); enforced [reconcile.ts:53](../../src/quota/reconcile.ts)). Deletion **nulls `user_id`** to detach attribution while keeping the row so the cap stays honest. Verified.
- **Basic deletion (Sam-approved).** No JWT revocation. A queued research job may recreate a **PII-free** stub (`ledgerOwnerSeed` uses `email: ""`, [research-jobs.ts:44](../../src/queue/research-jobs.ts)) — documented, not mitigated. The real email never returns.
- **`markdown-to-jsx` provenance (do NOT guess):** npm `markdown-to-jsx`, PURL `pkg:npm/markdown-to-jsx`, repo <https://github.com/quantizor/markdown-to-jsx>. Verify the resolved `repository` field; pin exact version; commit lockfile.
- **Reuse:** `resolveCurrentUser` (gate), `appendStatement`/`db.batch` (atomic write), `clearCookie(SESSION_COOKIE)`, `useBrowseAuthState().setAnonymous`.
- **Testing convention:** `src/app/**` coverage-excluded; server routes → workers-pool TDD; thin components → `tsc`+`eslint`+browser QA.
- **Merge:** **Review — domain (auth + destructive + schema migration).** `/codex` review, then Claude merges on green CI. Ships to prod only via a Sam-triggered dev→main release (the migration runs on deploy — [[git-base-dev]], deploy.yml applies migrations before deploy).

---

## Execution Status

**Overall:** 🚧 IN PROGRESS — claimed 2026-07-18T02:45:00Z on branch `feat/privacy-account-deletion` (cut off `origin/dev` f2596ad, post-PR-C).

**Deviations:** executing on `feat/privacy-account-deletion` (fresh off current dev), not the original `claude/privacy-account-deletion` doc branch — dev advanced past it (PR-C #39, chore #38); the revised design + this plan were copied onto the executing branch instead of rebasing the stale one. Round-2 item 3 resolved: **option A (disclose)** — Sam delegated, rationale recorded in design Appendix ("Disclose the stored Google identifier vs. stop storing it").

| Phase | Status | Ship SHA(s) | Notes |
|---|---|---|---|
| 1 — Verify policy claims | ✅ Verified 2026-07-18 | (audit only) | no trackers; role-label anon actors; cookie inventory matches |
| 2 — Privacy policy doc | ✅ Shipped 2026-07-18 | 63163d3 | option-A disclosure wording |
| 3 — /privacy render | ✅ Shipped 2026-07-18 | 07643b5 | static under next + OpenNext builds |
| 4 — Migration 0009 | ✅ Shipped 2026-07-18 | c10dbdc | rename-aside rebuild (parity-safe); upgrade test |
| 5 — Delete endpoint | ✅ Shipped 2026-07-18 | 4f381c3 | + stale-JWT replay guard + atomicity test |
| 6 — Delete UI | ✅ Shipped 2026-07-18 | cebea66 | op-state model; hooks before returns |
| 7 — AnonUser relabel | ✅ Shipped 2026-07-18 | a0b793c | + abuse-report relabel + feedback actor test |

---

## Codex re-review (round 2) — MUST address before/during execution

Found after the plan rebuild; not yet folded into the phases below. Fix these as you execute.

1. **[BLOCKER] Migration number:** use `0009_quota_ledger_nullable_user.sql`, NOT `0006` (`0006-0007` reserved per `scripts/provision.md:30`; `0008` exists). Update all `0006` references in this plan + design §7.
2. **[BLOCKER] Update `src/db/schema.sql`** (the cumulative schema) in Phase 4 too: `quota_ledger.user_id` → nullable + `ON DELETE SET NULL`. A parity test (`test/db/migration.test.ts:150`) enforces schema.sql ↔ migrations; it fails otherwise.
3. **[RESOLVED 2026-07-18 — option A, Sam-delegated]** Policy reworded to disclose the stored Google identifier + creation date and to present-tense the traceability claim (design §3.2 updated; rationale in design Appendix). Original finding: **Policy factual accuracy.** The app also stores the **raw Google `sub`** (`users.identity_subject`) + `created_at`, so "store only your email" is false. And "that id can't be traced back to you" is not durable (re-login regenerates the same deterministic id, `src/auth/oauth.ts:16`). **Decision pending (see handoff):** (A) reword the policy to disclose the stored Google identifier + soften the traceability claim to present-tense ("once you delete, we can no longer link that id to you"), or (B) stop storing the raw `sub` (the `user_id` hash is derived from it) so "only email" becomes true — a schema/code change touching the OAuth callback. Do NOT publish the policy until this is resolved.
4. **[should-fix] Phase 4 upgrade test:** apply through `0005`, seed a ledger row, apply `0009`, then assert row preservation + `user_id` nullable + `ON DELETE SET NULL` + `WITHOUT ROWID`. (Fresh-apply alone doesn't exercise the data-rebuild path.)
5. **[should-fix] Phase 5 atomicity test** (design §6 promised it): force the audit insert to fail and prove the ledger UPDATE + user DELETE roll back.
6. **[should-fix] Phase 5 stale-JWT guard:** `resolveCurrentUser` authenticates a JWT without checking the user row exists, so a replayed post-deletion JWT re-appends `account.deleted`. Make the audit append conditional on the user existing (or short-circuit if `users` row absent), returning idempotent 200.
7. **[should-fix] Phase 7 also relabel `src/abuse/report.ts:37`** (`actor: "system"` on an anonymous action) → `AnonUser`; and add a feedback-route anonymous-actor test (current feedback tests use a caller-supplied actor).
8. **[should-fix] Phase 3:** run `pnpm exec opennextjs-cloudflare build` IN the step (not only CI) to prove the `docs/` build-read works under OpenNext.
9. **[should-fix] Phase 6:** declare ALL hooks (`op`, `confirming`, `deleteFailed`, existing sign-out state) BEFORE the `unknown`/`anonymous` early returns in `NavAuthChip.tsx` — else conditional hooks (rules-of-hooks violation).
10. **[nit]** Design says `/privacy` is "one click from anywhere" but the plan links it from home + About only. Either add it to the global nav or soften the design claim.

---

## Phase 1 — Verify the policy's two factual claims

**Execution Status:** ✅ SHIPPED 2026-07-18 (see top-of-plan table for SHAs)

The policy asserts two things that must hold before publishing (design §2, corrected). This is a code audit, no commit.

- [x] **Step 1: No third-party analytics/tracking/ad cookies or scripts.** Grep `src/` for analytics/gtag/plausible/posthog/segment/ga/fbq/doubleclick; inspect `layout.tsx`/`globals.css`. Expected: none (only session + OAuth cookies).
- [x] **Step 2: Anonymous use associates nothing with a person.** Confirm anonymous branches resolve to a role label (post-Phase-7: `"AnonUser"`), never a client-supplied identifier. Record findings for the PR body.
- [ ] (The old "Google is the only third party" claim was dropped — Cloudflare is a processor; research providers see only public content. No verification needed; the policy wording already reflects this.)

---

## Phase 2 — Authoritative privacy policy document

**Execution Status:** ✅ SHIPPED 2026-07-18 (see top-of-plan table for SHAs)

**Files:** Create `docs/policy/privacy-policy.md`.

- [x] **Step 1: Write the policy** — copy the **finalized text verbatim from design §3.2** ("Proposed policy text" block; it is stop-slop-cleaned and Sam-approved). Keep `_Last updated: 2026-07-13_` and the `[GitHub Discussions](…/discussions)` markdown link.
- [x] **Step 2: Commit.** `git add docs/policy/privacy-policy.md && git commit -m "docs(policy): add privacy policy"`

---

## Phase 3 — Render the policy at `/privacy`

**Execution Status:** ✅ SHIPPED 2026-07-18 (see top-of-plan table for SHAs)

**Files:** `package.json`+lockfile (add `markdown-to-jsx`); create `src/app/privacy/page.tsx`; modify `src/app/page.tsx` + `src/app/about/page.tsx` footers (link `/privacy`).

**Risk (verify FIRST — mirrors PR-A's force-static spike):** does a `force-static` RSC reading `docs/policy/privacy-policy.md` via `fs` at build prerender correctly under `next build` **and** `opennextjs-cloudflare build`? **Fallback (codex-vetted):** if the `docs/` read fails, move the authoritative markdown to `src/app/privacy/privacy-policy.md` and read it there (still one source; adjust the "authoritative path" note in the design). Do NOT rely on an unconfigured `.md` raw-import loader. Decide by building, not assuming.

- [x] **Step 1: Add dep (verified provenance).** `pnpm add markdown-to-jsx`; verify `node_modules/markdown-to-jsx/package.json` `repository` → quantizor repo; pin the exact resolved version; commit lockfile.
- [x] **Step 2: Create the page** (`src/app/privacy/page.tsx`):
```tsx
// ABOUTME: /privacy — renders the authoritative docs/policy/privacy-policy.md at build (force-static) via markdown-to-jsx.
// ABOUTME: Single source of truth is the markdown file; this route only presents it (prerendered, no runtime fs read).
import { readFile } from "node:fs/promises";
import path from "node:path";
import Markdown from "markdown-to-jsx";

export const dynamic = "force-static";

export default async function PrivacyPage() {
  const md = await readFile(path.join(process.cwd(), "docs/policy/privacy-policy.md"), "utf8");
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-sm leading-relaxed text-body-gray">
      <Markdown options={{ overrides: {
        h1: { props: { className: "font-serif text-3xl font-medium tracking-tight text-ink-white mb-2" } },
        h2: { props: { className: "font-serif text-lg font-medium text-ink-white mt-8 mb-3" } },
        p:  { props: { className: "mt-3 text-dust-gray" } },
        ul: { props: { className: "mt-2 list-disc space-y-1 pl-5 text-dust-gray" } },
        a:  { props: { className: "text-iron-gall underline-offset-2 hover:underline" } },
      } }}>{md}</Markdown>
    </main>
  );
}
```
- [x] **Step 3: Link `/privacy`** from the home footer (`page.tsx`) and About footer (`about/page.tsx`) — plain `next/link` next to "About & compliance".
- [x] **Step 4: Verify.** `tsc`, `eslint`, `npm run build` — confirm `/privacy` is `○ (Static)` and the built HTML contains the policy headings. If read fails, take the fallback.
- [x] **Step 5: Commit.** `feat(web): render privacy policy at /privacy`.

---

## Phase 4 — Migration `0009`: `quota_ledger.user_id` nullable + `ON DELETE SET NULL`

**Execution Status:** ✅ SHIPPED 2026-07-18 (see top-of-plan table for SHAs)

**Files:** Create `migrations/0009_quota_ledger_nullable_user.sql`.

**BEFORE:** read an existing migration (e.g. `migrations/0005_quota_ledger.sql`) and check how D1 migrations handle FK during a table rebuild (whether `PRAGMA foreign_keys`/`defer_foreign_keys` is used, and D1's default FK enforcement). SQLite requires a table rebuild to change a column's nullability + FK action.

- [x] **Step 1: Write the migration** (rebuild pattern; adjust PRAGMA usage to match how D1 migrations run in this repo):
```sql
-- 0009: quota_ledger.user_id nullable + ON DELETE SET NULL — lets account deletion detach a user's
-- attribution (UPDATE ... SET user_id = NULL) while KEEPING the row, so the global daily cost cap
-- (countPacksGlobalOnDay counts all rows) stays honest. Table rebuild: SQLite can't ALTER nullability/FK.
CREATE TABLE quota_ledger_new (
  claim_key          TEXT    NOT NULL,
  source_revision_id INTEGER NOT NULL,
  user_id            TEXT    REFERENCES users(user_id) ON DELETE SET NULL,  -- was NOT NULL
  evaluated_at       TEXT    NOT NULL,
  neurons            INTEGER NOT NULL,
  brave_query_count  INTEGER NOT NULL,
  PRIMARY KEY (claim_key, source_revision_id)
) WITHOUT ROWID;
INSERT INTO quota_ledger_new (claim_key, source_revision_id, user_id, evaluated_at, neurons, brave_query_count)
  SELECT claim_key, source_revision_id, user_id, evaluated_at, neurons, brave_query_count FROM quota_ledger;
DROP TABLE quota_ledger;
ALTER TABLE quota_ledger_new RENAME TO quota_ledger;
```
- [x] **Step 2: Verify** the migration applies cleanly in the workers pool (it reads `migrations/`): run any existing `test/workers/**` quota/ledger test green. Confirm inserts still work and the column now accepts NULL.
- [x] **Step 3: Commit.** `feat(db): quota_ledger.user_id nullable, ON DELETE SET NULL (migration 0009)`.

---

## Phase 5 — `POST /api/account/delete`

**Execution Status:** ✅ SHIPPED 2026-07-18 (see top-of-plan table for SHAs)

**Files:** Create `src/app/api/account/delete/route.ts` + `test/workers/account-delete-route.test.ts` (workers pool; real D1; mirrors [sources-open-route.test.ts](../../test/workers/sources-open-route.test.ts) mock + [research-route-gating.test.ts](../../test/app/research-route-gating.test.ts) seeding).

**Interfaces:** `POST /api/account/delete` → `200 {"status":"deleted"}` + `Set-Cookie: wikinow_session=;…Max-Age=0` (authenticated); `401` (anonymous). Depends on Phase 4 (nullable column).

**BEFORE:** invoke `/superpowers:test-driven-development`; read `docs/pitfalls/testing-pitfalls.md`. Confirm (grep) `quota_ledger` is still the only table FK-referencing `users`.

- [x] **Step 1: Failing test** (`test/workers/account-delete-route.test.ts`):
```ts
// ABOUTME: Workers-pool test for POST /api/account/delete — deletes the profile, NULLs ledger attribution, appends audit.
// ABOUTME: Asserts global metering is preserved (row survives with user_id=NULL); anonymous → 401, nothing mutated.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { testEnv } from "./test-env";
import { issueSession } from "../../src/auth/session";
import { d1Executor } from "../../src/db/client";
import { upsertUser } from "../../src/db/users";
import { makeAuditLog } from "../../src/db/audit-log";
import { countPacksGlobalOnDay, countPacksForUserOnDay } from "../../src/db/quota-ledger";

const SESSION_SECRET = "account-delete-test-secret-32-bytes-xxx";
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: { DB: testEnv.DB, SESSION_SECRET } }) }));
const { POST } = await import("../../src/app/api/account/delete/route");

const db = () => d1Executor(testEnv.DB);
async function authedReq(userId: string): Promise<Request> {
  const token = await issueSession({ userId }, SESSION_SECRET, { ttlSeconds: 3600 });
  return new Request("https://x/api/account/delete", { method: "POST", headers: { cookie: `wikinow_session=${token}` } });
}
async function seedUserWithLedger(userId: string, day = "2026-07-14T00:00:00.000Z") {
  await upsertUser(db(), { userId, identityProvider: "google", identitySubject: "sub-" + userId, email: `${userId}@e.com`, createdAt: day });
  await db().prepare("INSERT INTO quota_ledger (claim_key, source_revision_id, user_id, evaluated_at, neurons, brave_query_count) VALUES (?,?,?,?,?,?)")
    .bind("ck-" + userId, 1, userId, day, 0, 0).run();
}
async function userExists(userId: string) {
  return (await db().prepare("SELECT user_id FROM users WHERE user_id = ?").bind(userId).all<{ user_id: string }>()).length > 0;
}

describe("POST /api/account/delete", () => {
  beforeEach(async () => {
    await testEnv.DB.exec("DELETE FROM quota_ledger");
    await testEnv.DB.exec("DELETE FROM users");
    await testEnv.DB.exec("DELETE FROM audit_log");
  });

  it("deletes the user, NULLs their ledger attribution (row kept for the global cap), appends one account.deleted, clears cookie", async () => {
    await seedUserWithLedger("u_del");
    const day = "2026-07-14";
    expect(await countPacksGlobalOnDay(db(), day)).toBe(1);
    const res = await POST(await authedReq("u_del"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "deleted" });
    expect(res.headers.get("set-cookie")).toContain("wikinow_session=;");
    expect(await userExists("u_del")).toBe(false);
    expect(await countPacksGlobalOnDay(db(), day)).toBe(1);        // global count PRESERVED
    expect(await countPacksForUserOnDay(db(), "u_del", day)).toBe(0); // attribution gone
    const del = (await makeAuditLog(db()).read()).filter((r) => r.eventType === "account.deleted");
    expect(del).toHaveLength(1);
    expect(del[0].actor).toBe("u_del");
  });

  it("deletes cleanly for a user with zero ledger rows", async () => {
    await upsertUser(db(), { userId: "u_none", identityProvider: "google", identitySubject: "s", email: "n@e.com", createdAt: "2026-07-14T00:00:00.000Z" });
    const res = await POST(await authedReq("u_none"));
    expect(res.status).toBe(200);
    expect(await userExists("u_none")).toBe(false);
  });

  it("rejects anonymous with 401 and mutates nothing", async () => {
    await seedUserWithLedger("u_keep");
    const res = await POST(new Request("https://x/api/account/delete", { method: "POST" }));
    expect(res.status).toBe(401);
    expect(await userExists("u_keep")).toBe(true);
    expect(await makeAuditLog(db()).read()).toHaveLength(0);
  });
});
```
- [x] **Step 2: Run → FAIL** (route missing): `node_modules/.bin/vitest run -c vitest.workers.config.mts test/workers/account-delete-route.test.ts`
- [x] **Step 3: Endpoint** (`src/app/api/account/delete/route.ts`):
```ts
// ABOUTME: POST /api/account/delete — deletes the user's profile (email/PII) and NULLs their quota_ledger
// ABOUTME: attribution (row kept for the global cost cap), appends account.deleted (G13), clears the session cookie.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { d1Executor } from "@/db/client";
import { appendStatement } from "@/db/audit-log";
import { resolveCurrentUser, SESSION_COOKIE } from "@/auth/current-user";
import { clearCookie } from "@/auth/cookies";

export const dynamic = "force-dynamic";

function json(body: unknown, status: number, setCookie?: string): Response {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  if (setCookie) headers.append("Set-Cookie", setCookie);
  return new Response(JSON.stringify(body), { status, headers });
}

export async function POST(request: Request): Promise<Response> {
  const { env } = getCloudflareContext();
  const auth = await resolveCurrentUser(request, env as unknown as Parameters<typeof resolveCurrentUser>[1]);
  if (auth.kind !== "authenticated") return json({ error: "Authentication required" }, 401);
  const userId = auth.userId;
  const db = d1Executor(env.DB);
  await db.batch([
    db.prepare("UPDATE quota_ledger SET user_id = NULL WHERE user_id = ?").bind(userId),  // detach; keep rows for the global cap
    db.prepare("DELETE FROM users WHERE user_id = ?").bind(userId),                         // remove the profile (email = PII)
    appendStatement(db, { actor: userId, eventType: "account.deleted", payload: {} }),
  ]);
  return json({ status: "deleted" }, 200, clearCookie(SESSION_COOKIE));
}
```
- [x] **Step 4: Run → PASS.** Then `tsc`.
- [x] **Step 5: Commit.** `feat(account): POST /api/account/delete (null-attribution + profile delete)`.

**Before complete:** assert the audit log has EXACTLY one new row (not zero, not wiped), the anonymous path mutates nothing, and the global count is unchanged after deletion.

---

## Phase 6 — Delete-account UI (nav confirm)

**Execution Status:** ✅ SHIPPED 2026-07-18 (see top-of-plan table for SHAs)

**Files:** Modify `src/app/components/NavAuthChip.tsx` (authenticated branch).

**Codex fix — use ONE operation state, not a shared `busy`.** During deletion the sign-out button must not read "Signing out…", Cancel must be disabled while a delete is in flight, and a prior delete-failure must clear when re-opening the confirm.

- [x] **Step 1: Extend the authenticated branch.** Replace the shared `busy` with `const [op, setOp] = useState<"idle" | "signout" | "delete">("idle")`; keep a `deleteFailed` that resets whenever the confirm opens/cancels. Sign-out uses `op === "signout"`; delete uses `op === "delete"`. Add a `deleteAccount()` handler POSTing `/api/account/delete` → on ok `setAnonymous()` + `router.refresh()`, else set failure. In the authed row, after Sign out:
```tsx
{!confirming ? (
  <button type="button" onClick={() => { setConfirming(true); setDeleteFailed(false); }}
          disabled={op !== "idle"} className="text-oxidized-rust underline-offset-2 hover:underline disabled:opacity-50">
    Delete account
  </button>
) : (
  <span className="flex items-center gap-2">
    <span className="text-dust-gray">Permanently delete your account?</span>
    <button type="button" onClick={deleteAccount} disabled={op !== "idle"}
            className="text-oxidized-rust underline-offset-2 hover:underline disabled:opacity-50">
      {op === "delete" ? "Deleting…" : "Delete"}
    </button>
    <button type="button" onClick={() => setConfirming(false)} disabled={op === "delete"}
            className="text-iron-gall underline-offset-2 hover:underline disabled:opacity-50">Cancel</button>
  </span>
)}
{deleteFailed && <span role="alert" className="text-oxidized-rust">Delete failed — retry</span>}
```
(Update the existing sign-out handler + disabled states to the `op` model so the two operations never show conflicting labels. Widen the `unknown` reserved-width placeholder if the authed row grows.)
- [x] **Step 2: Verify.** `tsc` + `eslint`. Post-deploy browser QA (needs a session): Delete → confirm → account gone, signed out, nav shows "Sign in"; Cancel dismisses; a re-login makes a fresh account; while deleting, Sign out/Cancel are disabled.
- [x] **Step 3: Commit.** `feat(ui): account menu with delete-account confirmation`.

---

## Phase 7 — Relabel anonymous audit actor `system` → `AnonUser`

**Execution Status:** ✅ SHIPPED 2026-07-18 (see top-of-plan table for SHAs)

**Files:** `src/app/api/sources/open/route.ts`, `src/app/api/feedback/route.ts`, `test/workers/sources-open-route.test.ts`.

Design §3.3. Only the **anonymous** branch changes; the research consumer's genuine backend `actor: "system"` (research-jobs.ts) stays. Append-only-safe (new rows only).

- [x] **Step 1.** In both routes, change `actor = auth.kind === "authenticated" ? auth.userId : "system"` → `: "AnonUser"`.
- [x] **Step 2.** Update the test asserting `actor === "system"` for an anonymous source-open ([sources-open-route.test.ts:67](../../test/workers/sources-open-route.test.ts)) → `"AnonUser"`. Grep for any other test asserting `"system"` on these routes' anonymous path.
- [x] **Step 3: Verify.** `node_modules/.bin/vitest run -c vitest.workers.config.mts` green; `tsc`.
- [x] **Step 4: Commit.** `fix(audit): label anonymous actions AnonUser, not system`.

---

## Finalization

- [x] Full verification: both pools green, `tsc`+`eslint` clean, `npm run build` OK (`/privacy` static).
- [ ] Open PR (base `dev`), `## Merge classification: Review — domain (auth + destructive + schema migration)`. Include Phase 1 findings.
- [ ] `/codex` review the diff, address findings, merge `--merge --delete-branch` on green CI (remote-delete manually if the `dev`-worktree conflict recurs — [[git-base-dev]]).
- [ ] **Ships to prod only via a Sam-triggered dev→main release.** The migration runs on deploy (deploy.yml applies migrations before deploy). Flag the migration explicitly at release; get Sam's go.
- [ ] Post-release: browser-QA the deletion flow with a real session (sign in → Delete account → gone + signed out).

## Notes for the executor
- Order: 1→2→3→4→5→6→7 (5 needs 4's nullable column; 6 needs 5). 7 is independent, can go anytime.
- The two real risks: Phase 3's build-time file read (verify early, take the fallback) and Phase 4's D1 migration FK mechanics (check how existing migrations handle it).
- Deletion is irreversible: the Phase-5 anonymous-mutates-nothing test and the Phase-6 confirm step are the guards. Do not weaken either.
