<!-- ABOUTME: Design spec for a formal Privacy Policy (authoritative markdown at docs/policy/privacy-policy.md, rendered in-app at /privacy) and a basic self-serve account-deletion feature that removes all personal data a signed-in user holds. -->
<!-- ABOUTME: Read alongside 2026-07-13-auth-state-ui-wiring-design.md (depends on its nav account area), src/db/users.ts + src/db/quota-ledger.ts (deletion targets + FK), docs/policy/wikipedia-genai-compliance.md (G13 audit-log append-only). -->

# Privacy policy + account deletion — design

**Status:** proposed design (brainstorm complete), pending Sam's review-gate approval.
**Author:** Claude + Sam, 2026-07-13.
**Depends on:** the auth-state UI wiring
([2026-07-13-auth-state-ui-wiring-design.md](2026-07-13-auth-state-ui-wiring-design.md))
— specifically its nav account area, where the Delete-account control lives. Lands as
its own PR **after** that work.
**Why coupled:** a privacy policy that says "you can delete your account" must ship
with a working delete (the teetimes precedent Sam pointed at does exactly this). So the
policy and the delete feature are one PR, not two.

## 1. Why this exists

Sign-in is live, so WikiAsOfNow now holds personal data (a Google email + an opaque
account id). That creates two obligations it doesn't yet meet: a **stated privacy
policy** and a **way for a user to delete their data**. This is deliberately simple —
the compliance design already minimized what we hold, so the honest policy is short.

## 2. What we actually hold (the basis for the policy — verify before publish)

From the data model (`src/db/users.ts`, `src/db/quota-ledger.ts`, `src/auth/*`):

| Data | Where | Personal? |
|---|---|---|
| Email | `users.email` | **Yes** — the one clearly-personal field |
| Google subject (`sub`) | `users.identity_subject` | Yes (links to the Google account) |
| Opaque account id | `users.user_id` = SHA-256(provider+sub) | Pseudonymous |
| Session token | `wikinow_session` cookie (JWT, carries only `user_id`) | Pseudonymous |
| Per-pack metering | `quota_ledger` (claim_key, revision, `user_id`, timestamp, neuron/query counts) | Pseudonymous (no PII) |
| Outcome/audit events | `audit_log` (actor = `user_id` signed-in / `"AnonUser"` anon / `"system"` backend, codes only) | Pseudonymous; **no free text/content** (G13) |

**Facts the policy asserts that MUST be verified before publishing** (checked during
implementation, confirmed at the review gate): (a) there are **no third-party
analytics/advertising cookies or trackers** in the app; (b) anonymous use associates
nothing with a person (anonymous actions are recorded only as actor `"system"`, with no
identifier). If either turns out false, the policy wording changes.

**Third-party framing (corrected after `/codex` review + Sam's steer).** The original
draft claimed "Google is the only third party" — imprecise, because **Cloudflare** is
also in the *personal-data* path, as a **data processor acting on our behalf** (not a
party we sell or share to). That is the only correction the policy needs. Codex also
listed Wikimedia / Brave / Workers AI, but those are **out of a privacy policy's scope**:
they process only *public* article/source content and **never receive user identity or
personal data** (Sam's steer). The policy therefore names Cloudflare (processor) + Google
(sign-in) for personal data, and adds one parenthetical noting the research feature's
public-content services never see personal data — nothing more.

## 3. Privacy policy — content and surfacing

### 3.1 Authoritative source + rendering

- **Authoritative doc:** `docs/policy/privacy-policy.md` (plain markdown, the single
  source of truth — Sam's instruction).
- **In-app surface:** a new `/privacy` route, `export const dynamic = "force-static"`
  (mirrors `/about`), that reads `docs/policy/privacy-policy.md` at **build time** and
  renders it. Because the route is static, the file is read once during `next build`
  (Node) and the Worker serves pre-rendered HTML — no filesystem read and no markdown
  parser at runtime.
- **Rendering mechanism:** add `markdown-to-jsx` to turn the markdown into React
  elements — no `dangerouslySetInnerHTML`. This is a deliberate dependency addition
  (flagged for the review gate); it is the minimal way to honor "one authoritative
  markdown source, rendered." The content is author-controlled (not user input), so
  there is no injection surface regardless.
  - **Verified provenance (do NOT guess the package/PURL):** npm package
    **`markdown-to-jsx`** — PURL `pkg:npm/markdown-to-jsx`, npm
    <https://www.npmjs.com/package/markdown-to-jsx>, source repo
    <https://github.com/quantizor/markdown-to-jsx> (author: quantizor). Before install,
    confirm the resolved package's `repository` field points at that exact repo; reject
    any look-alike. Pin an exact version in `package.json` and commit the lockfile.
- **Discoverability:** link `/privacy` from the global nav footer/About and the home
  footer (alongside "About & compliance"). One click from anywhere.
- **G1 note:** unlike detection/claim surfaces, this is app-governance prose authored by
  Claude and **approved by Sam** (like the existing `aboutContent()` compliance copy);
  it is human-owned policy text, not model prose injected into a Wikipedia-facing
  surface.

### 3.2 Proposed policy text (for review — becomes `docs/policy/privacy-policy.md` verbatim)

> # Privacy Policy
>
> _Last updated: 2026-07-13_
>
> WikiAsOfNow finds Wikipedia claims that may have gone stale, and lets you request
> research on one if you sign in. It's short because we hold very little.
>
> ## Browsing without an account
>
> You can look up articles and read detected claims without signing in. We don't
> associate anything with you when you browse anonymously.
>
> ## Signing in with Google
>
> Signing in is only for requesting research on a claim. When you do, we store only your
> **email address** and generate an **internal account id** (a one-way hash of your
> Google account; we never see your password). We use them to let you request research
> and to enforce daily usage limits.
>
> **We don't sell your personal data or share it with anyone for their own use.** Google
> is our sign-in provider, and Cloudflare, our hosting provider, stores and processes
> this data as our data processor. (Requesting research fetches and searches public web
> content through other services, which never receive your identity or any personal
> data.)
>
> ## Activity log
>
> We keep an append-only log for integrity and abuse-prevention. It records only short
> codes and identifiers, never your searches, article text, or any free text about you.
> When you're signed in, entries carry your opaque account id; once you delete your
> account, that id can't be traced back to you. Anonymous actions carry no personal
> identifier at all.
>
> ## Cookies
>
> One session cookie (`wikinow_session`) keeps you signed in, plus two short-lived
> cookies during Google sign-in. We use no analytics, advertising, or tracking cookies.
>
> ## Deleting your account
>
> Delete your account anytime from the account menu while signed in. This removes your
> email and account profile for good and signs you out. We keep anonymized daily usage
> counts to enforce overall limits, but nothing that links them back to you.
>
> ## Questions
>
> Ask in our [GitHub Discussions](https://github.com/scarson/wiki-as-of-now/discussions).
>
> ## Changes
>
> If this policy changes, we'll update the date above and the version in our public repo.

### 3.3 Audit actor label fix (`system` → `AnonUser`) — Sam's steer

The code currently tags **anonymous** user actions in the audit log with
`actor = "system"` ([sources-open/route.ts:34](../../src/app/api/sources/open/route.ts),
[feedback/route.ts:33](../../src/app/api/feedback/route.ts)). That's misleading —
`"system"` reads as a backend/cron service identity, not a person browsing anonymously.
Relabel the **anonymous** branch of those routes to **`"AnonUser"`**, leaving the
authenticated actor (the opaque `user_id`) and the genuine backend/consumer events
(the research consumer's `actor: "system"` in `research-jobs.ts`, which really *are*
system actions) unchanged. Update the one test that asserts `"system"` for an anonymous
source-open ([sources-open-route.test.ts:67](../../test/workers/sources-open-route.test.ts)).
Append-only-safe: only new rows get the clearer label; existing rows are untouched
(no rewrite, G13 intact). This keeps the audit log's actor field honest, which the
privacy policy's accuracy quietly depends on.

## 4. Account deletion — mechanics

### 4.1 Endpoint

`POST /api/account/delete` — auth-gated via `resolveCurrentUser` (401 for anonymous,
the same pattern as the research routes). POST-only. No request body needed; the actor
is the current session's `user_id`.

### 4.2 What it does — null the attribution, delete the profile

**The trap (found in `/codex` review, verified):** the `quota_ledger` is not just a
per-user record — a **global daily cost cap** counts *all* ledger rows for the day
(`countPacksGlobalOnDay` has no `user_id` filter,
[quota-ledger.ts:36-42](../../src/db/quota-ledger.ts); enforced in
[reconcile.ts:53-54](../../src/quota/reconcile.ts) against `DEFAULT_GLOBAL_DAILY_CAP`).
So **deleting a user's ledger rows would lower the global count and let research spend
blow past the global cost cap.** Hard-delete is out.

**The fix (Sam-approved):** sever the person-link but keep the row for global metering.

- **Migration `0006`:** rebuild `quota_ledger` so `user_id` is **nullable** with
  `REFERENCES users(user_id) ON DELETE SET NULL` (SQLite table-rebuild: new table → copy
  → drop → rename; PK `(claim_key, source_revision_id)` and all columns preserved).
- **Endpoint — one atomic `db.batch`:**
  1. `UPDATE quota_ledger SET user_id = NULL WHERE user_id = ?` — detaches attribution;
     the row still counts globally (the global query ignores `user_id`), so the cost cap
     is untouched.
  2. `DELETE FROM users WHERE user_id = ?` — removes the profile (email = the only PII).
  3. append an `account.deleted` event to the **audit log** (actor = `user_id`, codes
     only — append-only-consistent).

then the response **clears the `wikinow_session` cookie** (`clearCookie`); the client
(§5) `router.refresh()`es to anonymous. The explicit `UPDATE … NULL` is the real
mechanism (robust whether or not D1 enforces `ON DELETE SET NULL`); the FK clause is
defense-in-depth. Nulled rows don't count toward any user's per-user cap, so a
re-registered same-id user simply starts a fresh per-user count — global integrity
holds, per-user resets, which is the intended behavior.

### 4.3 Accepted limitations (basic deletion — Sam-approved, documented not mitigated)

Both are stated plainly in the public policy (§3.2), not hidden:

- **No server-side session revocation.** Sessions are stateless JWTs; deletion clears
  the cookie immediately (instant sign-out here), but a copy of the JWT open elsewhere
  verifies (resolving to a now-dangling `user_id`) until its 7-day expiry. No denylist.
- **A queued research job may recreate a PII-free stub.** The research consumer
  self-seeds a missing ledger-owner (`ledgerOwnerSeed`,
  [research-jobs.ts:38-47](../../src/queue/research-jobs.ts)) with `email: ""` /
  `provider: "pending"` — **never the real email** — so a job already queued when you
  delete can recreate a `users` row that contains **no personal data**. The real email
  is permanently gone regardless. Making the consumer drop work for deleted users is a
  larger change (queue semantics) deliberately deferred; documented as an accepted limit.

### 4.4 Compliance & safety checks (must hold at the review gate)

- Does **not** delete or mutate `audit_log` rows; only appends (G13 intact). Does **not**
  delete `quota_ledger` rows — only nulls `user_id` — so global metering (a cost/abuse
  control) is preserved.
- Migration `0006` alters only `quota_ledger`'s `user_id` nullability + FK action; the
  metered unit (row = one committed pack) is unchanged.
- Confirm no other table FK-references `users.user_id` beyond `quota_ledger` (verified
  at design time; re-grep at implementation).
- Destructive + auth-domain + schema migration → **Review-classified**; ships behind a
  `/codex` review and a confirmation step (§5). Adds a data-erasure capability the
  compliance posture lacked; weakens no guardrail.

## 5. Deletion UX

The nav account area from the auth-state work (top-right, authenticated state) becomes a
small menu: **Signed in ▾ → Sign out · Delete account**. "Delete account" opens a
confirmation dialog ("This permanently deletes your account and signs you out. This
can't be undone.") with an explicit confirm button. On confirm: `POST /api/account/delete`
→ on success, `router.refresh()` returns the whole app to the anonymous state; on
failure, a transient inline error (no optimistic sign-out). Modeled on the teetimes
"click your name → Delete account" flow.

## 6. Testing strategy (TDD)

- **Delete endpoint (server):** authenticated request deletes the `users` row, **nulls**
  the user's `quota_ledger.user_id` (rows remain — assert the global row count is
  unchanged), and appends exactly one `account.deleted` audit event, atomically;
  anonymous request → 401 with nothing mutated; response clears the cookie. A user with
  zero ledger rows deletes cleanly. Assert the audit_log is otherwise untouched.
- **Global-metering preservation:** after deletion, `countPacksGlobalOnDay` returns the
  same count as before (the row survives with `user_id = NULL`); `countPacksForUserOnDay`
  for the deleted id returns 0.
- **Atomicity:** a failure mid-batch leaves both tables unchanged (no half-deleted user).
- **`/privacy` render:** the built page contains the policy's section headings from the
  markdown source (guards the build-time read + `markdown-to-jsx` path).
- **UX:** confirm dialog gates the POST; cancel fires nothing; success refreshes to
  anonymous.
- Test output pristine; the 401 path asserts the error shape rather than letting it noise.

## 7. Implementation sequencing (isolated, CI-passing commits)

1. `docs(policy): add privacy policy` — authoritative `docs/policy/privacy-policy.md`
   (the §3.2 text, after verifying §2's factual claims).
2. `feat(web): render privacy policy at /privacy` — add `markdown-to-jsx`, static route,
   nav/footer links.
3. `feat(db): quota_ledger.user_id nullable, ON DELETE SET NULL` — migration `0006`
   (table rebuild) so attribution can be detached without dropping the metered row.
4. `feat(account): POST /api/account/delete` — atomic null-attribution + user delete +
   audit event + cookie clear (TDD).
5. `feat(ui): account menu with delete-account confirmation` — wires the endpoint into
   the nav account area.
6. `fix(audit): label anonymous actions AnonUser, not system` — §3.3; the two routes +
   the one test. Small, isolatable; can land first or last.

All six are one PR (interdependent: the policy promises the delete). PR is
**Review-classified** (auth + destructive + schema migration); merged by Claude after a
`/codex` review per Sam's grant.

## Appendix — reasoning & alternatives

**Render markdown vs. parallel JSX (Sam chose render).** Rendering the one authoritative
`.md` avoids a sync-drift burden between a doc and a hand-written page; the cost is one
small build-time dependency, paid once. The `force-static` read keeps it off the Worker
runtime entirely.

**Delete the profile, null the metering attribution (revised after `/codex`).** The
first draft hard-deleted the `users` row AND the `quota_ledger` rows. `/codex` caught —
and I verified — that the global daily cost cap counts all ledger rows, so dropping them
would let spend exceed the global budget. The fix keeps the metered rows (global cap
intact) and nulls their `user_id` (attribution gone), while hard-deleting the `users`
row (the actual PII). A full tombstone on `users` was rejected: `user_id` is a
deterministic hash, so a re-login would PK-collide with a tombstone; deleting the row and
letting re-login create a fresh one is cleaner. Migration `0006` makes `user_id` nullable
to allow the detach.

**Durability: document, don't over-build (Sam's call).** Making the research consumer
drop queued work for deleted users (and adding a user-existence check at the research
gate) is a real fix but a larger, queue-semantics change. Since the only thing a queued
job can recreate is a PII-free stub (email `""`), the honest, small choice is to document
the limit in the policy and defer the queue-drain work. Revisit if real users arrive.

**Basic vs. revocable sessions.** Chosen basic per "simple is good" and the teetimes
precedent; the JWT-until-expiry window is the one honest caveat, surfaced in §4.3 for
veto rather than buried.

**Still uncertain / to verify before publish:** the three factual assertions in §2
(no trackers, anonymous-stores-nothing, Google-only) — cheap to confirm in code, but
they gate the policy's honesty, so they are explicit preconditions, not assumptions.
