# Phase 1 Review — Round 3: Test Rigor

**Branch:** `claude/wikiasofnow-foundation-detector-o2yCO`
**Reviewer lens:** Test rigor — real vs. mocked behavior, assertion strength, error path coverage, determinism, pristine output, test pollution
**Test runs:** 3 (deterministic — 8 tests, 5 files, all pass, each run ~430-495ms)

---

## Verdict: GAPS-FOUND

2 IMPORTANT, 4 MINOR, 3 OBSERVATIONS. No CRITICAL findings. Tests are structurally sound — correct use of real in-memory SQLite, appropriate fakes at I/O boundaries, deterministic output — but several coverage gaps exist at the assertion and error-path level.

---

## Infrastructure Verification

**Real vs. mocked behavior confirmed correct:**

- `test/helpers/db.ts`: `freshTestDb()` opens a genuine `better-sqlite3` `:memory:` database, applies the real migration SQL, and enables `foreign_keys = ON`. This is not a stub — it exercises the real schema. Each test call creates a fully isolated DB instance.
- `test/db/audit-log.test.ts`, `test/db/migration.test.ts`: Use real DB (no stubs). Valid approach.
- `test/queue/research-jobs.test.ts`: Uses `vi.fn()` for `provider` and a real `Map` for `store`. The `audit` object is a thin inline recorder. This is the correct boundary: `provider` and the real DB are external I/O, faking them at their structural interface is not "testing the mock" — the test exercises the real handler logic and idempotency gate. Appropriate.
- `test/research/provider.test.ts`: Exercises the real `StubResearchProvider` class. No mocking.

**Test isolation confirmed:** Each DB test calls `freshTestDb()` independently; SQLite `:memory:` creates a fresh DB per connection. No shared mutable state between tests.

**Test output confirmed pristine:** Three consecutive runs show no stray `console.error`, no unhandled rejection warnings, no deprecation notices. Output is clean.

**Determinism confirmed:** 3 runs × 8 tests = 24 consistent passes. No flake observed. The `new Date().toISOString()` usage in the audit-log source is validated only by a format regex (not a frozen clock), which avoids time-sensitivity flake entirely.

---

## Findings

### IMPORTANT-1 — `migration.test.ts`: `stale_candidates` schema entirely untested

**File:** `test/db/migration.test.ts`

The migration test verifies that `audit_log` has its expected 5 columns. `stale_candidates` — the central table for the stale-claim detector — has **no column assertions at all**. The schema has 9 columns with non-trivial types (`REAL`, `INTEGER`, `TEXT`), `NOT NULL` constraints on all of them, and a foreign-key relationship to `articles`. None of this is tested.

Specifically unverified:
- `stale_candidates` column names (none tested)
- FK `stale_candidates.page_id REFERENCES articles(page_id)` — not tested. The FK is enforced in the real DB (verified manually: insert with nonexistent `page_id` throws `FOREIGN KEY constraint failed`), but regression is undetected.
- `NOT NULL` constraints on `stale_candidates` columns — not tested.

**Why it matters:** The FK and NOT NULL constraints are behavioral invariants that protect data integrity. If a migration edit accidentally drops a `NOT NULL` or the FK, no test would fail.

**Fix:** Add a test case:
```typescript
it("stale_candidates has correct shape with FK to articles", () => {
  const db = freshTestDb();
  const cols = db.prepare<[], { name: string }>("PRAGMA table_info(stale_candidates)")
    .all().map(r => r.name);
  expect(cols).toEqual(expect.arrayContaining([
    "id", "page_id", "section_heading", "sentence_text", "year",
    "marker", "score", "explanation", "detector_version", "source_revision_id"
  ]));
  // FK enforced: insert with nonexistent page_id must throw
  expect(() =>
    db.prepare(`INSERT INTO stale_candidates (page_id, section_heading, sentence_text, year, marker, score, explanation, detector_version, source_revision_id)
                VALUES (999, 'sec', 'txt', 2020, 'm', 0.5, 'exp', 'v1', 1)`).run()
  ).toThrow(/FOREIGN KEY constraint failed/);
});
```

---

### IMPORTANT-2 — `research-jobs.test.ts`: Provider rejection path untested

**File:** `test/queue/research-jobs.test.ts`

The queue consumer test covers the happy path (first delivery: provider called, result stored, audit appended) and the idempotent re-delivery path (second delivery: provider skipped). The **error path — `provider.research` rejects** — is not tested.

The retry semantics of `handleResearchMessage` are a behavioral contract: if the provider fails, the result must NOT be stored (so re-delivery retries the provider). The current code is correct (store.set is after await provider.research). But this invariant is not pinned by a test.

**Why it matters:** A future refactor that moves `store.set` before `await provider.research` (e.g., optimistic write) would break retry semantics and pass all tests.

**Fix:** Add a test case:
```typescript
it("does not store or log when provider throws, leaving the message retryable", async () => {
  const provider = { research: vi.fn().mockRejectedValue(new Error("provider down")) };
  const appended: AuditEntry[] = [];
  const audit = { append: (e: AuditEntry) => { appended.push(e); } };
  const store = new Map<number, unknown>();
  const msg = { candidateId: 7, claim: { claimText: "x", sectionHeading: "S", year: 2017 } };
  await expect(handleResearchMessage(msg, { provider, audit, store })).rejects.toThrow("provider down");
  expect(store.has(7)).toBe(false);             // not stored — retryable
  expect(appended).toHaveLength(0);             // no audit entry
  // Re-delivery retries the provider (idempotency gate not triggered)
  provider.research.mockResolvedValueOnce({ providerName: "stub", candidates: [] });
  await handleResearchMessage(msg, { provider, audit, store });
  expect(provider.research).toHaveBeenCalledTimes(2); // retried
});
```

---

### MINOR-1 — `audit-log.test.ts`: Timestamp regex weaker than the UTC claim

**File:** `test/db/audit-log.test.ts`, line 15

The test uses:
```typescript
expect(rows[0].ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO 8601 UTC
```

The comment says "ISO 8601 UTC" but the regex does not enforce the `Z` suffix (UTC zone designator). The pattern would also match `2024-01-01T10:30:00+05:30` (a local-timezone timestamp) or `2024-01-01T10:30:00` (no zone at all).

`new Date().toISOString()` always produces a `Z`-terminated string, so the current code is correct. But the test would not catch a regression to a non-UTC timestamp source (e.g., a library using local time).

**Fix:** Tighten the regex to explicitly require the UTC `Z` suffix and milliseconds (which `toISOString()` always emits):
```typescript
expect(rows[0].ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
```

---

### MINOR-2 — `audit-log.test.ts`: Second row payload and actor fields unverified

**File:** `test/db/audit-log.test.ts`, lines 8-16

The insertion-order test appends two entries. `rows[0].payload` is asserted. `rows[1].payload` (`{ candidateId: 7 }`) is never verified. Neither row's `actor` field is checked. The `eventType` array is verified for both rows, so insertion-order is confirmed, but the payload round-trip is only half-proven.

This is low severity because the payload serialization/deserialization logic is the same for both rows, but the gap means a row with a silently-mangled second payload would pass.

**Fix:** Add assertions for `rows[1].payload`, and optionally for `rows[0].actor` / `rows[1].actor`:
```typescript
expect(rows[1].payload).toEqual({ candidateId: 7 });
expect(rows[0].actor).toBe("system");
expect(rows[1].actor).toBe("u1");
```

---

### MINOR-3 — `research-jobs.test.ts`: Audit entry payload not verified

**File:** `test/queue/research-jobs.test.ts`, line 17

The test checks:
```typescript
expect(appended.filter(e => e.eventType === "research.completed").length).toBe(1);
```

It does not verify the payload content. The compliance requirement in the source code comment says the payload must contain only `{ candidateId: msg.candidateId }` (identifiers only, never result content or PII). A regression where the full `ResearchResult` were logged in the payload would pass this test.

**Fix:**
```typescript
const completionEntry = appended.find(e => e.eventType === "research.completed");
expect(completionEntry?.payload).toEqual({ candidateId: 7 });
```

---

### MINOR-4 — `migration.test.ts`: `articles` table column shape untested

**File:** `test/db/migration.test.ts`

The migration creates an `articles` table with columns `page_id`, `title`, `revision_id`, `fetched_at`. None of these are verified by the migration tests (only `audit_log` columns are checked).

Additionally: `articles.page_id` is declared as `INTEGER PRIMARY KEY` without an explicit `NOT NULL`. In SQLite, this means inserting `NULL` for `page_id` causes SQLite to auto-assign a fresh rowid — the row is created with no Wikipedia page ID, which is a silent logic error. This is a schema design gap (the column should be `NOT NULL`) and the migration test does not catch it because it only checks column names, not constraints.

Note: this is a schema correctness issue layered onto the testing gap. Both deserve attention together.

**Fix for test coverage:** Add a case verifying `articles` column names. For the schema gap, the migration should add `NOT NULL` to `page_id` (or restructure to avoid the rowid alias behavior). The schema fix is out of scope for a test-rigor review but is noted here for the implementer.

---

## Observations

**OBS-1 — `enqueueResearch` explicitly skipped:** `src/queue/research-jobs.ts` exports `enqueueResearch` which is not tested. The source code comment says "wiring to a live queue is a deploy-time concern." This is a correct and honest omission for Phase 1 — noting for completeness, not a gap.

**OBS-2 — Mutation surface guard is minimal but adequate:** The `exposes no update or delete method` test checks only `update` and `delete`. Other mutation verbs (`truncate`, `clear`, `upsert`) are not checked. Given the interface returns an object with exactly two methods (`append` and `read`), the risk of an accidental mutation method is low. The test is proportional for Phase 1.

**OBS-3 — SQLite type coercion unguarded:** SQLite accepts a string `'not-a-number'` into a `REAL` column without error (type affinity coercion). The `stale_candidates.score REAL NOT NULL` column would accept `'invalid'` silently. This is a D1/SQLite-specific gotcha that is not currently tested. Noting here as the stale-detector logic will depend on `score` being numeric. Recommend adding a type-validation layer in the insertion code path; testing that layer is preferable to testing SQLite's own behavior.

---

## Summary Table

| ID | Severity | File | Short description |
|----|----------|------|-------------------|
| 1 | IMPORTANT | `test/db/migration.test.ts` | `stale_candidates` schema (columns, FK, NOT NULL) entirely untested |
| 2 | IMPORTANT | `test/queue/research-jobs.test.ts` | Provider rejection path (retry semantics) untested |
| 3 | MINOR | `test/db/audit-log.test.ts:15` | Timestamp regex doesn't enforce UTC `Z` suffix |
| 4 | MINOR | `test/db/audit-log.test.ts:8-16` | Second row payload and both actor fields unverified |
| 5 | MINOR | `test/queue/research-jobs.test.ts:17` | Audit entry payload content not verified |
| 6 | MINOR | `test/db/migration.test.ts` | `articles` column shape untested; `page_id NOT NULL` gap undetected |

---

## Determinism

`pnpm test` ran 3 times. Results: 8/8 passed, 0 skipped, 0 flaky, identical timing profile (~430–495ms). Suite is deterministic.
