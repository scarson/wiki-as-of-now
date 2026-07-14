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
| Outcome/audit events | `audit_log` (actor = `user_id` or `"system"`, codes only) | Pseudonymous; **no free text/content** (G13) |

**Facts the policy asserts that MUST be verified before publishing** (checked during
implementation, confirmed at the review gate): (a) there are **no third-party
analytics/advertising cookies or trackers** in the app; (b) anonymous use associates
nothing with a person (anonymous actions are recorded only as actor `"system"`, with no
identifier); (c) Google is the only third party in the data path, and only as the
sign-in identity provider. If any turns out false, the policy wording changes.

## 3. Privacy policy — content and surfacing

### 3.1 Authoritative source + rendering

- **Authoritative doc:** `docs/policy/privacy-policy.md` (plain markdown, the single
  source of truth — Sam's instruction).
- **In-app surface:** a new `/privacy` route, `export const dynamic = "force-static"`
  (mirrors `/about`), that reads `docs/policy/privacy-policy.md` at **build time** and
  renders it. Because the route is static, the file is read once during `next build`
  (Node) and the Worker serves pre-rendered HTML — no filesystem read and no markdown
  parser at runtime.
- **Rendering mechanism:** add `markdown-to-jsx` (small, zero-dependency, widely used)
  to turn the markdown into React elements — no `dangerouslySetInnerHTML`. This is a
  deliberate dependency addition (flagged for the review gate); it is the minimal way
  to honor "one authoritative markdown source, rendered." The content is
  author-controlled (not user input), so there is no injection surface regardless.
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
> WikiAsOfNow helps you find time-bound claims in Wikipedia articles that may now be
> stale, and — if you sign in — request deterministic research on a claim. This policy
> explains what we store and how to remove it. It is deliberately short because we
> deliberately hold very little.
>
> ## Using WikiAsOfNow without an account
>
> You can look up articles and read detected stale claims without signing in. When you
> use the tool anonymously, we don't associate anything with you personally. Anonymous
> actions are recorded only as "system," with no identifier that points back to you.
>
> ## When you sign in with Google
>
> Signing in is only needed to request research on a claim (a metered operation). When
> you sign in with Google, we receive and store:
>
> - your **email address**, and
> - an **internal account id** derived from your Google account (a one-way hash — we
>   never store your Google password, and the raw Google identifier is not exposed).
>
> We use these only to let you request research and to apply per-account daily usage
> limits. **We don't sell your data or share it with anyone**, other than Google, which
> acts solely as the sign-in provider.
>
> ## Our activity log
>
> WikiAsOfNow keeps an append-only activity log for integrity and abuse-prevention. By
> design it records **only short outcome codes and identifiers** — never your searches'
> content, the article text, or any free-form text about you.
>
> ## Cookies
>
> We use a single session cookie (`wikinow_session`) to keep you signed in, and two
> short-lived cookies during the Google sign-in handshake. We use **no third-party
> analytics, advertising, or tracking cookies**.
>
> ## Deleting your account
>
> You can delete your account at any time. While signed in, open the account menu in
> the top-right corner and choose **Delete account**. This permanently removes your
> email, your account id, and your research-usage records from our servers, and signs
> you out. Anonymous activity-log entries remain, but they are no longer linked to you.
>
> ## Questions
>
> Ask in our [GitHub Discussions](https://github.com/scarson/wiki-as-of-now/discussions).
>
> ## Changes
>
> If this policy changes, we'll update the date above and the version in our public
> repository.

## 4. Account deletion — mechanics

### 4.1 Endpoint

`POST /api/account/delete` — auth-gated via `resolveCurrentUser` (401 for anonymous,
the same pattern as the research routes). POST-only. No request body needed; the actor
is the current session's `user_id`.

### 4.2 What it does (one atomic `db.batch`)

The `quota_ledger.user_id → users.user_id` foreign key
([0005_quota_ledger.sql](../../migrations/0005_quota_ledger.sql), default
`ON DELETE NO ACTION`) means the user row cannot be deleted while ledger rows reference
it. So deletion is a single atomic batch, children-before-parent:

1. `DELETE FROM quota_ledger WHERE user_id = ?`
2. `DELETE FROM users WHERE user_id = ?`
3. append an `account.deleted` event to the **audit log** (actor = `user_id`, codes
   only — append-only-consistent, records the deletion for auditability)

then the response **clears the `wikinow_session` cookie** (`clearCookie`), signing the
user out immediately. The client (§5) then `router.refresh()`es to the anonymous state.

**Why hard-delete the ledger rows** (rather than orphan or anonymize): the FK requires
addressing them; the rows carry no PII (opaque id only), but deleting them honors the
policy's "permanently removes … your research-usage records" and keeps the promise
concrete. This touches the `quota_ledger` (a "write-once" metering ledger), but **not**
the append-only compliance `audit_log` (G13) — the two are distinct, and the compliance
doc places no append-only constraint on `quota_ledger`. Still called out explicitly for
the review gate.

### 4.3 Accepted limitations (basic deletion — Sam's "simple is good")

- **No server-side session revocation.** Sessions are stateless JWTs; deletion works by
  clearing the cookie immediately, not by revoking outstanding tokens. Practically the
  user is signed out at once; a copy of the JWT elsewhere would verify (resolving to a
  now-dangling `user_id`) until its 7-day expiry. True revocation needs a denylist —
  out of scope unless Sam wants it. **Flagged for veto at the review gate.**
- **Quota reset via delete + re-login.** Re-signing-in with the same Google account
  re-derives the same `user_id` but with the ledger cleared, resetting that day's usage
  count. The daily cap resets anyway, and re-auth is high-friction; accepted at current
  usage. Noted, not mitigated.

### 4.4 Compliance & safety checks (must hold at the review gate)

- Does **not** delete or mutate `audit_log` rows; only appends (G13 intact).
- Confirm no other table FK-references `users.user_id` beyond `quota_ledger` (grep at
  implementation time; today only `quota_ledger` does).
- Destructive + auth-domain → **Review-classified**; ships behind a `/codex` review and
  a confirmation dialog (§5). This design does not weaken any guardrail; it adds a
  data-erasure capability the compliance posture lacked.

## 5. Deletion UX

The nav account area from the auth-state work (top-right, authenticated state) becomes a
small menu: **Signed in ▾ → Sign out · Delete account**. "Delete account" opens a
confirmation dialog ("This permanently deletes your account and signs you out. This
can't be undone.") with an explicit confirm button. On confirm: `POST /api/account/delete`
→ on success, `router.refresh()` returns the whole app to the anonymous state; on
failure, a transient inline error (no optimistic sign-out). Modeled on the teetimes
"click your name → Delete account" flow.

## 6. Testing strategy (TDD)

- **Delete endpoint (server):** authenticated request removes the user's `users` and
  `quota_ledger` rows and appends exactly one `account.deleted` audit event, atomically;
  anonymous request → 401 with nothing mutated; response clears the cookie. A user with
  zero ledger rows deletes cleanly. Assert the audit_log is otherwise untouched.
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
3. `feat(account): POST /api/account/delete` — atomic ledger+user delete + audit event +
   cookie clear (TDD).
4. `feat(ui): account menu with delete-account confirmation` — wires the endpoint into
   the nav account area.

All four are one PR (they're interdependent: the policy promises the delete). PR is
**Review-classified** (auth + destructive); merged by Claude after a `/codex` review per
Sam's grant.

## Appendix — reasoning & alternatives

**Render markdown vs. parallel JSX (Sam chose render).** Rendering the one authoritative
`.md` avoids a sync-drift burden between a doc and a hand-written page; the cost is one
small build-time dependency, paid once. The `force-static` read keeps it off the Worker
runtime entirely.

**Hard-delete vs. soft-delete/anonymize the user row.** A soft delete (nulling `email`
+ `identity_subject`) would keep the FK satisfied without touching `quota_ledger`, but
`user_id` is a deterministic hash, so a re-login would collide with the tombstone row's
primary key, and a lingering tombstone is a worse privacy story than "it's gone." Hard
delete is simpler and matches the policy's plain promise.

**Basic vs. revocable sessions.** Chosen basic per "simple is good" and the teetimes
precedent; the JWT-until-expiry window is the one honest caveat, surfaced in §4.3 for
veto rather than buried.

**Still uncertain / to verify before publish:** the three factual assertions in §2
(no trackers, anonymous-stores-nothing, Google-only) — cheap to confirm in code, but
they gate the policy's honesty, so they are explicit preconditions, not assumptions.
