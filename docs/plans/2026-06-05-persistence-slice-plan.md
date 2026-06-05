<!-- ABOUTME: TDD implementation plan for the single-article persistence + read vertical slice. -->
<!-- ABOUTME: Task-by-task, each with red→green→refactor steps, gates, and a commit/push checkpoint. -->

# Plan — Single-article persistence + read vertical slice

**Design:** `docs/design/2026-06-05-persistence-slice-design.md` (approved, Sam 2026-06-05).
**Branch:** `claude/next-persistence-slice-iTFaA` (off `origin/dev`). PR target: `dev`.
**Per-task gates (all must pass, output pristine):** `pnpm test`, `pnpm exec tsc --noEmit`,
`pnpm lint`. **Commit + PUSH after every task** (container is ephemeral; unpushed work is lost).
**TDD:** every production change is red→green→refactor. Detector + gold sets are untouched.

---

## Task 1 — Resolve the D1 async seam (`src/db/client.ts`)

**Red.** Rewrite `test/db/client.test.ts` to the async port: a `betterSqliteExecutor` runs
an insert via `prepare(sql).bind(...).run()` and reads it back via `.all()` (plain array);
an orphan `stale_candidates` insert through the adapter rejects with `/FOREIGN KEY/`. Add a
`d1Executor` shape test using a tiny fake `D1Database` (asserts `bind→run/all` delegation and
`{ results }` unwrapping). Run → fails (port/adapters don't exist).

**Green.** In `client.ts`: redefine `SqlStatement` (`bind(...): SqlStatement`, `run(): Promise<void>`,
`all<T>(): Promise<T[]>`) and `SqlExecutor` (`prepare(sql): SqlStatement`). Implement
`betterSqliteExecutor(db)` (stash params in `bind`; resolved Promises in `run`/`all`) and
`d1Executor(db)` (delegate; unwrap `.all().results`). `openLocalDb(path)` returns
`betterSqliteExecutor(new Database(path))` with `foreign_keys = ON`; keep access to the raw
handle for the FK-pragma assertion if retained.

**Refactor + propagate.** Update `audit-log.ts` `append`/`read` to `async`/`await` the port.
Update `test/db/audit-log.test.ts` to `await`. Keep `makeAuditLog` surface = append + read only.

**Gate + checkpoint.** All three gates green, pristine. Commit + push.

---

## Task 2 — Persistence module (`src/db/articles.ts`)

**Red.** New `test/db/articles.test.ts` on `freshTestDb` via `betterSqliteExecutor`:
- `upsertArticle` inserts, then a second call with the same `pageId` updates title/revision/
  fetchedAt (one row, updated values).
- `insertCandidates` inserts a mapped set; `getCandidatesByPageId` reads them back ordered by
  `score` desc; mapping covers all columns (year, marker, score=total, explanation,
  detector_version, source_revision_id, section_heading, sentence_text).
- Re-running `insertCandidates` for a page **replaces** the prior set (no duplicate/stale rows).
- `insertCandidates` before `upsertArticle` rejects on the FK (ordering matters).
- Empty `StaleCandidate[]` persists nothing; `getCandidatesByPageId` → `[]`.
Run → fails (module absent).

**Green.** Implement `upsertArticle` (`ON CONFLICT(page_id) DO UPDATE`), `insertCandidates`
(delete-for-page then insert each; map `StaleCandidate`→columns, `score = candidate.score.total`,
`detector_version = DETECTOR_VERSION`, `source_revision_id` param), `getCandidatesByPageId`
(`ORDER BY score DESC, id ASC`, map rows → typed objects). All `async`.

**Gate + checkpoint.** Green, pristine. Commit + push.

---

## Task 3 — Wikimedia fetch (`src/ingest/wikimedia.ts`)

**Red.** New `test/ingest/wikimedia.test.ts` with an injected `fetchFn`:
- Happy path: asserts request URL carries `action=query`, `prop=revisions`,
  `rvprop=content|ids`, `formatversion=2`, `maxlag=5`, the title; asserts the **User-Agent**
  header is the descriptive project string; returns canned Action-API JSON →
  `{ pageId, title, revisionId, wikitext }` correct (incl. normalized/redirected title).
- Missing page (`pages[0].missing`) → typed not-found error (asserted message).
- `error.code === "maxlag"` body (or 503) → typed retryable error (asserted message).
- Malformed/non-JSON body → typed error (no crash).
Run → fails.

**Green.** Implement `fetchArticle(title, { fetchFn = fetch, userAgent = DEFAULT_UA })`:
build the URL, set the UA header, parse the response, branch the error cases into typed
errors, return the `FetchedArticle`. Export `DEFAULT_UA`. No network in the test (injected fn).

**Gate + checkpoint.** Green, pristine. Commit + push.

---

## Task 4 — Orchestrator (`src/ingest/lookup.ts`)

**Red.** New `test/ingest/lookup.test.ts`: inject a `fetchFn` returning a **committed
fixture** (`test/fixtures/<an existing>.wikitext`) as wikitext, a `betterSqliteExecutor` on
`freshTestDb`, and a pinned `asOfYear`. Assert: article row persisted with the fixture's
pageId/revisionId; persisted candidates equal `detectStaleClaims(parseArticle(...), asOfYear)`
(count + key fields); exactly one `article.lookup` audit row with **identifiers-only** payload
(`pageId`, `revisionId`, `candidateCount`, `detectorVersion`) and no title/content; the returned
`LookupResult` shape. Run → fails.

**Green.** Implement `lookupAndPersist(executor, title, { fetchFn, userAgent, asOfYear =
new Date().getUTCFullYear() })`: fetch → parse → detect → upsert → insertCandidates →
audit.append (identifiers only) → return summary + candidates.

**Gate + checkpoint.** Green, pristine. Commit + push.

---

## Task 5 — API routes (thin handlers)

`src/app/api/articles/lookup/route.ts` (`POST`) and
`src/app/api/articles/[id]/candidates/route.ts` (`GET`). Each: resolve
`getCloudflareContext().env.DB` → `d1Executor` → call the module → JSON response with the
status mapping from the design (400 bad input, 404 page-not-found, 503 upstream/maxlag, 200
success/empty). Thin glue, no business logic; excluded from coverage (Workers runtime). Verify
they typecheck and lint; the logic they call is already tested.

**Gate + checkpoint.** `tsc` + `lint` + `test` green. Commit + push.

---

## Task 6 — UI (`src/app/page.tsx`, `src/app/layout.tsx`)

Replace boilerplate `page.tsx` with a minimal client component: title input → "Look up" →
`POST /api/articles/lookup` → render candidate cards (stale sentence, why-flagged explanation,
year, marker); loading/empty/error states. Fix `layout.tsx` metadata (title + description).
Add ABOUTME headers. `next build` not run in CI gate here (gates are test/tsc/lint), but ensure
`tsc` + `lint` pass.

**Gate + checkpoint.** Green, pristine. Commit + push.

---

## Task 7 — Live ingest smoke + final verification

Throwaway `npx tsx` script: one real `fetchArticle("Artemis program")` against Wikimedia →
confirm `{ pageId, title, revisionId }` resolve and `lookupAndPersist` against a local
better-sqlite3 DB produces candidates. **Delete the script; verify `git status` clean.** Run
the full gate trio once more. Then update the handoff/state docs as needed and open the PR to
`dev` with a `## Merge classification` (expected: **Review — architecture**: new API surface,
external Wikimedia integration, data-layer async-seam change).

---

## Self plan-review log

- **Round 1 (subagent-readiness / ambiguity):** each task names exact files, the red test
  contents, and the green scope. Fixture choice in Task 4 is "an existing `test/fixtures/*`"
  — pick one with known non-empty detector output (e.g. `artemis_program.wikitext`) and pin
  `asOfYear=2026`; verify it yields ≥1 candidate before asserting count, else choose another.
- **Round 2 (pitfall coverage):** DB-1 (no schema change; never fabricate key) ✓; testing §8
  (FKs ON via `freshTestDb`+adapter, real migration) ✓; §7/§9 (no network in committed tests;
  injected `fetchFn`; pinned `asOfYear`; committed fixtures) ✓; §1 (pristine; typed errors
  asserted) ✓; G13/G15/G14/G10 mapped in the design checklist ✓; ORCH-1/2 N/A (no parallel
  subagents — direct execution per Sam).
- **Round 3 (cross-task conflicts):** Task 1's async port is the contract every later task
  depends on — it lands first and its test rewrites (client, audit-log) are part of Task 1 so
  the suite is green at each checkpoint. No task leaves the tree red. Route handlers (Task 5)
  depend only on `d1Executor` + the orchestrator, both done by Task 4. UI (Task 6) depends on
  the route contract (Task 5). Order is a clean dependency chain.
