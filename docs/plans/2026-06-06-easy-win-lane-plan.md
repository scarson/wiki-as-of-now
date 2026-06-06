# Easy-win Lane v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the compliance-safe consumer of the merged G11 safe-lane gate — surface the stale candidates of articles that are *currently* `easy_win`-eligible, with point-of-use re-validation that can never let a biography of a living person (BLP) reach the lane.

**Architecture:** Persist the gate verdict (`eligibility_verdicts`, keyed `(page_id, revision_id, gate_version)`) as a cheap **pre-filter + audit/history record — never the surfacing authority**. The lane is a two-stage derived query: a DB pre-filter (current revision + current `GATE_VERSION` + `easy_win` + has-candidates, capped) then an authoritative per-page **re-fetch-by-page_id + re-run-gate** with a **positive allowlist** (include iff identity matches AND verdict is `easy_win` AND `source_revision_id === live === articles.revision_id`). Exposed via `POST /api/easy-win`. Plus a root-cause ReDoS hardening of `scanWikitextSignals` (the lane runs it on attacker-controllable wikitext at fan-out scale).

**Tech Stack:** TypeScript (ES2024, strict), Next.js 16 / OpenNext (Cloudflare Workers + D1), better-sqlite3 (local/test) behind the async `SqlExecutor` port, vitest, Node 24 / pnpm 11.5.1.

**Authoritative design:** `docs/design/2026-06-06-easy-win-lane-design.md` (v2). **Review trail + dispositions:** `docs/plans/easy-win-lane-review/` (`synthesis.md` + `round-{1..5}-*.md`). **Gate it consumes:** `docs/design/2026-06-06-safelane-gate-design.md` §6. Read the design before any task.

---

## Living Document Contract

This plan is a living document. Every executing agent MUST update it as
execution progresses, not only at completion.

- **On phase claim:** the executor MUST flip the banner to 🚧 IN PROGRESS
  with a claim timestamp (ISO 8601 UTC) and the active branch name. The
  banner MUST NOT include an expected-completion estimate — agents cannot
  reliably estimate their own wall-clock, and a fabricated duration
  becomes a stale anchor that misleads future readers. Followers
  encountering a 🚧 banner determine liveness by observable signals (PR
  existence, recent branch commits), not by arithmetic on expected times.
  See Step 5's stale-claim reclaim protocol.
- **On phase ship:** the executor MUST update that phase's **Execution
  Status** banner with the shipped commit SHA(s) and date. If a PR is
  open, the PR number and URL MUST appear in the top-of-plan Execution
  Status table.
- **On phase defer:** the executor MUST update the banner with ⏸ status
  AND a prose description of the unblock condition + a link to the
  likely-unblocker artifact (plan page, task, or PR whose own Execution
  Status banner will signal completion). Prose + link is durable across
  paraphrases and scope edits; exact-string coordination between agents
  is not.
- **On PR merge:** the executor MUST record the merge SHA in the banner
  + the top-of-plan Execution Status table.
- **On deviation from the written plan** (scope edits, structural
  refactors, dropped tasks, reordered phases): the executor MUST
  inline-document the deviation in the affected task AND summarize it
  in the top-of-plan Execution Status as a "Deviations" subsection.
  Deviation state MUST NOT live only in PR notes or status reports.
- **On discovery** (pre-existing drift surfaced during execution, new
  bugs found, architectural issues noted): the executor MUST add a
  "Discoveries" subsection at the top of the plan with pointers to the
  files/lines affected. Follow-up dispatches read this subsection to
  avoid duplicate discovery work.

The plan SHOULD reflect reality at the end of every session that touches
it. Anything worth putting in a status report to the user is worth
putting in the plan.

Rationale: `/writing-plans-enhanced` Step 5. Writing at ship time is
cheap; reconstruction by downstream readers is expensive, compounds
across dispatches, and fails silently when state is split across PR
notes and commit messages.

---

## Execution Status

**Overall:** Not started.

| Phase | Status | Ship SHA(s) | Notes |
|---|---|---|---|
| 1 — Scan hardening (`scanWikitextSignals` linear-time) | ⬜ Not started | — | independent; no lane deps |
| 2 — Data model (`eligibility_verdicts` + migration + DB module) | ⬜ Not started | — | — |
| 3 — Persist the verdict on lookup (article-row-last) | ⬜ Not started | — | depends on Phase 2 |
| 4 — Easy-win lane query (two-stage, positive allowlist) | ⬜ Not started | — | depends on Phases 2–3 |
| 5 — `POST /api/easy-win` endpoint | ⬜ Not started | — | depends on Phase 4 |

---

## Per-Task Protocol (MANDATORY — applies to EVERY task)

**BEFORE starting work:**
1. Invoke `superpowers:test-driven-development`.
2. Read `docs/pitfalls/testing-pitfalls.md` (§1 pristine output, §8 SQLite↔D1 parity / `freshTestExecutor`, §9 gold-set honesty) and the relevant `docs/pitfalls/implementation-pitfalls.md` entries (DB-1 `WITHOUT ROWID`/NULL, DB-2 `bind()`).
3. Read the design sections this task implements.
4. **Environment:** Node 24 is pinned; after any dependency re-sync, run `pnpm rebuild better-sqlite3` or every DB-backed test fails with a native-module ABI error (this bit us this session).
Follow TDD: failing test → confirm it fails for the right reason → minimal implementation → confirm green → refactor green → commit → **push**.

**BEFORE marking a task complete:**
1. Review the new tests against `docs/pitfalls/testing-pitfalls.md` (error paths? edge cases? negatives? pristine output?).
2. Run the full gate trio and confirm all green + output pristine: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`.
3. Commit with a descriptive message and **push** (the container is ephemeral; unpushed commits are lost).

**Assertion rigor (compliance floor — non-negotiable):** the lane is the surfacing path the BLP floor protects. If a test races/flakes, fix it with deterministic inputs (injected `now`, frozen `fetchFn`, fixed fixtures) — NEVER by weakening an assertion. A weakened test on a fail-OPEN path is a compliance regression: STOP and escalate. Tests marked **MUST-NOT-WEAKEN** below are load-bearing fail-OPEN guards. Commit subjects touching assertions state what happened to them ("add"/"strengthen"/"preserve").

**Determinism (G10/G14):** `src/safelane/*` stays pure (no clock/fetch/random); the scan is pure. The lane (`getEasyWinLane`) takes injected `fetchFn` + `now`; committed tests use a stub `fetchFn` and a fixed `now` — **no live network in tests**.

**Do NOT (scope boundaries — design §1 non-goals):** add a browse UI; re-detect changed articles; materialize a queue table; add pagination, freshness-recheck caching, row tombstoning, verdict/audit retention/compaction, D1 `batch()`, or auth-gating — all are named-deferred. Do NOT trust a persisted verdict to authorize surfacing (re-fetch is authoritative). Do NOT add an LLM anywhere.

---

## Phase 1 — Scan hardening (`scanWikitextSignals` linear-time)

**Execution Status:** ⬜ NOT STARTED

Independent of the lane (touches only `src/safelane/wikitext-signals.ts` + its test + a pitfall doc). Review finding F / R5-L2: the template-name regex over `{`-spam costs ~1s CPU at the 2 MB article limit because the per-match length cap bounds *match length*, not the *number of match-start positions*; the lane runs the scan on attacker-controllable wikitext at fan-out scale → Worker-CPU DoS (G15). Sam: fix at root in this slice.

### Task 1.1: Failing perf + behavior test for pathological input

**Files:**
- Test: `test/safelane/wikitext-signals.test.ts` (extend; keep all existing cases green)

- [ ] **Step 1: Add tests** asserting pathological spam returns `[]` promptly and a real signal still scans. Append to the existing `describe("scanWikitextSignals", …)`:

```ts
it("is linear-time on pathological brace/bracket spam (no quadratic blowup)", () => {
  // ~2 MB of open-brace spam — the MediaWiki page-size ceiling. Must return promptly.
  const spam = "{{".repeat(1_000_000);            // 2 MB of "{"
  const start = performance.now();
  expect(scanWikitextSignals(spam)).toEqual([]);
  expect(scanWikitextSignals("[[".repeat(1_000_000))).toEqual([]);
  const elapsedMs = performance.now() - start;
  // Generous bound — hardened scan is well under this; the pre-fix regex blows past it.
  expect(elapsedMs).toBeLessThan(1000);
});

it("still detects a real dispute template buried in a large body", () => {
  const body = "lorem ipsum ".repeat(50_000) + "\n{{POV}}\n" + "dolor ".repeat(50_000);
  expect(scanWikitextSignals(body)).toContain("dispute_template:POV");
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run test/safelane/wikitext-signals.test.ts` → the perf test FAILS (exceeds the bound on the current regex). Confirm it fails on the *timing* assertion, not a crash.
- [ ] **Step 3: Implement the fix** in `src/safelane/wikitext-signals.ts`. The root cause is that `matchAll` with the lazy `{1,100}?` / `{1,255}` body retries from a huge number of `{{`/`[[` start positions on spam. Keep semantics identical for real input; bound the work. Recommended approach — require a non-spam first character inside the delimiter and keep the bounded body, so a run of pure `{`/`[` can't create overlapping match-starts. Concretely, tighten the two patterns so the captured token cannot itself begin with another opening delimiter:

```ts
// (a) category links: first captured char must not be '[' (so "[[[[…" can't stack match-starts)
for (const m of text.matchAll(/\[\[\s*category:\s*([^[\]|\n][^\]|\n]{0,254})(?:\|[^\]\n]*)?\]\]/gi)) {
  if (BLP_SET.has(canonicalizeCategoryTitle("Category:" + m[1]))) codes.add("blp_wikitext");
}
// (b) dispute templates: first captured char must not be '{'
for (const m of text.matchAll(/\{\{\s*([^{}|\n][^}|\n]{0,99}?)\s*(?:\||\}\})/g)) {
  const name = canonicalizeTemplateName(m[1]);
  if (DISPUTE_SET.has(name)) codes.add(`dispute_template:${name}`);
}
```

> If review/benchmarking shows the regex tweak alone is insufficient, ALSO add a hard input-length guard at the top of `scanWikitextSignals` (e.g. scan at most the first N bytes where N is a generous constant > the 2 MB page ceiling is NOT needed — cap at the ceiling). Prefer the regex fix; add the guard only if measured necessary. Do NOT change which real signals are detected.

- [ ] **Step 4: Run** the full `wikitext-signals.test.ts` → all PASS (existing semantics preserved, perf test green). Re-run the eligibility + gold tests (`pnpm exec vitest run test/safelane`) to confirm no behavior change.
- [ ] **Step 5: Commit + push.** `git commit -m "fix(safelane): linear-time wikitext signal scan (bound match-start positions vs brace/bracket spam)"`

### Task 1.2: Pitfall entry

**Files:**
- Modify: `docs/pitfalls/implementation-pitfalls.md` (add an entry; update TOC count + Appendix B)

- [ ] **Step 1:** Add a `SAFE-1` (or next id in a new "Safe-lane" section) entry: "Untrusted-wikitext scans MUST be linear-time. `scanWikitextSignals` runs on attacker-controllable article wikitext, and the easy-win lane runs it at fetch-fan-out scale; a regex whose match-start count is superlinear in input length is a Worker-CPU DoS (G15). Bound match-start positions; verify with a multi-MB spam perf test." Cross-reference testing-pitfalls §1. Update the TOC entry count and Appendix B summary row.
- [ ] **Step 2: Commit + push.** `git commit -m "docs(pitfalls): SAFE-1 untrusted-wikitext scans must be linear-time"`

**After Phase 1:** 3+ review rounds — confirm the regex change preserves every existing detection (run the full safelane suite), the perf bound holds, and no real-article false-negative was introduced.

---

## Phase 2 — Data model (`eligibility_verdicts` + migration + DB module)

**Execution Status:** ⬜ NOT STARTED

Implements design §2. Adds the table, the ordered-migration discipline (finding I), and the DB module.

### Task 2.1: Migration + ordered `freshTestDb` + schema-equivalence test

**Files:**
- Create: `migrations/0002_eligibility_verdicts.sql`
- Modify: `src/db/schema.sql` (append the new table — `schema.sql` becomes the cumulative canonical schema)
- Modify: `test/helpers/db.ts` (apply migrations in order)
- Test: `test/db/migration.test.ts` (extend) + a new equivalence assertion

- [ ] **Step 1: Write failing tests.** In `test/db/migration.test.ts`, add: the `eligibility_verdicts` table exists with the expected columns + composite PK; AND a schema-equivalence test — a DB built by applying `migrations/0001*.sql` then `migrations/0002*.sql` has the same `sqlite_master` table/column shape as one built by applying `src/db/schema.sql` alone. (Build both via raw `better-sqlite3`, compare `SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name`.)
- [ ] **Step 2: Run** → FAIL (migration + table absent).
- [ ] **Step 3: Implement.** Create `migrations/0002_eligibility_verdicts.sql`:

```sql
-- 0002: eligibility_verdicts — persisted safe-lane gate verdict per (page, revision, gate_version).
CREATE TABLE eligibility_verdicts (
  page_id      INTEGER NOT NULL REFERENCES articles(page_id),
  revision_id  INTEGER NOT NULL,
  gate_version TEXT    NOT NULL,
  eligibility  TEXT    NOT NULL CHECK (eligibility IN ('easy_win','human_only')),
  reasons_json TEXT    NOT NULL,
  evaluated_at TEXT    NOT NULL,
  PRIMARY KEY (page_id, revision_id, gate_version)
) WITHOUT ROWID;
```

Append the identical `CREATE TABLE` to `src/db/schema.sql`. Update `test/helpers/db.ts:freshTestDb()` to apply migrations in sorted order:

```ts
import { readdirSync } from "node:fs";
// …
const dir = "migrations";
for (const f of readdirSync(dir).filter(f => f.endsWith(".sql")).sort()) {
  db.exec(readFileSync(`${dir}/${f}`, "utf8"));
}
```

(Replace the single `0001_init.sql` exec. Keep `foreign_keys = ON`.)

- [ ] **Step 4: Run** → PASS (table present, equivalence holds, existing migration tests green).
- [ ] **Step 5: Commit + push.** `git commit -m "feat(db): eligibility_verdicts table + ordered-migration freshTestDb + schema-equivalence test"`

> **Pitfall (DB-1):** `WITHOUT ROWID` + composite PK is what makes a NULL key component reject — Task 2.2 proves it with an insert test. Do NOT drop `WITHOUT ROWID`.

### Task 2.2: `eligibility_verdicts` DB module (upsert + pre-filter query)

**Files:**
- Create: `src/db/eligibility-verdicts.ts`
- Test: `test/db/eligibility-verdicts.test.ts`

Implements design §3 (write) + §4 Stage-1 (pre-filter). Read `docs/pitfalls/implementation-pitfalls.md` DB-2 (bind via `bind()`; D1 result envelope).

- [ ] **Step 1: Write failing tests** (`freshTestExecutor`, `await` every call, `bind()` params):
  - upsert inserts a row; re-upsert on the same `(page_id, revision_id, gate_version)` updates in place (no duplicate);
  - a NULL `gate_version` (or any PK component) insert rejects (DB-1);
  - the FK to `articles` fires (verdict for a non-existent `page_id` rejects);
  - `selectEasyWinPageIds(db, gateVersion)` returns only pages whose row matches `articles.revision_id` AND `gate_version` AND `eligibility='easy_win'` AND that have ≥1 `stale_candidates` row — and excludes `human_only`, stale-`revision_id`, stale-`gate_version`, and zero-candidate pages. (Seed `articles`, `stale_candidates`, and verdicts to cover each exclusion.)
- [ ] **Step 2: Run** → FAIL (module missing).
- [ ] **Step 3: Implement** `src/db/eligibility-verdicts.ts`:

```ts
// ABOUTME: Persistence + pre-filter query for safe-lane eligibility verdicts (advisory, never the surfacing authority).
// ABOUTME: Keyed (page_id, revision_id, gate_version); upsert on re-eval; Stage-1 pre-filter for the easy-win lane.
import type { SqlExecutor } from "./client";

export interface VerdictRecord {
  pageId: number;
  revisionId: number;
  gateVersion: string;
  eligibility: "easy_win" | "human_only";
  reasons: string[];
  evaluatedAt: string;
}

export async function upsertVerdict(db: SqlExecutor, v: VerdictRecord): Promise<void> {
  await db
    .prepare(
      "INSERT INTO eligibility_verdicts (page_id, revision_id, gate_version, eligibility, reasons_json, evaluated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(page_id, revision_id, gate_version) DO UPDATE SET " +
        "eligibility = excluded.eligibility, reasons_json = excluded.reasons_json, evaluated_at = excluded.evaluated_at"
    )
    .bind(v.pageId, v.revisionId, v.gateVersion, v.eligibility, JSON.stringify(v.reasons), v.evaluatedAt)
    .run();
}

/** Stage-1 pre-filter: pages currently recorded easy_win for their live revision + the given gate
 *  version that also have ≥1 detected candidate. A cheap, network-free narrowing — NOT authoritative
 *  (Stage 2 re-fetches + re-runs the gate before anything is surfaced). */
export async function selectEasyWinPageIds(db: SqlExecutor, gateVersion: string): Promise<number[]> {
  const rows = await db
    .prepare(
      "SELECT a.page_id AS page_id FROM articles a " +
        "JOIN eligibility_verdicts v ON v.page_id = a.page_id AND v.revision_id = a.revision_id " +
        "AND v.gate_version = ? AND v.eligibility = 'easy_win' " +
        "WHERE EXISTS (SELECT 1 FROM stale_candidates c WHERE c.page_id = a.page_id) " +
        "ORDER BY a.page_id ASC"
    )
    .bind(gateVersion)
    .all<{ page_id: number }>();
  return rows.map(r => r.page_id);
}
```

- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit + push.** `git commit -m "feat(db): eligibility_verdicts upsert + easy-win Stage-1 pre-filter query"`

**After Phase 2:** 3+ review rounds — composite-key/NULL/FK behavior on better-sqlite3 (matches D1), the pre-filter's exclusions all tested, `bind()` everywhere (DB-2).

---

## Phase 3 — Persist the verdict on lookup (article-row-last)

**Execution Status:** ⬜ NOT STARTED

Implements design §3. Adds the verdict upsert to `lookupAndPersist` and pins the write order so `articles.revision_id` never leads its candidates (CRITICAL-B ordering half).

### Task 3.1: Write the verdict + pin article-row-last ordering

**Files:**
- Modify: `src/ingest/lookup.ts`
- Test: `test/ingest/lookup.test.ts` (extend)

- [ ] **Step 1: Write failing tests** (extend the existing suite; reuse `fixtureFetch`, `NOW`):
  - after a lookup, `eligibility_verdicts` has exactly one row for `(PAGE_ID, REVISION_ID, GATE_VERSION)` with `eligibility='easy_win'`, `reasons_json='[]'` (Artemis fixture), and an ISO `evaluated_at`;
  - the verdict row's `eligibility`/`reasons` equal the returned `result.eligibility`/`result.reasons`.

```ts
it("persists the eligibility verdict bound to (page, revision, gate_version)", async () => {
  const exec = freshTestExecutor();
  const result = await lookupAndPersist(exec, "Artemis program", { fetchFn: fixtureFetch, asOfYear: AS_OF, now: NOW });
  const rows = await exec.prepare(
    "SELECT page_id, revision_id, gate_version, eligibility, reasons_json FROM eligibility_verdicts"
  ).all<{ page_id: number; revision_id: number; gate_version: string; eligibility: string; reasons_json: string }>();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ page_id: PAGE_ID, revision_id: REVISION_ID, eligibility: result.eligibility });
  expect(JSON.parse(rows[0].reasons_json)).toEqual(result.reasons);
});
```

- [ ] **Step 2: Run** → FAIL (no verdict written).
- [ ] **Step 3: Implement** in `src/ingest/lookup.ts`:
  - Import `upsertVerdict` from `../db/eligibility-verdicts`.
  - Reorder the writes so the `articles` upsert is **last**: `insertCandidates` → `upsertVerdict` → the two `makeAuditLog().append(...)` calls → `upsertArticle` LAST. Add a one-line comment: `// articles row written last: its revision_id must never lead the stale_candidates it summarizes (design §3 / CRITICAL-B).`
  - `upsertVerdict(db, { pageId: fetched.pageId, revisionId: fetched.revisionId, gateVersion: GATE_VERSION, eligibility: decision.eligibility, reasons: decision.reasons, evaluatedAt: new Date().toISOString() })`.

  > **FK ordering caveat:** `eligibility_verdicts.page_id` and `stale_candidates.page_id` both FK to `articles(page_id)`. With the article row written LAST, those inserts would violate the FK. Resolve by keeping `upsertArticle` first for FK satisfaction BUT capturing the *revision* invariant differently: write `articles` first with the row, but ensure no code path advances `articles.revision_id` ahead of the candidates' `source_revision_id` (they are the same `fetched.revisionId` here, so they always agree within one lookup). **Therefore:** keep `upsertArticle` FIRST (FK requires it); the CRITICAL-B invariant is satisfied because candidates + verdict + article all use the *same* `fetched.revisionId` in one call — add an assertion/comment documenting that they MUST share one revision id, and leave a test (below) that the three agree. Do NOT split the revision across writes.

  - Add `const liveRev = fetched.revisionId;` and use it for `upsertArticle`, `insertCandidates` (as `sourceRevisionId`), and `upsertVerdict` so the shared-revision invariant is syntactically obvious.
- [ ] **Step 4: Run** the full `lookup.test.ts` → PASS (existing + new).
- [ ] **Step 5: Commit + push.** `git commit -m "feat(ingest): persist the eligibility verdict on lookup; pin one-revision-per-lookup invariant"`

**After Phase 3:** 3+ review rounds — the verdict round-trips; article/candidates/verdict share one revision id; the existing audit + return contract is unchanged.

---

## Phase 4 — Easy-win lane query (two-stage, positive allowlist)

**Execution Status:** ⬜ NOT STARTED

Implements design §4/§5/§7 — the core. Read the design §4–§7 and the review synthesis CRITICAL-A/B + HIGH-C/D/G before starting.

### Task 4.1: `getEasyWinLane` — Stage 2 re-validation with the positive allowlist

**Files:**
- Create: `src/ingest/easy-win-lane.ts`
- Test: `test/ingest/easy-win-lane.test.ts`

- [ ] **Step 1: Write failing tests** (injected `fetchFn` + fixed `now`; seed via `freshTestExecutor` + `lookupAndPersist` or direct inserts). Cover EACH per-page outcome. The following are **MUST-NOT-WEAKEN** fail-OPEN guards:
  - **easy-win stays easy-win** (re-fetch absent, same revision) → page in `items` with its candidates; outcome `surfaced`.
  - **re-fetch BLP-present → excluded** (`demoted`); not in `items`; verdict refreshed to `human_only`. **MUST-NOT-WEAKEN.**
  - **re-fetch `blpProbe:"unknown"` → excluded** (`demoted`, reasons include `metadata_unavailable`). **MUST-NOT-WEAKEN.**
  - **page_id identity mismatch** (fetch returns a different `pageId`) → excluded; not surfaced. **MUST-NOT-WEAKEN.**
  - **revision drift** (live `revisionId` ≠ stored) → excluded (`revision_drift`); `articles.revision_id` UNCHANGED afterward. **MUST-NOT-WEAKEN.**
  - **`ArticleNotFoundError`** on re-fetch → excluded (`article_gone`); other pages still returned.
  - **`WikimediaUnavailableError`** on one page → excluded (`fetch_unavailable`); other pages still returned.
  - summary counts (`considered/surfaced/deferred/skipped[]`) are correct; empty-healthy vs all-skipped distinguishable.

- [ ] **Step 2: Run** → FAIL (module missing).
- [ ] **Step 3: Implement** `src/ingest/easy-win-lane.ts`. Signature + the positive allowlist:

```ts
// ABOUTME: Easy-win lane — Stage-1 DB pre-filter then authoritative point-of-use re-fetch + re-run-gate.
// ABOUTME: Positive allowlist (include iff identity + easy_win + revision match); persisted verdict is never the authority.
import type { SqlExecutor } from "../db/client";
import { getCandidatesByPageId, type PersistedCandidate } from "./articles";
import { selectEasyWinPageIds, upsertVerdict } from "../db/eligibility-verdicts";
import { makeAuditLog } from "../db/audit-log";
import { fetchArticle, toArticleMetadata, type FetchLike, ArticleNotFoundError, WikimediaUnavailableError } from "./wikimedia";
import { evaluateEligibility, GATE_VERSION } from "../safelane/eligibility";

export const DEFAULT_MAX_PAGES = 25; // G14 fan-out cap (named, tunable); pagination deferred (design §1)

type Outcome = "surfaced" | "demoted" | "revision_drift" | "article_gone" | "fetch_unavailable";
export interface EasyWinItem { pageId: number; title: string; revisionId: number; candidates: PersistedCandidate[]; }
export interface EasyWinLaneResult {
  items: EasyWinItem[];
  summary: { considered: number; surfaced: number; deferred: number; skipped: { pageId: number; outcome: Exclude<Outcome, "surfaced"> }[] };
}
export interface EasyWinLaneOptions { fetchFn?: FetchLike; userAgent?: string; now?: Date; maxPages?: number; }

export async function getEasyWinLane(db: SqlExecutor, options: EasyWinLaneOptions = {}): Promise<EasyWinLaneResult> {
  const now = options.now ?? new Date();
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const all = await selectEasyWinPageIds(db, GATE_VERSION);
  const pageIds = all.slice(0, maxPages);
  const deferred = all.length - pageIds.length;

  const items: EasyWinItem[] = [];
  const skipped: EasyWinLaneResult["summary"]["skipped"] = [];

  for (const pageId of pageIds) {                       // bounded, sequential (G14-polite); concurrency cap is a future tuning
    const storedRev = await currentArticleRevision(db, pageId); // SELECT revision_id, title FROM articles WHERE page_id=?
    const outcome = await revalidate(db, pageId, storedRev, now, options);
    if (outcome.outcome === "surfaced") items.push(outcome.item);
    else skipped.push({ pageId, outcome: outcome.outcome });
  }
  return { items, summary: { considered: pageIds.length, surfaced: items.length, deferred, skipped } };
}
```

  Implement `revalidate(...)`:
  - `fetchArticle` **by the stored title but assert identity** — call `fetchArticle(storedRev.title, { fetchFn, userAgent })`; on `ArticleNotFoundError` → audit + return `{ outcome: "article_gone" }`; on `WikimediaUnavailableError` → audit + `{ outcome: "fetch_unavailable" }`.
  - If `fetched.pageId !== pageId` → audit + `{ outcome: "demoted" }` (identity mismatch is treated as non-eligible; never surface). 
  - `const decision = evaluateEligibility(toArticleMetadata(fetched), now, GATE_VERSION)`; `await upsertVerdict(...)` with the re-run result (Stage-1 self-heals next read); audit `article.eligibility.revalidated` (codes only; idempotent on `(pageId, fetched.revisionId, GATE_VERSION)`).
  - **Positive allowlist — the ONLY include path:**
    ```ts
    if (decision.eligibility === "easy_win" &&
        fetched.pageId === pageId &&
        fetched.revisionId === storedRev.revisionId) {
      const candidates = await getCandidatesByPageId(db, pageId);
      // guard: candidates must describe the live revision
      if (candidates.every(c => c.sourceRevisionId === fetched.revisionId)) {
        return { outcome: "surfaced", item: { pageId, title: fetched.title, revisionId: fetched.revisionId, candidates } };
      }
    }
    ```
  - else classify: if `fetched.revisionId !== storedRev.revisionId` → `revision_drift` (do NOT update `articles.revision_id`); otherwise `demoted`.
  - Helper `currentArticleRevision(db, pageId)` selects `revision_id` + `title` from `articles`.

  > **Do NOT** add caching, retries, or re-detection. **Do NOT** mutate `articles.revision_id` on drift. **Do NOT** invert the allowlist into "exclude on bad reasons" — the include test is positive equality (CRITICAL-A).

- [ ] **Step 4: Run** the full `easy-win-lane.test.ts` → PASS.
- [ ] **Step 5: Commit + push.** `git commit -m "feat(ingest): easy-win lane query — two-stage, positive allowlist, per-page outcomes + audit"`

**MUST-NOT-WEAKEN reminder:** if any of the five fail-OPEN guard tests flakes, fix it with deterministic stub `fetchFn`/`now` — never by loosening the assertion. STOP and escalate if you can't make it pass deterministically.

**After Phase 4:** 3+ review rounds — the include path is positive-allowlist only; every exclusion outcome audited (codes only, no PII); `articles.revision_id` never mutated by the lane; the `maxPages` cap bites; per-page failure isolated.

---

## Phase 5 — `POST /api/easy-win` endpoint

**Execution Status:** ⬜ NOT STARTED

Implements design §6. Thin route; logic is covered by Phase 4 tests.

### Task 5.1: The route

**Files:**
- Create: `src/app/api/easy-win/route.ts`
- Test: none new (route is excluded from coverage like the lookup route; rely on tsc/lint + Phase-4 logic tests).

- [ ] **Step 1: Implement** `src/app/api/easy-win/route.ts` mirroring `src/app/api/articles/lookup/route.ts`: `export const dynamic = "force-dynamic"`; `POST` resolves the D1 binding (`d1Executor(getCloudflareContext().env.DB)`), calls `getEasyWinLane(db, { now: new Date() })`, returns `json({ items, summary }, 200)`. Map `WikimediaUnavailableError` → 503 only if it escapes (per-page failures are already swallowed into the summary, so a top-level catch returns `{ error: "Easy-win lane failed" }, 500`). It is a `POST` (side-effecting: fetches + audit/verdict writes) — design §6 / CRITICAL-E.
- [ ] **Step 2: Verify** `pnpm exec tsc --noEmit` + `pnpm lint` clean. Confirm the route returns the full `EasyWinLaneResult`.
- [ ] **Step 3: Commit + push.** `git commit -m "feat(api): POST /api/easy-win — surface the re-validated easy-win lane"`

**After Phase 5:** 3+ review rounds — `POST` (not `GET`); the route adds no logic beyond glue; the response carries `items` + `summary`.

---

## Final integration

- [ ] Full suite + `tsc` + `lint` green + pristine.
- [ ] Rebase onto latest `origin/dev`; resolve any conflict in `lookup.ts`/`wikimedia.ts`/`schema.sql`/`test/helpers/db.ts` by re-running the gate trio.
- [ ] Open a PR to `dev` with `## Merge classification` of **Review — compliance** (this is the BLP surfacing path). Link the design v2 + the 5-round review + the synthesis. Do NOT self-merge.

---

## Self-Review (author checklist — completed at write time)

**Spec coverage:** design §2 → Task 2.1/2.2; §3 → Task 3.1; §4 Stage-1 → 2.2, Stage-2 → 4.1; §5 → 4.1 (positive allowlist + re-fetch); §6 → 5.1; §7 audit → 4.1; §8 scan hardening → 1.1/1.2; §9 testing → distributed; §10 compliance → honored per task; §1 non-goals → "Do NOT" boundaries. No uncovered section.

**Open issue flagged for the executor (resolve in Task 3.1):** the design says "write the `articles` row LAST," but `eligibility_verdicts` and `stale_candidates` both FK to `articles(page_id)`, so the article row must exist FIRST for the inserts to satisfy the FK. Task 3.1 resolves this by keeping `upsertArticle` first and instead enforcing the *real* invariant — article, candidates, and verdict all use one shared `fetched.revisionId` per lookup (so revision can never lead its candidates), with a test that the three agree. The plan-review-cycle should confirm this resolution is sound and update design §3's wording if needed.

**Placeholder scan:** every code step shows code; commands concrete; no TBD.

**Type consistency:** `VerdictRecord`, `EasyWinItem`, `EasyWinLaneResult`, `Outcome` defined once and used consistently; `GATE_VERSION` imported from the gate; `PersistedCandidate`/`FetchLike`/typed errors imported from existing modules.
