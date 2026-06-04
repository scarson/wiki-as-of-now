<!-- ABOUTME: Implementation plan for WikiAsOfNow v1 Foundation + deterministic detector (the blocking-dependency milestones). -->
<!-- ABOUTME: Subagent-proof, TDD-mandated; honors the sacrosanct compliance contract. Produced via writing-plans-enhanced. -->

# WikiAsOfNow v1 — Foundation + Deterministic Detector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the WikiAsOfNow app skeleton (Next.js on Cloudflare Workers + D1 + Cloudflare Queues + the foundational append-only audit log + the research provider interface) and the deterministic, explainable stale-claim detector with a fixture corpus and a precision gate — the two blocking-dependency milestones from the design doc.

**Architecture:** Next.js (App Router) deployed to Cloudflare Workers via `@opennextjs/cloudflare`; Cloudflare D1 for relational storage (plain SQL migrations; `better-sqlite3` in-memory for local/test, applying the same migration SQL); Cloudflare Queues for async research jobs. The stale-claim detector is **pure, deterministic, LLM-free** (compliance guardrail "detection is deterministic and explainable"): it parses an article into sections + sentences, flags future-tense/expectation claims anchored to an explicit year now in the past, suppresses known false-positive patterns, and emits an explainable score per candidate. The research/LLM layer is only an interface + stub in this plan.

**Tech Stack:** TypeScript (Node 24 per `.nvmrc`), Next.js 16, `@opennextjs/cloudflare`, Wrangler, Cloudflare D1 + Queues, `arctic` + `jose` (auth — interface only here, full auth is a later milestone), `wtf_wikipedia` (wikitext → sections/sentences parsing), Vitest (unit/integration), `better-sqlite3` (test DB).

**Source documents (authoritative — read before executing):**
- Design: `docs/design/office-hours/wikiasofnow-v1-design.md`
- **Sacrosanct compliance contract:** `docs/policy/wikipedia-genai-compliance.md` (the detector being LLM-free is the "detection is deterministic" guardrail; the append-only audit log is the "audit log is foundational" guardrail)
- Spec: `docs/design/WikiAsOfNow_design_spec.md`
- Pitfalls (currently template stubs — populate domain entries as you discover them): `docs/pitfalls/implementation-pitfalls.md`, `docs/pitfalls/testing-pitfalls.md`

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

**Overall:** In progress. 0/2 phases shipped.

| Phase | Status | Ship SHA(s) | Notes |
|---|---|---|---|
| 1 — Foundation | 🚧 In progress | — | claimed 2026-06-04T20:12:59Z on `claude/wikiasofnow-foundation-detector-o2yCO` (subagent-driven execution) |
| 2 — Deterministic detector + fixtures | ⬜ Not started | — | depends on Phase 1 types + Task 2.1 |

### Task completion log
- **Task 1.1** (scaffold + Vitest): ✅ DONE — impl `3846c90`, code-review follow-up `e26a1be`. Spec review ✅, code-quality review ✅. Gates: `pnpm test` green, `pnpm exec tsc --noEmit` clean, `pnpm lint` exit 0.
- **Task 1.2** (D1 migration + SqlExecutor): ✅ DONE — impl `ff905c0`, code-review follow-up `c1cdd9a`. Spec review ✅, code-quality review ✅ (with concerns, triaged below). Gates: `pnpm test` 3/3, `tsc` clean, `lint` clean. Three tables match spec; `audit_log` is PII-clean; SQL byte-identical across the two files; `DB` D1 binding + `migrations_dir` set; env types regenerated.
- **Task 1.3** (append-only audit log): ✅ DONE — impl `39bc9ad`, code-review follow-up `4cd4226`. Spec review ✅ (append-only verified structurally — only `append`+`read`, no mutation/removal path; payload opaque `unknown`), code-quality review ✅ (concerns fixed). Gates: `pnpm test` 6/6, `tsc` clean, `lint` clean. Added `test/helpers/db.ts:freshTestDb()` (FK-on) used by both DB test files.
- **Task 1.4** (research provider interface + stub): ✅ DONE — impl `826a5d0`, lint-hygiene follow-up `83f801f`, style nit `(blank-line)`. Spec review ✅, code-quality review ✅ (no must-fix). Gates: `pnpm test` 7/7, `tsc` clean, `lint` clean. `EvidenceCard` has exactly `url`/`verbatimQuote`/`advisorySupport` with a compliance doc comment naming the bounded-LLM-role + no-machine-written-text guardrails; no LLM call (boundary only). Established the `_`-prefix unused-var lint convention for required-but-unused interface params.
- **Task 1.5** (research-job queue skeleton): ✅ DONE — impl `e037f86`, code-review follow-up `4a9d76f`. Spec review ✅ (idempotency exact; audit payload identifiers-only — result goes to `store`, not the log; no live-queue/D1 wiring; no real LLM), code-quality review ✅. Gates: `pnpm test` 8/8 (deterministic — ran twice), `tsc` clean, `lint` clean. Kept the spec's `{has,get,set}` store shape (pushed back on a "remove `get`" suggestion). TOCTOU on check-then-act is per-spec for the skeleton (concurrency control deferred).

### Deviations
- **Task 1.1 — eslint/scripts fixed beyond bare scaffold (`e26a1be`).** Code-quality review found the C3 scaffold shipped no `test` script, a broken `lint` script (`next lint` was removed in Next 16), and `@types/node ^20` skewed against the Node 24 runtime. Fixed all three (added `test`/`test:watch`, migrated eslint to native flat config, bumped `@types/node` to `^24`). Slightly beyond "scaffolding only," but in-scope bug fixes per the project's broken-windows rule; no new product surface added.

### Discoveries
- **Next.js 16 + ESLint 9 lint setup is broken as generated by C3.** `next lint` no longer exists in Next 16, and the C3 `eslint.config.mjs` uses `FlatCompat` to extend `next/core-web-vitals`, which crashes with a circular-reference validation error under ESLint 9. Fix: import `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript` directly (they are native flat-config arrays in v16) and scope `ignores` to exclude build output + vendored `.claude/` tooling + generated `*.d.ts`. (`eslint.config.mjs`)
- **`SqlExecutor` models a synchronous (better-sqlite3) contract; D1 is async (returns Promises).** Code-review of Task 1.2 flagged that `run()/.all()` typed as `unknown`/`unknown[]` hide a sync-vs-async mismatch. Deliberately kept sync because the plan's Task 1.3/1.5 tests are synchronous and live D1 is NOT wired in this milestone ("a deploy step, not unit-tested here"). **Future D1-wiring plan MUST add an async-aware adapter** before any consuming module (audit log, handlers) runs against real D1 — calling these as if synchronous will break on D1. Documented at the code site in `src/db/client.ts`. ⚠️ Flagged to Sam as a possible early architectural pivot (sync→async data layer).
- **FK enforcement differs local vs D1.** better-sqlite3 leaves `foreign_keys` OFF by default; D1 enforces them. Without `PRAGMA foreign_keys = ON`, local tests can false-pass on referential-integrity violations (e.g. `stale_candidates.page_id → articles`). Fixed in `openLocalDb` (`c1cdd9a`). Belongs in `docs/pitfalls/testing-pitfalls.md` at the Phase 1 review.
- **Shared working tree + subagents: `git checkout <sha>` detaches HEAD for the whole repo.** A Task 1.2 reviewer subagent ran `git checkout ff905c0` to inspect the commit, detaching HEAD; a subsequent controller commit landed on the detached HEAD instead of the branch (recovered via `git branch -f` + checkout, no work lost). **Mitigation:** review-subagent dispatch prompts MUST forbid any HEAD-moving git command (`checkout`/`switch`/`reset`); use `git show`/`git diff`/read-in-place only. Controller checks `git status -sb` for detachment after each subagent batch.

---

## File structure (locked decomposition)

```
package.json, tsconfig.json, wrangler.jsonc, open-next.config.ts, vitest.config.ts, .nvmrc
src/
  domain/
    types.ts                # ParsedArticle, Section, SentenceUnit, StaleCandidate, ScoreBreakdown
  db/
    schema.sql              # canonical migration source (also under migrations/)
    client.ts               # D1 in Workers; better-sqlite3 locally/in tests (same SQL)
    audit-log.ts            # append-only audit log: append(), read(); NO update/delete
  research/
    provider.ts             # ResearchProvider interface (LLM layer boundary) + types
    stub-provider.ts        # no-op provider used until the real one lands
  queue/
    research-jobs.ts        # enqueue(producer) + handleMessage(consumer) skeleton
  detector/
    parse.ts                # wikitext -> ParsedArticle (wraps wtf_wikipedia)
    markers.ts              # future-tense/expectation marker lexicon + year extraction
    suppress.ts             # negative-pattern (false-positive) suppression
    score.ts                # explainable multi-factor scoring
    detect.ts               # detectStaleClaims(article, asOfYear) orchestration
migrations/
  0001_init.sql             # audit_log + articles + stale_candidates (mirrors schema.sql)
test/
  fixtures/                 # real article wikitext: sbx-1.wikitext, plus procurement articles
  gold/                     # gold-set.json: labeled stale / not-stale sentences
  detector/*.test.ts, db/*.test.ts, queue/*.test.ts
```

Rationale for splitting the detector into `markers` / `suppress` / `score` / `detect`: each is independently testable and holds in context at once; `detect.ts` is pure orchestration over the other three.

---

## TDD discipline (applies to EVERY task below)

These bind every task; they are stated once here rather than repeated per task (DRY).

- **BEFORE starting any task:** invoke `superpowers:test-driven-development`; read `docs/pitfalls/testing-pitfalls.md`. Follow TDD strictly: write the failing test → run it and watch it fail for the right reason → write the minimal code → run it green → refactor green → commit.
- **BEFORE marking any task complete:** review the task's tests against `docs/pitfalls/testing-pitfalls.md`; confirm error paths and edge cases are covered; run `pnpm vitest run` (green) and `pnpm exec tsc --noEmit` (clean).
- **For any task whose tests touch timing, concurrency, cancellation, or cross-task coordination** (notably Task 1.5): if an assertion races, flakes, or fails nondeterministically, the fix is deterministic synchronization (awaitable fences), NOT assertion removal or weakening. If synchronization cannot make it pass reliably, STOP and raise to the dispatching agent. Prefer mechanism assertions over symptom assertions. Commit subjects touching test assertions state what happened to them ("add"/"strengthen"/"preserve"), never vague "CI fix".
- **After each phase:** the per-phase "After completing Phase N" review block (minimum 3 rounds) is mandatory.

---

## Phase 1 — Foundation

**Execution Status:** 🚧 IN PROGRESS — claimed 2026-06-04T20:12:59Z on branch `claude/wikiasofnow-foundation-detector-o2yCO`. Liveness: recent commits on that branch + this banner.

> Compliance touchpoints: the audit log (Task 1.3) is the "audit log is foundational" guardrail — append-only, built now, not later. The research provider (Task 1.4) is the boundary that keeps the LLM layer swappable and bounded.

### Task 1.1: Scaffold the app + test runner

**Package manager:** pnpm. Every `pnpm …` command below assumes it; if the scaffold tool emits an npm/bun lockfile, convert to pnpm before Step 5.

**Files:**
- Create: `package.json`, `tsconfig.json`, `wrangler.jsonc`, `open-next.config.ts`, `vitest.config.ts`, `src/app/page.tsx`, `src/domain/version.ts`, `test/smoke.test.ts`
- Already present — do NOT recreate or overwrite: `.nvmrc` (Node 24), `.gitignore`, `README.md`, `LICENSE`

- [ ] **Step 1: Write the failing smoke test**
```ts
// test/smoke.test.ts
import { describe, it, expect } from "vitest";
import { appName } from "../src/domain/version";
describe("smoke", () => {
  it("exposes the app name", () => { expect(appName()).toBe("WikiAsOfNow"); });
});
```
- [ ] **Step 2: Run it, verify it fails** — `pnpm vitest run test/smoke.test.ts` → FAIL (module not found).
- [ ] **Step 3: Scaffold + minimal impl.** Pinned approach: scaffold with the Cloudflare Next.js template — `pnpm create cloudflare@latest wikiasofnow -- --framework=next` — then relocate its output into this repo root (do not nest a second git repo; keep the existing `.git`, `.gitignore`, `.nvmrc`, `README.md`, `LICENSE`). This yields Next.js 16 + `@opennextjs/cloudflare` + `wrangler` preconfigured. Add deps: `pnpm add wtf_wikipedia arctic jose` and `pnpm add -D vitest better-sqlite3 @types/better-sqlite3`. Configure `vitest.config.ts` with `test: { environment: "node" }` (the unit/integration tests run in Node so the native `better-sqlite3` module loads; do NOT use a Workers/edge Vitest pool for these tests). Ensure `.gitignore` covers `node_modules/`, `.next/`, and `.open-next/` before committing. Create `src/domain/version.ts`:
```ts
export function appName(): string { return "WikiAsOfNow"; }
```
- [ ] **Step 4: Run tests, verify green** — `pnpm vitest run` → PASS.
- [ ] **Step 5: Commit** — `git status` first, confirm no `node_modules/`/`.next/`/`.open-next/` are staged, then `git add -A && git commit -m "chore: scaffold Next.js-on-Cloudflare app + Vitest"`.

**Do NOT:** add a UI beyond a placeholder page, add auth wiring, add the research provider implementation, or overwrite the existing `.nvmrc`/`.gitignore`. Scaffolding only.

BEFORE starting work: invoke `superpowers:test-driven-development`; read `docs/pitfalls/testing-pitfalls.md`.
BEFORE marking complete: run `pnpm vitest run` (green); confirm `pnpm exec tsc --noEmit` passes.

### Task 1.2: Initial D1 migration — audit_log + core tables

**Files:**
- Create: `migrations/0001_init.sql`, `src/db/schema.sql` (identical content; `schema.sql` is the readable canonical copy), `src/db/client.ts`, `test/db/migration.test.ts`

- [ ] **Step 1: Write the failing migration test**
```ts
// test/db/migration.test.ts
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
describe("0001_init migration", () => {
  it("creates audit_log, articles, stale_candidates", () => {
    const db = new Database(":memory:");
    db.exec(readFileSync("migrations/0001_init.sql", "utf8"));
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map((r: any) => r.name);
    expect(tables).toEqual(expect.arrayContaining(["articles", "audit_log", "stale_candidates"]));
  });
  it("audit_log has an append-only shape (id, ts, actor, event_type, payload_json)", () => {
    const db = new Database(":memory:");
    db.exec(readFileSync("migrations/0001_init.sql", "utf8"));
    const cols = db.prepare("PRAGMA table_info(audit_log)").all().map((r: any) => r.name);
    expect(cols).toEqual(expect.arrayContaining(["id", "ts", "actor", "event_type", "payload_json"]));
  });
});
```
- [ ] **Step 2: Run it, verify it fails** — FAIL (file missing).
- [ ] **Step 3: Write `migrations/0001_init.sql`** (copy verbatim to `src/db/schema.sql`), and create `src/db/client.ts` defining the **`SqlExecutor`** interface — the minimal shape `{ prepare(sql: string): { run(...args: unknown[]): unknown; all(...args: unknown[]): unknown[] } }` that both `better-sqlite3` and a Cloudflare `D1Database` satisfy — plus a helper that opens a `better-sqlite3` connection for local/test use. (Task 1.3 consumes `SqlExecutor`.) The migration SQL:
```sql
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,                 -- ISO 8601 UTC
  actor TEXT NOT NULL,              -- user id or 'system'
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL        -- identifiers only; never PII/document content (see compliance + PII pitfall)
);
CREATE TABLE articles (
  page_id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  revision_id INTEGER NOT NULL,
  fetched_at TEXT NOT NULL
);
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
- [ ] **Step 4: Run tests, verify green.**
- [ ] **Step 5: Commit** — `git add migrations/ src/db/ test/db/ && git commit -m "feat(db): initial D1 migration + SqlExecutor client"`.

Also point `wrangler.jsonc` `migrations_dir` at `migrations/` and declare the D1 binding (e.g. `DB`). Applying migrations to a real D1 instance (`wrangler d1 migrations apply`) is a deploy step, not unit-tested here; the test validates the SQL by applying it to in-memory `better-sqlite3`.

**Do NOT** add columns that store article body content or user PII to `audit_log` (PII-in-logs pitfall; payload is identifiers only).

BEFORE/AFTER blocks: same TDD + testing-pitfalls review as Task 1.1.

### Task 1.3: Append-only audit-log module

**Files:**
- Create: `src/db/audit-log.ts`, `test/db/audit-log.test.ts`

- [ ] **Step 1: Failing test**
```ts
// test/db/audit-log.test.ts
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { makeAuditLog } from "../../src/db/audit-log";
function freshDb() { const db = new Database(":memory:"); db.exec(readFileSync("migrations/0001_init.sql","utf8")); return db; }
describe("audit log", () => {
  it("appends and reads back in insertion order", () => {
    const log = makeAuditLog(freshDb());
    log.append({ actor: "system", eventType: "detector.run", payload: { pageId: 42 } });
    log.append({ actor: "u1", eventType: "source.opened", payload: { candidateId: 7 } });
    const rows = log.read();
    expect(rows.map(r => r.eventType)).toEqual(["detector.run", "source.opened"]);
    expect(rows[0].payload).toEqual({ pageId: 42 });
    expect(typeof rows[0].ts).toBe("string");
  });
  it("exposes no update or delete method (append-only)", () => {
    const log: any = makeAuditLog(freshDb());
    expect(log.update).toBeUndefined();
    expect(log.delete).toBeUndefined();
  });
});
```
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Minimal impl** — `makeAuditLog(db: SqlExecutor)` returns `{ append(entry), read() }` only. `append` inserts `ts = new Date().toISOString()` (the audit timestamp is genuinely "now" — this is the one place a real clock is correct), `payload_json = JSON.stringify(payload)`; `read` selects ordered by `id`, parsing `payload_json`. Consumes the `SqlExecutor` interface defined in Task 1.2's `client.ts` (a minimal `{ prepare(sql).run(...) / .all(...) }` shape both `better-sqlite3` and D1 satisfy).
- [ ] **Step 4: Verify green.**
- [ ] **Step 5: Commit** — `git commit -m "feat(db): append-only audit log module"`.

**Do NOT** add `update`/`delete`/`truncate` methods. Append-only is a compliance invariant; the absence of those methods is the enforcement.

### Task 1.4: Research provider interface + stub

**Files:** Create `src/research/provider.ts`, `src/research/stub-provider.ts`, `test/research/provider.test.ts`

- [ ] **Step 1: Failing test**
```ts
// test/research/provider.test.ts
import { describe, it, expect } from "vitest";
import { StubResearchProvider } from "../../src/research/stub-provider";
describe("research provider stub", () => {
  it("returns an empty, typed result with no candidates", async () => {
    const p = new StubResearchProvider();
    const r = await p.research({ claimText: "x", sectionHeading: "S", year: 2017 });
    expect(r.candidates).toEqual([]);
    expect(r.providerName).toBe("stub");
  });
});
```
- [ ] **Step 2: Run, fail. Step 3: Define the types** in `src/research/provider.ts`: `ResearchInput { claimText: string; sectionHeading: string; year: number }`; `ResearchProvider { research(input: ResearchInput): Promise<ResearchResult> }`; `ResearchResult { providerName: string; candidates: EvidenceCard[] }`; `EvidenceCard { url: string; verbatimQuote: string; advisorySupport: boolean }` (carries a real `url`, a `verbatimQuote`, an `advisorySupport` flag; never model-authored prose — add a doc comment referencing the bounded-LLM-role and no-machine-prose guardrails in the contract). `ResearchInput` is also imported by Task 1.5. Implement `StubResearchProvider` returning `{ providerName: "stub", candidates: [] }`.
- [ ] **Step 4: green. Step 5: Commit** — `git commit -m "feat(research): provider interface + no-op stub"`.

**Do NOT** implement any real LLM call here. This task defines the boundary only. Add a doc comment on `EvidenceCard` pointing to the bounded-LLM-role and no-machine-prose guardrails in `docs/policy/wikipedia-genai-compliance.md`.

### Task 1.5: Research-job queue skeleton

**Files:** Create `src/queue/research-jobs.ts`, `test/queue/research-jobs.test.ts`

- [ ] **Step 1: Failing test** — `handleMessage({ candidateId })` calls the (injected) provider, writes one `research.completed` audit entry via the (injected) audit log, and is idempotent (same message twice → provider called at most once if a result already exists; assert via a fake provider call-counter + a fake "results store").
```ts
// test/queue/research-jobs.test.ts
import { describe, it, expect, vi } from "vitest";
import { handleResearchMessage } from "../../src/queue/research-jobs";
describe("research job consumer", () => {
  it("runs research once and logs completion", async () => {
    const provider = { research: vi.fn().mockResolvedValue({ providerName: "stub", candidates: [] }) };
    const appended: any[] = [];
    const audit = { append: (e: any) => appended.push(e) };
    const store = new Map<number, unknown>();
    await handleResearchMessage({ candidateId: 7, claim: { claimText: "x", sectionHeading: "S", year: 2017 } }, { provider, audit, store });
    await handleResearchMessage({ candidateId: 7, claim: { claimText: "x", sectionHeading: "S", year: 2017 } }, { provider, audit, store });
    expect(provider.research).toHaveBeenCalledTimes(1); // idempotent
    expect(appended.filter(e => e.eventType === "research.completed").length).toBe(1);
  });
});
```
- [ ] **Step 2-4:** Implement `handleResearchMessage(msg, deps)`: if `store.has(candidateId)` return; else `await provider.research(msg.claim)`, `store.set(candidateId, result)`, `audit.append({ actor:"system", eventType:"research.completed", payload:{ candidateId } })`. Add a thin `enqueueResearch` that posts to the Cloudflare Queue binding (typed; not unit-tested here). The queue consumer may live in the Worker entry or a separate consumer Worker; wiring it to a live queue is a deploy step (not unit-tested). The `store` is an **injected abstraction** (a `{ has, get, set }` shape); its production D1 backing (a research-packs table) is a LATER milestone — do NOT add that table or its persistence here.
- [ ] **Step 5: Commit** — `git commit -m "feat(queue): research-job consumer skeleton (idempotent, audited)"`.

BEFORE marking complete (timing/coordination rule): If any test assertion races, flakes, or fails nondeterministically, the fix is deterministic synchronization (awaitable fences, not real timers) — NOT assertion removal or weakening. If synchronization cannot make it pass reliably, STOP and raise to the dispatching agent. Prefer mechanism assertions (provider called exactly once) over symptom assertions.

### After completing Phase 1
Review the batch from multiple perspectives. Minimum 3 review rounds (correctness, compliance-guardrail adherence, test rigor). If round 3 still finds issues, keep going until clean. Update this phase's Execution Status banner and the top-of-plan table. (If you dispatch these review rounds to subagents, each MUST persist its findings to a file before returning — ORCH-1 in `docs/pitfalls/implementation-pitfalls.md`. This applies to the Phase 2 review block too.)

---

## Phase 2 — Deterministic detector + fixtures

**Execution Status:** ⬜ NOT STARTED

> Compliance touchpoint: this entire phase is LLM-free (the "detection is deterministic and explainable" guardrail). No model calls anywhere in `src/detector/`.

### Task 2.1: Core domain types

**Files:** Create `src/domain/types.ts`, `test/domain/types.test.ts`

- [ ] **Step 1: Failing test** (a compile-level guard — construct each type and assert a field):
```ts
// test/domain/types.test.ts
import { describe, it, expect } from "vitest";
import type { ParsedArticle, StaleCandidate, ScoreBreakdown } from "../../src/domain/types";
describe("domain types", () => {
  it("StaleCandidate carries explanation + score breakdown", () => {
    const sb: ScoreBreakdown = { temporalRisk: 1, futureTenseConfidence: 1, suppression: 0, total: 2 };
    const c: StaleCandidate = {
      sentenceText: "x", sectionHeading: "S", year: 2017, marker: "is expected to",
      score: sb, explanation: "why", sectionIndex: 0, sentenceIndex: 1,
    };
    expect(c.score.total).toBe(2);
  });
});
```
- [ ] **Step 2-4:** Define: `SentenceUnit { text: string }`; `Section { heading: string; level: number; sentences: SentenceUnit[] }`; `ParsedArticle { title: string; revisionId: number; sections: Section[] }`; `ScoreBreakdown { temporalRisk: number; futureTenseConfidence: number; suppression: number; total: number }`; `StaleCandidate { sentenceText; sectionHeading; year; marker; score: ScoreBreakdown; explanation; sectionIndex; sentenceIndex }`. (Location is section+sentence index + heading; precise wikitext offset is deferred per the design doc's noted simplification — record this as a Deviation if/when it bites.)
- [ ] **Step 5: Commit** — `git commit -m "feat(domain): core detector types"`.

### Task 2.2: Article parser (wikitext → ParsedArticle)

**Files:** Create `src/detector/parse.ts`, `test/detector/parse.test.ts`

- [ ] **Step 1: Failing test**
```ts
// test/detector/parse.test.ts
import { describe, it, expect } from "vitest";
import { parseArticle } from "../../src/detector/parse";
describe("parseArticle", () => {
  it("splits sections by heading and sentences within them", () => {
    const wikitext = `Lead sentence one. Lead two.\n\n== Procurement ==\nThe Navy plans to award a contract in 2017. It was delayed.`;
    const a = parseArticle({ title: "Test", revisionId: 1, wikitext });
    const proc = a.sections.find(s => s.heading === "Procurement")!;
    expect(proc).toBeDefined();
    // substring match, not exact equality: robust to wtf_wikipedia's punctuation/splitting
    expect(proc.sentences.some(s => s.text.includes("plans to award a contract in 2017"))).toBe(true);
  });
});
```
- [ ] **Step 2-4:** Implement `parseArticle({title, revisionId, wikitext})` using `wtf_wikipedia`: map its sections → `Section` (heading, level), and each section's sentences → `SentenceUnit`. The lead (no heading) becomes a section with `heading: ""`. Trim and drop empty sentences.
- [ ] **Step 5: Commit** — `git commit -m "feat(detector): wikitext article parser"`.

**Do NOT** hand-roll a wikitext parser; use `wtf_wikipedia`. Note in the task: if `wtf_wikipedia` mis-splits a fixture sentence, capture it as a Discovery, do not silently special-case.

### Task 2.3: Marker + year extraction

**Files:** Create `src/detector/markers.ts`, `test/detector/markers.test.ts`

- [ ] **Step 1: Failing test** (positive + boundary cases)
```ts
// test/detector/markers.test.ts
import { describe, it, expect } from "vitest";
import { findExpectationMarkers, extractYears } from "../../src/detector/markers";
describe("markers + years", () => {
  it("detects future-tense/expectation markers", () => {
    expect(findExpectationMarkers("The Pentagon is expected to award a contract")).toContain("is expected to");
    expect(findExpectationMarkers("Construction is scheduled to begin")).toContain("is scheduled to");
    expect(findExpectationMarkers("The radar remains stationed at the site")).toEqual([]); // no expectation marker
    expect(findExpectationMarkers("Goodwill ambassadors will attend")).toContain("will"); // matches standalone 'will'
    expect(findExpectationMarkers("Goodwill ambassadors attended")).toEqual([]); // must NOT match 'will' inside 'Goodwill'
  });
  it("extracts 4-digit years", () => {
    expect(extractYears("award a contract in 2017 and again in 2025")).toEqual([2017, 2025]);
    expect(extractYears("no years here")).toEqual([]);
  });
});
```
- [ ] **Step 2-4:** Export a single `MARKER_STRENGTH: Record<string, number>` map from `markers.ts` (phrase → strength, e.g. `"is expected to": 2, "is scheduled to": 2, "is slated to": 2, "is due to": 2, "plans to": 2, "aims to": 1, "anticipated": 1, "to be completed by": 2, "will": 1`). Derive the lexicon from `Object.keys(MARKER_STRENGTH)`. `findExpectationMarkers(text)` returns the matched phrases, matched **case-insensitively and on word boundaries** (`\b` around each phrase) so bare `will` does not match inside "Williams"/"goodwill". `extractYears(text)` returns 4-digit years 1900–2099 via a word-bounded regex, in order. `MARKER_STRENGTH` is the single source of marker strength shared by Tasks 2.5 and 2.6.
- [ ] **Step 5: Commit** — `git commit -m "feat(detector): expectation markers + year extraction"`.

### Task 2.4: Negative-pattern suppression

**Files:** Create `src/detector/suppress.ts`, `test/detector/suppress.test.ts`

- [ ] **Step 1: Failing test** (the false-positive killers)
```ts
// test/detector/suppress.test.ts
import { describe, it, expect } from "vitest";
import { suppressionScore } from "../../src/detector/suppress";
describe("suppression", () => {
  it("suppresses historical narration framed in the past", () => {
    // "In 1944, the Army planned to..." — past-framed, not an unresolved expectation
    expect(suppressionScore("In 1944, the Army planned to invade.", 1944)).toBeGreaterThan(0);
  });
  it("suppresses direct quotations", () => {
    expect(suppressionScore('A spokesman said it "is expected to launch in 2017".', 2017)).toBeGreaterThan(0);
  });
  it("does not suppress a plain unresolved future-past claim", () => {
    expect(suppressionScore("The Navy plans to award a contract in 2017.", 2017)).toBe(0);
  });
});
```
- [ ] **Step 2-4:** `suppressionScore(sentence, year)` returns a non-negative penalty: +N if the sentence opens with a past-time frame — use a **grouped, anchored** regex `/^(In|By|During|As of)\s+(1[89]\d\d|20[0-2]\d)\b/` (the group around the year alternatives is required; `/^(In|...)\s+1[89]\d\d|20[0-2]\d/` is WRONG because the `|` would let the bare `20[0-2]\d` branch match any 20xx year anywhere and over-suppress valid claims) paired with past-tense verb cues like `planned|expected|was scheduled`; +N if the expectation phrase sits inside quotation marks; +N if a later-resolution cue (`later`, `subsequently`, `ultimately`) co-occurs. 0 otherwise. Document each rule with the false-positive class it guards (cross-link the spec's negative-pattern list).
- [ ] **Step 5: Commit** — `git commit -m "feat(detector): false-positive suppression"`.

### Task 2.5: Explainable scoring

**Files:** Create `src/detector/score.ts`, `test/detector/score.test.ts`

- [ ] **Step 1: Failing test**
```ts
// test/detector/score.test.ts
import { describe, it, expect } from "vitest";
import { scoreClaim } from "../../src/detector/score";
describe("scoreClaim", () => {
  it("scores higher the further past the year is", () => {
    const recent = scoreClaim({ sentence: "plans to X in 2024", year: 2024, marker: "plans to", asOfYear: 2026 });
    const old = scoreClaim({ sentence: "plans to X in 2017", year: 2017, marker: "plans to", asOfYear: 2026 });
    expect(old.total).toBeGreaterThan(recent.total);
    expect(old.explanation).toContain("2017");
  });
  it("zeroes out when the year is not yet past", () => {
    const future = scoreClaim({ sentence: "plans to X in 2030", year: 2030, marker: "plans to", asOfYear: 2026 });
    expect(future.total).toBe(0);
  });
});
```
- [ ] **Step 2-4:** `scoreClaim({sentence, year, marker, asOfYear})` returns `{ breakdown: ScoreBreakdown, total, explanation }`. `temporalRisk = max(0, asOfYear - year)` (0 when year ≥ asOfYear). `futureTenseConfidence = MARKER_STRENGTH[marker]` (imported from `markers.ts`, Task 2.3 — do not redefine the map here). `suppression` from Task 2.4. `total = max(0, temporalRisk + futureTenseConfidence - suppression)`, and **0 whenever `year >= asOfYear`** (a non-past year is never stale). `explanation` is a deterministic template naming the marker, the year, and how many years past — e.g. `"Contains 'plans to' tied to 2017, now 9 years past."` (`scoreClaim` does NOT receive the section heading, so it does not mention the section; `detectStaleClaims` in Task 2.6 enriches the final `StaleCandidate.explanation` with the section heading.) This explanation is the compliance "explainability" requirement; it is template-filled, never model-authored.
- [ ] **Step 5: Commit** — `git commit -m "feat(detector): explainable multi-factor scoring"`.

### Task 2.6: detectStaleClaims orchestration

**Files:** Create `src/detector/detect.ts`, `test/detector/detect.test.ts`

- [ ] **Step 1: Failing test**
```ts
// test/detector/detect.test.ts
import { describe, it, expect } from "vitest";
import { detectStaleClaims, DETECTOR_VERSION } from "../../src/detector/detect";
import { parseArticle } from "../../src/detector/parse";
describe("detectStaleClaims", () => {
  it("flags a past-year expectation claim and ignores a future-year one", () => {
    // The 2030 sentence HAS a real marker ("is expected to") but a future year, so it must
    // be excluded by the year gate — not merely for lacking a marker.
    const wikitext = `== Procurement ==\nThe Navy plans to award a contract in 2017.\nA follow-on contract is expected to be awarded in 2030.`;
    const article = parseArticle({ title: "T", revisionId: 1, wikitext });
    const out = detectStaleClaims(article, 2026);
    const years = out.map(c => c.year);
    expect(years).toContain(2017);
    expect(years).not.toContain(2030);
    expect(out[0].explanation.length).toBeGreaterThan(0);
  });
  it("is pure: no network, deterministic across runs", () => {
    const wikitext = `== S ==\nplans to launch in 2015.`;
    const a = parseArticle({ title: "T", revisionId: 1, wikitext });
    expect(detectStaleClaims(a, 2026)).toEqual(detectStaleClaims(a, 2026));
  });
});
```
- [ ] **Step 2-4:** `detectStaleClaims(article, asOfYear)` iterates sections→sentences, for each sentence with ≥1 expectation marker and ≥1 extracted year `< asOfYear`, builds a `StaleCandidate` via `scoreClaim` (when a sentence has several markers/years, pick the marker with the highest `MARKER_STRENGTH` and the earliest past year), sets the candidate's `explanation` to `scoreClaim`'s explanation plus a section clause (e.g. `" Appears in section 'Procurement'."`; empty-heading lead → `" Appears in the lead."`), records `sectionIndex`/`sentenceIndex`, drops candidates with `total === 0`, and sorts by `score.total` desc. Export `DETECTOR_VERSION = "1.0.0"`. **No imports from `src/research/` and no async/network** (assert purity in the test above).

**Do NOT** call `new Date()` / read the clock inside `src/detector/`. `asOfYear` is always an injected parameter; the caller (a route/job, later) supplies the current year. Tests MUST pass a fixed `asOfYear` (e.g. `2026`) so they stay deterministic as real-article fixtures age.
- [ ] **Step 5: Commit** — `git commit -m "feat(detector): detectStaleClaims orchestration"`.

### Task 2.7: Fixture corpus + gold set + precision gate

**Files:** Create `test/fixtures/sbx-1.wikitext` (+ 2-3 procurement articles), `test/gold/gold-set.json`, `test/detector/precision.test.ts`

- [ ] **Step 1: Build the fixtures.** The parser (`wtf_wikipedia`) needs **raw wikitext**, so fetch it from the MediaWiki raw/source endpoint, e.g. `https://en.wikipedia.org/wiki/Sea-based_X-band_radar?action=raw` (or the API `?action=query&prop=revisions&rvprop=content&rvslots=main&format=json`). **Do NOT use the `url-to-markdown` skill here** — it emits readable prose, not wikitext, which is the wrong format for the parser. (`url-to-markdown` is for faithfully grounding *prose* sources like the compliance docs; `WebFetch` is wrong for both because it summarizes.) Fetch with a descriptive User-Agent per the responsible-access guardrail. Save raw wikitext for Sea-Based X-Band Radar plus 2-3 military-procurement articles under `test/fixtures/*.wikitext`. Hand-label `gold-set.json` as `[{ fixture, sentenceSubstring, stale: true|false, expectedYear? }]` covering: ≥3 true date-anchored stale claims (incl. the SBX-1 line), ≥3 true negatives (future-year, historical-narration, quotation, resolved-nearby).
- [ ] **Step 2: Failing precision test**
```ts
// test/detector/precision.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseArticle } from "../../src/detector/parse";
import { detectStaleClaims } from "../../src/detector/detect";
const gold = JSON.parse(readFileSync("test/gold/gold-set.json","utf8")) as any[];
describe("detector gold-set precision", () => {
  // NOTE: this measures precision over the LABELED gold subset only (does the
  // detector flag the labeled positives and avoid flagging the labeled negatives),
  // NOT true precision over every sentence in the articles. It is a regression
  // gate, not a true-precision metric. Precision over recall is the design choice.
  it("gold-set precision >= 0.9", () => {
    let tp = 0, fp = 0;
    for (const g of gold) {
      const wikitext = readFileSync(`test/fixtures/${g.fixture}`, "utf8");
      const cands = detectStaleClaims(parseArticle({ title: g.fixture, revisionId: 1, wikitext }), 2026);
      const flagged = cands.some(c => c.sentenceText.includes(g.sentenceSubstring));
      if (g.stale && flagged) tp++;
      if (!g.stale && flagged) fp++;
    }
    const precision = tp / (tp + fp || 1);
    expect(precision).toBeGreaterThanOrEqual(0.9);
  });
});
```
- [ ] **Step 3: Tune** `markers`/`suppress`/`score` until the gate passes by *improving suppression*, never by deleting gold-set negatives. If a true stale claim can't be caught without dropping precision below 0.9, record it as a Discovery (recall gap) and leave it — precision-over-recall is the design choice.
- [ ] **Step 4: green. Step 5: Commit** — `git commit -m "test(detector): fixture corpus + gold set + precision gate"`.

BEFORE marking complete: review tests against `docs/pitfalls/testing-pitfalls.md`; confirm the gold set has real negatives (not just positives); confirm no test weakens the precision threshold to pass. If precision is gamed by removing negatives, that is the exact rigor regression the assertion-preservation rule forbids — STOP and raise instead.

### After completing Phase 2
Minimum 3 review rounds (detector correctness on edge cases; purity/no-LLM compliance; gold-set honesty + assertion rigor). Update banners + the top-of-plan table. Populate `docs/pitfalls/implementation-pitfalls.md` with any detector pitfall discovered (e.g., a `wtf_wikipedia` splitting quirk), per that doc's maintenance checklist.

---

## Self-review (run by the plan author before review cycle)

- **Spec coverage:** Foundation (scaffold, D1+audit log, provider interface, queue) and detector (parse→markers→suppress→score→detect→precision gate) cover the design doc's "Foundation" and "Deterministic detector + fixtures" milestones and their blocking dependencies (async primitive in Task 1.5; article-text representation in Task 2.1/2.2). Auth, queue UI, transparency surface, two-mode queue, and About page are explicitly out of scope for this plan (later milestones).
- **Placeholder scan:** every code step carries real code; no TBD/TODO-as-implementation.
- **Type consistency:** `ParsedArticle`/`Section`/`SentenceUnit`/`ScoreBreakdown`/`StaleCandidate` defined in Task 2.1 are used consistently in 2.2–2.7; `ResearchProvider`/`EvidenceCard` defined in 1.4 are used in 1.5.

## Plan review record

Ran `/plan-review-cycle` (self-run runner, 7 rounds, ended clean). Findings fixed:
R1 (11) — fixtures must be raw wikitext via `action=raw` not `url-to-markdown`; pinned scaffold (Cloudflare C3); package manager (pnpm); Vitest node env; `.nvmrc` already exists; `SqlExecutor`/`ResearchInput` ownership; determinism (no `new Date()` in detector); gold-set-precision labeling; gitignore coverage; ORCH-1 note. R2 (4) — grouped suppression regex (the un-grouped form over-suppressed any 20xx year); `scoreClaim` explanation/section consistency; substring assertion for `wtf_wikipedia` output; `migrations_dir` note. R3 (3) — `MARKER_STRENGTH` consolidated into `markers.ts` (DRY); word-boundary marker matching; table name. R4 (2) — detect fixture now exercises the year gate with a real marker; added a word-boundary regression test. R5 (1) — `store` is an injected abstraction, research-packs table deferred. R6 (1) — global TDD-discipline block binding every task. R7 — clean.

## Notes for the executor on compliance

This plan builds only the deterministic detector and the LLM-layer *boundary*. No task here calls a model. When the research provider is later implemented (a separate plan), it MUST satisfy every guardrail in `docs/policy/wikipedia-genai-compliance.md` — fetched-content-as-untrusted-data, the verbatim-quote check, mechanical citations, no machine prose. The `EvidenceCard` type and the audit log built here are the seams that make those guardrails enforceable.
