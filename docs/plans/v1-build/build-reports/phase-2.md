<!-- ABOUTME: Build report for Phase 2 of the v1 build — research reachability (enqueue route + surfacing read). -->
<!-- ABOUTME: Per-task commits, final test counts, deviations + rationale, and lead-attention items. -->

# Phase 2 build report — Research reachability (enqueue route + surfacing read)

**Branch:** `feat/v1-build`
**Date:** 2026-06-13
**Commit range:** `1355c83..e2023bf` (7 commits)
**Status:** DONE

## Summary

Made the research backend reachable from the app worker: added the `RESEARCH_QUEUE`
producer binding to the root config, built `POST /api/research/[candidateId]`
(eligibility-gated to easy-win only, G11) and `GET /api/research/[candidateId]/pack`
(drift-aware surfacing read), plus the DB read accessors the routes need. The
surfacing read `surfaceResearchPack` is the first consumer of `getSurfaceablePack`.

All work followed TDD: failing test first (confirmed failing for the expected
reason), minimal implementation, green, commit. No test was skipped or weakened.
No red commits.

## Tasks + commits

| Task | Description | Commit |
|------|-------------|--------|
| 2.1 | `RESEARCH_QUEUE` producer binding in root `wrangler.jsonc` + re-typegen | `1355c83` |
| 2.2a | `getCandidateById` — single stale-candidate read by id | `fe54944` |
| 2.2b | `getArticleByPageId` — single article read by page id | `e032e3c` |
| 2.3 Step 0 | `getVerdict` — persisted eligibility verdict read (defensive) | `d8e282d` |
| 2.3 | `POST /api/research/:candidateId` enqueue route (G11 gate) | `d42ac54` |
| 2.4 | `surfaceResearchPack` — drift-aware worksheet read | `2e68f5c` |
| 2.5 | `GET /api/research/:candidateId/pack` — drift-aware surfacing route | `e2023bf` |

## Final test counts

- **Node pool** (`vitest run`): 650 passed (51 files). Baseline was 638 (47 files); +12
  new across 4 new files (candidate-lookup 2, article-read 2, verdict-read 4,
  surface-pack 4).
- **Workers pool** (`vitest run -c vitest.workers.config.mts`): 10 passed (3 files).
  Baseline was 3 (1 file); +7 new across 2 new files (research-enqueue 4,
  research-pack-read 3). Exit code 0.
- `tsc --noEmit`: clean. `eslint .`: clean.

## Compliance verification

- **G11 safe-lane gate** is enforced and tested both ways: a `human_only` candidate
  is refused with 403 and **nothing is enqueued**; a missing verdict **fails closed
  to `human_only`** (the production gate returns `{ eligibility: "human_only",
  reasons: ["no_verdict"] }` when `getVerdict` returns null). `getVerdict` is a
  defensive read — a corrupt `reasons_json` reads as `null`, which the route also
  treats as fail-closed.
- **CC-20 revision drift**: `surfaceResearchPack` splits `getSurfaceablePack`'s
  `not_found` (which conflates "never computed" and "revision-drifted") into a
  first-class `revision_drift` state vs `not_found`, using a probe for any pack at
  any revision for the (pageId, claimKey). The pack-read route returns
  `revision_drift` at HTTP 200 — never a silent empty — so the UI can flag it.
- **G1 (no machine-written prose)**: the surfacing read returns only the
  deterministically-verified `EvidenceCard[]` from the stored pack. It does not
  re-run the model or add prose.
- **G13 / CC-12 (codes-only audit)**: the enqueue route writes no audit row in v1
  (the plan made auditing optional — "if you add auditing"); none was added, so no
  PII-leak surface exists. The claimKey is computed server-side by `enqueueResearch`,
  never trusted from the client.
- The route never constructs `claimKey` (integration-contract §2.2) — verified by the
  enqueue test asserting the enqueued message carries a 64-hex claimKey the handler
  did not supply.

## Deviations from the plan (with rationale)

1. **Task 2.3 Step 0 — `getVerdict` test needed an `articles` parent row (FK).** The
   plan's `verdict-read.test.ts` code inserts a verdict for `page_id = 9` without
   first inserting the article. `eligibility_verdicts.page_id REFERENCES
   articles(page_id)`, and the project's FK-on test DB (`freshTestExecutor`,
   mandated by the same plan via testing-pitfalls §8) correctly rejects the orphan
   row with `FOREIGN KEY constraint failed`. Added a `seedArticle` helper that
   inserts `articles(page_id=9, revision_id=100)` before each verdict insert. This
   is a fidelity fix to the plan's test code, not a change to the implementation or
   the contract; the `getVerdict` implementation is exactly as specified.

2. **Task 2.3 — `Queue.send` adapter (v4-API deviation).** Integration-contract §2.2
   claims "CF `Queue.send()` returns `Promise<void>` — no adapter needed for the
   single-send path." Under the **installed** runtime types (`workerd@1.20260603.1`,
   `Queue.send` returns `QueueSendResponse`), this is **stale** — `tsc` rejects
   passing `env.RESEARCH_QUEUE` directly to `handleResearchEnqueue`'s
   `{ send(m): Promise<void> }` param. Fixed by wrapping `env.RESEARCH_QUEUE.send`
   with a thin void-returning adapter **only in the production `POST` wiring** —
   exactly mirroring the existing `sendBatch` adapter in
   `workers/research/index.ts:79` (the same v4-API deviation already recorded for the
   batch path). The `handleResearchEnqueue` signature and the test's `fakeQueue` are
   unchanged — they correctly model the contract's `{ send }: Promise<void>` shape;
   only the real CF binding needs the adapter. **This is the v4-API deviation already
   flagged in commit `1ba3d68`'s message; it now also applies to the single-send
   path. Lead may want to correct integration-contract §2.2.**

3. **Task 2.3/2.5 — `@/*` alias added to `vitest.workers.config.mts`.** The
   `src/app/**` route handlers use the `@/*` → `./src/*` alias (the Next.js
   convention; all three existing route files use it). Next's bundler resolves it in
   production, but the workerd vitest pool imports the route handlers directly and
   could not resolve `@/`. Added `resolve.alias: { "@": <root>/src }` to the workers
   config so it resolves identically to production. Chosen over making this one route
   use relative imports, which would make it an inconsistent outlier among the four
   route files. Does not affect the Node pool (those source modules use relative
   imports; only `src/app/**` uses `@/`) and the existing workers test still passes.

4. **Task 2.4 — `allowConsole()` on the corrupt-row test.** `getSurfaceablePack`'s
   defensive read logs the JSON parse failure via `console.error` (contract §3.4 /
   CC-19). The project's pristine-output setup (`test/setup/pristine.ts`) fails any
   test with un-asserted console output. Added `allowConsole()` to the
   corrupt-cards_json test, matching the established project pattern (15+ existing
   error-path tests in `research-packs.test.ts` do the same). The plan's test code
   omitted it; the implementation is exactly as specified.

## For the lead's attention

- **integration-contract §2.2 is stale on the single-send path** (deviation #2). The
  `Queue.send` no-adapter claim no longer holds against the installed runtime types;
  the worked-around path is correct and tested, but the contract text should be
  updated to match the recorded v4-API deviation for consistency.
- **Workers-pool teardown warning is benign.** `vitest run -c
  vitest.workers.config.mts` prints "Tests closed successfully but something prevents
  Vite server from exiting" after the results — a known `@cloudflare/vitest-pool-workers`
  teardown-timing artifact (the Miniflare remote connection lingers). Exit code is 0;
  CI keys on the exit code. Not introduced by Phase 2 (it surfaces once the pool has
  >1 test file).
- **No audit row on enqueue.** The plan made enqueue auditing optional; none was
  added in v1. If the lead wants a `research.enqueued` audit row, it must be
  codes-only (`pageId`, `candidateId`, `sourceRevisionId`, claimKey) per CC-12/G13 —
  the machinery (`appendStatement`) exists. Flagging as a deliberate non-inclusion,
  not an omission.
