# Testing Pitfalls

Test scenario checklist for reviewing coverage of any feature. Every item on this list exists because it catches bugs that have occurred in real codebases. Items marked with **🔥 Found in this project** were discovered here specifically. Unmarked items are universal — bugs we haven't made *yet* in this project, but that have bitten other projects hard enough to be worth testing against. Do not deprioritize an unmarked item because it lacks a marker.

> **Relationship to implementation-pitfalls.md:** `implementation-pitfalls.md` specifies *what* to implement and *why*. This document specifies *how to verify* those implementations work correctly. Cross-references between the two are noted inline.

---

## How to Use This Document

**If you're writing tests:** Go to the relevant topic sections below, read the checklist items, and verify your test suite covers each one that applies. Unchecked items are gaps — either add a test or explicitly note why the item doesn't apply to this feature.

**If you're reviewing tests:** Use the checklist to audit coverage gaps. A passing test suite with missing coverage is worse than a failing test suite with complete coverage — you don't know what's actually protected.

**If you're maintaining this document:** When a real bug slips through to production or staging because of a missing test, add the check item to the appropriate section with the 🔥 marker and a one-line note about the observed failure mode. See §How to Add a Testing-Pitfall at the end.

---

## 1. Test Output Pristine

Test output MUST be clean for the suite to pass — no stray errors, warnings, or stack traces. If a test legitimately produces errors (e.g. it's verifying error handling), capture them explicitly and assert on their content. Silent error spam in test output hides real failures.

- [ ] **No unexpected stderr in passing tests.** Any stderr output from a passing test must be explicitly asserted on, or the test is lying about what it verifies.
- [ ] **No unhandled promise rejections / uncaught exceptions.** These often appear as warnings rather than test failures; configure your runner to fail on them.
- [ ] **Deprecation warnings fail the suite or are explicitly tracked.** Silently-warned deprecations become hard breaks on the next runtime upgrade.
- [ ] **Test output doesn't contain debug prints.** Debug statements that escaped into production tests are sometimes the only evidence of a half-finished implementation.

---

## 2. Skipped Tests Are Not Passing Tests

A test that's `skip`ped, `xit`'d, `pending`, or `@Ignore`d is a test that's not running. A CI job that says "100 tests passed, 5 skipped" is NOT the same as "105 tests passed."

- [ ] **No unexplained skips in the suite.** Every skipped test has a comment explaining why it's skipped and under what condition it should be re-enabled.
- [ ] **Skips with a linked issue/ticket.** A skip without follow-up context is forgotten work.
- [ ] **CI distinguishes skipped from passed in its summary.** If the report doesn't separate them, skipped failures hide.
- [ ] **Skip counts are tracked over time.** Growing skip count = eroding coverage.

---

## 3. Error Path Coverage

Silent error swallowing is one of the largest bug categories in any codebase. Every error path must be tested explicitly — not just "the happy path works."

- [ ] **Each error branch has a test that triggers it.** If a function has 5 ways to return an error, there are 5 tests covering each one.
- [ ] **Error messages are asserted, not just error presence.** `expect(err).toBeTruthy()` doesn't catch "wrong error returned"; `expect(err.message).toMatch(/expected pattern/)` does.
- [ ] **Information leakage via error codes checked.** When a handler must return the same status code regardless of whether a resource exists (anti-enumeration), test that ALL error paths return the same status — including DB errors on post-lookup queries that leak existence.
- [ ] **Error-path side effects verified.** If an error path is supposed to roll back state / release a lock / clear a cache, assert that it did.
- [ ] **Error-path resource cleanup verified.** Acquired resources (file handles, DB connections, semaphores) must be released even on error. Test with `defer`-equivalent patterns or explicit cleanup assertions.

---

## 4. Negative Property Testing

Happy-path tests prove "it works" for one input. Negative property tests prove "it doesn't break" under stress, boundaries, and adversarial input. The latter catches the bugs that ship.

- [ ] **Cleanup and eviction.** When code accumulates state (maps, caches, queues), test that stale entries are eventually cleaned up. Don't just test "it works" — test "it doesn't leak."
- [ ] **Bounded growth.** For any in-memory data structure that grows with external input, test that it has a maximum size or eviction policy. Simulate 1000+ entries and verify memory is bounded.
- [ ] **Case sensitivity where identity matters.** When a string key is used for identity (email, username, path), test that case variations are treated consistently. `Admin@Example.com` and `admin@example.com` must be the same identity — or consistently different ones.
- [ ] **Empty / null / zero inputs.** Every parameter that accepts a value should be tested with empty string, null, zero, empty array, empty map. "Did not crash" is not the same as "handled correctly."
- [ ] **Oversized inputs.** Long strings, deeply nested structures, large collections. Where are your truncation / rejection boundaries, and are they enforced?
- [ ] **Unicode / encoding edge cases.** Multi-byte chars, combining sequences, RTL text, emoji, zero-width joiners, NUL bytes. Anywhere strings cross a boundary (storage, display, comparison) needs this.

---

## 5. Concurrency & TOCTOU

If the code can be executed concurrently, test it concurrently. Single-threaded happy-path tests don't catch race conditions.

- [ ] **Multi-step flows under concurrent access.** When a flow reads state then writes state (check-then-act), test two callers racing through the same flow simultaneously. Use a barrier / sync primitive to ensure they hit the critical section at the same time — `WaitGroup` / `Promise.all` alone doesn't guarantee simultaneity.
- [ ] **"Use once" tokens consumed correctly.** Any token that should be single-use (password reset, verification code, invitation) must be tested with two concurrent consumers. Exactly one must succeed.
- [ ] **Rate-limit enforcement under concurrency.** Count-then-insert rate limits can be bypassed by concurrent requests that all read the same count before any insert. Test with burst requests.
- [ ] **Idempotency under retry/concurrency.** If an operation should be idempotent (accepting an invitation twice, retrying a failed payment), test concurrent execution — the second attempt must not produce a 500 from a constraint violation.
- [ ] **Bootstrap / first-time races.** First-user, first-org, or any "only if none exist" flow tested with concurrent attempts. Exactly one must win.

---

## 6. Boundary & Configuration Validation

Configuration errors, bad boundaries, and missing validation are a surprisingly large portion of production incidents. Test the edges.

- [ ] **Default values are tested.** What does the code do when a config value is absent? Crash? Use a default? Silently use zero? All three are possible; the right behavior needs a test.
- [ ] **Invalid config is rejected at load time.** A system that loads invalid config, then crashes on first use of it, surfaces the error too late. Test that config validation runs at load.
- [ ] **Environment-specific behavior.** If code behaves differently in dev vs. prod (feature flags, degraded modes), test both paths. Don't assume dev-tested code works in prod.
- [ ] **Feature flag flip behavior.** Test both flag-on and flag-off paths. A feature behind a flag that's never tested with the flag off can't be safely rolled back.
- [ ] **Timeout and retry boundaries.** If a caller retries 3 times with 5s timeouts, test what happens on the 4th call and on a request that takes 4.9s. The edges matter.

---

## 7. Test Infrastructure Hygiene

The test suite itself is code. It decays if not maintained. Messy test infrastructure produces flaky tests, which produce lost confidence, which produce skipped tests (see §2).

- [ ] **No shared mutable state between tests.** Each test should set up its own state and tear it down. Tests that depend on previous tests' state are order-dependent and flaky.
- [ ] **Setup / teardown covers the failure case.** If setup partially succeeds then teardown fails, the next test starts from a corrupted state. Teardown must be robust to partial-setup states.
- [ ] **Test doubles are minimal and honest.** A mock that returns fixed data is testing the mock, not the code. Use real implementations where feasible; mock only external boundaries.
- [ ] **No hardcoded time-of-day or timezone assumptions.** Tests that pass at 09:00 UTC but fail at 23:00 UTC are flaky by design. Use injected clocks for time-sensitive tests.
- [ ] **No network calls in unit tests.** A unit test that hits a real API is an integration test with a misleading name. Either mock the boundary or move it to the integration suite.

---

## 8. Local SQLite ↔ Cloudflare D1 Parity

Tests run against `better-sqlite3` (in-memory) as a stand-in for D1. The two are NOT configured identically out of the box, so a test DB built with bare defaults can **false-pass** on violations that real D1 would reject. Keep the stand-in faithful.

- [ ] **Foreign keys must be ON in the test DB.** `better-sqlite3` leaves `PRAGMA foreign_keys` **OFF** by default; D1 enforces FKs. A bare `new Database(":memory:")` silently ignores `REFERENCES` constraints, so a test inserting a `stale_candidates` row with a non-existent `page_id` would pass locally but fail on D1. Build every test DB via `test/helpers/db.ts:freshTestDb()` (it sets `foreign_keys = ON` and applies the migration), never a raw `new Database()`. There is a regression test asserting the `stale_candidates → articles` FK actually fires.
- [ ] **Schema under test is the real migration.** `freshTestDb()` applies `migrations/0001_init.sql` (kept byte-identical to `src/db/schema.sql`). Don't hand-roll table DDL in a test — exercise the shipped migration so column/constraint drift is caught.
- [ ] **The sync/async seam is a known divergence.** `SqlExecutor` is synchronous (better-sqlite3); D1's API is async (Promises). Tests are sync today; when D1 is wired, the data-layer read/write methods become `async` and tests must `await`. Don't write tests that bake in the sync contract as if it were permanent — see the `src/db/client.ts` note and the plan's Discoveries.

---

## 9. Detector Precision Gate & Gold-Set Honesty

The detector's precision gate (`test/detector/precision.test.ts`) runs the real detector over real Wikipedia fixtures and a hand-labeled gold set. It is only meaningful if the gold set is honest. These checks exist because precision is trivially gameable.

- [ ] **🔥 Found in Phase 2: the precision gate measures the LABELED subset only — it is a regression gate, not true precision.** It asks "does the detector flag the labeled positives and avoid the labeled negatives?", NOT "what fraction of ALL flags are correct?". Keep the in-test NOTE that says so. Do not read a passing gate as "the detector has 100% precision in production" — there are known residual false positives outside the gold set (see DET-2).
- [ ] **🔥 Found in Phase 2: the gold set MUST contain real negatives, and a composition guard MUST enforce it.** Precision over a positives-only set is trivially 1.0. `precision.test.ts` asserts ≥3 positives AND ≥3 negatives so a future edit cannot pass the gate by deleting the negatives. If you tune precision, do it by *improving suppression*, never by removing a gold negative — removing a real negative to make the gate pass is the exact rigor regression the plan's TDD rules forbid; STOP and escalate instead.
- [ ] **🔥 Found in Phase 2: build the gold set from real detector output, not idealized sentences.** Run the detector on the fixtures, read what it actually flags, and label *those* sentences. Hand-writing "obviously stale" sentences hides the dominant real false-positive class (historical dateline narration — DET-1) and produces a gate that passes while the detector is noisy on real articles.
- [ ] **Negatives must be genuine false-positive-class examples the detector correctly avoids — not throwaway sentences.** Each negative should represent a real class (historical-narration dateline, year-gate future claim, quotation, resolved-nearby) and be not-flagged for a *principled* reason (suppression or the year gate), not by accident. Independently re-derive each label by running the detector; flag any you'd dispute.
- [ ] **Fixtures are pinned-`asOfYear` and committed, never fetched in-test.** Tests pass a fixed `asOfYear` (2026) so labels stay stable as the live articles age, and the `.wikitext` fixtures are committed files — no network call at test time (that would be nondeterministic and an integration test in disguise; see §7).
- [ ] **A suppression rule added to pass the gate must generalize, not overfit the fixtures.** Probe a new/tuned suppression rule on fresh invented sentences across the pattern class (not just the committed fixtures). If it only works on the curated sentences, it is overfit — a precision number that does not transfer.

---

## How to Add a Testing-Pitfall

When a bug reaches production (or staging, or late integration testing) because a test was missing:

1. **Identify the topic section** the missing test belongs in. If none of sections 1-7 fit, add a new numbered topic section.
2. **Write the check item** as a `- [ ]` checkbox. Lead with a bolded imperative ("**X is tested.**"), then one sentence explaining what the check covers and why.
3. **Mark with the 🔥 marker** if the bug was found in this project's own history: `**🔥 Found in [context]:** one-line note about the observed failure mode`.
4. **Cross-reference implementation-pitfalls.md** if there's a corresponding implementation entry.
5. **Resist the urge to be clever.** "Tests X under condition Y" is better than a novel testing philosophy. These are pass/fail checklist items, not essays.

The test suite is the enforcement mechanism for this document. If you add a check item and don't write the corresponding test, you've documented a gap, not closed one. Close it.
