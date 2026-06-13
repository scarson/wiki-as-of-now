<!-- ABOUTME: Integration contract for the v1 build — exact interfaces of the built modules (research seam, queue, db, routes, config/test). -->
<!-- ABOUTME: Generated 2026-06-13 by the v1-interface-recon workflow; grounds the implementation plan and subagent tasks. Re-grep if a signature looks stale. -->

The reports are accurate against the actual files. Producing the final integration contract now.

---

# WikiAsOfNow v1 — Integration Contract Reference

**Repo:** `/Users/sam/Code/wiki-as-of-now/.claude/worktrees/wizardly-bose-dad490`
**Purpose:** Single source of truth for builders (and subagents) wiring v1. Every signature and citation below is verified against source. When in doubt, re-grep — but these are exact as of this synthesis.

**Path alias:** `@/*` → `./src/*` (tsconfig.json:22-24). Worker files use relative imports (`../../src/...`).

---

## 1. Research provider contract

A `WorkersAiResearchProvider` must implement exactly one method. The pipeline owns all caps, verbatim verification, and host de-dup — the provider only proposes.

### 1.1 The interface to implement — `src/research/provider.ts:58-60`
```ts
export interface ResearchProvider {
  research(input: ResearchInput): Promise<ProviderResearch>;
}
```

### 1.2 Input — `src/research/provider.ts:5-11`
```ts
export interface ResearchInput {
  claimText: string;        // the candidate's sentence_text
  sectionHeading: string;
  year: number;
  surroundingText?: string; // optional; plumbed at detection time in a later slice
  sourceRevisionId: number;
}
```

### 1.3 Output the provider MUST return — `src/research/provider.ts:42-47`
```ts
export interface ProviderResearch {
  providerName: string;
  modelVersion: string;     // FULL model identifier for G12 disclosure; fake → "fake-provider/0"
  proposals: ProposedEvidence[];
  queries: string[];
}
```

### 1.4 Proposal element — `src/research/provider.ts:14-18`
```ts
export interface ProposedEvidence {
  url: string;
  proposedQuote: string;
  advisorySupport: boolean;
}
```

### 1.5 Error contract — `src/research/provider.ts:50-55`
```ts
export class ProviderUnavailableError extends Error {
  constructor(message = "research provider unavailable") {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}
```
**The pipeline catches this exact class and only this class** (`pipeline.ts:104-105`). It converts to `{ status: "provider_unavailable" }`. **Any other thrown error escapes `researchClaim` uncaught.** The provider MUST throw `ProviderUnavailableError` (not a generic `Error`) when the Workers AI binding is unreachable or returns a non-retryable transport failure.

### 1.6 Reference shape to mirror — `src/research/stub-provider.ts`
`StubResearchProvider` returns `{ providerName: "stub", modelVersion: "fake-provider/0", proposals: [], queries: [] }`. Mirror this exactly. **WARNING:** the stub is PK-poisoning when committed to D1 — see §2.6 and Cross-cutting gotcha CC-7.

### 1.7 How the pipeline consumes the provider — `src/research/pipeline.ts`
```ts
// pipeline.ts:87
export async function researchClaim(input: ResearchInput, deps: ResearchClaimDeps): Promise<ResearchOutcome>

// pipeline.ts:35-41
export interface ResearchClaimDeps {
  provider: ResearchProvider;
  fetchSource: (url: string) => Promise<SourceFetchResult>;
  now: Date;
  maxProposals?: number;   // default DEFAULT_MAX_PROPOSALS = 5
  perHostCap?: number;     // default DEFAULT_PER_HOST_CAP = 2
}
```
- Sole provider call site: `provider.research(input)` at `pipeline.ts:103`.
- The `WorkersAiResearchProvider` is passed as `deps.provider`. `deps.fetchSource`, `deps.now`, and the optional caps come from the **caller**, not the provider.

### 1.8 Caps and bounds the pipeline enforces AFTER the provider returns — `pipeline.ts:14-17`
```ts
export const DEFAULT_MAX_PROPOSALS = 5;
export const DEFAULT_PER_HOST_CAP = 2;
export const DEFAULT_MAX_QUERIES = 8;       // G9 cheap sanity bound (count)
export const DEFAULT_MAX_QUERY_LEN = 256;   // G9 cheap sanity bound (length, code points)
```
- **Proposal truncation:** truncated to `maxProposals` (default 5) FIRST, before any per-item work (`pipeline.ts:121`). The provider need not self-cap, but over-returning wastes tokens.
- **Query bounds** (`applyQueryBound`, `pipeline.ts:53-69`): queries >256 code points dropped; queries that `includes` the normalized full `claimText` dropped; only first 8 survivors kept.
- **Per-host cap** uses canonical host from `canonicalizeUrl` (`pipeline.ts:158-163`) → lowercased WHATWG-parsed hostname (`canonicalize-url.ts:69-79`). `en.wikipedia.org` and `En.Wikipedia.Org` count as the same host. The provider does NOT de-dup by host.
- **Partition invariant** (`pipeline.ts:177-179`): `cards.length + dispositions.length === truncated.length`. Internal debug check.

### 1.9 Outcome type — `pipeline.ts:23-33`
```ts
export type ResearchOutcome =
  | { status: "provider_unavailable" }
  | {
      status: "no_proposals" | "proposals_present";
      providerName: string;
      modelVersion: string;
      queries: string[];
      cards: EvidenceCard[];
      dispositions: DroppedProposal[];
      overCapCount: number;
    };
```

### 1.10 Verbatim verification — what `proposedQuote` must survive
`verifyProposal(proposal, { fetchSource })` (`verify-proposal.ts:13-31`) runs on every surviving (non-malformed, non-capped) proposal. Inside, `evaluateQuote(fetched.text, proposal.proposedQuote)` (`verbatim-check.ts:24`):

Constants — `verbatim-check.ts:14-19`:
```ts
export const MIN_QUOTE_LEN = 8;   // code points; below → "quote_too_short"
export const MAX_QUOTE_LEN = 300; // code points; above → "quote_too_long"
```
Private: `MAX_PAGE_CHARS = 4_000_000` (hard pre-normalization page-text bound, `verbatim-check.ts:20`).

Normalization (`normalizeForVerbatim`, `normalize.ts:14-21`) applied to **both** quote and page text:
1. NFC normalize both.
2. Strip zero-width chars (soft-hyphen + zero-width family).
3. Vertical-whitespace run → `\n`.
4. Horizontal-whitespace run → single ASCII space.
5. Drop spaces adjacent to `\n`; trim.

Then:
- Normalized quote containing `\n` → `"quote_not_found"` (no cross-block quotes) — `verbatim-check.ts:30`.
- Match iff `page.includes(q)` — contiguous substring — `verbatim-check.ts:33`.
- Length checks on the **normalized** form against `[MIN_QUOTE_LEN, MAX_QUOTE_LEN]`.

**On match, `verifyProposal` stores the RAW, un-normalized `proposal.proposedQuote` as `verbatimQuote`** (`verify-proposal.ts:26`). Whatever the provider puts in `proposedQuote` is what gets stored — keep it a clean verbatim excerpt, never model-authored prose. This is the G8/G15 quote-fabrication backstop.

```ts
// EvidenceCard — provider.ts:32-39 (pipeline emits, NOT the provider)
export interface EvidenceCard { url: string; verbatimQuote: string; advisorySupport: boolean; }

// DroppedProposal — verify-proposal.ts:9-12
export interface DroppedProposal {
  url: string;
  reason: string;  // SourceFetchFailureReason | "quote_too_short" | "quote_too_long" | "quote_not_found"
}
```

---

## 2. Queue producer wiring — enqueue one research job from the app worker

The consumer worker (`workers/research/`) is a separate, already-complete deployment. The app worker only needs to become a **producer**. Three changes: binding in config, type in env, the enqueue call.

### 2.1 Message shape — `src/queue/research-jobs.ts:16-21`
```ts
export interface ResearchMessage {
  claimKey: string;          // 64-char lowercase hex from computeClaimKey()
  pageId: number;
  sourceRevisionId: number;
  input: ResearchInput;      // §1.2
}
```

### 2.2 The producer API — `src/queue/research-jobs.ts:199-206`
```ts
export async function enqueueResearch(
  queue: { send(message: ResearchMessage): Promise<void> },
  params: { pageId: number; sourceRevisionId: number; input: ResearchInput },
): Promise<void>
```
Computes `claimKey` internally via `computeClaimKey(pageId, input.sectionHeading, input.claimText, input.year)`, then `queue.send(...)`. **The caller does NOT construct or pass `claimKey`.** A Cloudflare `Queue<ResearchMessage>` binding does NOT directly satisfy the structural `{ send(...): Promise<void> }` param: under the installed runtime types `Queue.send()` returns `Promise<QueueSendResponse>`, not `Promise<void>` (v4-API; same deviation as the `sendBatch` adapter in `workers/research/index.ts`). **CORRECTED 2026-06-13 (Phase 2 deviation D5):** wrap it in a tiny void adapter — `const queue = { send: async (m) => { await env.RESEARCH_QUEUE.send(m); } }` — exactly as `src/app/api/research/[candidateId]/route.ts` does. The caller still does NOT construct or pass `claimKey`.

### 2.3 Config change — root `wrangler.jsonc` (currently has no `queues` section)
```jsonc
"queues": {
  "producers": [{ "binding": "RESEARCH_QUEUE", "queue": "research" }]
}
```

### 2.4 Type change — after editing config, run `pnpm cf-typegen`
`cloudflare-env.d.ts` gains `RESEARCH_QUEUE: Queue;`. **`cf-typegen` reads ONLY the root `wrangler.jsonc`** — adding the producer there is what surfaces the type to OpenNext routes. (The research worker's bindings never appear in this file; see §5.3.)

### 2.5 The call — in `POST /api/research/:candidateId`
```ts
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { enqueueResearch } from "@/queue/research-jobs";

const { env } = getCloudflareContext();   // inside the handler body, never module scope
await enqueueResearch(env.RESEARCH_QUEUE, {
  pageId: candidate.pageId,
  sourceRevisionId: candidate.sourceRevisionId,
  input: {
    claimText: candidate.sentenceText,
    sectionHeading: candidate.sectionHeading,
    year: candidate.year,
    sourceRevisionId: candidate.sourceRevisionId,
  },
});
```
Route file must also export `export const dynamic = "force-dynamic"` (§4.5).

### 2.6 Pre-deploy infra (shared, already required by research worker)
```bash
wrangler queues create research
wrangler queues create research-dlq
```
Both queues must pre-exist before deploying the app worker as a producer. The DLQ `research-dlq` is inferred by wrangler from the consumer config (`workers/research/wrangler.jsonc:29`) — do NOT declare it as a separate `Queue<...>` binding or it conflicts.

### 2.7 What the app worker does NOT need
The app worker does not consume the queue. No `processBatch`, no `handleResearchMessage`, no `makeDeps`, no consumer registration. For reference, the consumer side (research worker) is described below — builders touching it need this; app-route builders can skip to §3.

### 2.8 Consumer side (reference — research worker only)
- `processBatch` (`process-batch.ts:34-53`) iterates `batch.messages` **sequentially** — load-bearing for G14 host politeness; do NOT parallelize without a global per-host throttle (`process-batch.ts:7-8`).
- `handleResearchMessage` (`research-jobs.ts:104-189`): (1) shape-validate via `isValidMessage()` → malformed = codes-only audit + **ACK** (no retry); (2) idempotency: `packStore.has(...)` → silent **ACK**; (3) `researchClaim` throw → codes-only audit + **rethrow** (retry); (4) `provider_unavailable` → codes-only audit + **throw** (retry); terminal → build `ResearchPack` + audit, `packStore.commitTerminal(pack, audit)`, **ACK**.
- `makeResearchPackStore(db)` (`research-jobs.ts:60-72`): `commitTerminal` does `db.batch([insertPackStatement, appendStatement])` — both-or-neither atomic.
- `enqueueResearchBatch` (`research-jobs.ts:247-287`): chunks ≤100 msgs AND ≤256KB/call; skips msgs whose JSON >128KB (codes-only warn). Expects `{ sendBatch(msgs: { body: ResearchMessage }[]): Promise<void> }` — note `void`; the real CF `sendBatch` returns `Promise<QueueSendBatchResponse>`, so the worker wraps it with an adapter (`workers/research/index.ts:66-68`).
- `selectResearchSeeds(db, { gateVersion, limit })` (`seed.ts:54-102`): `SEED_BATCH_LIMIT = 50` max (`research-jobs.ts:226`), enforced at module load against `MAX_BATCH_COUNT = 100` (throws if bumped above).
- Research worker env (`workers/research/index.ts:25-28`): `{ DB: D1Database; RESEARCH_QUEUE: Queue<ResearchMessage> }`. `makeDeps` (`index.ts:34-55`) wires `StubResearchProvider` — **PK-poisoning placeholder; must be replaced before cron/consumer is enabled with a real provider, and stub packs purged from D1** (Cross-cutting gotcha CC-7).
- `max_batch_size: 1` (`wrangler.jsonc:27`) → exactly one message per `queue()` invocation.
- Malformed messages: `claimKey` is sanitized to the literal `"malformed"` if not 64-char hex before any audit write (`research-jobs.ts:109-121`) — raw input never reaches the append-only log (G13).

---

## 3. DB contract

**Source of truth:** `src/db/schema.sql` (cumulative) + `migrations/0001..0003`. Every migration MUST be mirrored byte-identically into `schema.sql` or the parity test fails (§3.6).

### 3.1 Full schema

**`audit_log`** — `migrations/0001_init.sql:3` (rowid table, AUTOINCREMENT surrogate, NO WITHOUT ROWID)
```sql
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,              -- ISO 8601 UTC
  actor TEXT NOT NULL,           -- user id or 'system'
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL     -- identifiers only; never PII/document content
);
```

**`articles`** — `migrations/0001_init.sql:10` (WITHOUT ROWID; PK explicitly NOT NULL)
```sql
CREATE TABLE articles (
  page_id INTEGER PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  revision_id INTEGER NOT NULL,
  fetched_at TEXT NOT NULL
) WITHOUT ROWID;
```

**`stale_candidates`** — `migrations/0001_init.sql:17` (rowid table; FK → articles)
```sql
CREATE TABLE stale_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL REFERENCES articles(page_id),
  section_heading TEXT NOT NULL,
  sentence_text TEXT NOT NULL,
  year INTEGER NOT NULL,
  marker TEXT NOT NULL,
  score REAL NOT NULL,
  explanation TEXT NOT NULL,
  detector_version TEXT NOT NULL,
  source_revision_id INTEGER NOT NULL
);
```

**`eligibility_verdicts`** — `migrations/0002_eligibility_verdicts.sql:2` (WITHOUT ROWID; composite PK; CHECK)
```sql
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

**`research_packs`** — `migrations/0003_research_packs.sql:2` (WITHOUT ROWID; composite PK; CHECK; FK → articles)
```sql
CREATE TABLE research_packs (
  claim_key          TEXT    NOT NULL,   -- SHA-256 hex of canonical(page_id, section_heading, sentence_text, year)
  source_revision_id INTEGER NOT NULL,
  page_id            INTEGER NOT NULL REFERENCES articles(page_id),
  section_heading    TEXT    NOT NULL,
  sentence_text      TEXT    NOT NULL,
  year               INTEGER NOT NULL,
  provider_name      TEXT    NOT NULL,
  model_version      TEXT    NOT NULL,   -- full model identifier; fake → 'fake-provider/0'
  status             TEXT    NOT NULL CHECK (status IN ('no_proposals','proposals_present')),
  queries_json       TEXT    NOT NULL,   -- string[] — G9 LLM query log lives HERE, not audit_log
  cards_json         TEXT    NOT NULL,   -- verified EvidenceCard[]
  dispositions_json  TEXT    NOT NULL,   -- DroppedProposal[] — show-your-work (G6)
  evaluated_at       TEXT    NOT NULL,
  PRIMARY KEY (claim_key, source_revision_id)
) WITHOUT ROWID;
```
No explicit indexes beyond PK indexes exist in any migration.

### 3.2 SqlExecutor port — `src/db/client.ts`
```ts
// client.ts:13
export interface SqlStatement {
  bind(...params: unknown[]): SqlStatement;
  run(): Promise<void>;
  all<T>(): Promise<T[]>;
}
// client.ts:24
export interface SqlExecutor {
  prepare(sql: string): SqlStatement;
  batch(statements: SqlStatement[]): Promise<void>;   // all-or-nothing atomic
}
```
- **D1 adapter** `d1Executor` (`client.ts:50`): `WeakMap<SqlStatement, D1StatementLike>` recovers native statements for `db.batch(...)`. A statement from a different executor instance throws `"Statement was not produced by this executor"` (`client.ts:67`).
- **better-sqlite3 adapter** `betterSqliteExecutor` (`local-db.ts:17`): wraps sync engine in `db.transaction(...)` via `WeakMap<SqlStatement, () => void>` (`local-db.ts:38`). Test/local only — never in worker-bundled code (§5.6).
- The port is **async even though better-sqlite3 is sync** — `await` every `run()`/`all()`.
- **D1 takes no params on `run`/`all`** — always `.bind(...params)` first; `run()`/`all()` take no args. D1's `all()` `{ results }` envelope is unwrapped by the adapter (DB-2).

### 3.3 Audit-log API — `src/db/audit-log.ts`
```ts
// :6
export interface AuditEntry { actor: string; eventType: string; payload: unknown; }  // identifiers only
// :13
export interface AuditRow { id: number; ts: string; actor: string; eventType: string; payload: unknown; }
// :36 — returns a bound, UNEXECUTED statement; ts captured at CALL time, not .run() time
export function appendStatement(db: SqlExecutor, entry: AuditEntry): SqlStatement
// :48
export function makeAuditLog(db: SqlExecutor): {
  append(entry: AuditEntry): Promise<void>;   // executes immediately
  read(): Promise<AuditRow[]>;                // insertion order; one bad payload_json aborts whole read (:59 comment, :67)
}
```
`eventType` is free `TEXT` — no enum at DB layer. Payload is identifiers only (compliance invariant, `migrations/0001_init.sql:8`). Use `appendStatement` to include an audit row in an atomic `db.batch([...])`.

### 3.4 Research-packs API — `src/db/research-packs.ts`
```ts
// :12
export interface ResearchPack {
  claimKey: string; sourceRevisionId: number; pageId: number;
  sectionHeading: string; sentenceText: string; year: number;
  providerName: string; modelVersion: string;
  status: "no_proposals" | "proposals_present";
  queries: string[]; cards: EvidenceCard[]; dispositions: DroppedProposal[];
  evaluatedAt: string;
}
// :28
export type ResearchPackRead =
  | { state: "found"; pack: ResearchPack }
  | { state: "pack_unreadable" }
  | { state: "not_found" };

// :45 — async (crypto.subtle); MUST await. NFC-normalizes string fields before hashing.
export async function computeClaimKey(pageId: number, sectionHeading: string, sentenceText: string, year: number): Promise<string>
// :177 — bound, unexecuted; ON CONFLICT(claim_key, source_revision_id) DO NOTHING
export function insertPackStatement(db: SqlExecutor, pack: ResearchPack): SqlStatement
// :213 — write-once; re-delivery is silent no-op
export async function insertPackIfAbsent(db: SqlExecutor, pack: ResearchPack): Promise<void>
// :163
export async function packExists(db: SqlExecutor, claimKey: string, sourceRevisionId: number): Promise<boolean>
// :224
export async function getPack(db: SqlExecutor, claimKey: string, sourceRevisionId: number): Promise<ResearchPackRead>
// :247
export async function deletePack(db: SqlExecutor, claimKey: string, sourceRevisionId: number): Promise<void>
// :266 — joins articles on rp.source_revision_id = a.revision_id
export async function getSurfaceablePack(db: SqlExecutor, claimKey: string, pageId: number): Promise<ResearchPackRead>
```
- `computeClaimKey`: SHA-256 hex over a 4-byte big-endian length-prefixed, NFC-normalized serialization of `[String(pageId), sectionHeading.normalize("NFC"), sentenceText.normalize("NFC"), String(year)]`. Cross-runtime (`crypto.subtle`), no Node imports.
- **Write-once is intentional** (protects metered LLM spend): no upsert path. To replace a pack (e.g. model version change) → `deletePack` then re-insert.
- `getPack`/`getSurfaceablePack` use a defensive read: per-field `JSON.parse` in try/catch + G16 read-time verbatim-quote length-cap validation + status enum backstop → any failure returns `{ state: "pack_unreadable" }` (with `console.error`), never throws.
- `getSurfaceablePack` returns `{ state: "not_found" }` (NOT `pack_unreadable`) when the pack's `source_revision_id` is older than the article's current `revision_id` — the revision check is a JOIN condition. `not_found` does NOT mean "never computed".

### 3.5 Atomic commit pattern
```ts
const db = d1Executor(env.DB);
await db.batch([
  appendStatement(db, { actor: userId, eventType: "research_pack.stored", payload: { claimKey, sourceRevisionId } }),
  insertPackStatement(db, pack),
]);
```
Both statements MUST be produced by the same executor instance.

### 3.6 Migration mechanics
- `migrations_dir: "migrations"` declared in `wrangler.jsonc:44`. Production: `npx wrangler d1 migrations apply`.
- Naming: `NNNN_<slug>.sql`, zero-padded 4-digit sequential. Files sorted lexicographically; the prefix is load-bearing for application order (`readdirSync(...).sort()`, `test/helpers/db.ts:18`). Gaps safe; reuse/reversal unsafe.
- Local/test: `freshTestDb()` globs+sorts `migrations/*.sql` (`test/helpers/db.ts:18`). Workers pool: `applyD1Migrations(env.DB, env.TEST_MIGRATIONS)` in `beforeAll` (`test/workers/apply-migrations.ts:7`); migrations injected as `env.TEST_MIGRATIONS` by `vitest.workers.config.mts`.
- **Parity test** `test/db/migration.test.ts:150` (`"schema-equivalence: ordered migrations == schema.sql (identical sqlite_master DDL)"`): builds DB-A from all `migrations/*.sql` and DB-B from `schema.sql` alone, compares `sqlite_master` DDL — must match exactly.

**Adding a migration (mandatory steps):**
1. Create `migrations/NNNN_<slug>.sql` (next sequential number).
2. Append the same DDL (cumulative form) to `src/db/schema.sql` — the parity test enforces byte-identity.
3. Add a typed module `src/db/<table>.ts` following the existing pattern (ABOUTME header, `SqlExecutor` param, camelCase↔snake_case mapping, defensive JSON parsing for JSON columns).
4. Add migration tests in `test/db/migration.test.ts`: column presence, NOT NULL on PK fields, CHECK constraints, FK enforcement.

### 3.7 v1 schema additions needed (users/quota/topics)
None of these tables exist yet. Each MUST use WITHOUT ROWID with explicit `PRIMARY KEY NOT NULL` on every PK column (natural keys), be mirrored into `schema.sql`, and keep the parity test green:
- `migrations/0004_users.sql` — `users`: OAuth identity, email, preferences.
- `migrations/0005_quota.sql` — `quota_ledger` (or similar): per-user metered-API spend, FK → users.
- `migrations/0006_topics.sql` — `topics` / seed-list: user-curated article watch list.
- `migrations/0007_saved_items.sql` — `saved_items`: user-saved candidates/packs.

App and research workers **share the same D1 database** (`database_name: "wikiasofnow"`, identical `database_id`) — these migrations affect both.

---

## 4. App / route contract

### 4.1 Env / bindings access pattern (all OpenNext route handlers)
```ts
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { d1Executor } from "@/db/client";
// inside the handler body — NEVER at module scope:
const { env } = getCloudflareContext();   // lookup route.ts:30; easy-win :20; candidates :26
const db = d1Executor(env.DB);            // env.DB is the D1 binding name
```
`getCloudflareContext()` takes no request param and no React context. `next.config.ts` already calls `initOpenNextCloudflareForDev()` for local dev. Every route also exports `export const dynamic = "force-dynamic"`.

### 4.2 Types the UI consumes

```ts
// src/db/articles.ts:16 — score is a SCALAR (ScoreBreakdown.total), not the full object
export interface PersistedCandidate {
  id: number; pageId: number; sectionHeading: string; sentenceText: string;
  year: number; marker: string; score: number; explanation: string;
  detectorVersion: string; sourceRevisionId: number;
}
// src/ingest/lookup.ts:22
export interface LookupResult {
  pageId: number; title: string; revisionId: number; candidateCount: number;
  candidates: PersistedCandidate[];
  eligibility: "easy_win" | "human_only"; reasons: string[];
}
// src/ingest/easy-win-lane.ts:25-30
export interface EasyWinItem { pageId: number; title: string; revisionId: number; candidates: PersistedCandidate[]; }
export interface EasyWinLaneResult {
  items: EasyWinItem[];
  summary: {
    considered: number; surfaced: number; deferred: number;
    skipped: { pageId: number; outcome: "demoted" | "revision_drift" | "article_gone" | "fetch_unavailable" }[];
  };
}
export interface EasyWinLaneOptions { fetchFn?: FetchLike; userAgent?: string; now?: Date; maxPages?: number; fetchTimeoutMs?: number; }
// src/domain/types.ts:65
export interface EligibilityDecision { eligibility: "easy_win" | "human_only"; reasons: string[]; }
// src/domain/types.ts:38 — full ScoreBreakdown lives HERE; DB strips to scalar on INSERT (articles.ts:96)
export interface StaleCandidate {
  sentenceText: string; sectionHeading: string; year: number; marker: string;
  score: ScoreBreakdown; explanation: string; sectionIndex: number; sentenceIndex: number;
}
// src/domain/types.ts:24
export interface ScoreBreakdown { temporalRisk: number; futureTenseConfidence: number; suppression: number; total: number }
```

### 4.3 Ingest + lane entry points
```ts
// src/ingest/lookup.ts:44
export async function lookupAndPersist(db: SqlExecutor, title: string, options?: LookupOptions): Promise<LookupResult>
// src/ingest/lookup.ts:13
export interface LookupOptions { fetchFn?: FetchLike; userAgent?: string; asOfYear?: number; now?: Date; }
// src/ingest/easy-win-lane.ts:124
export async function getEasyWinLane(db: SqlExecutor, options?: EasyWinLaneOptions): Promise<EasyWinLaneResult>
```
Lane is bounded to `DEFAULT_MAX_PAGES = 25` (`easy-win-lane.ts:10`); pages beyond go to `summary.deferred`, NOT `summary.skipped`. Default `fetchTimeoutMs = 10_000`.

### 4.4 Existing routes
| Route | File | Method | Request | 200 response |
|---|---|---|---|---|
| Article lookup | `src/app/api/articles/lookup/route.ts:17` | `POST(request)` | `{ title: string }` non-empty | `LookupResult` |
| Easy-win lane | `src/app/api/easy-win/route.ts:19` | `POST()` | no body | `EasyWinLaneResult` |
| Candidates | `src/app/api/articles/[id]/candidates/route.ts:16` | `GET(_req, { params })` | `:id` positive int | `{ pageId: number; candidates: PersistedCandidate[] }` |

Error responses:
- lookup: 400 missing/empty title or non-JSON body; 404 `ArticleNotFoundError`; 503 `WikimediaUnavailableError`; 500 `{ error: "Lookup failed" }`.
- easy-win: 500 `{ error: "Easy-win lane failed" }` (per-page Wikimedia errors are caught inside `getEasyWinLane` and surface in `summary.skipped`, not as HTTP errors).
- candidates: 400 non-integer or non-positive id. **No 404** — unknown article and article-with-zero-candidates both return `{ candidates: [] }`.

`POST /api/easy-win` is POST (not GET) deliberately: the lane writes verdict + audit rows on every call (`route.ts:15-16`); GET would be cacheable/prefetchable and skip the writes. The candidates route's `params` is a **Promise** (Next.js 15): `const { id } = await params` (`candidates/route.ts:18-19`). All routes return a hand-rolled `Response` via a local `json()` helper (`application/json; charset=utf-8`) — no `NextResponse` import anywhere.

### 4.5 Adding a new route handler (the canonical 3-line pattern)
```ts
export const dynamic = "force-dynamic";   // REQUIRED — omitting it breaks static prerender
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { d1Executor } from "@/db/client";
// in handler body:
const { env } = getCloudflareContext();
const db = d1Executor(env.DB);
```
Then pass `db` to any `src/db/` or `src/ingest/` function. The `POST /api/research/:candidateId` route (§2) follows this and adds `env.RESEARCH_QUEUE`.

### 4.6 Frontend consumption — `src/app/page.tsx`
`"use client"` component. Defines **local inline** `Candidate` (`:7`) and `LookupResult` (`:17`) interfaces mirroring the API shape — NOT imported from server modules. Inline `Candidate` matches `PersistedCandidate` minus `pageId`, `detectorVersion`, `sourceRevisionId`; `score: number` (`:13`). State machine `"idle" | "loading" | "done" | "error"` (`:51`). Single fetch: `POST /api/articles/lookup` with `{ title }` (`:64`). Renders eligibility badge (green easy_win / amber human_only) + per-candidate `<li>`. `reasonLabel()` (`:29`) maps reason codes; its `dispute_template:` `startsWith` guard must precede the switch.

**Reason codes** (canonical order, `src/safelane/eligibility.ts`):
- Floor (FLOOR_ORDER, `:9,:22-26`): `metadata_unavailable` (blpProbe unknown), `non_mainspace` (namespace≠0), `blp_category` (blpProbe present), `recently_edited` (within 15-min window).
- Advisory (appended): `blp_wikitext`, `dispute_template:<TemplateName>` (sorted alphabetically).
```ts
export const GATE_VERSION = "1.0.0";                 // eligibility.ts:6
export const FRESHNESS_WINDOW_MS = 15 * 60 * 1000;   // eligibility.ts:7
export function evaluateEligibility(meta: ArticleMetadata, now: Date, _gateVersion: string): EligibilityDecision  // :16
```
`getCandidatesByPageId` orders `score DESC, id ASC` (`articles.ts:112`). `POST /api/easy-win` and `GET .../candidates` are NOT yet called from the frontend — server APIs only.

---

## 5. Build / test operational manual

### 5.1 package.json scripts — `package.json:6-21`
```
dev            next dev
build          next build
start          next start
test           vitest run                                    # Node pool
test:workers   vitest run -c vitest.workers.config.mts       # workerd pool
test:watch     vitest
test:coverage  vitest run --coverage
lint           eslint .
deploy         opennextjs-cloudflare build && opennextjs-cloudflare deploy   # app worker
deploy:research wrangler deploy -c workers/research/wrangler.jsonc           # research worker
upload         opennextjs-cloudflare build && opennextjs-cloudflare upload
preview        opennextjs-cloudflare build && opennextjs-cloudflare preview
cf-typegen     wrangler types --env-interface CloudflareEnv ./cloudflare-env.d.ts
gen:nfc-golden node scripts/gen-nfc-golden.ts
```

### 5.2 Root `wrangler.jsonc` (app/OpenNext worker)
`name: "wikiasofnow"`, `main: ".open-next/worker.js"`, `compatibility_date: "2026-06-04"`, `compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"]`. Currently bound: `DB` (D1, `migrations_dir: "migrations"`), `IMAGES`, `ASSETS`, `WORKER_SELF_REFERENCE`. **No AI, no queue binding yet.**

`workers/research/wrangler.jsonc`: `name: "wikiasofnow-research"`, `main: "index.ts"`, flags `["global_fetch_strictly_public"]` (**no nodejs_compat**). Bound: `DB` (same DB), `RESEARCH_QUEUE` producer; consumes `research` (`max_batch_size: 1`, `max_retries: 3`, `dead_letter_queue: "research-dlq"`). No AI yet.

### 5.3 Adding bindings + cf-typegen
- **AI binding (app worker):** add `"ai": { "binding": "AI" }` to root `wrangler.jsonc` → `pnpm cf-typegen` → `cloudflare-env.d.ts` gains `AI: Ai;` → access via `getCloudflareContext().env.AI`.
- **AI binding (research worker):** add `"ai": { "binding": "AI" }` to `workers/research/wrangler.jsonc`; access `env.AI` directly in `workers/research/index.ts` (it is a plain Worker). **`cf-typegen` does NOT pick this up** — research worker env is typed by its own `Env`/`ResearchWorkerEnv` interface (`index.ts:25-28`). After adding it, also update the `vitest.workers.config.mts` miniflare block if tests need it.
- **Queue producer (app worker):** §2.3-2.4.
- **Secrets:** NOT in `wrangler.jsonc`. `wrangler secret put NAME` (add `-c workers/research/wrangler.jsonc` for the research worker). Secrets arrive in `env` as `string` at runtime and are NOT in generated types.
- `cloudflare-env.d.ts` is auto-generated, eslint-ignored (`eslint.config.mjs:13`), in `tsconfig.json` types (`:26`) — **never hand-edit; re-run `pnpm cf-typegen` after any root binding change.**

### 5.4 The two vitest projects
**Node pool** — `vitest.config.ts`: `environment: "node"`, `setupFiles: ["./test/setup/pristine.ts"]`, **excludes `test/workers/**`** (`:10`), coverage `include: ["src/**/*.ts"]`, `exclude: ["src/app/**", "src/**/*.d.ts"]`. Loads `better-sqlite3` native module. `pnpm test`. For unit/detector/data-layer (`betterSqliteExecutor`)/safelane tests.

**Workerd pool** — `vitest.workers.config.mts` (**MUST be `.mts`** — `@cloudflare/vitest-pool-workers` is ESM-only; a `.ts` config bundles as CJS and fails): `wrangler.configPath: "./workers/research/wrangler.jsonc"`, `miniflare.bindings: { TEST_MIGRATIONS: migrations }` (from `readD1Migrations()`), `include: ["test/workers/**/*.test.ts"]`, `setupFiles: ["./test/workers/apply-migrations.ts"]`. Runs in Miniflare with real D1 + Queue bindings. `pnpm test:workers`. Worker tests MUST live under `test/workers/`; Node-pool tests MUST NOT.

### 5.5 Deploy
- App worker: `pnpm deploy` (builds `.open-next/`, deploys root config as `wikiasofnow`).
- Research worker: `pnpm deploy:research` (`wrangler deploy -c workers/research/wrangler.jsonc`, deploys as `wikiasofnow-research`).
- One-time before first real deploy: `wrangler queues create research` and `wrangler queues create research-dlq`.

### 5.6 ESLint import guard — `eslint.config.mjs:33-59`
Files under `src/research/**`, `src/queue/**`, `src/db/**/*.ts`, `workers/**` (except `src/db/local-db.ts`) **cannot import** `better-sqlite3`, `**/local-db`, `**/db/local-db`. Worker-bundled code uses `d1Executor` from `db/client`; `betterSqliteExecutor` is test/local-only.

### 5.7 CI pipeline — `.github/workflows/ci.yml` (in order)
1. `pnpm install --frozen-lockfile`
2. `pnpm rebuild better-sqlite3` (native rebuild for CI OS — missing this breaks Node-pool tests)
3. `pnpm exec tsc --noEmit`
4. `pnpm lint`
5. `pnpm test` (Node pool)
6. `pnpm test:workers` (workerd pool)

### 5.8 tsconfig — `tsconfig.json`
`module: esnext`, `moduleResolution: bundler`, `paths: { "@/*": ["./src/*"] }`, `types: ["./cloudflare-env.d.ts", "node"]`, include covers `**/*.ts`, `**/*.tsx`, `.next/types/**`, `.next/dev/types/**`.

### 5.9 Consolidated pitfalls by Phase (1-7)
- **Phase 1 (detection/detector):** Detection MUST be deterministic + LLM-free — `src/detector/` has zero model/network/`Date`/clock calls. Grep the dir and its import graph for `Date`, `now`, `fetch`, `random`, `async`, `await`, `Promise` before any detector PR (DET-1). Untrusted-wikitext regex must be linear-time — reject delimiter spam O(1)/position (first captured char excludes opening/closing delimiters, e.g. `[^{}|\n]`); prove with a multi-MB pathological perf test (SAFE-1). Precision gate is a regression gate on the labeled gold subset only — keep ≥3 positives AND ≥3 negatives; never delete a gold negative to pass (testing-pitfalls §9).
- **Phase 2 (DB / schema):** WITHOUT ROWID requires explicit `PRIMARY KEY NOT NULL` (composite: every PK column); plain `INTEGER PRIMARY KEY` is a rowid alias that silently replaces NULL (DB-1) — set at CREATE TABLE, can't ALTER in. Mirror every migration into `schema.sql` or parity test fails. 4-digit prefix is load-bearing for sort order.
- **Phase 3 (executor / atomic commit):** statements from one executor instance can't go into another's `batch()` (WeakMap identity, throws). D1 takes no params on `run`/`all` — `.bind()` first; `all()` `{ results }` envelope unwrapped by adapter (DB-2). FKs OFF by default in better-sqlite3 — use `freshTestDb()`/`freshTestExecutor()` (sets `foreign_keys = ON`), never raw `new Database(':memory:')` (false-pass footgun, testing-pitfalls §8). `SqlExecutor` is async — `await` everything.
- **Phase 4 (research pipeline/provider):** throw `ProviderUnavailableError` (not generic) on transport failure — only this class is caught. `modelVersion` must be the full model ID for G12. `proposedQuote` must survive NFC + zero-width-strip + whitespace-collapse normalization and be a contiguous substring; no `\n` (no cross-block); 8-300 code points on the normalized form. Raw `proposedQuote` is stored verbatim — keep it clean.
- **Phase 5 (queue transport):** `processBatch` sequential is load-bearing (G14) — don't parallelize without a global per-host throttle. Malformed messages ACK (no retry); `provider_unavailable` and other throws retry. Audit writes are codes-only (`claimKey` sanitized to `"malformed"` if not 64-char hex). `SEED_BATCH_LIMIT = 50` ≤ `MAX_BATCH_COUNT = 100` (throws at module load if violated). `enqueueResearchBatch` expects `void`-returning `sendBatch` — needs an adapter; `enqueueResearch`/`send` does not. DLQ inferred from consumer config — don't declare as a separate binding.
- **Phase 6 (workers pool / config):** `vitest.workers.config.mts` MUST be `.mts` (ESM). Workerd pool points at `workers/research/wrangler.jsonc`, not root — new research-worker bindings go there + check the miniflare block. `cf-typegen` reads ONLY root config. Research worker has no `nodejs_compat` (no Node APIs). Both workers share the same D1 DB. `pnpm rebuild better-sqlite3` required in CI. StubResearchProvider PK-poisons D1 — purge stub packs before enabling real provider.
- **Phase 7 (app/routes/UI):** `getCloudflareContext()` only inside handler body, never module scope. `export const dynamic = "force-dynamic"` required on every route calling it. Next.js 15 dynamic `params` is a Promise (`await params`). `score` is a scalar in `PersistedCandidate`. `POST /api/easy-win` is POST by design (it writes). Candidates route has no 404 (empty array for unknown/empty). Reason-code canonical order; `dispute_template:` `startsWith` guard before the switch. Routes return hand-rolled `Response` via local `json()` — no `NextResponse`.

---

## Cross-cutting gotchas (deduplicated across all five readers)

- **CC-1 — WITHOUT ROWID + NOT NULL PK.** `articles`, `eligibility_verdicts`, `research_packs` are WITHOUT ROWID; every PK column must be explicitly `NOT NULL`. Plain `INTEGER PRIMARY KEY` is a rowid alias that silently auto-assigns on NULL. Must be set at CREATE TABLE; can't ALTER in. v1 users/quota/topics/saved_items tables follow this. (DB-1; db-layer, config-test-infra)
- **CC-2 — Schema parity is mandatory.** Every new migration must be mirrored byte-identically into `src/db/schema.sql`; `test/db/migration.test.ts:150` compares `sqlite_master` DDL from both paths. 4-digit zero-padded prefix is load-bearing for `readdirSync(...).sort()` application order. (db-layer)
- **CC-3 — Executor instance identity.** Statements from `appendStatement`/`insertPackStatement` must be produced by the same `SqlExecutor` instance passed to `batch()`, or it throws `"Statement was not produced by this executor"` (WeakMap identity, both adapters). (db-layer)
- **CC-4 — D1 calling convention.** `.bind(...params)` before `run()`/`all()`; D1 takes no params on `run`/`all` (better-sqlite3 does — divergence). D1's `all()` `{ results }` envelope is unwrapped by `d1Executor` — callers never see it. The whole port is async; `await` every call. (DB-2; db-layer, config-test-infra)
- **CC-5 — better-sqlite3 banned in worker-bundled code.** ESLint `no-restricted-imports` (`eslint.config.mjs:33-59`) blocks `better-sqlite3`/`local-db` under `src/research/**`, `src/queue/**`, `src/db/**/*.ts`, `workers/**` (except `src/db/local-db.ts`). workerd has no native modules — use `d1Executor`. (queue-transport, config-test-infra)
- **CC-6 — FK enforcement OFF by default in better-sqlite3.** D1 enforces FKs. Tests must use `freshTestDb()`/`freshTestExecutor()` (issue `PRAGMA foreign_keys = ON`), never raw `new Database(':memory:')` — silent false-pass. (db-layer, config-test-infra)
- **CC-7 — StubResearchProvider PK-poisons D1.** Any stub pack committed permanently blocks real research for that `(claimKey, sourceRevisionId)` because `packStore.has()` is provider-agnostic and packs are write-once (ON CONFLICT DO NOTHING; no upsert — `deletePack` then re-insert to replace). Purge stub packs and replace `StubResearchProvider` in `makeDeps` before enabling cron/consumer with a real provider. (research-seam, queue-transport, db-layer)
- **CC-8 — `.mts` is required for the workers vitest config.** `@cloudflare/vitest-pool-workers` is ESM-only; a `.ts` config bundles as CJS and fails to load. Flagged in commit 1ba3d68. Worker *source* (`workers/research/index.ts`) stays `.ts`; the `.mts` requirement applies to the vitest config and ESM-resolved test/spec files. (queue-transport, db-layer, config-test-infra)
- **CC-9 — `cf-typegen` reads ONLY the root `wrangler.jsonc`.** Research-worker bindings (`RESEARCH_QUEUE`, future `AI`) never appear in `cloudflare-env.d.ts`; they are typed by the worker's own `ResearchWorkerEnv` (`index.ts:25-28`). `cloudflare-env.d.ts` is auto-generated, eslint-ignored, a global ambient type — never hand-edit; re-run after any root binding change. (config-test-infra)
- **CC-10 — App and research workers share one D1 database** (`wikiasofnow`, identical `database_id`). Migrations affect both. (config-test-infra)
- **CC-11 — `getCloudflareContext()` only inside handler bodies, never module scope; `dynamic = "force-dynamic"` required on every route that calls it.** Module-scope calls fail in workerd; omitting `dynamic` breaks static prerender. (app-and-ingest)
- **CC-12 — Audit log is codes-only / no PII.** Identifiers only (entry/correlation/command IDs, claimKey) — never field values, document content, or user-identifiable data beyond an actor ID. The append-only audit log is a compliance invariant (`migrations/0001_init.sql:8`, wikipedia-genai-compliance.md). Queue handler sanitizes non-hex `claimKey` to `"malformed"` before any write (G13). (db-layer, queue-transport)
- **CC-13 — NFC normalization before hashing/quote-matching.** `computeClaimKey` NFC-normalizes string fields (pre-composed vs decomposed produce different bytes); it is async (`crypto.subtle`) — await it. The verbatim check NFC-normalizes both quote and page text. Always normalize `sectionHeading`/`sentenceText` consistently. (db-layer, research-seam)
- **CC-14 — `score` is a scalar in the DB layer.** `PersistedCandidate.score: number` is `ScoreBreakdown.total`; the full `ScoreBreakdown` lives only on `StaleCandidate` and is stripped on INSERT (`articles.ts:96`). The inline frontend `Candidate` reflects `score: number`. (app-and-ingest)
- **CC-15 — `provider_unavailable` retries; malformed ACKs.** Pipeline catches only `ProviderUnavailableError` → `{ status: "provider_unavailable" }`; the consumer treats that as a throw → retry. Malformed queue messages ACK without retry. All other pipeline errors escape uncaught → consumer rethrows → retry. (research-seam, queue-transport)
- **CC-16 — Sequential batch processing is load-bearing for G14 host politeness.** Do NOT parallelize `processBatch` without first adding a global per-host fetch throttle. (queue-transport)
- **CC-17 — `global_fetch_strictly_public` on both workers** restricts `fetch()` to public IPs (anti-SSRF). Do not remove. (config-test-infra)
- **CC-18 — Detection must stay deterministic + LLM-free; untrusted-wikitext regex must be linear-time.** Compliance invariant (wikipedia-genai-compliance.md). Grep `src/detector/` import graph for clock/network/random/async before any detector PR (DET-1); prove regex with a multi-MB pathological perf test (SAFE-1). (config-test-infra)
- **CC-19 — Audit `read()` has no per-row error isolation.** One corrupt `payload_json` aborts the whole read (`audit-log.ts:67`); the `:59` comment flags that user-facing disclosure paths must add per-row try/catch. Pack reads (`getPack`/`getSurfaceablePack`) ARE defensive (per-field try/catch → `pack_unreadable`). (db-layer)
- **CC-20 — `getSurfaceablePack` revision check is a JOIN.** Returns `not_found` (not `pack_unreadable`) when the pack's `source_revision_id` is older than the article's current `revision_id`. `not_found` does NOT imply "never computed". (db-layer)

**File anchors:** research seam `src/research/{provider,pipeline,verbatim-check,verify-proposal,normalize,stub-provider}.ts`; queue `src/queue/{research-jobs,process-batch,seed}.ts` + `workers/research/index.ts`; DB `src/db/{client,audit-log,research-packs,articles,local-db}.ts` + `migrations/000{1,2,3}_*.sql` + `src/db/schema.sql`; app `src/app/api/**/route.ts`, `src/app/page.tsx`, `src/ingest/{lookup,easy-win-lane}.ts`, `src/domain/types.ts`, `src/safelane/eligibility.ts`; config `wrangler.jsonc`, `workers/research/wrangler.jsonc`, `cloudflare-env.d.ts`, `vitest.config.ts`, `vitest.workers.config.mts`, `eslint.config.mjs`, `tsconfig.json`, `package.json`, `.github/workflows/ci.yml`.