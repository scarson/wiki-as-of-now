# Research Queue Transport + Seed List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the merged single-message research consumer into a real, scaled background pipeline — a dedicated Cloudflare Worker that consumes a Queue (per-message ack/retry) and a cron that seeds easy-win candidates with bounded fan-out — built entirely against the existing `StubResearchProvider` (no Gemini key).

**Architecture:** A new dedicated `workers/research/` Worker (`{ queue, scheduled }`) shares the web app's D1. Transport-agnostic logic lives in `src/queue/` (process-batch, seed) and is Node-pool unit-tested; the real binding wiring is proven in a new `@cloudflare/vitest-pool-workers` project. An atomic `SqlExecutor.batch()` primitive makes pack+completion-audit commit together (closes a G13 hole the queue would amplify). The `client.ts` split keeps `better-sqlite3` out of the workerd bundle.

**Tech Stack:** TypeScript (ES2024, strict), Next.js 16 / OpenNext (Cloudflare Workers + D1 + Queues), better-sqlite3 (local/test) behind the async `SqlExecutor` port, vitest 4.1 (Node) + `@cloudflare/vitest-pool-workers` (workerd), Node 24 / pnpm 11.5.1.

**Authoritative spec:** [docs/design/2026-06-07-research-queue-transport-design.md](../design/2026-06-07-research-queue-transport-design.md) — read the section named in each phase before starting it. **Compliance:** [docs/policy/wikipedia-genai-compliance.md](../policy/wikipedia-genai-compliance.md) — G13 (append-only codes-only audit), G14 (bounded fan-out / responsible access), G15 (untrusted fetch / SSRF guard).

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

**Overall:** 🚧 IN PROGRESS (claimed 2026-06-07T00:00:00Z). 5/6 phases shipped. Branch `claude/research-queue-transport-impl-L8Klm` (off `dev` `e078c73`, which includes merged slice A + this plan/spec via merged PR #18). Executed via subagent-driven development.

| Phase | Status | Ship SHA(s) | Notes |
|---|---|---|---|
| 1 — `client.ts` split + lint guard | ✅ Shipped | `6cedbee`, `7299ca8`, `f873bb9` | refactor-neutral; 537 tests green; guard fires |
| 2 — `SqlExecutor.batch()` + atomic pack+audit | ✅ Shipped | `ee26d6c`, `976ef9f`, `1d650f3`, `3e58b06` | G13 hole closed atomically; OPUS review APPROVE; 551 tests |
| 3 — `process-batch.ts` | ✅ Shipped | `ad3e158`, `5a5dc8b` | sequential ack/retry+isolation+codes-only warn; 559 tests; 2 reviewers APPROVE |
| 4 — `seed.ts` + `enqueueResearchBatch` | ✅ Shipped | `f7ab10a`, `d64e397`, `ffff6fe` | dedup == has() (OPUS APPROVE); NFC/NFD collapse; ≤100+≤256KB chunking; 574 tests |
| 5 — `workers/research/` worker + wrangler + deploy | ✅ Shipped | `7e80fba`, `4ea0837` | dormant cron; bundle better-sqlite3-free, no nodejs_compat (dry-run proven); 2 reviewers APPROVE |
| 6 — workers-pool test project + integration + CI | 🚧 In progress | — | real Miniflare D1+Queues; both pools in CI |

### Deviations
- **Phase 4 Task 4.1 (`OVERSELECT_FACTOR` comment rephrased to comply with CLAUDE.md).** The plan instructed the comment to mark the constant "a v1 placeholder valid only because the cron is off … deferred to the Gemini slice." Code-quality review flagged that wording as roadmap/temporal, which CLAUDE.md (overriding) forbids in comments. Rephrased (commit `ffff6fe`) to state the same load-bearing meaning as an evergreen invariant: the fixed multiplier is sufficient only while no scheduled job continuously drains/re-seeds the queue; a continuation-cursor seeder would be required to lift that, with inline-oriented spec ref. Meaning preserved; roadmap phrasing removed.
- **Phase 1 Task 1.2 (lint guard scope broadened).** The plan enumerated the guard's `files` as the specific worker-reachable set (`src/db/client.ts`, `src/db/research-packs.ts`, `src/db/audit-log.ts`, …). Code-quality review flagged that this omits the other production data-layer modules (`src/db/articles.ts`, `src/db/eligibility-verdicts.ts`), which a future transitive import could drag into the worker bundle uncaught. Broadened to `src/db/**/*.ts` with `ignores: ["src/db/local-db.ts"]` (commit `f873bb9`). Zero-risk (verified no current `src/db` module imports `better-sqlite3`/`local-db`); strictly improves bundle hygiene; within the plan's intent. The Phase-5 `wrangler deploy --dry-run` bundle grep remains the authoritative backstop.

### Discoveries
- **Bundle-grep false positive in the source map.** `wrangler deploy -c workers/research/wrangler.jsonc --dry-run --outdir <dir>` emits both `index.js` (executable) and `index.js.map` (source map). A `grep -rl "better-sqlite3" <dir>` matches `index.js.map` because its `sourcesContent` embeds `src/db/client.ts`'s JSDoc, which legitimately mentions "better-sqlite3" in describing the port contract. This is HARMLESS — the executable `index.js` has zero `better-sqlite3` imports/requires. The correct bundle-hygiene check is `grep -c "better-sqlite3" <dir>/index.js` (must be 0), NOT a recursive grep over the whole outdir. Phase 6 / final integration: use the `index.js`-scoped grep.

---

## Per-Task Protocol (MANDATORY — applies to EVERY task)

**BEFORE starting work:**
1. Invoke `superpowers:test-driven-development`.
2. Read `docs/pitfalls/testing-pitfalls.md` (§1 pristine output, §3 error-path coverage, §5 concurrency/TOCTOU, §8 SQLite↔D1 parity / `freshTestExecutor`) and the relevant `docs/pitfalls/implementation-pitfalls.md` entries (DB-1 `WITHOUT ROWID`/NULL, DB-2 `bind()` + the port shape, ORCH-3 verify-against-git).
3. Read the spec section named in the phase banner.
4. **Environment:** Node 24 (`.nvmrc`). After any dependency re-sync (`pnpm install`/`pnpm add`), run `pnpm rebuild better-sqlite3` or every DB-backed test fails with a native-module ABI error.

Follow TDD: failing test → run it, confirm it fails for the RIGHT reason → minimal implementation → confirm green → refactor green → commit → **push**.

**BEFORE marking a task complete:**
1. Review the new tests against `docs/pitfalls/testing-pitfalls.md` (error paths? edge cases? negatives? pristine output?).
2. Run the gate trio green + PRISTINE: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`. (From Phase 6 on, also run the workers-pool project: `pnpm test:workers`.)
3. Commit (descriptive message) + **push** (the container is ephemeral; unpushed commits are lost). `git status` before `git add`; never `git add -A`.

**Assertion rigor (compliance floor — non-negotiable):** this is the BLP-safety backstop's research transport. If a test races/flakes, the fix is **deterministic synchronization or deterministic inputs** (injected `now`, fake `MessageBatch`/`fetchImpl`, sequenced awaits) — NEVER assertion removal or weakening. If an assertion cannot pass deterministically, STOP and raise to the dispatching agent. A weakened test on the audit/atomicity/dedup paths is a compliance regression. Commit subjects touching assertions state what happened ("add"/"strengthen"/"preserve" — never obscure a weakening as a "CI/timing fix"). Prefer mechanism assertions ("both pack and audit present", "exactly maxBatch fetches") over symptom assertions.

**Per-phase review (MANDATORY):** after the last task in a phase, run **≥3 review rounds** (read the code/tests; check spec compliance + the named pitfalls + assertion rigor; verify git provenance per ORCH-3 — `git show --stat HEAD`, `git cat-file -e HEAD~1:<file>` for "new" files). Phases **2** (atomic pack+audit, merged G13 code) and **4** (seed dedup identity) MUST get one round from a fresh **opus** reviewer.

**Do NOT (scope boundaries — spec §1 / §8):** add the real Gemini provider (use `StubResearchProvider`); add `triggers.crons` to any committed wrangler config (the cron ships dormant — spec §4); add a manual/admin enqueue API; add a DLQ consumer/alerting; add per-user quotas/auth; parallelize `processBatch` (sequential is load-bearing for G14 host politeness — spec §3/§8); special-case the consumer by provider (persistence stays provider-agnostic); bump `max_batch_size` above 1 (spec §5).

---

## Phase 1 — `client.ts` split + lint guard

**Execution Status:** ✅ SHIPPED (2026-06-07; SHAs `6cedbee` split, `7299ca8` guard, `f873bb9` guard-broaden+nit). Refactor behavior-neutral (537 tests green); guard proven to fire on a worker-reachable `local-db` import. 3 review rounds (self-verify + spec-compliance APPROVE + code-quality → 2 findings fixed).

Implements spec §6. Refactor-only (no behavior change): move the Node-only `better-sqlite3` code out of `src/db/client.ts` so the workerd bundle (Phase 5) never references the native module. The gate trio MUST stay green throughout (this is the regression gate — there are no new tests, just moved code + updated imports). TDD's failing-test-first does not apply to a pure move; the existing suite is the safety net.

### Task 1.1: Split `client.ts` → portable `client.ts` + Node-only `local-db.ts`

**Files:**
- Modify: `src/db/client.ts` (remove the `better-sqlite3` import + `betterSqliteExecutor` + `openLocalDb`; keep `SqlExecutor`/`SqlStatement` interfaces + `d1Executor`)
- Create: `src/db/local-db.ts` (the moved `betterSqliteExecutor` + `openLocalDb`; `import Database from "better-sqlite3"`)
- Modify: `test/helpers/db.ts` (import `betterSqliteExecutor` from `../../src/db/local-db` instead of `../../src/db/client`)
- Modify: any other importer of `betterSqliteExecutor`/`openLocalDb` (grep first).

- [ ] **Step 1:** `grep -rn "betterSqliteExecutor\|openLocalDb" src test` to list every importer. Expected importers: `test/helpers/db.ts` (and possibly `src/db/client.ts`'s own internal use). Record the list.
- [ ] **Step 2:** Create `src/db/local-db.ts` with a 2-line ABOUTME header, `import Database from "better-sqlite3";` and the **verbatim** `betterSqliteExecutor` + `openLocalDb` functions moved from `client.ts` (they import `SqlExecutor`/`SqlStatement` as types from `./client`). Do not change their bodies.
- [ ] **Step 3:** In `src/db/client.ts`, delete the `better-sqlite3` import and the two moved functions. `client.ts` now exports ONLY `SqlExecutor`, `SqlStatement`, `d1Executor` (and the `D1*Like` duck types). Update its ABOUTME to say it is the portable port (no engine-history wording — describe what it is, per CLAUDE.md naming rules).
- [ ] **Step 4:** Update `test/helpers/db.ts` + any other importer to import `betterSqliteExecutor`/`openLocalDb` from `../../src/db/local-db`.
- [ ] **Step 5: Verify** `pnpm test` (all existing tests green — proves the move is behavior-neutral), `pnpm exec tsc --noEmit`, `pnpm lint` clean.
- [ ] **Step 6:** `grep -rn "better-sqlite3" src` → the ONLY hit MUST be `src/db/local-db.ts`. Paste the output.
- [ ] **Step 7: Commit + push.** `git add src/db/client.ts src/db/local-db.ts test/helpers/db.ts <other importers> && git commit -m "refactor(db): split client.ts — portable port + d1Executor vs Node-only local-db (better-sqlite3)"`

### Task 1.2: Lint guard — forbid `local-db` in the worker-reachable set

**Files:** Modify `eslint.config.mjs`.

The research worker bundle (`workers/research/**` + everything it imports under `src/`, except the test/local path) MUST NOT import `better-sqlite3`. Enforce mechanically so a future `import { openLocalDb }` is caught at lint, not at `wrangler deploy`.

- [ ] **Step 1:** Add an ESLint override block targeting the worker-reachable source (`src/research/**`, `src/queue/**`, `src/db/client.ts`, `src/db/research-packs.ts`, `src/db/audit-log.ts`, `workers/**`) with a rule:
  ```js
  "no-restricted-imports": ["error", { "patterns": [
    { "group": ["**/local-db", "**/db/local-db", "better-sqlite3"],
      "message": "Worker-bundled code must not import better-sqlite3 / local-db (workerd has no native modules). Use d1Executor from db/client; betterSqliteExecutor is test/local-only." }
  ]}]
  ```
  (Scope the override `files` so it does NOT apply to `test/**` or `src/db/local-db.ts` itself.)
- [ ] **Step 2: Verify** `pnpm lint` clean (the current code already obeys the rule). Add a throwaway `import { openLocalDb } from "../db/local-db";` to a worker-reachable file, confirm `pnpm lint` now ERRORS on it, then revert the throwaway.
- [ ] **Step 3: Commit + push.** `git commit -m "chore(lint): forbid better-sqlite3/local-db imports in worker-bundled code"`

**After Phase 1:** ≥3 review rounds — the only `better-sqlite3` reference under `src/` is `local-db.ts`; all tests green (behavior-neutral move); the lint rule actually fires on a worker-path violation (the throwaway proof); no `client.ts` consumer broke (grep the import sites).

---

## Phase 2 — `SqlExecutor.batch()` + atomic pack+audit (opus review)

**Execution Status:** ✅ SHIPPED (2026-06-07; SHAs `ee26d6c` batch(), `976ef9f` builders+commitTerminal, `1d650f3` consumer atomic close, `3e58b06` review-fixes). G13 pack-without-audit hole closed: terminal commit is `db.batch([insertPackStatement, appendStatement])` — both-or-neither proven on better-sqlite3 (real `db.transaction` + sync runners) AND composed for D1 (`db.batch` over WeakMap-recovered native statements; identity-asserted). End-to-end atomicity proven through the real consumer (orphan-FK reject → nothing persisted). Codes-only audit allowlist+sentinel preserved; non-terminal paths untouched. 551 tests green. 3 review rounds: self-verify + **OPUS APPROVE** (D1 unwrap path scrutinized) + code-quality (3 test-strengthening findings fixed, incl. the D1 identity assertion both reviewers flagged).

Implements spec §2 (and §10 D1). Adds an atomic multi-statement primitive to the port and makes the **merged** `handleResearchMessage` commit the research pack and its `research.completed` audit row **together or not at all** — closing the G13 pack-without-audit hole that the queue's automatic retries would otherwise make recurring. This phase edits merged slice-A compliance code; it gets an **opus** review round.

### Task 2.1: Add `batch()` to the `SqlExecutor` port + both adapters

**Files:**
- Modify: `src/db/client.ts` (add `batch` to `SqlExecutor` + `d1Executor`)
- Modify: `src/db/local-db.ts` (add `batch` to `betterSqliteExecutor`)
- Test: `test/db/client.test.ts` (extend)

- [ ] **Step 1: Write failing tests** in `test/db/client.test.ts` using `freshTestExecutor()` (which wraps `betterSqliteExecutor`): a `batch([stmtA, stmtB])` where both inserts succeed commits BOTH; a `batch([validInsert, insertThatViolatesAConstraint])` commits NEITHER (atomic rollback — assert the first insert's row is absent after the throw). Bind every param via `.bind(...)` (DB-2).
- [ ] **Step 2: Run** → FAIL (`batch` not a function).
- [ ] **Step 3: Implement.** Extend the port:
  ```ts
  export interface SqlExecutor {
    prepare(sql: string): SqlStatement;
    /** Run the given prepared statements atomically (all-or-nothing). */
    batch(statements: SqlStatement[]): Promise<void>;
  }
  ```
  `d1Executor.batch`: collect the underlying D1 statements and call `db.batch([...])` (D1 runs a batch in a single implicit transaction). The wrapped `SqlStatement` must carry its bound D1 statement so `batch` can unwrap it (extend the `wrap` closure to expose the underlying `D1StatementLike`).
  `betterSqliteExecutor.batch`: wrap in `db.transaction(() => { for (const s of statements) s.run(); })()` — but since the port's `run()` is async and `db.transaction` is sync, have each wrapped better-sqlite3 statement expose a synchronous `runSync()`/captured `(stmt, params)` the transaction can execute; the `transaction` throws on any statement error → better-sqlite3 rolls back. Keep `run()`/`all()` working as before.
- [ ] **Step 4: Run** → PASS (both-or-neither proven on better-sqlite3).
- [ ] **Step 5: Commit + push.** `git commit -m "feat(db): SqlExecutor.batch() — atomic multi-statement commit (d1 batch / better-sqlite3 transaction)"`

### Task 2.2: Statement-builders + `PackStore.commitTerminal` (atomic pack+audit)

**Files:**
- Modify: `src/db/research-packs.ts` (add `insertPackStatement`; `insertPackIfAbsent` reuses it)
- Modify: `src/db/audit-log.ts` (add `appendStatement`; `append` reuses it)
- Modify: `src/queue/research-jobs.ts` (add `commitTerminal` to `PackStore` + `makeResearchPackStore`)
- Test: `test/db/research-packs.test.ts`, `test/db/audit-log.test.ts`, `test/queue/research-jobs.test.ts`

- [ ] **Step 1: Write failing tests.**
  - `research-packs.test.ts`: `insertPackStatement(db, pack)` returns a `SqlStatement` that, when run, inserts the pack (write-once); building it does not execute it.
  - `audit-log.test.ts`: `appendStatement(db, entry)` returns a `SqlStatement` that inserts one audit row with the bound `ts`/`actor`/`event_type`/`payload_json`.
  - `research-jobs.test.ts`: `makeResearchPackStore(freshTestExecutor()).commitTerminal(pack, auditEntry)` persists the pack AND the audit row **atomically** — and, with an executor whose `batch` is made to throw mid-commit (inject a failing statement), NEITHER the pack nor the audit row appears (no pack-without-audit, no audit-without-pack).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
  - `insertPackStatement(db, pack): SqlStatement` — the existing `INSERT INTO research_packs (...) VALUES (...) ON CONFLICT(claim_key, source_revision_id) DO NOTHING` with all params bound; `insertPackIfAbsent` becomes `await db.batch([insertPackStatement(db, pack)])` or `await insertPackStatement(db, pack).run()` (keep its existing behavior/tests green).
  - `appendStatement(db, entry): SqlStatement` — the existing audit INSERT with `ts = new Date().toISOString()` bound; `append` becomes `await appendStatement(db, entry).run()`.
  - Extend `PackStore` with `commitTerminal(pack: ResearchPack, audit: AuditEntry): Promise<void>`; `makeResearchPackStore(db)` implements it as `db.batch([insertPackStatement(db, pack), appendStatement(db, audit)])`. (Imports `appendStatement` from `../db/audit-log`.)
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit + push.** `git commit -m "feat(db): statement-builders + PackStore.commitTerminal (atomic pack+completion-audit)"`

### Task 2.3: Use `commitTerminal` in `handleResearchMessage` (close the G13 hole)

**Files:** Modify `src/queue/research-jobs.ts`; Test: `test/queue/research-jobs.test.ts`.

- [ ] **Step 1: Write failing test.** In the terminal-path tests, replace the separate "pack persisted" + "one research.completed audit" assertions with: after `handleResearchMessage` (real `makeResearchPackStore` + `makeAuditLog` over one `freshTestExecutor()`), BOTH the pack (`getPack` → found) AND exactly one `research.completed` audit row exist. Add: with a `commitTerminal` that throws (injected), `handleResearchMessage` rejects (→ retry) AND leaves **no pack and no completion audit** (atomic). The allowlist+sentinel audit assertion stays.
- [ ] **Step 2: Run** → FAIL (consumer still calls insertIfAbsent + append separately).
- [ ] **Step 3: Implement.** In the terminal branch, replace `await packStore.insertIfAbsent(pack); … await audit.append({ … research.completed … })` with a single `await packStore.commitTerminal(pack, { actor: "system", eventType: "research.completed", payload: auditPayload })`. The `provider_unavailable` (audit-only) and `research.failed` (malformed/unexpected) paths keep using `audit.append` (single, non-atomic — correct, no pack involved). `has()` unchanged.
- [ ] **Step 4: Run** the full suite → PASS.
- [ ] **Step 5: Commit + push.** `git commit -m "fix(queue): commit research pack + completion audit atomically (close G13 pack-without-audit hole; strengthen)"`

**After Phase 2 (opus reviewer REQUIRED):** ≥3 review rounds — `batch()` is genuinely atomic on both adapters (both-or-neither proven); `commitTerminal` never yields pack-without-audit OR audit-without-pack under an injected mid-commit failure; the codes-only allowlist+sentinel audit invariant is preserved; `insertPackIfAbsent`/`append` single-statement callers still behave (write-once, append-only); no behavior change to the non-terminal audit paths. Opus specifically checks the D1 `db.batch` unwrap path (the better-sqlite3 transaction proves atomicity locally; confirm the d1 adapter composes real D1 statements, validated again in Phase 6's workers-pool test).

---

## Phase 3 — `process-batch.ts` (transport core)

**Execution Status:** ✅ SHIPPED (2026-06-07; SHAs `ad3e158` processBatch, `5a5dc8b` test-strengthening). Sequential per-message ack/retry with full isolation (middle throw → siblings still ack'd, no whole-batch throw); incremental-ack proven by call-order assertion (falsifies deferred dispatch); codes-only retry warn (sanitized claimKey + `e.name`, proven non-leaking vs content + PII sentinels); malformed→ack via the real consumer; structural `MessageBatchLike` (no workers-types). 559 tests. 3 review rounds: self + spec-compliance APPROVE + code-quality APPROVE.

Implements spec §3 (`processBatch`). The per-message ack/retry mapping with isolation. Pure transport logic, Node-pool unit-tested with a faithful `MessageBatch` fake.

### Task 3.1: `processBatch(batch, deps)`

**Files:**
- Create: `src/queue/process-batch.ts`
- Test: `test/queue/process-batch.test.ts`

- [ ] **Step 1: Write failing tests** (a faithful fake: `{ messages: { body, ack: vi.fn(), retry: vi.fn() }[] }`). Inject a controllable `handleResearchMessage`-shaped handler so this tests the WRAPPER (not the merged consumer): a handler that resolves → that message's `ack()` called once, `retry()` not; a handler that throws → `retry()` called once, `ack()` not; **isolation** — in a 3-message batch where message 2's handler throws, messages 1 and 3 are still `ack()`ed (the throw doesn't abort the loop or whole-batch-throw); **incremental ack** — messages processed before a later throw remain acked (the loop never un-acks); a handler that audits-and-returns on a malformed body → `ack()` (don't retry permanently-bad input). Use `allowConsole()` and assert the retry-counter `console.warn` (codes-only: the claimKey + reason) on the throw case.
  - Signature under test: `processBatch(batch: MessageBatch, deps: ResearchConsumerDeps, handle = handleResearchMessage)` — `handle` injectable for the unit test, defaulting to the real consumer.
- [ ] **Step 2: Run** → FAIL (module missing).
- [ ] **Step 3: Implement** `src/queue/process-batch.ts`: a minimal `MessageBatch`/`Message` interface (`{ messages: { body: unknown; ack(): void; retry(): void }[] }`); iterate **sequentially**; per message `try { await handle(msg.body, deps); msg.ack(); } catch { console.warn(...codes-only retry note...); msg.retry(); }`. ABOUTME notes sequential is LOAD-BEARING for cross-message G14 host politeness (do not parallelize without a global per-host throttle). Export `processBatch`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit + push.** `git commit -m "feat(queue): processBatch — per-message ack/retry, isolation, malformed-ack, sequential (G14)"`

**After Phase 3:** ≥3 review rounds — isolation holds (one throw doesn't starve siblings); ack is per-message/incremental (a killed batch can't re-run acked messages); malformed→ack matches `handleResearchMessage`; retry log is codes-only + asserted under `allowConsole()`; sequential documented as load-bearing.

---

## Phase 4 — `seed.ts` + `enqueueResearchBatch` (opus review)

**Execution Status:** ✅ SHIPPED (2026-06-07; SHAs `f7ab10a` selectResearchSeeds, `d64e397` enqueueResearchBatch, `ffff6fe` review-fixes). Dedup identity is `packExists` on `(claim_key, source_revision_id)` — the SAME function/identity the consumer's `has()` uses (disagreement structurally precluded; both directions of full-PK identity tested). In-memory `claimKey` Set collapses NFC/NFD byte-variants SQL DISTINCT keeps separate (escape-clean test, hygiene grep verified). Live-revision-only join; deterministic total ORDER BY; limit honored; `enqueueResearchBatch` ≤100-count + ≤256KB-byte chunking (both paths tested), oversized singleton skipped+codes-only-warned (no leak), `SEED_BATCH_LIMIT=50` asserted ≤100 at module load. 574 tests. 3 review rounds: self + **OPUS APPROVE** (dedup-identity gate) + code-quality (1 typo + DRY/ABOUTME/evergreen-comment + byte-split-test findings fixed).

Implements spec §3 (seed). The candidate→message planner with dedup that **matches the consumer's `has()` identity exactly**, plus the size-aware batch producer. Opus review (the dedup-identity correctness is load-bearing for G14 spend-avoidance).

### Task 4.1: `selectResearchSeeds(db, { gateVersion, limit })`

**Files:**
- Create: `src/queue/seed.ts`
- Test: `test/queue/seed.test.ts`

- [ ] **Step 1: Write failing tests** (`freshTestExecutor`; seed `articles` + `eligibility_verdicts(easy_win, live revision, gateVersion)` + `stale_candidates` + some existing `research_packs`):
  - returns one `ResearchMessage` per **distinct** claim that is easy-win at the **live revision** and **not already packed** (the dedup uses `(claim_key, source_revision_id)` == the consumer's `has()` identity);
  - a `stale_candidate` whose `source_revision_id ≠ articles.revision_id` is EXCLUDED (superseded revision);
  - duplicate candidate rows for one claim (no unique constraint) collapse to ONE message (`DISTINCT` + in-memory `claimKey` dedup);
  - **NFC/NFD variant rows** that produce the SAME `claimKey` collapse to ONE message (seed two `stale_candidates` rows whose `section_heading`/`sentence_text` differ only by Unicode normalization — written with `\uXXXX` escapes — and assert one message; this proves the in-memory `claimKey` dedup, since SQL `DISTINCT` is byte-level while `claimKey` NFC-folds);
  - respects `limit` (returns ≤ limit distinct claims, deterministic selection via the total `ORDER BY`);
  - a page where every candidate is already packed contributes nothing.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `selectResearchSeeds`:
  1. SQL: `SELECT DISTINCT c.page_id, c.section_heading, c.sentence_text, c.year, c.source_revision_id FROM stale_candidates c JOIN articles a ON a.page_id = c.page_id AND c.source_revision_id = a.revision_id JOIN eligibility_verdicts v ON v.page_id = a.page_id AND v.revision_id = a.revision_id AND v.gate_version = ? AND v.eligibility = 'easy_win' ORDER BY c.page_id, c.section_heading, c.year, c.sentence_text` (total deterministic order) `LIMIT ?` where the LIMIT is `limit * OVERSELECT_FACTOR` (define `OVERSELECT_FACTOR = 3` with a comment that it is a v1 placeholder valid only because the cron is off — spec §3).
  2. For each row, `claimKey = await computeClaimKey(page_id, section_heading, sentence_text, year)` (from `../db/research-packs`).
  3. Batched dedup: `SELECT claim_key, source_revision_id FROM research_packs WHERE (claim_key, source_revision_id) IN (...)` for the computed keys → drop already-packed; OR call `packExists` per key (acceptable at this bounded count). Skip already-packed.
  4. **In-memory dedup on `claimKey`** (collapse NFC/NFD variants).
  5. Take the first `limit` distinct claims → `ResearchMessage { claimKey, pageId, sourceRevisionId, input: { claimText: sentence_text, sectionHeading, year, sourceRevisionId } }`. (The `claimKey` is already computed — single source.)
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit + push.** `git commit -m "feat(queue): selectResearchSeeds — live-revision easy-win candidates, PK-dedup matching has(), claimKey dedup"`

### Task 4.2: `enqueueResearchBatch(queue, msgs)`

**Files:** Modify `src/queue/research-jobs.ts`; Test: `test/queue/research-jobs.test.ts`.

- [ ] **Step 1: Write failing tests** (fake queue with `sendBatch: vi.fn()`): sends pre-built messages unchanged (no recompute of `claimKey`); a list of 250 messages is chunked into `sendBatch` calls of ≤100; a single message whose serialized size exceeds ~128 KB is SKIPPED + logged (`allowConsole()`), not sent, and does not throw; asserts `SEED_BATCH_LIMIT ≤ 100` at module load (a const-assert/throw if violated).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `enqueueResearchBatch(queue: { sendBatch(msgs: { body: ResearchMessage }[]): Promise<void> }, msgs: ResearchMessage[])`: chunk to ≤100 count AND ≤256 KB/chunk (measure `JSON.stringify(msg).length`); a single message > ~128 KB is skipped + `console.warn` (codes-only: claimKey); `sendBatch` each chunk. Define `SEED_BATCH_LIMIT = 50` and assert `SEED_BATCH_LIMIT <= 100`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit + push.** `git commit -m "feat(queue): enqueueResearchBatch — size-aware ≤100 chunking; SEED_BATCH_LIMIT<=100 asserted"`

**After Phase 4 (opus reviewer REQUIRED):** ≥3 review rounds — the dedup identity is `(claim_key, source_revision_id)` (== `has()`), NOT a text-column JOIN; NFC/NFD variants collapse to one message (in-memory `claimKey` dedup tested); only live-revision easy-win candidates seeded; duplicate candidate rows collapse; deterministic total order; `limit`/chunk/size bounds hold; `OVERSELECT_FACTOR` documented as cron-off placeholder.

---

## Phase 5 — `workers/research/` worker + wrangler + deploy

**Execution Status:** ✅ SHIPPED (2026-06-07; SHAs `7e80fba` worker+wrangler+deploy:research, `4ea0837` cast/now NITs). Dedicated `{ scheduled, queue }` worker (no fetch) sharing the web D1; `makeDeps(env)` one-line provider swap point with the PK-poison precondition comment; wrangler.jsonc has `global_fetch_strictly_public`, NO `nodejs_compat`, NO `migrations_dir`, NO `triggers.crons` (dormant), D1 binding matching the web worker. **Load-bearing bundle check PASSED:** `wrangler deploy --dry-run` exits 0, executable `index.js` is `better-sqlite3`-free with no `nodejs_compat` (the Phase-1 split + lint guard proven end-to-end). 3 review rounds: self + spec-compliance APPROVE + code-quality APPROVE; both type-bridges (fetch→FetchImpl cast, queueAdapter for the `QueueSendBatchResponse`→void return) confirmed justified.

Implements spec §1/§4/§5. The dedicated background Worker that wires the transport modules to real bindings. **No `triggers.crons`** (the cron ships dormant — spec §4). No new behavior tests here (the logic is tested in Phases 2–4; the real-binding proof is Phase 6); this phase is the worker entry + config + a build/bundle check.

### Task 5.1: The worker entry

**Files:**
- Create: `workers/research/index.ts`
- Create: `workers/research/wrangler.jsonc`
- Modify: `package.json` (add `deploy:research`)
- Modify: `cloudflare-env.d.ts` or a local env type for the research worker (the `RESEARCH_QUEUE` producer binding + `DB`)

- [ ] **Step 1:** Create `workers/research/index.ts` (ABOUTME header) exporting:
  - `scheduled(_controller, env, _ctx)`: `const db = d1Executor(env.DB); const msgs = await selectResearchSeeds(db, { gateVersion: GATE_VERSION, limit: SEED_BATCH_LIMIT }); await enqueueResearchBatch(env.RESEARCH_QUEUE, msgs);`
  - `queue(batch, env, _ctx)`: build `deps` = `{ researchClaim: (input) => researchClaim(input, { provider: new StubResearchProvider(), fetchSource: (url) => fetchSourceText(url, { fetchImpl: fetch, now: new Date() }), now: new Date(), maxProposals: DEFAULT_MAX_PROPOSALS, perHostCap: DEFAULT_PER_HOST_CAP }), packStore: makeResearchPackStore(d1Executor(env.DB)), audit: makeAuditLog(d1Executor(env.DB)), now: new Date() }`; `await processBatch(batch, deps);`
  - Use a small `makeDeps(env)` factory so the provider is one line for the Gemini slice to swap. Add a code comment: the stub yields `no_proposals` packs which are PK-poison — the Gemini slice MUST clean up stub packs before enabling the cron (spec §8).
- [ ] **Step 2:** Create `workers/research/wrangler.jsonc`: `name: "wikiasofnow-research"`; `main: "index.ts"`; `compatibility_date` (match the web worker); `compatibility_flags: ["global_fetch_strictly_public"]` (NO `nodejs_compat`); `d1_databases: [{ binding: "DB", database_name: "wikiasofnow", database_id: "<same as web>" }]` (NO `migrations_dir` — the web worker owns migrations); `queues.producers: [{ binding: "RESEARCH_QUEUE", queue: "research" }]`; `queues.consumers: [{ queue: "research", max_batch_size: 1, max_retries: 3, dead_letter_queue: "research-dlq" }]`; `observability.enabled: true`. **NO `triggers.crons`** (dormant — spec §4).
- [ ] **Step 3:** Add `package.json` script `"deploy:research": "wrangler deploy -c workers/research/wrangler.jsonc"`. Add a comment/README note that `wrangler queues create research` and `wrangler queues create research-dlq` must be run once before first deploy.
- [ ] **Step 4: Verify the bundle is clean** (the load-bearing check): `pnpm exec wrangler deploy -c workers/research/wrangler.jsonc --dry-run --outdir /tmp/research-bundle` → MUST succeed with no `better-sqlite3`/native-module error and no `nodejs_compat` requirement. Then `grep -rl "better-sqlite3" /tmp/research-bundle` → empty. (If the dry-run pulls `better-sqlite3`, the Phase-1 split/lint guard has a gap — STOP and fix it, do not add `nodejs_compat` to paper over it.) `pnpm exec tsc --noEmit` + `pnpm lint` clean.
- [ ] **Step 5: Commit + push.** `git commit -m "feat(worker): dedicated research worker (queue + scheduled), shared D1, global_fetch_strictly_public, dormant cron"`

**After Phase 5:** ≥3 review rounds — the worker imports only the portable `client` (lint guard passes; dry-run bundle is `better-sqlite3`-free, no `nodejs_compat`); NO `triggers.crons`; D1 binding has no `migrations_dir`; the provider is the stub behind a one-line `makeDeps` swap point; the stub-pack-PK-poison precondition is noted in-code.

---

## Phase 6 — workers-pool test project + integration tests + CI

**Execution Status:** 🚧 IN PROGRESS (claimed 2026-06-07, branch `claude/research-queue-transport-impl-L8Klm`)

Implements spec §7. Proves the REAL Cloudflare binding/ack/retry/DLQ/cron mapping in `workerd` (Miniflare), which the Node faithful-fake pool cannot. Adds a second vitest project and wires both into CI.

### Task 6.1: Add the workers-pool project

**Files:**
- Modify: `package.json` (add `@cloudflare/vitest-pool-workers` dev dep + `test:workers` script)
- Create: `vitest.workers.config.ts`
- Create: `test/workers/` dir for workerd-pool tests

- [ ] **Step 1:** `pnpm add -D @cloudflare/vitest-pool-workers` (peers `vitest ^4.1.0` — matches our 4.1.8); `pnpm rebuild better-sqlite3`.
- [ ] **Step 2:** Create `vitest.workers.config.ts` using `defineWorkersConfig` from `@cloudflare/vitest-pool-workers/config`, `test.include: ["test/workers/**/*.test.ts"]`, and `poolOptions.workers.wrangler.configPath: "./workers/research/wrangler.jsonc"` (so the pool provides the real `DB` + `RESEARCH_QUEUE` bindings via Miniflare). Apply the `migrations/` to the Miniflare D1 in a setup (per the pool's D1 migration mechanism). Ensure the Node project (`vitest.config.ts`) EXCLUDES `test/workers/**` so the two projects don't overlap.
- [ ] **Step 3:** Add `package.json` script `"test:workers": "vitest run -c vitest.workers.config.ts"`.
- [ ] **Step 4: Verify** `pnpm test:workers` runs (even with zero tests yet) and `pnpm test` (Node pool) still excludes `test/workers/**`.
- [ ] **Step 5: Commit + push.** `git commit -m "test(workers): add @cloudflare/vitest-pool-workers project (real D1+Queues via Miniflare)"`

### Task 6.2: Integration tests (happy-path delivery + retry→DLQ + scheduled)

**Files:** Create `test/workers/research-worker.test.ts`.

- [ ] **Step 1: Write the tests** (real Miniflare `env.DB` + `env.RESEARCH_QUEUE`; apply migrations; seed an `articles` row + verdict + candidate for the cron test). Cover:
  - **happy-path delivery:** send a `ResearchMessage` for a seeded claim through `env.RESEARCH_QUEUE` (or invoke the `queue()` handler with a real batch); after the consumer runs, a (stub `no_proposals`) pack is in real D1 (`getPack`) AND its `research.completed` audit row exists — proving the d1 `batch()` atomic commit on REAL D1.
  - **retry → DLQ:** the per-message **retry() mapping** is already proven deterministically in the Node pool (Phase 3, faithful fake: handler throws → `retry()`). Real DLQ *routing* is hard to induce in the live worker because the stub never throws (and `provider_unavailable` requires a non-stub provider). **Do NOT add a production test-seam just to force a throw.** If the workers-pool can induce a genuine failure WITHOUT contorting the worker (e.g. the pool exposes a way to fail a consume, or a transient D1 error can be simulated), assert the message reaches `research-dlq` after `max_retries`. Otherwise: rely on the Phase-3 `retry()` proof + document DLQ routing as covered-by-faithful-fake + a one-line `wrangler` manual-verification note, and record it as a named test residual. Either way, do NOT weaken or fake it.
  - **scheduled enqueue:** invoke the `scheduled()` handler; assert the selected seed message(s) were enqueued to `RESEARCH_QUEUE`.
  - These tests make NO outbound `fetch` (the stub returns `no_proposals` → zero `fetchSource` calls), so no network + `global_fetch_strictly_public` is moot.
- [ ] **Step 2: Run** `pnpm test:workers` → iterate to green.
- [ ] **Step 3: Commit + push.** `git commit -m "test(workers): research worker integration — delivery+atomic-commit, retry→DLQ, scheduled enqueue"`

### Task 6.3: CI runs both pools

**Files:** Modify `.github/workflows/ci.yml`.

- [ ] **Step 1:** Add `- run: pnpm test:workers` after the existing `pnpm test` step (and ensure `pnpm install --frozen-lockfile` picks up the new dev dep + `pnpm rebuild better-sqlite3` stays).
- [ ] **Step 2: Verify** the YAML is well-formed; both `pnpm test` and `pnpm test:workers` are present.
- [ ] **Step 3: Commit + push.** `git commit -m "ci: run the workers-pool test project alongside the node suite"` Confirm both jobs go green on the PR (via the GitHub Actions check).

**After Phase 6:** ≥3 review rounds — the workers-pool test proves atomic pack+audit on REAL D1 (not just better-sqlite3); the retry→DLQ test proves the real ack/retry/DLQ mapping (not just the faithful fake); `scheduled()` enqueues; the two vitest projects don't overlap (no double-run, no better-sqlite3 in the workers pool); CI runs both and is green.

---

## Final integration

- [ ] Both test projects green + pristine: `pnpm test` (Node) + `pnpm test:workers` (workerd); `pnpm exec tsc --noEmit`; `pnpm lint`. CI green on the branch's PR (both jobs).
- [ ] `pnpm exec wrangler deploy -c workers/research/wrangler.jsonc --dry-run` succeeds, bundle `better-sqlite3`-free, no `nodejs_compat`.
- [ ] Rebase onto latest `origin/dev` if it moved; resolve conflicts in `src/db/client.ts` / `src/queue/research-jobs.ts` / `.github/workflows/ci.yml` by re-running both test projects.
- [ ] Open a PR to `dev`. `## Merge classification`: **Review — compliance** (this slice changes the merged G13 audit-commit path to atomic and adds the SSRF-fetching background worker). Link the spec + this plan. Do NOT self-merge.

### Gemini-slice preconditions (recorded — handled in the NEXT slice, not here)

- **Stub packs are PK-poison:** before enabling the cron with the real provider, clean up terminal stub packs (`deletePack` where `model_version = 'fake-provider/0'`) OR add a model dimension to `has()`/surfacing — with a test. (None are written to prod in this slice; the worker is dormant.)
- Enable `triggers.crons` (interval MUST exceed worst-case batch drain to avoid overlap re-enqueues).
- Add a per-message AbortController time budget (~25–30s) and re-evaluate `max_batch_size` / intra-claim fetch concurrency (with a host limiter) before raising throughput (spec §5).
- Swap `StubResearchProvider` → the real Gemini provider in `makeDeps(env)` (the one-line seam).
- Add the provider slice's pre-claim placeholder row to bound concurrent-redelivery double-spend.

---

## Self-Review (author checklist — completed at write time)

**Spec coverage:** §1 topology → Phase 5; §2 batch()/atomic pack+audit → Phase 2; §3 process-batch + seed + enqueueResearchBatch → Phases 3+4; §4 worker entry + dormant cron → Phase 5; §5 config (max_batch_size=1, SEED_BATCH_LIMIT) → Phases 4+5; §6 client.ts split + lint → Phase 1; §7 hybrid tests → Phases 1–4 (Node) + Phase 6 (workers pool) + CI; §8 residuals + Gemini preconditions → Final integration. No uncovered spec section.

**Placeholder scan:** high-stakes units (batch(), commitTerminal, the seed query+dedup, processBatch) carry full test+impl direction; the worker entry + wrangler carry the exact config; the workers-pool config references the research wrangler. No TBD/TODO.

**Type consistency:** `SqlExecutor.batch` (Phase 2.1) used by `commitTerminal` (2.2) + the worker; `insertPackStatement`/`appendStatement` (2.2) used in `commitTerminal` + consumer (2.3); `ResearchMessage` (merged) produced by `selectResearchSeeds` (4.1) + consumed by `enqueueResearchBatch` (4.2) + `processBatch` (3.1); `SEED_BATCH_LIMIT`/`OVERSELECT_FACTOR` (4) used by the worker (5); `makeResearchPackStore`/`makeAuditLog`/`researchClaim`/`fetchSourceText`/`StubResearchProvider` (merged) wired in the worker (5).

**Ordering:** 1 (split, foundation) → 2 (batch+atomic, needs the port) → 3 (process-batch) and 4 (seed) both need 1/merged code, independent of each other → 5 (worker, needs 2+3+4) → 6 (workers-pool tests, needs 5). No two parallel tasks edit the same file.
