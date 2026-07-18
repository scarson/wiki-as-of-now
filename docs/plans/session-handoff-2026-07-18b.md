# Session handoff — priority queue worked: throttle, session mint, gold-answer eval shipped + released — 2026-07-18 (second session)

Successor to [session-handoff-2026-07-18.md](session-handoff-2026-07-18.md) (same day, follow-on session that executed its priority queue).

## Headline state

- **Prod == dev again.** Release [PR #50](https://github.com/scarson/wiki-as-of-now/pull/50) promoted PRs #47–#49 (merge pending at writing — see the PR for final state; no D1 migrations in it). Suites at dev tip: **976 node + 63 workers green**.
- **Branch namespace:** only `dev`/`main` remote plus this handoff's `docs/handoff-0718b`. Feature branches from this session (`feat/capture-throttle`, `feat/dev-session-mint`, `feat/gold-answer-eval`) merged and deleted.
- **Worktrees:** this session used `.claude/worktrees/wikinow-session-handoff-e81ef1` (harness-created; safe to delete after this branch merges). `laughing-chaplygin-ce1c13` remains untouched — still Sam's to triage.

## What shipped this session (all merged to dev)

- **[PR #47](https://github.com/scarson/wiki-as-of-now/pull/47) — anonymous capture throttle.** In-memory per-IP fixed window (10 req/60 s, env-overridable) on `POST /api/queue/capture`; 429 + Retry-After; cross-origin POSTs refused before charging the budget (codex P2). Design + rejected alternatives: [capture-throttle design](../design/2026-07-18-capture-throttle-design.md). **The load-bearing constraint:** the privacy policy's "anonymous actions carry no personal identifier" promise rules out any durable (even hashed) IP storage without a Sam-approved policy amendment — hence in-memory/per-isolate, honestly modest.
- **[PR #48](https://github.com/scarson/wiki-as-of-now/pull/48) — dev-only session mint** (`POST /api/dev/mint-session`), per Sam's explicit upgrade of handoff item 4 to implement-and-merge. Double fail-closed gate (`DEV_SESSION_MINT` var, dev-env only + constant-time `ADMIN_SECRET`); uniform 404 on every refusal AND every non-POST method (codex P2); config test guards prod absence; mints a real `dev-test` user row + 1 h cookie. Design: [dev-session-mint design](../design/2026-07-18-dev-session-mint-design.md). Live-verified fail-closed on both dev and prod (six probe shapes, all 404).
- **[PR #49](https://github.com/scarson/wiki-as-of-now/pull/49) — offline gold-answer eval** (`test/research/gold-answer-eval.test.ts`): replays all 30 evidenced gold records through `canonicalizeUrl` → `researchClaim` (production caps) → `verifyProposal` against pinned snapshots; per-card ordered comparison; contiguous context-window check; tampered-quote control; anti-vacuity floor (36/39 cards carry context — 3 whole-paragraph quotes legitimately don't). **Result: 100% acceptance.** Also fixed the stale recall.test.ts ABOUTME header (see Corrections).
- **[PR #50](https://github.com/scarson/wiki-as-of-now/pull/50) — release** of the above to prod.

## Corrections to the prior handoff (verify-before-working lesson)

1. **Priority item 1 (detector recall floor) was already complete** — shipped 2026-06-05 via [PR #6](https://github.com/scarson/wiki-as-of-now/pull/6) ([recall plan](2026-06-05-wikiasofnow-recall-plan.md), Phases 1–2 ✅). Live-verified this session: reachable recall 1.0 (11/11), 0.90 floor enforced, only miss is the deferred inline-year design limit. The prior handoff was misled by recall.test.ts's stale "no hard floor" header (fixed in #49) and pointed at the wrong plan for "Task 2.2" (it's in the recall plan, not the corpus build plan).
2. **The dev deployment runs single-admin mode, not oauth** — no Google credentials on the dev worker (`/api/auth/google` → 404). "oauth mode disables the admin-header fallback" is true of prod only. Memory: `dev-auth-mode-and-mint`.
3. **Corpus build plan Phases 3–4 banners said ⏸ DEFERRED but the work shipped** via the corpus-pilot line — banners flipped retroactively in this commit.

## Qualitative review of the 4 live dev packs (handoff item 2, second half)

All four 2026-07-12 Gemma packs read against their sources (full findings: memory `research-pack-quality-pattern`):

- **Pack quality tracks named entities in the claim sentence.** Kali Hotel (names Clayco/LJC/Hollywood Park): excellent, 4 resolving cards from official releases. Three Gorges ("The dam…"): good card, generic queries. San Jose–Gilroy: related-background card that does NOT resolve the claim; `advisorySupport: true` overclaims. CA HSR ("the Authority…"): **bad card** — lawinsider.com legal-dictionary boilerplate from an unrelated project; Gemma emitted literal `[Authority]` placeholder queries.
- **Root cause:** query generation sees only `sentence_text` + `sectionHeading` + `year`. `surroundingText` exists on `ResearchInput` (`src/research/provider.ts`) marked "plumbed at detection time in a later slice" — that slice is now the highest-leverage research-quality work, with concrete evidence.
- The deterministic verify layer was sound in all 4 packs (every quote genuinely on its page) — the weakness is relevance triage, which G6 show-your-work anticipates.

## Blocked / owed by Sam

- **ADMIN_SECRET value for dev** — blocks live authed QA (prior handoff item 5). The secret store lists the name only; the permission classifier (correctly) blocked me from rotating it. **Either:** drop the current value into `~/.wikinow/dev-admin-secret` (`chmod 600`), **or** approve a rotation (`openssl rand -base64 32 | bunx wrangler secret put ADMIN_SECRET --env dev`, then store the value in that file). Once present, the item-5 runbook below is ready.
- **Capture throttle-vs-auth-gate preference** (standing): throttle shipped as the default; auth-gating or a durable throttle (needs privacy-policy amendment) remain Sam's calls. A zone-level WAF rate rule is a no-code strengthening option.
- **Prod deletion-flow QA** — the mint is dev-only by design ("config absent from prod" was the grant's own boundary), so prod deletion QA still needs Sam (or an explicit future decision to extend minting to prod — recommended against in the [mint design](../design/2026-07-18-dev-session-mint-design.md)). **Dev-parity deletion QA is already machine-verified** (workers test: mint → delete → row gone, cookie cleared, re-mint same id), so the live-dev run below is confirmatory.
- **`laughing-chaplygin-ce1c13` worktree triage** (standing).

## Ready-to-dispatch (once unblocked)

**Item 5 live QA runbook (needs the ADMIN_SECRET value):**
1. `curl -X POST -H @$HOME/.wikinow/dev-admin-header https://wiki-as-of-now-dev.samuel-carson.workers.dev/api/dev/mint-session` (write the header file as `x-admin-secret: <value>`; `-H @file` keeps the secret out of argv) → 200 + cookie.
2. Drive authed flows with the cookie: `/api/auth/state` (authenticated), enqueue-research on an eligible candidate (**mind the metered global daily cap — 50/day, ledger rows never deleted; one enqueue is plenty**), account delete → verify signed out + row gone.
3. Browser-based QA: set the cookie in the in-app browser via the mint response, exercise nav auth chip + account menu + delete UI.

## Priority queue (next session)

1. **Plumb article title + `surroundingText` into `ResearchInput`** at enqueue time (evidence: the pack review above; 2 of 4 packs degraded, 1 irrelevant, for want of the claim's referent). Deterministic plumbing, TDD; the LLM prompt then receives it (prompt change = research/LLM surface — read the compliance contract first; G9's three-jobs box is unaffected by adding *context*, but keep queries neutral).
2. **Cheap adjunct:** drop queries containing literal `[`/`]` placeholders in the G9 query bound (`applyQueryBound`, `src/research/pipeline.ts`) — observed `[Authority]` queries from Gemma.
3. **Item 5 live QA** (blocked on the secret above; runbook ready).
4. **Online (LLM-inclusive) eval** — the corpus design's "online (manual eval)": does the live pipeline *find* the gold answers? Metered; design a small-N manual protocol before spending.
5. **Consider `advisorySupport` calibration** — the San Jose–Gilroy card shows the model marking non-resolving background as supportive; the eval corpus could ground a measurement.

## Session mechanics notes

- **Usage-limit pause:** mid-session (before the throttle codex review), Sam asked for a 30-minute sleep across the 5-hour usage reset. Implemented as one chained background command — codex review, then `sleep` padding to 30 min — producing a single wake-up with the review output on disk. Explains the 30-minute gap in the transcript; pattern is reusable.
- **`unstable_readConfig`:** wrangler 4.x exports a working `unstable_readConfig` (verified against this repo's `wrangler.jsonc`), but the config prod-safety test uses the house `readJsonc` pattern already in `test/config/wrangler-config.test.ts` instead — consistency within the file over a second parser. Recorded so a future session doesn't re-litigate.

## Operational guardrails accumulated (beyond the prior handoff's — those all still hold)

- In Monitor tool scripts, `status` is a **read-only zsh variable** — a `status=$(...)` assignment kills the script (exit 1, "read-only variable"). Use another name.
- `gh pr checks <n>` on a just-opened PR can include a `deploy` check inherited from the head SHA's branch push — expect two checks on release PRs.
- The permission classifier can block `wrangler secret put` compound commands; surface to Sam rather than splitting the command to evade it.
- `getUserById` returns `undefined` (not `null`) for a missing row.
- Quote-context can be legitimately null on BOTH sides (whole-paragraph quote) — 3 of 39 gold cards; don't assert context presence per-card.

## Continuation prompt (paste-ready)

> WikiAsOfNow (Cloudflare Workers + Next 16; prod alpha at https://wikinow.scarson.io). **FIRST read `docs/plans/session-handoff-2026-07-18b.md`** — full state, grants, corrections, and the priority queue; its predecessor `session-handoff-2026-07-18.md` carries the standing grants/toolchain sections which all still hold (merge authority incl. releases, codex gate on code PRs, TDD both pools, Workflow standing-approved ~20 agents `model:'opus'` + adversarial verify, plain-text questions, compliance contract sacrosanct, `eval "$(fnm env)"` + `cd "$(git rev-parse --show-toplevel)"` every Bash call, Monitor for CI waits — plus new: never name a Monitor-script variable `status`, zsh read-only).
>
> **State:** PRs #47 (capture throttle), #48 (dev session mint), #49 (gold-answer eval) merged to dev; release PR #50 → prod (verify it merged + prod smoke if the prior session didn't confirm). 976 node + 63 workers green. Only `dev`/`main` remote. Fresh worktree: `git worktree add .claude/worktrees/<slug> -b feat/<topic> origin/dev` + `pnpm install --frozen-lockfile`. Don't touch `laughing-chaplygin-ce1c13`.
>
> **Queue:** (1) plumb article title + surroundingText into ResearchInput at enqueue (evidence: dev-pack review — pronoun-subject claims produce generic/wrong queries; memory `research-pack-quality-pattern`); (2) drop `[placeholder]` queries in applyQueryBound; (3) live authed QA on dev via POST /api/dev/mint-session — BLOCKED until Sam provides the dev ADMIN_SECRET value in `~/.wikinow/dev-admin-secret` (runbook in the handoff); (4) design a small-N online eval protocol (metered — global cap 50/day, ledger permanent); (5) advisorySupport calibration.
>
> **Owed by Sam (remind, don't block):** dev ADMIN_SECRET value (or approve rotation); throttle-vs-auth-gate preference; prod deletion-flow QA (mint is dev-only by design); laughing-chaplygin worktree triage.

## Adversarial review rounds

- **Round 1 — naive fresh agent — 2 findings applied:** the continuation prompt originally said "grants in the predecessor doc" without enumerating any — inlined the load-bearing ones; the item-5 runbook lacked the header-file trick that keeps the secret out of argv.
- **Round 2 — recency-bias audit — 2 findings applied:** restored the mid-session usage-limit pause + resume (context for why one codex run's output landed 30 minutes late — no durable impact, but explains the transcript to a reader); added the early-session discovery that wrangler's `unstable_readConfig` works in node tests (chose the house `readJsonc` pattern instead — recorded so a future session doesn't re-litigate).
- **Round 3 — seam auditor — 2 findings applied:** flagged that release PR #50 was opened before this doc merged (this doc's branch targets dev, so the released prod tip does NOT contain this handoff — harmless, but a reader diffing prod against dev will see it); noted the mint route's uniform-404 means "deploy missing" and "gate refusing" are indistinguishable from outside — check the Deploy run, not the status code (also in memory `dev-auth-mode-and-mint`).
- **Round 4 — operational guardrails auditor — 1 finding applied:** the zsh `status` read-only trap was only in the transcript; added to guardrails + continuation prompt.
- **Round 5 — loss-averse auditor — 2 findings applied:** the three all-null-context gold cards (would otherwise resurface as a "bug" hunt); the `.pnpm-store/` untracked dir in the worktree is package-manager noise, not lost work.
- **Round 6 — security-surface auditor (session-specific: this session shipped an auth-bypass-adjacent route and touched request gating) — 3 findings verified, 1 applied:** verified the mint route's prod inertness rests on TWO independent legs (flag absent from prod config — CI-enforced — AND uniform 404s), not one; verified the throttle cannot lock out the mint path (different route, no shared state); applied: made explicit that extending minting to prod is recommended-against in the design doc, so a future "just enable it on prod for QA" shortcut has to argue with a written decision, not silence.
- **Round 7 — top-to-bottom coherence pass — 1 finding applied:** the priority queue numbered item 3 as blocked but the Ready-to-dispatch section presented it as ready; reconciled (ready-once-unblocked, blocker named in both places). Final full pass: zero material findings.
