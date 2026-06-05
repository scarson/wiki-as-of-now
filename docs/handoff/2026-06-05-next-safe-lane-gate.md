# Starting prompt — WikiAsOfNow: safe-lane / fail-closed BLP exclusion gate (G11)

*(Hand this whole file to a fresh agent. It is self-contained.)*

---

You are picking up work on **WikiAsOfNow**, a deterministic stale-claim finder for Wikipedia paired with a selective, metered Gemini-backed research assistant (Cloudflare Workers + D1, Next.js via OpenNext). The repo root has `CLAUDE.md` — **read it first; its rules OVERRIDE your defaults** (it also tells you to address the human as "Sam").

## Your task

Build the **safe-lane gate (compliance guardrail G11)** — the deterministic, LLM-free mechanism that keeps the tool in its intended "high-volume, low-complexity, well-sourced temporal fixes" lane, and above all enforces the **fail-closed floor: any biography-of-living-persons (BLP) article is excluded from the easy-win queue by default.** This is a hard compliance floor that **does not exist in code yet** and MUST land before any research/"easy win" path is ever surfaced to a user. It is deterministic and fixture-testable — the same engineering muscle as the detector.

## MUST READ before any work

1. `CLAUDE.md` (+ sibling `AGENTS.md`) — project rules (OVERRIDE defaults): TDD, smallest-change, measure-first, the skills/subagent workflow, git strategy.
2. `docs/policy/wikipedia-genai-compliance.md` — the **sacrosanct** contract. Read the **stay-in-the-safe-lane (G11)** guardrail verbatim. Key points: the hard floor — *"any article in a biography-of-living-persons category is excluded from the easy-win queue by default, period — it can only be worked through explicit human-only handling"*; the broader lane is enforced by **conservative, deliberately-imperfect mechanisms** (topic/category + template denylists, living-persons heuristics, excluding flagged/disputed articles); anything contentious/sensitive *about* a living person → human-only, not an easy win; but **merely naming an official in a routine procurement fact is fine — the bar is contentious/sensitive *claims*, not the presence of a name.** Also relevant: **detection-is-deterministic (G10)** — keep this LLM-free. **G11 is sacrosanct: its floor can only be weakened with explicit human sign-off + a change-log rationale** — if any design choice would weaken it, STOP and ask Sam.
3. `docs/design/WikiAsOfNow_design_spec.md` — search for "safe lane", "BLP", "living persons", "denylist", "allowlist", "eligibility"; read the eligibility/safe-lane design, the data model (§13 — where article metadata/categories live), §16 (boundaries), and §26 (invariants + build order).
4. `docs/pitfalls/implementation-pitfalls.md` + `docs/pitfalls/testing-pitfalls.md` (gold/fixture honesty §9, pristine output §1, the local-DB parity §8 if you persist eligibility decisions).
5. `docs/git-strategy.md` — branching, `## Merge classification`, PR-to-`dev`.

## Current build state (2026-06-05 survey — verify)

- **Safe-lane: ⬜ NOTHING EXISTS.** No denylist, allowlist, BLP-category, or eligibility code anywhere in `src/` (only a passing comment in `audit-log.ts`). The fail-closed BLP floor is absent.
- ✅ **Detector** (`src/detector/*`): mature, pure, LLM-free. It flags stale *claims*; the safe-lane gates *articles* (and possibly claim-level for contentious-about-a-living-person). Types in `src/domain/types.ts`.
- 🟡 **DB** (`src/db/*`, `migrations/0001_init.sql`): `articles` / `stale_candidates` / `audit_log` tables (§13); append-only audit log (`audit-log.ts`) exists (log decisions with identifiers only). NOTE the **D1 sync/async seam** is unresolved (`client.ts` ~lines 19-25: better-sqlite3 sync vs D1 async) — relevant if you persist eligibility decisions.
- ⚠️ **Coordinate:** the safe-lane gate needs article **metadata (categories, templates, namespace)** as input, which a Wikimedia-ingestion path supplies. A sibling "single-article persistence + ingestion slice" may be in flight — check `dev` and open PRs. If ingestion isn't built, **define the input contract the ingest path must provide** and build the gate as a pure function over that contract.

## What the gate is

A **pure, deterministic** function over an article's metadata → an eligibility decision: `easy-win` vs `human-only`, **with the reason**. **Fail-closed:** default to `human-only`/excluded whenever uncertain; return `easy-win` only when an article clearly passes every conservative check. Components (per G11):
- **BLP-category exclusion — the hard floor** (e.g. the "Living people" category and related) — deterministic, fail-closed.
- **Topic/category denylist**, **template denylist**, **exclude flagged/disputed articles**, **living-persons heuristics** for contentious claims.
The gate sits **between detection and the easy-win queue**: a candidate from a non-eligible article never becomes an easy win.

## Key decisions to settle (in brainstorming, with Sam)

- **Eligibility input contract:** exactly what metadata the gate consumes (categories[], templates[], namespace, dispute flags) and where it comes from (Wikimedia ingestion). Define it even if ingestion isn't built.
- **BLP detection mechanism:** category-based and fail-closed — how is "BLP category" identified deterministically, and what happens when category data is missing/uncertain (→ exclude)?
- **Article-level vs claim-level scope for v1:** G11 floors at the article level (BLP article → excluded) AND flags "contentious/sensitive claims about a living person." Likely v1 = the article-level fail-closed floor + denylists first; claim-level contentiousness is harder and may be deferred — decide explicitly.
- Whether/where eligibility decisions are persisted + audit-logged (identifiers only).

## Do NOT

- Do NOT use an LLM (G10/G11 are deterministic). Do NOT modify the detector or any gold set.
- Do NOT build the research/Gemini path, auth, or UI here (other milestones).
- **Fail closed:** when in doubt, EXCLUDE (human-only). Never default an uncertain article to easy-win.
- YAGNI — but do NOT under-build the hard floor; the BLP exclusion must be genuinely fail-closed and proven by tests.

## Workflow

`superpowers:brainstorming` (HARD GATE: design approval before building) → spec to `docs/design/` → `writing-plans-enhanced` (plan to `docs/plans/`) → `plan-review-cycle` → `subagent-driven-development` (TDD, spec + quality reviews per task) → PR to `dev` with `## Merge classification`. Apply **measure-first**: build a small labeled eligibility fixture set (like the detector's gold sets) — e.g. how many of the existing `test/fixtures/*.wikitext`-style articles are BLP / would be excluded — so the gate's behavior is measured, not asserted. Per-task gates green + pristine: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`. Node 24, pnpm@11.5.1.

## Operational gotchas

- **PUSH after every commit** — the container is ephemeral and re-clones on resume; unpushed commits are LOST.
- The git stop-hook flagging GitHub's own PR-merge commits (`noreply@github.com`) as "Unverified" is **cosmetic** — don't rewrite merged history.
- `npx tsx` for throwaway scripts (not bare `node`; extensionless ESM imports). Delete before commit; check `git status`.
- After a resume, if DB tests fail to load the native module: `pnpm rebuild better-sqlite3`.

## Definition of done

A deterministic, fixture-tested safe-lane eligibility module with a **proven fail-closed BLP exclusion** (a BLP article never yields an easy win, including when category data is uncertain), the conservative denylist/flag checks, a clear documented input contract, audit-logged decisions (identifiers only), all gates green, PR to `dev`. No LLM.
