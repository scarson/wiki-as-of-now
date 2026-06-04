# Phase 1 Review — Round 1: CORRECTNESS

**Branch:** `claude/wikiasofnow-foundation-detector-o2yCO`
**Date:** 2026-06-04
**Reviewer lens:** Cross-file correctness; seams, integration points, latent bugs.
**Pre-conditions verified:** `pnpm test` — 8/8 PASS; `pnpm exec tsc --noEmit` — clean; `pnpm lint` — clean.

---

## Findings

### IMPORTANT — `wrangler.jsonc` line 39: `migrations_dir` is at the top level, not inside `d1_databases`

**File:** `wrangler.jsonc:39`

```jsonc
"migrations_dir": "migrations",   // ← top-level key
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "wikiasofnow",
    "database_id": "00000000-0000-0000-0000-000000000000"
    // ← migrations_dir should go HERE
  }
]
```

**Root cause:** According to the wrangler config JSON Schema (`node_modules/wrangler/config-schema.json`), `migrations_dir` is defined only inside each `d1_databases[n]` entry — not at the top level. The top-level config object has `additionalProperties: false`, so the top-level `"migrations_dir"` key is **silently ignored** by wrangler.

**Effect today:** `wrangler d1 migrations apply` still works because the D1 implementation falls back to the default path `"./migrations"` when `migrations_dir` is absent from the database entry — which happens to match the repo layout. The bug is invisible in normal use.

**Risk:** If the migrations directory is ever moved (e.g., to `migrations/d1/`), updating `wrangler.jsonc` at the top level will have no effect, causing silent use of a stale path. The fix is a one-line move.

**Fix:**
```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "wikiasofnow",
    "database_id": "00000000-0000-0000-0000-000000000000",
    "migrations_dir": "migrations"
  }
]
// Remove the top-level "migrations_dir" key entirely.
```

---

### MINOR — `AuditEntry.payload: unknown` admits non-serializable values with no type guard

**File:** `src/db/audit-log.ts:9` (type definition), `src/db/audit-log.ts:38` (usage)

`JSON.stringify(entry.payload)` is called unconditionally. Three edge cases:

| Payload value | `JSON.stringify` result | Consequence |
|---|---|---|
| `undefined` | `undefined` (not a string) | Inserts `NULL` → `NOT NULL` constraint failure throws |
| circular object | throws `TypeError` | `append()` throws before the INSERT |
| value with `Function` fields | silently strips them | Stored JSON loses data without error |

**Current callers are safe:** `research-jobs.ts` passes `{ candidateId: number }` and the test helpers pass plain objects. No current path hits these edge cases.

**Risk:** A future caller that passes `undefined` as payload (valid from TypeScript's perspective given `unknown`) will get a runtime crash from the DB, not a clear "bad payload" error. The type provides no protection.

**Suggested fix (optional at this milestone):** Narrow `payload: unknown` to `payload: Record<string, unknown> | readonly unknown[]` in `AuditEntry`, or add a `JSON.stringify` guard with a try/catch and a descriptive error message in `append()`. This is not blocking since current callers are safe, but worth tracking before the interface is widened to other callers.

---

### OBSERVATION — `src/db/client.ts`: sync/async seam is documented but the full blast radius is worth noting explicitly

**File:** `src/db/client.ts:20-28`, `src/db/audit-log.ts:51-52`

The `SqlStatement.all()` call in `audit-log.ts:52` is used synchronously (`const rows = db.prepare(...).all() as RawAuditRow[]`). D1's `Statement.all()` returns `Promise<D1Result>`, not an array. The existing comment in `client.ts` captures this correctly. No action required — the comment is accurate and the async adapter is deferred by design.

**Noting for completeness:** when the D1 adapter is added, `read()` in `audit-log.ts` will need to become `async`, which will cascade to all call sites. The seam is clean and the risk is documented.

---

### OBSERVATION — `stale_candidates` has no `created_at` column and no explicit indexes

**File:** `src/db/schema.sql` / `migrations/0001_init.sql`

`stale_candidates` tracks no insertion timestamp. The audit log can indirectly give a time bound, but querying "which candidates were found in the last run?" requires a join or a secondary signal. No explicit index exists on `stale_candidates.page_id` (only the implicit PK index on `id`).

Neither is a correctness bug at this milestone. Both are plausible intentional deferments for the skeleton phase. Recording for the next design pass.

---

## Clean items (explicitly confirmed)

| Item | Status |
|---|---|
| `schema.sql` byte-identical to `migrations/0001_init.sql` | CLEAN — `diff` returns 0 |
| `makeAuditLog` snake_case↔camelCase mapping (`event_type` → `eventType`, `payload_json` → parsed) | CLEAN — round-trip verified with `null`, arrays, nested objects, primitives |
| `ORDER BY id` insertion-order guarantee with `AUTOINCREMENT` | CLEAN — AUTOINCREMENT guarantees strictly increasing IDs; no deletions possible on append-only table |
| `handleResearchMessage` idempotency ordering (check → research → store.set → audit.append) | CLEAN — ordering is correct; the "audit lost if append throws after store.set" scenario is explicitly documented in-code |
| `AuditEntry` type seam consumed by `research-jobs.ts` | CLEAN — structural match confirmed |
| `ResearchDeps.provider` vs `ResearchProvider` interface | CLEAN — structurally identical; `StubResearchProvider` satisfies both |
| `Map<number, unknown>` satisfies `ResearchResultStore` | CLEAN — `has`/`get`/`set` all present |
| `SqlExecutor` structural duck-typing against `better-sqlite3` | CLEAN — `prepare()` / `run()` / `all()` all present |
| `openLocalDb` FK pragma | CLEAN — `PRAGMA foreign_keys = ON` matches D1's default enforcement |
| `cloudflare-env.d.ts` exists and declares `DB: D1Database` | CLEAN — generated, consistent with wrangler binding name |
| `vitest.config.ts` node environment | CLEAN — required for `better-sqlite3` native module |
| `tsconfig.json` strict + noEmit | CLEAN — passes with zero errors |
| `eslint.config.mjs` unused-var rule | CLEAN — errors on unused vars, `_`-prefixed exceptions correct |
| AUTOINCREMENT on `audit_log.id` and `stale_candidates.id` | CLEAN — appropriate for append-only and detection-output tables |
| `articles.page_id` as non-autoincrement PK | CLEAN — externally-assigned Wikipedia page ID, correct |
| Test coverage (8 tests across 5 files) | CLEAN — all pass, no spurious node_modules tests leaked through |

---

## Overall Verdict

**ISSUES-FOUND**

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| IMPORTANT | 1 (wrangler.jsonc `migrations_dir` misplaced — works today by coincidence of default) |
| MINOR | 1 (`AuditEntry.payload: unknown` admits non-serializable values, no current caller affected) |
| OBSERVATION | 2 (sync/async seam already documented; `stale_candidates` missing timestamp + indexes) |

The foundation is structurally sound. The one IMPORTANT issue is a configuration bug that is invisible in normal operation (the default path matches the intended path), but will silently do the wrong thing if the migrations directory is ever moved without knowing to look in the right place in `wrangler.jsonc`. It should be fixed before the branch merges.
