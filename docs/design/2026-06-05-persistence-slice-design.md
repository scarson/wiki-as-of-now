<!-- ABOUTME: Design for the single-article persistence + read vertical slice — fetch → detect → persist (D1) → API → UI. -->
<!-- ABOUTME: Resolves the D1 sync/async seam; captures the reasoning chain, alternatives, and accepted scope cuts. -->

# Design — Single-article persistence + read vertical slice

**Status:** approved (Sam, 2026-06-05) — design gate passed before build.
**Source prompt:** `docs/handoff/2026-06-05-next-persistence-slice.md`.
**Spec anchors:** design spec §26.2 build-order steps 2 ("article lookup + storage") & 4 ("rendering"); §24 Phase 1; §16.1/§16.2 (endpoints + service modules); §13 (data model); §27 (UX); §4.1 (D1 runtime).
**Compliance anchors:** `docs/policy/wikipedia-genai-compliance.md` — the audit-log-is-foundational (G13), responsible-Wikimedia-access (G14), fetched-content-is-untrusted-data (G15), and detection-is-deterministic (G10) guardrails are load-bearing here.

---

## 1. Goal and non-goals

**Goal.** Make the mature deterministic detector reachable end-to-end: a real Wikipedia
article entered in a minimal UI → fetched from Wikimedia → parsed → detected → **persisted
to D1** → read back through two API routes → rendered as explained stale candidates. Wire
the first real audit-log producer. Resolve the D1 sync/async seam so production runs on the
Workers async contract while tests run on better-sqlite3.

**Non-goals (YAGNI / explicit scope cuts).** No LLM (G10 — this path stays deterministic),
no auth/quotas, no research/Gemini provider, no queue, no safe-lane (G11) gate, no batch
ingestion (single-article only), no live D1 provisioning or deploy (Sam: local-only,
D1 adapter code-complete but unprovisioned — `database_id` stays placeholder; no Cloudflare
credentials in this environment and the app has never been deployed). No freshness/TTL
cache layer (spec §8 is a later phase) — lookup is an explicit user-initiated fetch.

---

## 2. The architectural decision: the D1 sync/async seam

**The problem.** `src/db/client.ts` defines `SqlExecutor`/`SqlStatement` modelling
better-sqlite3's **synchronous** contract (`prepare(sql).run(...args)` / `.all(...args)`
return values directly). Cloudflare D1's surface is **async** (`prepare(sql).bind(...args)`,
then `.run()` / `.all()` return Promises, and `.all()` yields `{ results }`, not a bare
array). The audit log and every future data-layer caller sit on this seam. The spec
invariant "D1 is the default source of application truth" (§26.1) means production must run
on D1 — so the seam cannot stay synchronous.

**Decision (approved).** Redefine the canonical `SqlExecutor` as an **async port** and put
two adapters behind it:

```ts
interface SqlStatement {
  bind(...params: unknown[]): SqlStatement;   // uniform binding (D1 requires it; b-s3 emulates)
  run(): Promise<void>;
  all<T>(): Promise<T[]>;                       // always a plain rows array
}
interface SqlExecutor {
  prepare(sql: string): SqlStatement;
}
```

- **better-sqlite3 adapter** (`betterSqliteExecutor(db)`): `bind()` stashes params; `run()`/
  `all()` call the synchronous statement and return resolved Promises. Used by tests/local.
- **D1 adapter** (`d1Executor(env.DB)`): delegates to `D1PreparedStatement.bind().run()/.all()`,
  unwrapping `.all()`'s `{ results }` to a plain array. Used in Worker route handlers via
  `getCloudflareContext().env.DB`.

All data-layer methods (audit log `append`/`read`, persistence `upsertArticle`/
`insertCandidates`/`getCandidatesByPageId`) become `async`. Existing DB tests move to
`await` — explicitly anticipated by testing-pitfalls §8 ("when D1 is wired, the data-layer
methods become async and tests must await; don't bake in the sync contract as permanent").

**Why this shape.** Binding is uniform (`bind(...).run()`) so the *same* SQL + call site
runs on both engines; the adapter is the only place the two contracts differ. We deliberately
do **not** surface `lastInsertRowid`/`changes` in the port: this slice never needs a generated
id back (articles use the natural `page_id` key; candidates are read back by `page_id`, not by
their autoincrement id), so leaving it out keeps the port minimal and the two adapters trivially
equivalent. If a later milestone needs the insert id, extend the port then (keeping-options-open
is cheap here; speculating now is YAGNI).

**Alternatives considered and ruled out.**
- *Keep the seam synchronous, defer D1.* Rejected: violates the DoD ("runs on the Workers
  async contract") and the D1-is-source-of-truth invariant; only postpones the same work.
- *Make modules sync and run D1 via `await` at the call site only.* Rejected: D1's API is
  unavoidably Promise-returning; a sync module physically cannot call it. The async boundary
  has to live at (or below) the data-layer methods.
- *A query-builder / ORM (Drizzle, Kysely).* Rejected as over-engineering for three tables
  and a handful of statements (YAGNI); the duck-typed seam already exists and is tiny.

---

## 3. Module layout

```
src/db/client.ts        async SqlExecutor port + betterSqliteExecutor + d1Executor + openLocalDb
src/db/audit-log.ts     makeAuditLog → async append/read (unchanged surface: append + read only)
src/db/articles.ts      upsertArticle, insertCandidates, getCandidatesByPageId  (NEW)
src/ingest/wikimedia.ts fetchArticle(title, opts) → { pageId, title, revisionId, wikitext } (NEW)
src/ingest/lookup.ts    lookupAndPersist(executor, title, opts) orchestrator (NEW)
src/app/api/articles/lookup/route.ts            POST handler (thin) (NEW)
src/app/api/articles/[id]/candidates/route.ts   GET handler (thin)  (NEW)
src/app/page.tsx        real minimal UI (replaces boilerplate)
src/app/layout.tsx      fix metadata title/description
```

**Testability principle.** All logic lives in plain modules that accept an injected
`SqlExecutor` and (for ingest) an injected `fetchFn`, so they are fully unit-testable on
better-sqlite3 with committed fixtures and zero network. The `route.ts` handlers are thin
glue (resolve `env.DB` → wrap in `d1Executor` → call the module → serialize JSON); they
require the Workers runtime and are excluded from coverage (vitest config already excludes
`src/app/**`), consistent with how the detector keeps logic out of the framework shell.

---

## 4. Persistence (`src/db/articles.ts`)

- `upsertArticle(executor, { pageId, title, revisionId, fetchedAt })` →
  `INSERT INTO articles (...) VALUES (...) ON CONFLICT(page_id) DO UPDATE SET title=…,
  revision_id=…, fetched_at=…`. Idempotent on the natural key (spec §17.3 idempotency;
  re-looking-up an article updates it in place rather than erroring).
- `insertCandidates(executor, pageId, StaleCandidate[])` → delete existing candidates for
  the page, then insert the fresh set. **Rationale:** a re-run on a newer revision must not
  leave stale rows from the prior run; a per-page replace keeps the persisted set equal to
  the latest detector output (idempotent re-detection). Maps each `StaleCandidate` to the
  `stale_candidates` columns: `section_heading`, `sentence_text`, `year`, `marker`,
  `score` (the `ScoreBreakdown.total`), `explanation`, `detector_version` (`DETECTOR_VERSION`),
  `source_revision_id` (the article's revision). The full `ScoreBreakdown` is not persisted
  this slice — only `total` (the column is `score REAL`); the breakdown is recomputable and
  not needed for the read/render path (YAGNI; matches the existing column).
- `getCandidatesByPageId(executor, pageId)` → `SELECT … WHERE page_id=? ORDER BY score DESC,
  id ASC` → mapped rows for the read API.

**DB-1 compliance.** `articles.page_id` is already the `WITHOUT ROWID` natural key in the
shipped migration — no schema change needed. A NULL-page_id insert is already regression-tested
(`migration.test.ts`). Persistence must never fabricate a `pageId`; it always comes from the
Wikimedia response.

**FK ordering.** `insertCandidates` runs after `upsertArticle` so the `stale_candidates →
articles` FK is satisfied (FKs are ON in `freshTestDb` and on D1 — testing-pitfalls §8).

---

## 5. Ingest (`src/ingest/`)

### 5.1 Fetch (`wikimedia.ts`)

`fetchArticle(title, { fetchFn = fetch, userAgent }): Promise<FetchedArticle>` using the
**MediaWiki Action API** (one call returns everything the natural key + revision need):

```
GET https://en.wikipedia.org/w/api.php
    ?action=query&prop=revisions&rvprop=content|ids&rvslots=main
    &titles=<title>&format=json&formatversion=2&maxlag=5&redirects=1
```

Returns `{ pageId, title (normalized), revisionId, wikitext }`.

**G14 — responsible Wikimedia access:**
- **Descriptive User-Agent** per Wikimedia policy: `WikiAsOfNow/0.1 (+https://github.com/scarson/wiki-as-of-now)`
  — a project name/version + contact URL. (URL, not personal email — sufficient per policy and
  avoids embedding PII.)
- **`maxlag=5`** so we yield when the replicas are lagging; on an HTTP 200 with an API
  `error.code === "maxlag"` (or HTTP 503 with a `Retry-After`), surface a typed, retryable
  error rather than hammering. (No automatic background retry loop this slice — a single
  interactive lookup; the caller/UI sees the error.)
- **No bulk crawling** — single article, user-initiated. Dumps/bulk are a later batch concern
  (spec §7.1) and explicitly out of scope.
- **Caching:** persistence itself is the durable store; the read path (`GET …/candidates`)
  hits D1, not Wikimedia. Lookup re-fetches because it is an explicit "fetch now" action —
  not redundant load. A freshness TTL (spec §8) is deferred.

**G15 — fetched content is untrusted data:** the wikitext flows only into `wtf_wikipedia`
parsing and the deterministic detector. It is never interpreted as instructions, never sent
to a model (there is no model in this path). The verbatim content is not echoed into logs
(see §7). Error handling treats absent/`missing` pages, redirects, and malformed JSON as
typed failures, not crashes (negative-path coverage — testing-pitfalls §3/§4).

### 5.2 Orchestrator (`lookup.ts`)

`lookupAndPersist(executor, title, { fetchFn, userAgent, asOfYear }): Promise<LookupResult>`:

1. `fetchArticle` → `{ pageId, title, revisionId, wikitext }`.
2. `parseArticle({ title, revisionId, wikitext })` (the same `wtf_wikipedia` path the detector
   fixtures use).
3. `detectStaleClaims(parsed, asOfYear)` → `StaleCandidate[]` (consume only — detector
   untouched, G10).
4. `upsertArticle(...)` with `fetchedAt = new Date().toISOString()`.
5. `insertCandidates(pageId, candidates)`.
6. `auditLog.append({ actor: "system", eventType: "article.lookup", payload: { pageId,
   revisionId, candidateCount, detectorVersion } })` — **identifiers only**, no title/content
   (G13 + no-PII-in-logs pitfall).
7. Return `{ pageId, title, revisionId, candidateCount, candidates }`.

**`asOfYear` and the clock.** The detector is clockless by invariant (G10; no `Date` in
`src/detector/`). "As of now" is an *application* concern: the orchestrator/route supplies
`asOfYear = new Date().getUTCFullYear()` (default), but the parameter is injectable so tests
pin it (e.g. 2026) for determinism — mirroring how the detector fixtures pin `asOfYear`. The
app layer reading the clock is fine; only the detector must not.

---

## 6. API routes (spec §16.1)

- **`POST /api/articles/lookup`** — body `{ title: string }`. Resolves `env.DB` →
  `d1Executor` → `lookupAndPersist` → `200 { pageId, title, revisionId, candidateCount,
  candidates }`. Validates `title` is a non-empty string (`400` otherwise). Maps a Wikimedia
  "page not found" to `404`, a maxlag/upstream failure to `503`. Never leaks raw upstream
  errors verbatim to the client.
- **`GET /api/articles/:id/candidates`** — `id` = `page_id`. Resolves `env.DB` →
  `d1Executor` → `getCandidatesByPageId` → `200 { pageId, candidates }`. Non-integer `id`
  → `400`. Unknown page → `200 { pageId, candidates: [] }` (a page with no persisted
  candidates and a never-seen page are indistinguishable at this layer and both legitimately
  read as "no candidates"; no existence oracle needed for public Wikipedia page ids).

Both handlers are thin; the orchestration + read logic they call is unit-tested directly.

---

## 7. Audit log (G13)

The orchestrator is the **first real production producer** of the audit log (today only a
test calls it). Payload is **identifiers only**: `pageId`, `revisionId`, `candidateCount`,
`detectorVersion`. **Never** the title, the wikitext, sentence text, or any document content
(no-PII-in-logs pitfall + the schema column comment). `append`/`read` remain the only methods
— append-only is preserved (G13). The audit append happens after a successful persist so the
log reflects committed state.

---

## 8. UI (spec §27)

Replace the create-next-app boilerplate `page.tsx` with a minimal real client component:
a title input + "Look up" button → `POST /api/articles/lookup` → render the returned
candidates as a list, each card showing the **stale sentence**, the **why-flagged
explanation**, the **year**, and the **marker** (spec §27 "candidate detail": extracted
stale sentence, why flagged, citation year). Loading + empty ("no stale candidates found")
+ error states handled. Fix `layout.tsx` metadata (`title`/`description`) — currently still
"Create Next App". Tailwind v4 is available; keep styling minimal and legible. No research
button, no auth UI, no topic browse (later milestones).

This UI cannot be auto-verified end-to-end without a deploy (out of scope); the API + logic
are covered by unit tests, and a one-off `npx tsx` script does a single real Wikimedia fetch
to confirm the live ingest path (deleted before commit; never a committed test — committed
tests must not hit the network, testing-pitfalls §7/§9).

---

## 9. Testing strategy (TDD, per testing-pitfalls)

- **Seam adapters** (`client.test.ts`, rewritten to async): better-sqlite3 adapter runs and
  reads back; `all()` returns a plain array; FK enforcement still fires through the adapter
  (`bind(...).run()` on an orphan candidate rejects). The pragma-level FK check stays
  available via `openLocalDb`'s underlying handle or is replaced by the behavioural FK test.
- **Audit log** (`audit-log.test.ts`, → async/`await`): append + read-back order, empty read,
  no mutation methods (unchanged assertions, now awaited).
- **Persistence** (`articles.test.ts`, NEW): upsert insert-then-update idempotency; candidate
  insert + read-back ordering (score desc); re-detect replaces the prior set (no stale rows);
  FK satisfied only after upsert; empty-candidates persists nothing and reads `[]`; NULL/garbage
  guarded by the natural key. Built on `freshTestDb` via the adapter (FKs ON — §8).
- **Ingest fetch** (`wikimedia.test.ts`, NEW): inject a fake `fetchFn` asserting the request
  URL params (`maxlag`, `rvprop`, `formatversion`) and the **User-Agent header** (G14), and
  returning a canned Action-API body → correct `{ pageId, title, revisionId, wikitext }`.
  Negative paths: missing page → typed not-found error; `error.code==="maxlag"` → typed
  retryable error; malformed JSON → typed error. (Mocking only the network boundary, not the
  logic — testing-pitfalls §7.)
- **Orchestrator** (`lookup.test.ts`, NEW): inject a fake `fetchFn` returning a **committed
  fixture's** wikitext (real Wikipedia content, not fetched in-test) + a better-sqlite3
  executor → asserts persisted article + candidates match `detectStaleClaims` output for a
  pinned `asOfYear`, and that exactly one identifiers-only `article.lookup` audit row is
  written. Reuses an existing `test/fixtures/*.wikitext`.
- **Pristine output** (§1): no stray stderr; typed errors asserted on message/shape.
- **Determinism** (§9): pinned `asOfYear`, committed fixtures, no network in committed tests.

---

## 10. Compliance checklist for this slice

| Guardrail | How this slice honors it |
|---|---|
| Detection deterministic & LLM-free (G10) | Detector consumed unchanged; zero model calls anywhere in the path. |
| Audit log foundational (G13) | First real producer wired (`article.lookup`); append-only preserved; identifiers only. |
| Responsible Wikimedia access (G14) | Descriptive UA + contact URL, `maxlag=5`, single-article (no bulk crawl), read path served from D1. |
| Fetched content untrusted (G15) | Wikitext → parser/detector only; never instructions, never to a model, never logged verbatim. |
| No PII in logs | Audit payload is numeric identifiers + version string; no title/content. |
| DB-1 (natural-key NULL trap) | `articles.page_id` already `WITHOUT ROWID`; persistence never fabricates a key. |
| D1↔SQLite parity (§8) | FKs ON in tests; real migration exercised; async contract via the D1 adapter. |

---

## 11. Reasoning chain / what I almost missed (thinking-doc discipline)

- **The port could have just been "make it async."** The non-obvious part is *param binding*:
  better-sqlite3 takes args at `run(...args)`; D1 forbids that and requires `bind()`. A naive
  async port keeping `run(...args)` would work for b-s3 and silently mis-shape the D1 adapter.
  Making `bind()` the uniform contract is what actually closes the seam. Captured so a future
  reader doesn't "simplify" `bind()` away.
- **Re-detect must replace, not append.** First instinct was a plain insert; that would
  accumulate duplicate candidate rows on every lookup of the same page. Per-page replace keeps
  persisted state equal to the latest detector output (idempotency, spec §17.3).
- **Title-in-audit-log temptation.** A title reads like a harmless identifier, but it is
  document-adjacent free text; `pageId` already identifies the article. Kept the log strictly
  numeric/version to stay unambiguously on the "identifiers only" side.
- **`asOfYear` clock placement.** The detector's clocklessness made me check where "now"
  legitimately enters: the app layer, not the detector — same reasoning the audit log uses for
  its `ts`. Injectable param so tests stay deterministic.
- **Still uncertain / deferred:** freshness TTL & re-fetch suppression (spec §8) — not built;
  live D1 provisioning + a deployed end-to-end check — not done (no credentials, out of scope);
  a maxlag *retry* policy — only surfaced as a typed error this slice, not retried.
