# Starting prompt — WikiAsOfNow: finish the safe-lane gate (G11), Phases 3–5

*(Hand this whole file to a fresh agent. It is self-contained.)*

---

You are continuing work on **WikiAsOfNow**, a deterministic stale-claim finder for Wikipedia paired with a selective, metered Gemini-backed research assistant (Cloudflare Workers + D1, Next.js via OpenNext). The repo root has `CLAUDE.md` — **read it first; its rules OVERRIDE your defaults** (it also tells you to address the human as "Sam").

## Your task

Finish the **safe-lane eligibility gate (compliance guardrail G11)** by executing **Phases 3, 4, and 5** of the already-written, already-reviewed implementation plan. The deterministic, LLM-free gate keeps **biographies of living persons (BLP)** and other non-eligible articles out of the future automated "easy-win" lane, fail-closed. Phases 1–2 (the pure core) are **done and merged into this branch**; you are wiring it into the live single-article lookup path and proving it with a gold set.

**The plan is the authoritative, step-by-step guide. Follow it task-by-task.** It is subagent-proofed (exact files, exact test code, exact implementation, "do NOT" boundaries) and was hardened by a 5-round review. Do not redesign — execute.

## Current state (verify, don't just trust)

- **Branch:** `claude/safelane-gate-g11` (off `dev`). **Continue on this branch** — pushing Phases 3–5 extends the existing **PR #13** into the complete gate. Push after every commit (the container is ephemeral; unpushed work is LOST).
- **Phases 1–2 SHIPPED** (on the branch; in PR #13): the pure core, all TDD'd, suite green.
  - `src/domain/types.ts` — `ArticleMetadata`, `EligibilityDecision`.
  - `src/safelane/denylists.ts` — `BLP_CATEGORIES`, `DISPUTE_TEMPLATES`, `canonicalizeCategoryTitle`, `canonicalizeTemplateName`.
  - `src/safelane/wikitext-signals.ts` — `scanWikitextSignals(wikitext)` (advisory; comment/nowiki-stripped; bounded regexes).
  - `src/safelane/eligibility.ts` — `evaluateEligibility(meta, now, gateVersion)`, `GATE_VERSION`, `FRESHNESS_WINDOW_MS`.
- **What's left (your job):** Phase 3 (extend `fetchArticle` to the one atomic metadata call + the `mapResponseToMetadata`/`toArticleMetadata` helpers; capture frozen gold API envelopes), Phase 4 (wire eligibility into `lookupAndPersist` + audit + API/UI), Phase 5 (gold-set integration test + composition guard). The plan's top-of-file **Execution Status** table + per-phase banners show 1–2 ✅ and Phase 3 as the next pickable task.
- **Runtime:** Node 24 (`.nvmrc`; the session-start hook provisions it and installs deps), pnpm@11.5.1. The full gate trio is `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint` — all must be green and **output pristine** at each task.

## MUST READ before any work (in this order)

1. `CLAUDE.md` (+ sibling `AGENTS.md`) — TDD, smallest-change, measure-first, naming/comment rules, git strategy, the skills workflow. OVERRIDES defaults. **Spell out "BLP" → "biographies of living persons" at first use in any artifact you write** (Sam's standing preference).
2. **`docs/plans/2026-06-06-safelane-gate-plan.md`** — THE execution guide. Read the header, the **Per-Task Protocol** (mandatory per task), the **Living Document Contract** (you MUST update the banners as you ship/defer), and Phases 3–5 in full. It carries exact test + implementation code.
3. `docs/design/2026-06-06-safelane-gate-design.md` — the approved spec (the "why"). §5 ingest, §6 wiring/audit/no-persist, §7 freshness, §8 gold set, §9 the four named residuals.
4. `docs/policy/wikipedia-genai-compliance.md` — the **sacrosanct** contract. The **stay-in-the-safe-lane (G11)** guardrail and the **2026-06-06 change-log entry** recording the four signed-off residual fail-OPENs. Also **detection-is-deterministic (G10)**, **audit-log-is-foundational (G13)**, **responsible-Wikimedia-access (G14)**, **fetched-content-is-untrusted (G15)**. **If any change would weaken the floor beyond the signed-off residuals, STOP and ask Sam.**
5. `docs/pitfalls/implementation-pitfalls.md` (DB-1, DB-2) + `docs/pitfalls/testing-pitfalls.md` (§1 pristine output, §8 SQLite↔D1 parity / `freshTestExecutor`, §9 gold-set honesty).
6. *Optional context (for the "why" behind decisions, only if you need it):* `docs/plans/safelane-design-review/round-{1..5}-*.md` — the 5-round adversarial design review.

## Decisions already settled — do NOT re-open (the plan/spec encode these)

- **Floor = ONE atomic `clcategories` BLP-category probe** inside the combined `prop=revisions|categories|info` call (wikitext + categories + namespace + revision from the SAME response — no two-snapshot skew). **Never enumerate categories**; never add a second fetch for categories.
- **Advisory wikitext scan is one-way and best-effort** — it only ADDs `human_only`, never clears the floor. **No infobox-name matching** (unmaintainable; intentionally excluded).
- **Freshness fail-closed:** revision within `FRESHNESS_WINDOW_MS` (15 min) of injected `now` → `human_only(recently_edited)`. `now` is injected (the gate stays clock-free).
- **No v1 persistence of the verdict** — compute on the fly, return in `LookupResult`, show in the UI, audit-log it (identifiers/codes only). Enforcement model: re-evaluate at point-of-use (documented for the future easy-win queue). Do NOT add an eligibility DB column/migration.
- **Scope:** en.wikipedia only; article-level floor + denylists; claim-level contentiousness and the contentious-topic-category denylist are deferred. Talk pages are not fetched.
- **The four named residual fail-OPENs are signed off** (compliance change log) — they are accepted v1 limits, mitigated by the freshness gate + the downstream human-verification gate (G5). Don't try to "fix" them; don't silently widen them.

## Highest-risk subtleties the plan calls out (read these tasks carefully)

- **Task 3.1 UPDATES two existing assertions** in `test/ingest/wikimedia.test.ts` (`prop` → `revisions|categories|info`, `rvprop` → `content|ids|timestamp`) — they are *supposed* to change, not "stay green." Build `mapResponseToMetadata(body, fetchedAt): FetchedArticle` and `toArticleMetadata(f): ArticleMetadata` as the single parsing + rename path (consumed by Phase 4 and Phase 5).
- **Task 4.1 UPDATES the existing "exactly one audit row" test** (it becomes two events: `article.lookup` + `article.eligibility`) and **injects a fixed `now`** into existing lookup tests (no wall-clock dependence). Update the existing `fixtureFetch` to the combined envelope with a FIXED OLD timestamp.
- **Task 3.2 captures frozen gold envelopes via a one-time live fetch** (network is available; use a descriptive User-Agent + `maxlag`, a throwaway `npx tsx` script you DELETE before committing). Store the FULL response body, not just `pages[0]`. Add synthetic `unknown` + recently-edited envelopes.
- **Task 5.1 composition guard** asserts shape coverage (≥1 each of present/absent/unknown/non-mainspace/recently-edited), and you must probe that it actually fails when a shape is removed.

## Workflow (CLAUDE.md + the plan mandate this)

Per task: invoke `superpowers:test-driven-development`; write the failing test → confirm red → minimal implementation → green → refactor → **commit + push**. Per phase: 3+ review rounds (the "After completing Phase N" blocks). **Update the plan's Execution Status banners + table as you ship each phase** (Living Document Contract). Keep `src/safelane/*` pure (no clock/network/random; `new Date(isoString)` to parse an injected value is allowed). Preserve assertion rigor — never weaken a fail-OPEN-path test to make CI pass; STOP and escalate instead.

## Operational gotchas (hard-won)

- **PUSH after every commit.** Ephemeral container.
- `npx tsx` for throwaway scripts (extensionless ESM imports); delete before committing; verify `git status` clean.
- If DB tests fail to load the native module after a resume: `pnpm rebuild better-sqlite3` (ABI mismatch; the hook now does this automatically, but verify).
- The git stop-hook flags GitHub's own PR-merge commits (`noreply@github.com`) as "Unverified" — cosmetic; never rewrite merged history.
- Commit subjects touching test assertions state what happened to them ("add"/"strengthen"/"preserve"/"update").

## Definition of done

Phases 3–5 complete: `fetchArticle` does the atomic metadata call with the BLP probe; `lookupAndPersist` computes + returns + audit-logs the eligibility verdict (identifiers/codes only); the UI shows the verdict + reasons; the frozen-envelope gold-set test + composition guard pass; all gates green + pristine; the plan banners show 5/5 shipped; **PR #13 now carries the complete gate** (rebase onto latest `origin/dev` first; resolve any conflict in `lookup.ts`/`wikimedia.ts`/`page.tsx` by re-running the gate trio). Merge classification **Review — compliance** (do NOT self-merge; it's a G11-floor change for Sam). No LLM, no verdict persistence, no scope creep beyond the plan.
