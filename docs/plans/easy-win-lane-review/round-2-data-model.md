# Round 2 — Adversarial design review: data model & migration correctness

**Lens:** data model & migration correctness for the easy-win lane v1 (`eligibility_verdicts` table + migration-discipline refactor).
**Reviewed:** `docs/design/2026-06-06-easy-win-lane-design.md` (§2, §3, §8, open-Q #1), `src/db/schema.sql`, `migrations/0001_init.sql`, `src/db/articles.ts`, `src/db/client.ts`, `test/helpers/db.ts`, `test/db/migration.test.ts`, `src/ingest/lookup.ts`, `src/safelane/eligibility.ts`, `wrangler.jsonc`, pitfalls DB-1/DB-2, testing-pitfalls §8.
**Date:** 2026-06-06. **Reviewer stance:** adversarial — findings are problems; "What is sound" at the end records what survives.

Severity scale (matching `implementation-pitfalls.md` Appendix B): CRITICAL (data loss / security), HIGH (correctness bug under predictable conditions), MEDIUM (correctness bug under edge cases), LOW (cleanliness / clarity).

---

## Empirical verification performed (don't re-derive)

I ran the proposed DDL on `better-sqlite3` (the same engine tests use) with FKs ON. Confirmed:

- `WITHOUT ROWID` + composite PK `(page_id, revision_id, gate_version)` **rejects NULL on every component** — `NOT NULL constraint failed: eligibility_verdicts.<col>` for each of page_id / revision_id / gate_version. DB-1 is satisfied for the whole composite key, not just the leading column.
- Duplicate composite key → `UNIQUE constraint failed` (PK is the real key, as intended).
- `ON CONFLICT(page_id,revision_id,gate_version) DO UPDATE SET …` upserts correctly (verdict + reasons_json overwritten in place).
- FK to a missing `articles.page_id` → `FOREIGN KEY constraint failed` (FK to a `WITHOUT ROWID` parent PK works normally, as DB-1 promises).

So the **table shape itself is correct**. The findings below are about the surrounding discipline, the upsert/history semantics, and one false claim in the design's own migration section.

---

## FINDING 1 — [HIGH] The "0001 byte-identical to schema.sql" invariant the design proposes to refactor **does not exist in code**; nothing tests `schema.sql` at all

**Issue.** §2's migration section and open-Q #1 are premised on: "today `migrations/0001_init.sql` is byte-identical to `src/db/schema.sql`, and `freshTestDb()` applies only `0001`." The second clause is true; the first is **only a comment**, enforced by nothing.

Evidence:
- `freshTestDb()` (`test/helpers/db.ts:17`) reads `migrations/0001_init.sql`. It never reads `src/db/schema.sql`.
- `grep` across `test/` for `schema.sql`: **zero** references. No test asserts byte-equality (or any equality) between the two files. The only mention of "byte-identical" anywhere is the comment at the top of both SQL files.
- The two files happen to be identical on disk today (`diff -q` confirms), but that is maintained by hand, not by CI.

**Why it matters.** The design treats "byte-identical to 0001" as a *load-bearing invariant the refactor must carefully migrate to "cumulative; equals the ordered migrations."* But there is no invariant to migrate — there is an **untested, hand-maintained doc copy**. This changes the refactor's risk profile two ways:

1. The refactor is *lower-stakes than the design implies* on the "don't break the invariant" axis (there's no test to break), but
2. it is *higher-stakes on a hidden axis*: `src/db/schema.sql` is **dead documentation** that can silently drift from the real migrations and no test will catch it. If the plan makes `schema.sql` "cumulative = concatenation of all migrations" but still doesn't test that equality, the lane ships a second untested copy that a future reader will trust. Testing-pitfalls §8 ("Schema under test is the real migration") is satisfied *only because* `freshTestDb()` reads the migration, not `schema.sql` — the design must preserve that, and should not accidentally point `freshTestDb()` at `schema.sql` in the refactor.

**Recommended fix.**
- The plan MUST state explicitly that `freshTestDb()` keeps applying **the migration files** (now `0001` + `0002`, in order), never `schema.sql`. `schema.sql` stays a readable convenience copy.
- Add a test that **proves** the `schema.sql`↔migrations relationship the design newly asserts ("cumulative; equals the ordered migrations"): read all `migrations/*.sql` in lexical order, concatenate, and assert equality (modulo a defined normalization — see Finding 2) against `src/db/schema.sql`. Without this, the new "cumulative" claim is exactly as unenforced as the old "byte-identical" one, and the doc comment becomes a lie the first time someone edits one file and not the other.
- Update the comment in both files to describe the *real, tested* relationship, not an aspirational one.

---

## FINDING 2 — [MEDIUM] "Cumulative schema.sql = concatenation of ordered migrations" is underspecified and brittle as a literal byte-concatenation

**Issue.** The design's proposed shape is "make `src/db/schema.sql` the cumulative canonical schema (= concatenation of all migrations)." Taken literally, byte-concatenation of migration files is fragile and will fight you:

- Each migration file currently starts with its own 2-line ABOUTME/header comment (`-- WikiAsOfNow initial schema…`). Concatenating files verbatim interleaves N header blocks into `schema.sql`, and `0002`'s header will reference "initial schema" wording that's wrong for a cumulative file. So a literal concat is *not* what you want; you want a normalized concat (strip per-file headers, or define a canonical join).
- Future migrations are frequently **not** pure `CREATE TABLE` — they include `ALTER TABLE ADD COLUMN`, `CREATE INDEX`, data backfills, `DROP`. A cumulative *schema* (the end-state DDL) is **not** the concatenation of migration *operations* once an `ALTER` enters the picture: concatenating `CREATE TABLE foo(...)` + `ALTER TABLE foo ADD COLUMN bar` does not equal the single `CREATE TABLE foo(..., bar)` you'd want a readable schema to show. The "concatenation" framing only works as long as every migration is additive `CREATE TABLE`, which is precisely the property you can't guarantee going forward.

**Why it matters.** If the plan codifies "schema.sql = literal concat" and then tests that equality (Finding 1's fix), the first `ALTER`-bearing migration breaks the test and forces an awkward choice: hand-maintain `schema.sql` as a true end-state (diverging from concat) or pollute it with ALTERs. Either way the "single source of truth" story the design wants collapses.

**Recommended fix.** Decide *now* which of two coherent models you want, and write it into the plan (don't leave it as "concatenation"):

- **(A) Migrations are the only source of truth; `schema.sql` is a generated, tested artifact.** Keep `schema.sql` as the human-readable *end-state* schema, and enforce it with a test that **applies the ordered migrations to a scratch DB and compares the resulting `sqlite_master` DDL** against applying `schema.sql` to a second scratch DB — i.e. assert the two produce the *same schema objects*, not the same bytes. This survives ALTERs (it compares end states, not text) and is the faithful version of "cumulative." This is the recommended option.
- **(B) Drop `schema.sql` entirely.** It exists only as a readability convenience; `migrations/` already is the source of truth and is what `freshTestDb()` runs. If no test and no code reads `schema.sql` (today: none do), YAGNI says delete it rather than carry a second copy that can drift. This is the smallest change and removes the drift surface entirely.

Either is defensible; "concatenation" is not, because it silently assumes additive-only migrations forever. Flag this as a decision for Sam (it's the substance behind open-Q #1).

---

## FINDING 3 — [MEDIUM] gate_version bump leaves orphaned old verdict rows — design calls it "history kept" but specifies no bound, no reader, and no audit-log relationship

**Issue.** §2 says a gate-version bump "adds a row (history kept)" and the Stage-1 query (§4) filters to `gate_version = current GATE_VERSION`. So after a bump from `1.0.0`→`1.1.0`, every page's old `1.0.0` verdict row becomes **permanently unreachable by the lane** but stays in the table. The design frames this as intentional history, but:

1. **No reader.** Nothing in the design reads non-current `gate_version` rows. The lane filters them out; there's no history/audit query over `eligibility_verdicts`. The audit-log (`audit_log`) is the stated immutable trail (§3: "audit = the immutable trail; the verdict table = the queryable latest-state-per-snapshot"). So the "history" in `eligibility_verdicts` is *write-only* — it is retained but never read. That's not history, it's **unbounded dead rows**.
2. **Unbounded growth, two multipliers.** Rows accumulate on *both* the `revision_id` axis (every distinct revision ever looked up) **and** the `gate_version` axis (every gate version ever shipped). The §4 self-heal path (Stage 2 "refresh the persisted verdict") only ever upserts the *current* `(page, live-revision, current-gate)` row — it never deletes superseded revision or gate-version rows. For a single-user v1 this is small, but the design explicitly claims a "cheap pre-filter" and an "auditable history"; the history claim is unbacked and the growth is genuinely unbounded with no stated retention or pruning.
3. **Tension with the stated division of responsibility.** The design says the audit log is the history and the verdict table is "latest-state-per-snapshot." But the table is keyed `(page, revision, gate_version)` — that's *per-snapshot-per-gate-version history*, not "latest state." The key shape and the prose disagree about what the table is for.

**Why it matters.** "History kept" reads as a feature but is actually an unowned retention policy. Either the rows are history (then something must read them and growth must be bounded/owned), or they're not (then the key shouldn't retain per-gate-version rows the lane can't use). Right now it's the worst of both: retained, unread, unbounded, and justified by a claim (auditable history) that the design elsewhere assigns to a *different* table.

**Recommended fix.** Pick one and write it down:
- **If the verdict table is a pre-filter cache (recommended, matches §10's "pre-filter + audit record" and the advisory framing):** then on a gate-version bump or revision change, the stale rows have no consumer — say so, and decide retention explicitly. Simplest: keep the composite key (you still need per-revision/per-gate rows transiently during a bump rollout so Stage 1 doesn't go blind mid-deploy), but add a one-line note that pruning superseded rows is a known deferred concern, and ensure the §4 self-heal path is the *only* growth on the live axis. Optionally narrow Stage-1's exposure by documenting that only `(current revision, current gate)` rows are ever authoritative-as-pre-filter.
- **If you genuinely want auditable verdict history:** then specify the reader and the bound (a retention window or a "keep last K gate-versions" prune), and reconcile with the audit-log: don't claim history in two places with no query over one of them.
- **Minimum for v1:** add open-Q #3-style explicitness — state that old `gate_version` / old `revision_id` rows are *retained, unread, unpruned in v1*, that growth is bounded in practice only by single-user volume, and that pruning is deferred. An unowned retention policy that's *named* is a decision; unnamed it's a latent bug (mirrors DET-2's "documented gap vs latent bug" lesson).

---

## FINDING 4 — [MEDIUM] `reasons_json` as a TEXT JSON blob holds compliance-load-bearing data (the exclusion/demotion reason codes) — DB-4-style concern: app-critical logic in JSON

**Issue.** `reasons_json TEXT NOT NULL` stores "a JSON array of canonical reason codes." These codes are not decorative — they are the **compliance-relevant explanation of why a page is `human_only`** (`blp_category`, `non_mainspace`, `recently_edited`, `metadata_unavailable`, `blp_wikitext`, `dispute_template:*`; see `src/safelane/eligibility.ts`). The design's own Stage-1 pre-filter and Stage-2 self-heal logic, and the G13 audit story, depend on these codes being correct and queryable.

Storing them as an opaque TEXT blob means:
- **No DB-level validation.** A malformed or empty-but-non-`[]` blob (e.g. `""`, `"null"`, `"{}"`, a truncated write) satisfies `NOT NULL` and the CHECK-less TEXT column. The `eligibility` column has a CHECK constraint (`IN ('easy_win','human_only')`); `reasons_json` has none, yet there's an invariant the schema doesn't express: **`eligibility='human_only'` ⟺ `reasons_json` is a non-empty array**, and **`eligibility='easy_win'` ⟺ `reasons_json = '[]'`** (from `evaluateEligibility`: `eligibility = ordered.length === 0 ? 'easy_win' : 'human_only'`). Nothing enforces that coupling; a bug could persist `human_only` with `[]` or `easy_win` with reasons and the DB would accept it.
- **No queryability.** If any future lane logic or audit query needs "all pages excluded for `blp_category`," it must `json_each`/`LIKE` over the blob. Fine if never needed; a smell if the codes are the product's compliance evidence.

This is the DB-4 discipline the prompt flags ("app-critical logic in JSON?"). Note: DB-4 is referenced in the review prompt but **does not yet exist** in `implementation-pitfalls.md` (current entries are DB-1, DB-2 only) — so there's no canonical fix to point at; treat this as the finding that may *establish* DB-4.

**Why it matters.** The reason codes are the human-readable justification a BLP page was kept out of the lane — exactly the kind of compliance artifact (G13) that must be trustworthy. A JSON blob with no schema-level invariant is the cheapest place for a silent corruption to hide, and it's load-bearing for the one guardrail this whole slice exists to protect (the BLP floor).

**Recommended fix (graded — pick per appetite, but at minimum the first):**
- **Minimum:** in `upsertVerdict`, validate the coupling in application code before binding — assert `eligibility==='easy_win'` ⟺ `reasons.length===0`, and that `reasons` is a string array — and serialize canonically (`JSON.stringify(reasons)` with a stable order; the gate already emits a canonical order). Add a DB-layer test that round-trips and that a malformed/empty blob is rejected at the boundary. This keeps the blob but makes the *writer* the guard (defense-in-depth, not a DRY violation per CLAUDE.md).
- **Stronger (recommended if the codes are ever queried):** mirror the audit-payload discipline — keep `reasons_json` for the full ordered list (it mirrors the audit payload, §2/§3), but if Stage-1 or any query ever needs to filter on a specific reason, don't reach into JSON; that's the signal to promote the queried dimension to a typed column or a child table. For v1, document that `reasons_json` is **display/audit-only, never queried** — that documented contract is what keeps the blob acceptable (same logic as audit_log's `payload_json`, which is also a blob but explicitly identifiers-only and not queried).
- Consider whether `reasons_json` could carry content/PII. It can't today (codes only, like the audit payload), but the column comment should say "canonical reason codes only — never field values/content," matching `audit_log.payload_json`'s comment, so a future writer doesn't stuff a snippet in.

---

## FINDING 5 — [HIGH] FK insert ordering: `upsertVerdict` MUST follow `upsertArticle`, and the §3 write-path snippet places it *after* the article upsert but the prose doesn't state the ordering as a hard requirement — plus the audit-vs-verdict atomicity gap

**Issue.** `eligibility_verdicts.page_id REFERENCES articles(page_id)`, and FKs are enforced (D1 default; `freshTestExecutor` sets the pragma; there's already a regression test that the `stale_candidates→articles` FK fires, and `articles.test.ts` proves candidate-insert-before-article is rejected). So a verdict insert for a `page_id` not yet in `articles` **throws** `FOREIGN KEY constraint failed`. The ordering is correct in the §3 snippet (verdict upsert is described as added "after the existing `article.eligibility` audit append," which is after `upsertArticle`), but:

1. **The ordering is load-bearing and should be stated as a requirement, not just implied by snippet position.** §8 lists "FK to `articles`" as a test, which is good, but the write-path section should call out: verdict upsert MUST come after `upsertArticle` in `lookupAndPersist`, for the same FK-ordering reason `insertCandidates` already obeys. A future refactor reordering these (or extracting verdict-write into a path that doesn't guarantee the article exists) reintroduces the exact failure `articles.test.ts:114` already guards for candidates.
2. **Non-atomic multi-statement write (DB-2 carry-over).** `lookupAndPersist` is already a sequence of independent statements (upsertArticle → insertCandidates(delete+inserts) → audit append → audit append → verdict upsert), with **no transaction** — the SqlExecutor port has no batch/transaction primitive (DB-2 documents this deliberately). Adding `upsertVerdict` extends this non-atomic chain. Consequences to make explicit:
   - If `upsertVerdict` throws (e.g. transient), the article + candidates + **two audit events** are already committed, but no verdict row exists. The audit log will say `article.eligibility` happened with a verdict, while the verdict table has no row. On re-run, `upsertArticle`/`insertCandidates`/`upsertVerdict` are idempotent (upsert / full-replace / upsert), so re-running heals the verdict — **but a duplicate pair of audit events is appended** (audit is append-only, not idempotent). That's pre-existing behavior, but the verdict addition widens the window where audit and verdict disagree.
   - The design (§7) *adds* a new audit event `article.eligibility.revalidated` on the lane path. Same non-atomicity applies there: verdict refresh + audit demotion are two statements; a crash between them leaves the audit log and verdict table inconsistent.
3. **Idempotency interaction with the composite key under revision drift.** On the *lookup* path, `upsertVerdict` keys on `(pageId, fetched.revisionId, GATE_VERSION)`. `upsertArticle` updates `articles.revision_id` to the new revision in place. So after a revision bump, the *article* row points at the new revision, but the *old* verdict row (old revision) still exists, and a *new* verdict row (new revision) is upserted. Stage-1's join is `eligibility_verdicts.revision_id = articles.revision_id` — so it correctly picks the new-revision verdict and ignores the orphaned old-revision verdict. Good — but this is the same orphaned-row accumulation as Finding 3, now on the revision axis, and it confirms the join is the only thing keeping Stage-1 correct. Worth a test: after two lookups at different revisions, Stage-1 sees exactly the current-revision verdict.

**Why it matters.** FK ordering is a predictable, already-encountered failure class in this codebase (two existing tests guard it for candidates). The atomicity gap means audit/verdict divergence is possible on partial failure — relevant because G13 treats the audit log as foundational; a verdict-table row that the audit log claims exists (or vice versa) erodes the "audit is the trail" guarantee.

**Recommended fix.**
- State in the write-path section: "`upsertVerdict` MUST be called after `upsertArticle` (FK ordering, as `insertCandidates` already requires)." Add the DB-layer test §8 already lists, and add the revision-drift Stage-1 test above.
- Decide the atomicity posture explicitly. DB-2 already says: if atomicity becomes required, add D1 `batch()` behind the port — don't special-case better-sqlite3 transactions. For v1, if you accept non-atomicity, **say so and rely on idempotent re-run** (matching the `insertCandidates` precedent comment), but note the audit-append non-idempotency: a partial failure that re-runs duplicates audit events. If that's unacceptable for G13, the audit appends and the verdict write need to be ordered so the verdict is written *before* the audit event that asserts it, or batched. At minimum, the design should not be silent on "what state is the DB in if the verdict write throws."

---

## FINDING 6 — [LOW] `evaluated_at` / timestamp columns are unvalidated TEXT; no index strategy stated for the Stage-1 join

**Issue / two minor points.**
- `evaluated_at TEXT NOT NULL` ("ISO 8601 UTC") has no format enforcement (consistent with `articles.fetched_at`, `audit_log.ts` — so it matches house style, not a new problem). It's not queried in the design (Stage-1 filters on eligibility + gate_version + revision join), so this is LOW. Just confirm nothing orders/filters by it; if a future "most-recent verdict" query appears, the unvalidated text sorts lexically (fine for ISO-8601 UTC, *if* the writer always uses the same format — `lookup.ts` uses both `new Date().toISOString()` and `fetched.fetchedAt` in different places, so pick one).
- **Index for Stage-1.** Stage-1 joins `articles × eligibility_verdicts ON (page_id, revision_id = articles.revision_id, gate_version = current)` filtered by `eligibility='easy_win'`. The composite PK `(page_id, revision_id, gate_version)` is a usable index for the `page_id`/`revision_id` lookup per article, so per-page joins are covered. But a scan "all easy_win rows at current gate_version" (if the query drives from the verdict table rather than per-article) has no supporting index on `(gate_version, eligibility)`. For single-user v1 this is negligible (small table), so **LOW** — but the design should state the query drives from `articles` (bounded, indexed by PK) → look up each page's verdict via the composite PK, *not* a full `eligibility_verdicts` scan. If it's the latter, note an index is deferred.

**Why it matters.** Minor for v1 scale; flagged so the plan picks the join direction deliberately and doesn't accidentally write a full-table-scan pre-filter that the design sells as "cheap."

**Recommended fix.** State the Stage-1 join direction (drive from `articles`, resolve verdict by composite PK). Defer any secondary index with a one-line note. Standardize the timestamp writer.

---

## What is sound (survives the adversarial pass)

- **The table shape is correct and DB-1-compliant for the *full* composite key.** Verified empirically: `WITHOUT ROWID` + composite PK rejects NULL on page_id, revision_id, **and** gate_version (not just the leading column), rejects duplicate keys, and the FK to the `WITHOUT ROWID` `articles` parent fires. The design's DB-1 reasoning is accurate.
- **`ON CONFLICT(page_id,revision_id,gate_version) DO UPDATE` is the right conflict target** — it matches the PK exactly, so upsert is idempotent on the natural snapshot key as intended. Verified.
- **The `eligibility` CHECK constraint** (`IN ('easy_win','human_only')`) is good practice and mirrors the gate's only two outputs.
- **The composite natural key faithfully encodes §6's binding** `(page_id, revision_id, gate_version)`. The choice of a composite natural key over a surrogate `id` is correct here (the snapshot identity *is* the key; there's no need for a rowid).
- **No D1-vs-better-sqlite3 divergence in the DDL itself.** `WITHOUT ROWID`, composite PK, CHECK, FK, and `ON CONFLICT … DO UPDATE` upsert all behave identically on both engines, and the existing `bind()`-based `SqlExecutor` (DB-2) carries the new `upsertVerdict` unchanged. The §8 instruction to bind via `bind()` and test through `freshTestExecutor` is correct.
- **Excluding-on-revision-drift and the advisory-not-authoritative framing** are coherent with the schema: the Stage-1 `revision_id = articles.revision_id` join is exactly what makes the persisted verdict a *pre-filter* rather than an authority, and it self-heals on the live axis. The schema supports the design's compliance story.
- **The migration mechanics that *do* exist are sound:** `freshTestDb()` applies the real migration file (testing-pitfalls §8 ✓), FKs are ON in tests (✓), and there are existing regression tests for NULL-key rejection and FK firing that the new table's tests should mirror.

---

## Summary of recommendations the plan must resolve before implementation

1. **(HIGH)** Stop calling "byte-identical to 0001" an invariant — it's an untested comment. Decide whether `schema.sql` stays (and gets a *real* test of the migrations relationship) or is dropped (YAGNI). Keep `freshTestDb()` reading migration files, never `schema.sql`. (Findings 1, 2)
2. **(MEDIUM)** Replace "schema.sql = concatenation of migrations" with a model that survives non-`CREATE TABLE` migrations: either end-state-equivalence test (recommended) or delete schema.sql. (Finding 2)
3. **(MEDIUM)** Name the retention policy for superseded `gate_version` / `revision_id` rows — retained/unread/unpruned-in-v1, or genuine history with a reader and a bound. Reconcile the "auditable history" claim with the audit-log's stated ownership of history. (Finding 3)
4. **(MEDIUM)** Guard the `eligibility` ⟺ `reasons_json` coupling in the writer (DB has no constraint for it); document `reasons_json` as codes-only, audit/display-only, never-queried; mirror `audit_log.payload_json`'s codes-only comment. (Finding 4)
5. **(HIGH)** State `upsertVerdict`-after-`upsertArticle` as a hard FK-ordering requirement; decide and document the non-atomic write posture (idempotent re-run vs D1 `batch()`), including the audit-append non-idempotency window the verdict write widens. Add the revision-drift Stage-1 test. (Finding 5)
6. **(LOW)** Fix the Stage-1 join direction (drive from `articles`, resolve via composite PK — not a full verdict scan); standardize the `evaluated_at` writer; defer any secondary index with a note. (Finding 6)

**Note on DB-4:** the review prompt references "DB-4 discipline (app-critical logic in JSON)" but `implementation-pitfalls.md` currently defines only DB-1 and DB-2. Finding 4 is the candidate to *establish* DB-4 if the team agrees the reasons_json concern generalizes.
