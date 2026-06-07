<!-- ABOUTME: Design spec for the async batch queue transport + seed list (build-sequence step 6) on top of the merged research-engine slice A. -->
<!-- ABOUTME: A dedicated Cloudflare Worker consumes a Queue (per-message ack/retry) and a cron seeds easy-win candidates; built against the fake/stub provider (no Gemini key). Hardened over a 5-round adversarial review (self ↔ Opus). -->

# Design — Research queue transport + seed list (step 6)

**Status:** designed, hardened over 5 adversarial rounds (self → Opus → self → Opus → self). Ready for `writing-plans`.

**Goal.** Turn the merged single-message research consumer into a real, scaled, **autonomous-when-enabled** background pipeline: a dedicated Cloudflare Worker that (1) **consumes** a Cloudflare Queue, mapping each message through the existing `handleResearchMessage` with **per-message ack/retry** (never a whole-batch throw), and (2) **seeds** that queue from the deterministic easy-win candidate set on a cron, with bounded fan-out (G14). Built entirely against the **existing stub provider** — no Gemini key required.

**Why now / what it excludes.** The transport + seed are provider-agnostic plumbing that is fully buildable and testable against the stub. The **real Gemini provider** stays deferred (one swap behind the `ResearchProvider` seam). Also deferred: per-user quotas/auth; a manual/admin enqueue trigger; a DLQ *consumer*/alerting; the snippet assembler + worksheet UI.

**Authoritative context.** Builds on [docs/design/2026-06-06-research-engine-design.md](2026-06-06-research-engine-design.md) (the merged slice A). Compliance: [docs/policy/wikipedia-genai-compliance.md](../policy/wikipedia-genai-compliance.md) — load-bearing here are **G13** (append-only, codes-only audit), **G14** (responsible automated access / bounded fan-out), **G15** (fetched content untrusted; the SSRF guard). Pitfalls: `docs/pitfalls/implementation-pitfalls.md` DB-1/DB-2.

---

## Living Document Contract

Same discipline as the slice-A docs: the executing agent updates this as execution progresses (phase claim → 🚧, ship → ✅ + SHA, deviations inline + summarized, discoveries at top). The §Reasoning & adversarial review trail is durable thinking documentation — do not delete it.

---

## 1. Architecture & topology

A **new dedicated background Worker** at `workers/research/`, separate from the OpenNext web worker, sharing the same D1 database.

- **`workers/research/index.ts`** — exports `{ queue, scheduled }`. No `fetch`. Constructs deps from `env` and delegates to the transport-agnostic modules in `src/`.
- **`workers/research/wrangler.jsonc`** — its own config:
  - shared D1 binding `DB` (same `database_name`/`database_id` as the web worker) **without `migrations_dir`** (the web worker owns migrations; applying from one place avoids double-apply).
  - queue **producer** binding `RESEARCH_QUEUE` (queue `research`) **and** **consumer** config on queue `research`: `max_batch_size: 1`, `max_retries: 3`, `dead_letter_queue: "research-dlq"`.
  - `compatibility_flags: ["global_fetch_strictly_public"]` — defense-in-depth that makes the runtime refuse `fetch()` to private/internal IPs, a **partial mitigation of the named DNS-rebinding SSRF residual** (slice-A §2/§9); this is the worker that actually fetches arbitrary third-party source URLs. **No `nodejs_compat`** — the worker import graph is verified free of `better-sqlite3` and `node:` builtins (see §6).
  - **No `triggers.crons`** in v1 (see §4, decision on the cron).
- The web worker (`wrangler.jsonc`) is **untouched** — it gets neither queue binding in v1 (manual/admin enqueue is deferred).
- **Deploy:** a second step `deploy:research` (`wrangler deploy -c workers/research/wrangler.jsonc`); the `research` and `research-dlq` queues must be created (`wrangler queues create …`) before first deploy.

**Data flow (one cron tick → one consumed message):**

```
scheduled() → selectResearchSeeds(db, { gateVersion, limit })
            → enqueueResearchBatch(env.RESEARCH_QUEUE, messages)   (≤100 + size-aware chunks)
   …Cloudflare Queue delivers a MessageBatch…
queue(batch, env) → processBatch(batch, deps)
            → for each message (SEQUENTIAL): handleResearchMessage(msg.body, deps)
                  → returns → msg.ack()      (terminal: atomic pack+audit committed)
                  → throws  → msg.retry()    (provider_unavailable / transient DB) → DLQ after max_retries
```

---

## 2. The `SqlExecutor` `batch()` primitive (atomicity — resolves the G13 pack/audit hole)

**Problem (surfaced in review):** the merged `handleResearchMessage` does `insertPackIfAbsent` **then** `audit.append("research.completed")` as two separate writes. A transient D1 failure on the audit write after a successful insert leaves a **pack with no completion audit row** — a G13 gap (the append-only audit is the source of truth for disclosure/show-your-work). The queue's automatic retries make this **recurring**, not one-off, and reordering to audit-first is *worse* (an orphan `completed` audit with card counts for a pack that never persisted is a false, uncorrectable statement in an append-only log).

**Fix (the principled one; DB-2 anticipated it):** add an atomic multi-statement primitive to the port and commit pack + audit as one unit.

- **`SqlExecutor.batch(statements: SqlStatement[]): Promise<void>`** — runs all statements atomically (all-or-nothing).
  - `d1Executor`: delegates to D1's native `db.batch([...])` (single implicit transaction).
  - `betterSqliteExecutor` (test/local): wraps in `db.transaction(() => { … })`.
- The data layer exposes **statement builders** so the consumer can compose one batch:
  - `insertPackIfAbsentStatement(db, pack): SqlStatement` (the existing `INSERT … ON CONFLICT DO NOTHING`).
  - `appendAuditStatement(db, entry): SqlStatement` (the existing audit insert, with `ts`/`payload_json` bound).
  - The existing `insertPackIfAbsent`/`append` keep working (single-statement convenience), implemented on top of the builders.
- `handleResearchMessage` terminal path becomes: build both statements → `db.batch([insertPack, appendCompleted])`. Pack and completion audit now persist together or not at all. (The `provider_unavailable` audit-only path and the `research.failed` paths are single appends — unchanged.)

This **strengthens** G13 (no longer relies on two-step ordering). Because it touches merged compliance/data-integrity code, the PR is **Review — compliance**.

---

## 3. Transport modules (in `src/queue/`, Node-pool unit-tested, transport-agnostic)

### `src/queue/process-batch.ts` — `processBatch(batch, deps)`
- Iterates `batch.messages` **sequentially**; per message: `await handleResearchMessage(msg.body, deps)` in try/catch → resolve ⇒ `msg.ack()`, throw ⇒ `msg.retry()`. **Per-message isolation** — one poison message never blocks its siblings; never a whole-batch throw.
- **`ack()` is called per message immediately on resolve** (not at end-of-batch), so a batch killed mid-iteration (wall-clock) never re-runs already-acked messages.
- A structurally-malformed/undeserializable `msg.body` → `handleResearchMessage` already audits `research.failed` (codes-only) + returns ⇒ `msg.ack()` (don't retry permanently-bad input).
- On `msg.retry()`, log a codes-only retry-counter line (`console.warn` with `claimKey` + reason) so retry storms are visible despite the no-consumer DLQ (Cloudflare observability). Tests use `allowConsole()` and assert the log.
- Typed against a minimal `MessageBatch`/`Message` interface (`{ messages: { body: unknown; ack(): void; retry(): void }[] }`) so it's fake-testable in the Node pool.
- **Sequential is load-bearing (G14), not a simplicity choice.** `perHostCap` bounds fetches *within* one claim; it does NOT bound across messages. Sequential processing is what keeps simultaneous fan-out to any one source host bounded. **Do not parallelize `processBatch` without first adding a global per-host throttle** (named residual §8).

### `src/queue/seed.ts` — `selectResearchSeeds(db, { gateVersion, limit })`
Returns pre-built `ResearchMessage[]` for un-researched, currently-eligible claims:
1. **Candidate-level query** (not page-level): `articles ⋈ eligibility_verdicts (eligibility='easy_win', revision_id = articles.revision_id, gate_version) ⋈ stale_candidates (source_revision_id = articles.revision_id)`. `DISTINCT` on the claim identity `(page_id, section_heading, sentence_text, year, source_revision_id)` (the candidate table has no claim-uniqueness — re-detection appends duplicate rows). A **deterministic total `ORDER BY`** (page_id, then the claim columns) so paging/selection is stable and testable. **Over-select** ~2–3× `limit`.
2. For the over-selected rows, compute `claimKey = computeClaimKey(pageId, sectionHeading, claimText, year)` in code.
3. **Dedup against existing packs** via a **batched lookup on the real PK `(claim_key, source_revision_id)`** — the *same identity* `has()` uses (`packExists`) — skipping already-packed claims. (Do NOT dedup via a SQL JOIN on the text columns: `claimKey` NFC-folds `section_heading`/`sentence_text` while SQL compares bytes, so they disagree.)
4. **In-memory dedup on `claimKey`** before returning (two NFC/NFD-variant candidate rows are `DISTINCT` in SQL but collapse to one `claimKey`).
5. Take the first `limit` distinct claims → build `ResearchMessage { claimKey, pageId, sourceRevisionId, input }` (the `claimKey` already computed — single source; `enqueueResearchBatch` never recomputes).

*Note:* the 2–3× over-select is a **v1 placeholder valid only because the cron is off** (with the stub, after one drain every easy-win claim for a revision is packed, so seeding goes idle — fine when nothing auto-runs). A general seeder would paginate via a continuation cursor; that is deferred to the Gemini slice.

### `enqueueResearchBatch(queue, msgs)` (in `src/queue/research-jobs.ts`)
- Sends **pre-built** `ResearchMessage[]` via Queues `sendBatch`, **chunked to ≤100 messages** and **size-aware** (≤256 KB/batch); a single message exceeding ~128 KB is skipped + logged (never fails the batch). `SEED_BATCH_LIMIT ≤ 100` is asserted at config load. The existing single `enqueueResearch(params)` (recomputes `claimKey`) stays for any future single-enqueue.

### Message validation (`isValidMessage`, hardening)
Deepen the existing guard: validate `input.claimText` (non-empty string), `input.sectionHeading` (string), `input.year` (finite number) — the queue message is the transport trust boundary. (The existing `claimKey` 64-hex sanitization for the malformed-audit path stays.)

---

## 4. The worker entry + the cron decision

`workers/research/index.ts`:
- `scheduled(controller, env, ctx)` → `db = d1Executor(env.DB)`; `msgs = await selectResearchSeeds(db, { gateVersion: GATE_VERSION, limit: SEED_BATCH_LIMIT })`; `await enqueueResearchBatch(env.RESEARCH_QUEUE, msgs)`.
- `queue(batch, env, ctx)` → build `deps`: `researchClaim` = the Phase-8 pipeline pre-bound with `{ provider: new StubResearchProvider(), fetchSource: url => fetchSourceText(url, { fetchImpl: fetch, now }), now, maxProposals, perHostCap }`; `packStore`/`audit` over `d1Executor(env.DB)`; `now` → `processBatch(batch, deps)`. (The provider is the one line the Gemini slice swaps.)

**Cron = option (b): build + test `seed.ts` and `scheduled()`, but ship NO active `triggers.crons`.** Rationale: with the stub provider every `researchClaim` returns `no_proposals`, persisting a terminal empty pack; `has()` is provider-agnostic (PK = `(claim_key, source_revision_id)`, no model dimension), so those stub packs would **permanently block real Gemini research** for that revision. A committed-but-"don't-enable" cron is a footgun (config drifts from the doc note). Option (b) delivers the tested seed code while ensuring **nothing auto-runs** until the Gemini slice wires the cron (`scheduled()` remains manually invokable for tests / `wrangler dev --test-scheduled`). Consequence: the research worker is **deployable but functionally dormant in prod** until the Gemini slice (honest framing).

---

## 5. Configuration (named, tunable)

- `SEED_BATCH_LIMIT = 50` (G14 per-tick fan-out bound; asserted ≤ 100).
- `max_batch_size = 1` (queue consumer). Worst-case batch wall-clock = `max_batch_size × maxProposals(5) × DEFAULT_FETCH_TIMEOUT_MS(10s)`; even one message = ~50s, near the consumer wall-clock budget. `max_batch_size=1` is correct under the stub (zero fetches) and the safe first real value. **Gemini-slice precondition:** add a per-message AbortController time budget (~25–30s) and re-evaluate batch size / intra-claim fetch concurrency (with a host limiter) before raising it.
- `max_retries = 3`; `dead_letter_queue = research-dlq` (declared; no consumer in v1).
- Cron interval (set in the Gemini slice): **must exceed worst-case batch drain** to avoid overlapping ticks re-enqueuing in-flight claims.

---

## 6. Bundle hygiene — the `client.ts` split

The research worker needs `SqlExecutor`/`d1Executor` from `src/db/client.ts`, but that file top-imports `better-sqlite3` (a Node-only **devDependency**) — which would drag the native module into the workerd bundle (build failure / bogus `nodejs_compat`).

**Split by role** (not engine/history):
- `src/db/client.ts` — the portable port (`SqlExecutor`/`SqlStatement` interfaces, `batch()`) + `d1Executor`. No `better-sqlite3`.
- `src/db/local-db.ts` — `betterSqliteExecutor` + `openLocalDb` (imports `better-sqlite3`), used only by tests + local dev. Test helpers import from here.

**Enforce mechanically:** an ESLint `no-restricted-imports` rule forbidding `local-db` from the worker-reachable set (so a future `openLocalDb` import can't silently re-poison the bundle — caught at lint, not `wrangler deploy`). Import graph verified: the worker path (`research-jobs → research-packs → pipeline → verify-proposal/verbatim-check/source-fetch/canonicalize-url/normalize`, + `audit-log`, portable `client`) pulls only `htmlparser2` + `ipaddr.js` (both pure JS, no `node:` builtins) and uses `crypto.subtle`/`TextEncoder` (workerd-native); `wtf_wikipedia` is off-path (detector only). → **no `nodejs_compat` needed.**

---

## 7. Testing (hybrid — `@cloudflare/vitest-pool-workers@0.16.13` peers `vitest ^4.1.0`, matching our 4.1.8)

**Node pool (existing vitest project):**
- `process-batch` — faithful `MessageBatch` fake: each `handleResearchMessage` outcome → correct `ack()`/`retry()`; per-message isolation (one throw, others still ack); malformed body → ack; incremental ack (a fake batch where a later message throws doesn't un-ack earlier ones); retry-counter log asserted under `allowConsole()`.
- `seed` — `freshTestExecutor`: live-revision-only selection; `DISTINCT` collapses duplicate candidate rows; dedup uses the same `(claim_key, source_revision_id)` identity as `has()`; in-memory `claimKey` dedup (NFC/NFD variant rows → one message); deterministic order; respects `SEED_BATCH_LIMIT`; over-select-all-packed → empty result.
- `enqueueResearchBatch` — chunking (≤100), size-awareness (oversized single message skipped+logged), `SEED_BATCH_LIMIT ≤ 100` assertion.
- `batch()` atomicity — `betterSqliteExecutor`: a 2-statement batch where the 2nd fails rolls back the 1st; `handleResearchMessage` terminal path leaves **no** pack without its completion audit (and none-or-both under an injected mid-commit failure).

**Workers pool (NEW `@cloudflare/vitest-pool-workers` project, real Miniflare D1 + Queues):**
- happy-path delivery: enqueue via the real `RESEARCH_QUEUE` → consumer runs → a (stub `no_proposals`) pack + its completion audit land in real D1.
- retry → DLQ: a message whose handler throws (injected failing dep) is redelivered and, after `max_retries`, lands in `research-dlq` — proving the real ack/retry/DLQ mapping (the whole point of the pool).
- `scheduled()` invocation enqueues the selected seeds.
- Neither workers-pool test makes outbound `fetch` calls (stub → zero `fetchSource` calls), so no network + `global_fetch_strictly_public` is moot in tests.

CI runs **both** projects. (`better-sqlite3` DB tests stay in the Node pool; the workers pool uses Miniflare D1 — applied from the same `migrations/`.)

---

## 8. Compliance & named residuals

**Compliance.** G13 — the new `batch()` makes pack+completion-audit atomic (strengthened); the audit stays codes-only (the consumer's `claimKey` sanitization + allowlist are unchanged). G14 — bounded fan-out (`SEED_BATCH_LIMIT` per tick + `maxProposals`/`perHostCap` per claim); **no new Wikimedia load** (the seed reads only D1; source-fetch hits arbitrary third-party hosts, not Wikimedia); cross-message host politeness preserved by sequential `processBatch`. G15 — `global_fetch_strictly_public` adds runtime SSRF defense-in-depth on the fetching worker.

**Named residuals (do NOT silently re-open):**
- **Sequential `processBatch` is load-bearing for cross-message host politeness** — parallelizing requires a global per-host throttle first.
- **No cross-message / global per-host rate limiter** — per-claim caps only; acceptable under sequential processing + `max_batch_size=1`.
- **DLQ has no consumer** — failed messages park in `research-dlq` for manual inspection; a retry-counter log is the only signal.
- **Cron-overlap duplicate enqueues** — the seed dedups *packed* claims, not *in-flight* ones; harmless (consumer `has()` is idempotent) but the interval must exceed drain time. Moot until the cron is enabled (Gemini slice).
- **Over-select multiplier** is a v1 placeholder tied to cron-off; a continuation-cursor seeder is deferred.

**Named preconditions of the Gemini slice (must be handled there):**
- **Stub packs are PK-poison.** Any terminal stub pack blocks real research for its revision (provider-agnostic `has()`). The Gemini slice must clean up stub packs (`deletePack` where `model_version='fake-provider/0'`) or add a model dimension to `has()`/surfacing — with a test. (In v1 none are written to prod because the consumer never runs there — dormant.)
- Enable `triggers.crons` (interval > worst-case drain); add the per-message time budget + re-evaluate `max_batch_size`/fetch concurrency; swap `StubResearchProvider` → the real Gemini provider; the provider slice's pre-claim placeholder row to bound concurrent-redelivery double-spend.

---

## 9. Reasoning & adversarial review trail

Five rounds (self → Opus → self → Opus → self). Load-bearing changes:

- **R1 (self).** Replaced per-candidate crypto + `packExists` dedup with an efficient approach; added `global_fetch_strictly_public`; made `processBatch` sequential; pinned the cron as the open decision.
- **R2 (Opus).** CRITICAL: the seed dedup-on-text ≠ the `claim_key` identity (NFC vs byte compare) and was page-vs-claim granularity over a candidate table with no claim-uniqueness or live-revision filter → seed query rewritten candidate-level. Found the **G13 pack-without-audit hole** (audit is last/unwrapped). Found the **`better-sqlite3` bundling blocker**. Corrected the wall-clock math (×5). Pushed hard against shipping a dormant cron.
- **R3 (self).** Flipped B1's fix from "materialize `claim_key` on `stale_candidates`" (blocked by the `ALTER ADD COLUMN NOT NULL` + schema-equivalence wall) to contained **seed-time compute + batched PK dedup**. Initially proposed an audit-before-pack reorder for C4 (later reversed). Confirmed cron = (b).
- **R4 (Opus).** CRITICAL reversal: the C4 reorder is *wrong* — an orphan `completed` audit in an append-only log is a false, uncorrectable record, worse than a backfillable missing row → **do atomic `batch()` now** (the queue makes atomicity *more* needed). Re-sized wall-clock (`max_batch_size=1`; per-message time budget as a Gemini precondition; verify incremental ack). Verified the `client.ts` split keeps the bundle clean end-to-end. Flagged the NFC/`DISTINCT` in-memory dedup and the stub-pack PK-poison precondition.
- **R5 (self).** Verified `@cloudflare/vitest-pool-workers` supports vitest 4.1 (hybrid plan viable). Adopted atomic `batch()` (best long-term option). Finalized: in-memory `claimKey` dedup, size-aware chunking, lint-enforced split, dormant-in-prod framing, the Gemini-slice precondition list.

**Still uncertain / would add with more time:** the exact Cloudflare queue-consumer wall-clock ceiling (design conservatively to ~30s-class; confirm at Gemini-implementation time); whether a continuation-cursor seeder should land with the cron rather than later.

---

## 10. Decisions log

| # | Decision | Rationale |
|---|---|---|
| Q1 | Full deployable real-Queues wiring (paid plan available) | Paid plan removes the cost blocker; build the real transport |
| Q2 | Separate dedicated background Worker (not augment OpenNext) | Background pipeline has nothing to do with the web tier; lean, independently observable/testable consumer |
| Q3 | Cron-only trigger; seed = easy-win candidates, skip-already-packed, capped | Autonomous, no auth surface; G14 fan-out bound |
| Q4 | Hybrid test fidelity (Node faithful-fake + workers-pool integration) | Fast unit coverage + real-binding proof of ack/retry/DLQ/cron |
| D1 | Atomic pack+audit via a new `SqlExecutor.batch()` (now, not deferred) | The append-only audit is sacrosanct (G13); the queue amplifies the gap; DB-2 anticipated `batch()`; bounded lake |
| D2 | Cron ships **dormant** — `seed.ts`+`scheduled()` built/tested, no committed `triggers.crons` | Stub packs are PK-poison; a committed don't-enable cron is a footgun; deliver the code, gate activation to the Gemini slice |
| D3 | Seed dedup by computed `claimKey` against the PK, + in-memory `claimKey` dedup | The text-column JOIN disagrees with the NFC-folded `claim_key` identity `has()` uses |
| D4 | `max_batch_size=1` + per-message time budget deferred to Gemini | Worst-case `batch×maxProposals×timeout` exceeds the consumer wall-clock budget |
| D5 | Split `client.ts` (portable) / `local-db.ts` (better-sqlite3), lint-enforced | Keep the native module out of the workerd bundle; no `nodejs_compat` |
| D6 | `global_fetch_strictly_public` on the research worker | Runtime SSRF defense-in-depth for the DNS-rebinding residual |
