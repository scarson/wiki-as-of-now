# Handoff → Phase 2 (Deterministic detector + fixtures)

**Date:** 2026-06-04 · **Author:** prior session (Phase 1 execution) · **For:** a fresh session executing Phase 2.

This is a pointer-and-state handoff. The **authoritative execution artifact is the plan**:
`docs/plans/2026-06-04-wikiasofnow-foundation-detector-plan.md` → §"Phase 2 — Deterministic detector + fixtures" (Tasks 2.1–2.7 + the "After completing Phase 2" review block). Read it; this doc does not duplicate the task specs.

---

## Headline state

- **Phase 1 (Foundation): ✅ DONE and ✅ MERGED to `dev`** via PR [#3](https://github.com/scarson/wiki-as-of-now/pull/3) (merge commit `380c6f7`). `origin/dev` tip is `380c6f7` and contains all Phase 1 work (`3846c90`…`f4290d3`).
- **Phase 2: ⬜ NOT STARTED.** This is the entire remaining scope.
- **Gates at handoff:** `pnpm test` 13/13 (deterministic), `pnpm exec tsc --noEmit` clean, `pnpm lint` clean (0 warnings). **No CI exists** (`.github/workflows/` is absent) — the green signal is the local gates only. Standing up CI could be an early Phase 2 chore if PR-gate enforcement is wanted.
- **Toolchain:** Node 24 + pnpm 10.33 (resolved automatically by the session-start hook). `wtf_wikipedia ^10.4.2` is **already in `package.json`** (Task 2.2 uses it directly — do not re-add).

## ⚠️ Seam #1 — branch for Phase 2 (decide before first commit)

The Phase 1 branch `claude/wikiasofnow-foundation-detector-o2yCO` **has been merged and is consumed.** The original task mandate pinned that branch ("develop on … NEVER push to a different branch without explicit permission"), but that mandate was for the foundation work, which is now in `dev`.

**Recommended:** realign local `dev` to `origin/dev`, then create a NEW Phase 2 feature branch off it (e.g. `claude/wikiasofnow-detector-phase2`). Per `docs/git-strategy.md`: feature work happens on a dedicated branch in a worktree, PR → `dev`. Do **not** keep committing to the merged Phase 1 branch.

```bash
git fetch origin dev
git checkout dev && git reset --hard origin/dev    # realign local dev (it had drifted; reset, don't merge)
git checkout -b claude/wikiasofnow-detector-phase2  # or a worktree: git worktree add .claude/worktrees/phase2 -b <branch>
```

**This needs Sam's nod on the branch name** (the original branch instruction was explicit). Confirm before pushing.

## What shipped this session (Phase 1) — pointers, not narrative

- Code: `src/db/{client,audit-log,schema.sql}.ts`, `migrations/0001_init.sql`, `src/research/{provider,stub-provider}.ts`, `src/queue/research-jobs.ts`, `test/helpers/db.ts`, plus tests under `test/`.
- Review trail: `docs/plans/phase1-review/round-{1-correctness,2-compliance,3-test-rigor}.md`.
- Plan: per-task completion log, Deviations, Discoveries, and the §"Phase 1 batch review" summary are all in the plan's Execution Status section.

## Operational guardrails accumulated this session (so you don't re-discover them)

These are durably captured in `docs/pitfalls/` and the plan; summarized here for a cold start:

1. **Subagent-driven flow that worked well:** per task — dispatch an *implementer* subagent (strict TDD), then a *spec-conformance* review subagent, then a *code-quality* review subagent; the controller triages findings, applies small fixes itself, re-runs gates, commits, pushes. Each review round for the whole phase persists its report to a file (ORCH-1).
2. **ORCH-2 (pitfall):** review/inspection subagents share the working tree — they MUST NOT run `git checkout`/`switch`/`reset` (it detaches HEAD for the controller; it happened once this session and a commit landed off-branch, recovered via `git branch -f`). Bake "inspect with `git show`/`diff`/`log` only" into every review-subagent prompt, and check `git status -sb` after each batch.
3. **DB tests:** always build the test DB via `test/helpers/db.ts:freshTestDb()` (foreign_keys=ON + real migration), never bare `new Database()`. better-sqlite3 leaves FKs OFF; D1 enforces them (testing-pitfalls §8).
4. **DB-1 (pitfall):** `NOT NULL`/`CHECK` are no-ops on an `INTEGER PRIMARY KEY` rowid alias; natural-key tables need `WITHOUT ROWID` (that's why `articles` is now `WITHOUT ROWID`). Verify NULL-rejection with a real insert test.
5. **Lint:** unused vars are an error; intentionally-unused interface params use a `_` prefix (`eslint.config.mjs`).
6. **Commit discipline:** commit + push frequently (ephemeral container). End commit/PR bodies with the session link. Don't `git add -A` blindly.
7. **Compliance is sacrosanct:** read `docs/policy/wikipedia-genai-compliance.md` before touching detection/research/audit/LLM/citation code. **Phase 2's load-bearing invariant: the detector is deterministic and LLM-free — ZERO model calls anywhere in `src/detector/`** (plan §Phase 2 compliance touchpoint).

## Deferred items (from Phase 1, may surface in Phase 2)

Both are documented in the plan's §Discoveries:

1. **Async-aware data-layer adapter.** `SqlExecutor` is synchronous (better-sqlite3); live D1 is async. Unblock condition: when any module is wired to run against real D1 (a future deploy/integration milestone, not Phase 2). Likely-unblocker: a future D1-wiring plan/task. Phase 2's detector is pure and does not touch D1, so this should NOT block Phase 2 — but if a Phase 2 task does persist candidates, stop and revisit the seam.
2. **`audit append` `JSON.stringify` guard.** YAGNI at skeleton stage. Unblock condition: an event taxonomy or a caller that could pass non-serializable payloads. Not expected in Phase 2.

## Phase 2 at a glance (full specs in the plan)

LLM-free deterministic detector, built test-first, ending in a precision gate over a fixture corpus:

- **2.1** Core domain types (`src/domain/types.ts`) — `ParsedArticle`, `Section`, `SentenceUnit`, `ScoreBreakdown`, `StaleCandidate`.
- **2.2** Article parser (`src/detector/parse.ts`) — wikitext → `ParsedArticle` via `wtf_wikipedia` (do NOT hand-roll).
- **2.3** Marker + year extraction (`src/detector/markers.ts`) — `MARKER_STRENGTH` map is the single source of marker strength (shared by 2.5/2.6); word-boundary matching so bare `will` ≠ "goodwill".
- **2.4** Negative-pattern suppression (`src/detector/suppress.ts`) — the false-positive killers.
- **2.5** Explainable scoring (`src/detector/score.ts`) — `ScoreBreakdown` with a human-readable explanation.
- **2.6** `detectStaleClaims` orchestration (`src/detector/detect.ts`) — composes 2.2–2.5.
- **2.7** Fixture corpus + gold set + **precision gate** — real Wikipedia fixtures; a measured precision threshold.
- **After Phase 2:** mandatory 3-round batch review (same as Phase 1) + **populate `docs/pitfalls/` with any detector pitfall discovered** (the Phase 2 after-block requires this explicitly).

**Phase 2 TDD note:** every task ships a failing test first (the plan embeds the verbatim test for each). Several tests use substring/word-boundary matching deliberately (robust to `wtf_wikipedia`'s splitting) — preserve that intent; if `wtf_wikipedia` mis-splits a fixture, capture it as a Discovery, do NOT silently special-case.

## Continuation prompt (paste-ready for a fresh session)

> Execute **Phase 2 (Deterministic detector + fixtures)** of `docs/plans/2026-06-04-wikiasofnow-foundation-detector-plan.md` (Tasks 2.1–2.7 + the "After completing Phase 2" review block). Phase 1 is merged to `dev` (`380c6f7`); start from `origin/dev`.
>
> First: read this handoff (`docs/plans/2026-06-04-wikiasofnow-phase2-handoff.md`), the plan's Phase 2 section, `docs/policy/wikipedia-genai-compliance.md`, and `docs/pitfalls/` (DB-1, ORCH-1/2, testing §8). **Confirm the Phase 2 branch name with Sam before pushing** (Seam #1: the Phase 1 branch is consumed; recommend a new `claude/wikiasofnow-detector-phase2` off updated `dev`).
>
> Then execute task-by-task with the subagent-driven flow that worked in Phase 1 (implementer → spec review → code-quality review → controller triages/fixes → gates → commit → push), strict TDD, committing frequently. **Hard invariant: the detector is deterministic and LLM-free — zero model calls in `src/detector/`.** Gates per task: `pnpm test` green + pristine, `pnpm exec tsc --noEmit` clean, `pnpm lint` clean. Review subagents MUST NOT move HEAD (ORCH-2). End with the 3-round batch review, populate `docs/pitfalls/` with detector findings, update the plan's Phase 2 banners, and open a PR → `dev`.

---

### Adversarial review of this handoff

- **Round 1 — Naive fresh agent:** Added explicit toolchain facts (Node 24/pnpm, wtf_wikipedia already present), the exact realign+branch commands, and a self-contained continuation prompt. Jargon (ORCH-1/2, DB-1, freshTestDb) is expanded inline or pointed to its pitfalls home.
- **Round 2 — Recency-bias audit:** Pulled forward mid-session items, not just the PR: the subagent-driven flow, the `_`-lint convention, the freshTestDb pattern, the FK-off divergence — all from earlier in the session, not just the final hardening.
- **Round 3 — Seam auditor:** Seam #1 (consumed Phase 1 branch → new Phase 2 branch, needs Sam's nod) is called out explicitly with commands. The merge itself (Sam merged PR #3 manually) is recorded with the merge SHA so the next agent starts from `origin/dev`, not the stale local branch. The two deferred Phase-1 items carry prose unblock conditions + note they should NOT block Phase 2.
- **Round 4 — Operational guardrails auditor:** All 7 guardrails are in durable homes (`docs/pitfalls/`, plan, `eslint.config.mjs`) and re-summarized here for cold start, not left in the transcript.
- **Round 5 — Loss-averse auditor:** "No CI exists," "wtf_wikipedia already a dep," and the LLM-free invariant are surfaced — each would cost real time or risk a compliance breach if rediscovered late.
- **Round 6 — Compliance-continuity auditor (session-specific):** This project's defining character is the sacrosanct GenAI-compliance contract. Chosen because Phase 2 is the first phase that builds the *detector* — the exact component the "detection is deterministic and LLM-free" guardrail governs. Findings applied: elevated the LLM-free invariant into both the guardrails list (item 7) and the continuation prompt as a hard invariant, and pointed at the contract doc as required pre-reading. A fresh agent cannot miss that `src/detector/` must contain zero model calls.
- **Final pass:** re-read rounds 1–6 after edits; no further material findings.
