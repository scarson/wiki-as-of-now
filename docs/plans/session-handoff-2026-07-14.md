# Session handoff — auth-state initiative (PR-A shipped; PR-B/PR-C planned) — 2026-07-14

## Headline state

- **Worktree:** `.claude/worktrees/auth-state-ui-wiring-b15a4e` (name is stale — it now hosts the PR-B branch). Deps installed (`pnpm install` already run).
- **Current branch:** `claude/privacy-account-deletion` (cut off `origin/dev` **after** PR-A merged; carries all 3 design docs + all 3 plans). Local tip ≈ `2a43733`. **NOT pushed** — no PR-B PR open yet.
- **`origin/dev`** tip `57f3666` — PR-A merged in. **`origin/main`** — PR-A **released to production** (PR #37). Site **live**: https://wikinow.scarson.io
- **Merge/release model:** feature PRs target **`dev`** (NOT main); agent merges on green CI + `/codex`; **dev→main release is Sam-triggered** (runs the prod deploy + migrations). See `[[git-base-dev]]` memory + `docs/git-strategy.md`.

## What shipped this session

- **PR-A — auth-state UI wiring: MERGED (#36 → dev `57f3666`) + RELEASED to prod (#37 → main).** Nav auth chip + sign-out, dynamic home banner, proactive queue sign-in gate, `GET /api/auth/state`, cookie rename `wan_session`→`wikinow_session`, GitHub links on /about. Design: [docs/design/2026-07-13-auth-state-ui-wiring-design.md](../design/2026-07-13-auth-state-ui-wiring-design.md); plan (all phases ✅): [docs/plans/2026-07-13-auth-state-ui-wiring-plan.md](2026-07-13-auth-state-ui-wiring-plan.md).
  - **Live-verified (anonymous/static):** nav chip correct on home + `/queue` + **force-static `/about`** (the client-fetch design's whole point), dynamic banner, `/api/auth/state`→`{"authenticated":false}`, no console errors, GitHub links render.
  - **NOT yet verified (needs Sam):** the **authenticated** flow. The cookie rename logged Sam out, so the live site currently shows anonymous. Sam must **re-sign-in** and confirm: nav "Signed in · Sign out", banner "You're signed in…", sign-out flips back, authed `/queue` enqueue → 200 + "Queued 1…" toast.
- **Designs + plans for PR-B and PR-C** written, `/codex`-reviewed, committed on the branch.
- **Memory added:** `git-base-dev`, `nextjs-force-static-cookies`; `toolchain-quirks` updated (fresh worktree needs `pnpm install`).

## In-flight / ready-to-execute

Both PR-B and PR-C are **planned + codex-reviewed but NOT executed**. Neither branch is pushed.

### PR-C — Wikipedia links + article context (READY, do this FIRST — simplest, Routine, independent)
- Plan: [docs/plans/2026-07-13-wikipedia-links-and-article-context-plan.md](2026-07-13-wikipedia-links-and-article-context-plan.md). Design: [wikipedia-links design](../design/2026-07-13-wikipedia-links-and-article-context-design.md).
- `/codex` round-1 findings already **fixed in the plan** (populated-title test only, queue `onKeyDown` guard, apostrophe test).
- 3 phases: shared URL helper (TDD) → worksheet linked title (one extra column in `loadWorksheetView`) → link titles+sections in queue + article page. **Routine** merge.
- Independent of PR-B; not blocked on the policy decision. Good warm-up / quick win.

### PR-B — Privacy policy + account deletion (BLOCKED on one Sam decision)
- Plan: [docs/plans/2026-07-13-privacy-and-account-deletion-plan.md](2026-07-13-privacy-and-account-deletion-plan.md). Design: [privacy+deletion design](../design/2026-07-13-privacy-and-account-deletion-design.md).
- Design **finalized** with Sam (policy stop-slop'd + Sam-edited; deletion = null-attribution not hard-delete; AnonUser relabel; durability documented).
- Plan rebuilt + `/codex` round-2 reviewed. **The plan's top "Codex re-review (round 2)" section lists 10 findings to address during execution** — 2 plan-fix blockers (migration must be **`0009`** not 0006; update `src/db/schema.sql` for the parity test), 7 should-fix/nit, and **1 BLOCKER that needs Sam** (below).

## OPEN DECISION FOR SAM (blocks publishing the privacy policy)

`/codex` found the "finalized" policy is **factually inaccurate**: it says we store "only your email + a generated id," but the app **also stores the raw Google `sub`** (`users.identity_subject`) and `created_at` ([callback route:63](../../src/app/api/auth/google/callback/route.ts), [users.ts:5](../../src/db/users.ts)). And "that id can't be traced back to you" isn't durable — re-login **deterministically regenerates the same id** ([oauth.ts:16](../../src/auth/oauth.ts)).

**Two options (Sam's call):**
- **(A) Reword the policy** to disclose the stored Google identifier + soften traceability to present-tense ("once you delete, we can no longer link that id to you").
- **(B) Stop storing the raw `sub`** (the `user_id` hash is derived from it, so it may be unnecessary) so "only email" becomes literally true — a small schema/OAuth-callback change. More minimal; touches session-issuance code (normally off-limits, but this is a deliberate, Sam-sanctioned change if chosen).

Do NOT publish the policy until Sam picks A or B. Full detail: PR-B plan → "Codex re-review (round 2)" → item 3.

## Not started
- PR-A authenticated-flow live QA (needs Sam re-auth — see above).

## Operational guardrails (accumulated; don't re-discover)
- **Base branch is `dev`, not `main`.** Harness/context hints say "main" — wrong for feature PRs. `[[git-base-dev]]`.
- **`/codex`-gated merges** are Sam's standing grant for this initiative: every PR gets a `/codex` review before Claude merges on green CI. `/codex` review high-effort can exceed the 7-min shell limit — **redirect stdout to a file + use the 560000ms timeout** (a bare run lost all output once).
- **dev→main release + prod deploy is Sam's call** (deploy.yml auto-deploys dev→preview and main→prod, applying D1 migrations first; it's armed).
- **Toolchain:** fresh worktree needs `pnpm install --frozen-lockfile` first; node via `eval "$(fnm env)"`; tests via `node_modules/.bin/vitest [-c vitest.workers.config.mts]`; `cd $(git rev-parse --show-toplevel)` each Bash call (cwd resets). `[[toolchain-quirks]]`.
- **`--delete-branch` fails** with "`dev` is already used by worktree" — the GitHub merge still succeeds; delete the remote branch manually (`git push origin --delete <branch>`).
- **force-static neutralizes `cookies()`** → client-fetch for global per-user UI. `[[nextjs-force-static-cookies]]`.
- **Sam prefers plain-text questions**, never the AskUserQuestion tool. `[[ask-in-plain-text]]`.

## Priority queue (for the next session)
1. **Execute PR-C** (independent, Routine, unblocked): follow its plan → `/codex` diff review → merge to dev on green. Fast.
2. **Get Sam's A/B decision** on the PR-B policy accuracy (above). Then update the design/policy text accordingly.
3. **Execute PR-B** once the decision lands: work its plan **including the round-2 findings section** (migration 0009, schema.sql, upgrade+atomicity tests, stale-JWT guard, abuse-report relabel, opennext build, hooks-before-returns) → `/codex` diff → merge to dev.
4. **Release** (Sam-triggered): dev→main when Sam wants PR-C/PR-B live. Flag the **schema migration** explicitly at the PR-B release.
5. **PR-A authed QA**: Sam re-signs-in on the live site and confirms the authenticated flow.

## ⚠️ Seam — the PR-B/PR-C plans live ONLY on this (unpushed→now-pushed) branch
The PR-B plan, PR-C plan, and the **revised** privacy design are committed on
`claude/privacy-account-deletion`, **not on `dev`** (dev only has the ORIGINAL designs +
PR-A plan from PR #36). This branch is **pushed** as part of this handoff so the artifacts
survive. A fresh session MUST `git fetch && git checkout claude/privacy-account-deletion`
(in this worktree) to see them — do NOT start from `dev` or you'll miss the plans.

## Executor warning (PR-B)
The PR-B plan's **phases still contain stale content** (migration numbered `0006`, the
pre-correction policy). They are NOT final. The executor MUST reconcile each phase against
the plan's top **"Codex re-review (round 2)"** section before applying it — especially
migration `0009` (not 0006), `schema.sql`, and the un-resolved policy decision. Do NOT
publish the policy until Sam picks option A or B.

## Continuation prompt (paste-ready)

> WikiAsOfNow (Cloudflare Workers + Next 16, live at https://wikinow.scarson.io). Resume the auth-state initiative. **FIRST read `docs/plans/session-handoff-2026-07-14.md`.** Work in the existing worktree `.claude/worktrees/auth-state-ui-wiring-b15a4e` on branch **`claude/privacy-account-deletion`** (`git fetch && git checkout claude/privacy-account-deletion`; `pnpm install --frozen-lockfile` if `node_modules` is missing). This branch holds the PR-B/PR-C plans + revised privacy design — they are NOT on `dev`.
>
> PR-A (auth-state UI) is merged to `dev` and **released to prod (live)**; verified for anonymous, but Sam still owes an **authenticated-flow re-sign-in QA** on the live site. Two PRs remain, both planned + `/codex`-reviewed but NOT executed:
>
> **1. PR-C (Wikipedia links) — do FIRST.** Independent, Routine, unblocked. Cut a branch off `origin/dev`, follow `docs/plans/2026-07-13-wikipedia-links-and-article-context-plan.md` exactly (its `/codex` round-1 fixes are already in it), TDD, `/codex` the diff, merge to `dev` on green CI.
>
> **2. PR-B (privacy + account deletion) — BLOCKED on one Sam decision.** The privacy policy is factually inaccurate ("only email" but the app also stores the raw Google `sub`). Ask Sam: (A) reword the policy to disclose the stored Google identifier, or (B) stop storing the raw `sub`. See the PR-B plan → "Codex re-review (round 2)" → item 3. **Do NOT publish the policy until resolved.** Then execute `docs/plans/2026-07-13-privacy-and-account-deletion-plan.md` — but its phases are NOT final: reconcile every phase with the plan's top "Codex re-review (round 2)" section (10 findings), especially **migration `0009` not `0006`**, update `src/db/schema.sql`, add the stale-JWT audit-spam guard to the delete endpoint, relabel `src/abuse/report.ts`, and NavAuthChip hooks-before-returns. PR-B has a **D1 schema migration** → Review-classified; `/codex` the diff, merge to `dev`, flag the migration at the Sam-triggered dev→main release.
>
> Guardrails: feature PRs target **`dev` NOT main** (memory `git-base-dev`); **`/codex`-gated merges** (redirect codex stdout to a file + use a ~9-min timeout — it can exceed the shell limit); **Sam triggers dev→main releases** (prod deploy + D1 migrations, deploy.yml is armed); Sam wants **plain-text questions**, never the AskUserQuestion tool; `force-static` neutralizes `cookies()` (memory `nextjs-force-static-cookies`); toolchain quirks in memory `toolchain-quirks` (fresh worktree needs `pnpm install`; node via `fnm env`; `cd $(git rev-parse --show-toplevel)` each Bash call).
>
> Owed to Sam: (a) his authenticated re-sign-in QA of PR-A; (b) his A/B policy decision for PR-B; (c) his explicit go for each dev→main release.
