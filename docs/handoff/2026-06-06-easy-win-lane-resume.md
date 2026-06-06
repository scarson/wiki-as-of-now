<!-- ABOUTME: Resume handoff for the easy-win lane build — Phases 1–2 shipped, Phases 3–5 remain. -->
<!-- ABOUTME: Points at the authoritative plan (Living Document Contract banners); captures session guardrails + continuation prompt. -->

# Handoff — Easy-win lane, resume Phases 3–5

## Headline state
- **Branch:** `feat/easy-win-lane`, pushed to origin. Tip `0cbc238` (run `git log --oneline -1` to confirm).
- **Base:** branched off `origin/dev`; `origin/dev` last seen at `0069b90` (the merged safe-lane PR #14). No rebase needed unless `origin/dev` has since advanced.
- **Suite:** 210 tests green, `tsc --noEmit` clean, `pnpm lint` clean (as of `0cbc238`).
- **No PR exists yet.** Do NOT open one until all phases + final review are done (see §PR).
- No worktrees; single working tree at `/home/user/wiki-as-of-now`.

## Authoritative artifact (READ FIRST)
`docs/plans/2026-06-06-easy-win-lane-plan.md` — the subagent-proof implementation plan. Its **Living Document Contract** per-phase Execution Status banners are the source of truth for what's done:
- **Phase 1 — scan hardening:** ✅ SHIPPED (`5129686`,`b925dc2`,`6ac9fda`).
- **Phase 2 — data model (`eligibility_verdicts` + module):** ✅ SHIPPED (`b9ce7c4`,`27c3e5c`,`a718e5b`,`2e85622`).
- **Phase 3 — persist verdict on lookup:** ⬜ ready to pick up (Phase 2 done).
- **Phase 4 — easy-win lane query:** ⬜ the compliance-critical phase.
- **Phase 5 — `POST /api/easy-win`:** ⬜.

Supporting (do not re-derive): design v2 `docs/design/2026-06-06-easy-win-lane-design.md`; the 5-round adversarial review + dispositions `docs/plans/easy-win-lane-review/` (`synthesis.md`, `round-{1..5}-*.md`).

## What shipped this session (concrete)
- **Phase 1:** `src/safelane/wikitext-signals.ts` regex hardened to linear-time against `{{`/`[[` spam (first-char negation makes each failing match-start O(1)); perf + buried-signal tests; pitfall `SAFE-1` in `docs/pitfalls/implementation-pitfalls.md`.
- **Phase 2:** `migrations/0002_eligibility_verdicts.sql` (`WITHOUT ROWID` composite PK `(page_id,revision_id,gate_version)`, FK→articles, CHECK on eligibility); `src/db/schema.sql` made cumulative; `test/helpers/db.ts:freshTestDb()` now applies migrations in sorted order; schema-equivalence + DB-1 NULL-rejection tests; `src/db/eligibility-verdicts.ts` (`upsertVerdict`, `deleteVerdict`, `selectEasyWinPageIds`) + 11 tests.

Each task got a fresh implementer + spec review + code-quality review + a fix-subagent round; review findings were folded before marking complete.

## Execution method (continue this)
`superpowers:subagent-driven-development`. Per task:
1. Dispatch a **fresh** implementer subagent (`general-purpose`) with the **full task text pasted in** (don't make it read the plan file) + scene-setting context. Templates: `.claude/skills/subagent-driven-development/{implementer,spec-reviewer,code-quality-reviewer}-prompt.md`.
2. Then a **spec-compliance** reviewer (verify by reading code, don't trust the report), then a **code-quality** reviewer. Fix findings via a fresh fix-subagent (NOTE: `SendMessage` to continue an agent is NOT available in this env — dispatch a fresh subagent with the exact fix).
3. Implementer commits + pushes each task on `feat/easy-win-lane`. Update the plan banner at phase boundaries.
- Cheap model (sonnet) is fine for these well-specified tasks; consider opus for the Phase-4 reviews (highest stakes).

## Operational guardrails accumulated this session
- **Node 24 + better-sqlite3 ABI:** the env runs Node 24; after any dependency re-sync (the session-start hook does one), the prebuilt `better-sqlite3` native module mismatches and **every DB-backed test fails** with an ABI error. Fix: `pnpm rebuild better-sqlite3`. Hit twice this session. The plan's Per-Task Protocol already notes this.
- **Don't commit a running subagent's WIP.** Subagents share this working tree; mid-run there are uncommitted changes that are THEIRS. The stop-hook will nag about uncommitted/untracked files while a subagent runs — ignore it; the subagent commits its own work. Never `git add`/`commit` on top of an in-flight subagent.
- **Verify git provenance; don't trust subagent narration.** The Task 2.2 implementer falsely reported the files "were already present (a prior session scaffolded them)" — `git cat-file -e HEAD~1:<file>` confirmed they were new this task. Always independently verify the commit + diff (the skill's "do not trust the report" is load-bearing).
- **Review subagents MUST NOT move HEAD** (ORCH-2): no `git checkout`/`switch`/`reset` — inspect via `git show`/`diff`/reading files. All review prompts say this.
- **DB discipline:** async `SqlExecutor` port — bind ALL params via `.bind(...)`, never pass to `run`/`all` (DB-2); natural keys are `WITHOUT ROWID` so NULL-rejection works (DB-1); build test DBs via `freshTestExecutor()`; `await` every call. Testing-pitfalls §1 (pristine output), §8 (SQLite↔D1 parity), §9 (gold-set honesty).
- **Commit subjects touching assertions** state what happened ("add"/"strengthen"/"preserve") — never obscure a weakening as a "fix".

## Phase 4 is the crown jewel — MUST-NOT-WEAKEN
Phase 4 (`getEasyWinLane`) is the BLP (biographies of living persons) surfacing path the whole stay-in-the-safe-lane (G11) floor protects. **Compliance STOP:** the sacrosanct contract `docs/policy/wikipedia-genai-compliance.md` governs here — the re-fetch-don't-cache decision and the four signed-off residuals are load-bearing; anything that would surface a verdict without re-running the gate (caching, skipping the re-fetch, an inverse "exclude-on-bad" check) weakens the floor beyond the signed-off residuals and requires Sam's explicit sign-off + a change-log entry. Do not "optimize" it away. **Dependency seam:** Phase 4's revision guard (`fetched.revisionId === articles.revision_id === source_revision_id`) is sound only because Phase 3 writes all three from one shared `liveRev` per lookup — preserve that invariant if you touch either phase. The plan marks five fail-OPEN guard tests **MUST-NOT-WEAKEN**:
1. re-fetch BLP-present → excluded (`demoted`);
2. re-fetch `blpProbe:"unknown"` → excluded (`metadata_unavailable`) — `fetchArticle` returns *successfully* on unknown, so the include rule is a **positive allowlist** (include iff `eligibility==='easy_win'` AND `fetched.pageId===pageId` AND `source_revision_id===live===articles.revision_id`), never "exclude-on-bad";
3. page_id identity mismatch (rename rebind) → excluded;
4. revision drift → excluded, `articles.revision_id` UNCHANGED, stale verdict pruned (R3-F8 self-heal);
5. per-fetch timeout (R3-F3, `Promise.race`) → `fetch_unavailable`, no hang, no unhandled rejection.
If any races/flakes, fix with deterministic stub `fetchFn`/`now` — NEVER weaken the assertion. STOP + escalate if it can't pass deterministically. Give the Phase-4 spec + quality reviews extra scrutiny (the lane-review `synthesis.md` CRITICAL-A/B are the highest-severity class).

## PR (after all phases + final review)
No PR yet. After Phases 3–5 ship and a final whole-implementation review passes: confirm full suite + tsc + lint green/pristine; rebase onto latest `origin/dev` if it moved (resolve any `lookup.ts`/`schema.sql`/`test/helpers/db.ts` conflict by re-running the trio); open ONE PR to `dev` with `## Merge classification` = **Review — compliance** (the BLP surfacing path), linking design v2 + the 5-round review + `synthesis.md` + the plan. **Do NOT self-merge.**

## Priority queue
1. **Phase 3 / Task 3.1** — persist the verdict in `lookupAndPersist` (one shared `liveRev` for article+candidates+verdict; `upsertArticle` first for FK; add `upsertVerdict`). Plan has exact code + tests.
2. **Phase 4 / Task 4.1** — `src/ingest/easy-win-lane.ts` two-stage lane + positive allowlist + self-heal + timeout + audit. The big one; review hard.
3. **Phase 5 / Task 5.1** — `POST /api/easy-win` route (thin glue).
4. Final whole-implementation review → PR to dev (above).

## Continuation prompt (paste-ready for a fresh agent)
> Resume subagent-driven execution of `docs/plans/2026-06-06-easy-win-lane-plan.md` on branch `feat/easy-win-lane` (already pushed, tip `0cbc238`, suite 210 green). Phases 1–2 are ✅ SHIPPED (see the plan's Execution Status banners); execute Phase 3 → Phase 4 → Phase 5 in order via `superpowers:subagent-driven-development` — fresh implementer per task with the full task text pasted in, then spec-compliance review, then code-quality review, fix loops via a fresh subagent (`SendMessage` is unavailable here), commit+push each task, update the plan banner at phase boundaries. Read `docs/handoff/2026-06-06-easy-win-lane-resume.md` for operational guardrails: run `pnpm rebuild better-sqlite3` if DB tests hit an ABI error; bind() all SQL params (DB-2); don't trust subagent reports (verify git provenance); review subagents must not move HEAD. Phase 4 is the compliance-critical BLP surfacing path — its five MUST-NOT-WEAKEN fail-OPEN guard tests (positive allowlist, identity, revision-drift self-heal, unknown-excluded, timeout) must never be weakened; give its reviews extra scrutiny (opus). After all phases + a final whole-implementation review pass green, open ONE PR to `dev` as **Review — compliance**, linking the design v2 + 5-round review + synthesis + plan; do NOT self-merge.
