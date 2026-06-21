<!-- ABOUTME: Phase 4 build report — queue & topic seeding (easy-win lane page, ad-hoc capture, pageview seed lists). -->
<!-- ABOUTME: Tasks + SHAs, test counts, deviations, chosen ranking window/cadence, .tsx surfaces needing visual QA. -->

# Phase 4 build report — Queue & topic seeding

**Status:** ✅ SHIPPED
**Date:** 2026-06-13
**Branch:** `feat/v1-build`
**SHA range:** `7724ad4..dcb1d7a` (7 commits)

## Summary

Surfaced the bounded-topic triage queue on top of the built spine:

- **Topic / seed-list schema** — `seed_lists` (one row per topic) + `seed_list_entries` (one ranked
  article per row), both `WITHOUT ROWID` with explicit `NOT NULL` PK columns and an FK from entries →
  list (DB-1/CC-1), mirrored byte-identically into `src/db/schema.sql` (CC-2, parity test green), with a
  defensive typed data layer (`src/db/seed-lists.ts`).
- **Pageview-ranked seed lists for two topics** — `military-procurement` and `infrastructure-megaprojects`,
  built from live MediaWiki category membership (`list=categorymembers`, mainspace-only) ranked by the
  Wikimedia Pageviews REST API over a trailing 30-day window. All live access is G14-compliant (descriptive
  UA reused from `wikimedia.ts`, `maxlag=5` on the Action API, **sequential** fetch loops — never
  `Promise.all` over a live endpoint). Network is fixture-backed in tests (committed REAL responses; no
  in-test fetch).
- **Easy-win lane / batch-queue page** (`/queue`) — POSTs `/api/easy-win`, renders the
  considered/surfaced/deferred/skipped summary + surfaced items, keyboard-first triage (↑/↓ move, space
  toggle, `r` research selected), and a "research selected" action that POSTs `/api/queue/enqueue-research`.
- **Ad-hoc capture** (`/queue/capture` + `/api/queue/capture`) — paste a Wikipedia title or `/wiki/` URL,
  normalized by the shared pure `parseWikiTarget` (validated in both the client form and the server route —
  defense in depth), reusing `lookupAndPersist`.
- **Async research over Cloudflare Queues** — the queue page's "research selected" action enqueues one
  `ResearchMessage` per candidate via the single-send `enqueueResearch` in a **sequential** producer loop
  (`enqueueCandidatesForResearch`), proven end-to-end against a real Miniflare D1 + Queue: producer → real
  queue → consumer → stub pack on real D1.

The compliance-load-bearing logic lives in pure / data-layer modules (Node-pool tested against real D1 via
`freshTestExecutor`); the `.tsx` pages are thin renderers that mirror API shapes locally and never import
server modules (integration-contract §4.6). No UI surface in this phase has a slot for model-authored prose;
seed lists are deterministic (pageview counts + category membership).

## Decided parameters (design §11.4 left these to this phase)

- **Ranking window:** the trailing **30 complete days** ending **2 days before `now`** (UTC), to absorb the
  Pageviews API's ~24–48h data lag. Window math (`pageviewWindow`) takes an injected `now: Date` — never a
  bare `new Date()` inside ranking logic (testing-pitfalls §7). 30 days smooths weekly seasonality / news
  spikes while staying recent.
- **Refresh cadence:** seed lists are recomputed **on demand when older than 7 days** (a `refreshed_at`
  staleness check on the `seed_lists` row, in `getOrRefreshSeedList`); otherwise served from the stored
  snapshot. **No cron-driven refresh in v1** (cron stays disabled until Phase 7; CC-7). The seed-list route
  recompute is a bounded, sequential inline operation (≤2 categories × ≤100 members per topic).
- **Storage:** the ranked result is persisted as `seed_list_entries` under a parent `seed_lists` row
  (durable, auditable, fast to read; the rank/count snapshot doubles as a future impact stat).
- **Topic membership source:** category membership via the live MediaWiki Action API
  (`list=categorymembers`), **not** a Wikipedia dump pipeline (explicitly deferred for v1, office-hours
  decision). v1 reads only the first page of up to 100 members per category — no `cmcontinue` pagination
  (a bounded-list decision; deeper pagination is a deferred enhancement).

## Tasks + SHAs

| Task | Description | SHA |
|------|-------------|-----|
| 4.4 | Seed-list tables (`0008_seed_lists.sql`) + schema.sql mirror + typed data layer + migration/data tests | `7724ad4` |
| 4.3a | `category-members.ts` — mainspace-only `categorymembers` fetch (G14, sequential) | `887e87f` |
| 4.3b | `pageviews.ts` — trailing-30d window + sequential count fetch + deterministic ranking | `46c334d` |
| 4.3c | `seed-topics.ts` — two launch topics + `buildSeedList` (compose → persist, sequential) | `a7e6042` |
| 4.1 | Easy-win lane page (`/queue`) + `enqueue-research` route + `enqueueCandidatesForResearch` core (+ `getOrRefreshSeedList`) | `1f7d4a6` |
| 4.2 | Ad-hoc capture (`parseWikiTarget` + capture route + form) + seed-list route + seed-list page | `29378da` |
| 4.5 | Workers-pool integration proof: queue-page enqueue → real Miniflare queue → consumer pack | `dcb1d7a` |

## Test counts

| Pool | Before (baseline) | After | Delta |
|------|-------------------|-------|-------|
| Node (`vitest run`) | 696 | 740 | +44 |
| Workers (`vitest run -c vitest.workers.config.mts`) | 14 | 15 | +1 |

Final gate (all fresh, this session): `tsc --noEmit` exit 0 · `eslint .` exit 0 · Node 740/740 · workers 15/15.
(The workers pool prints a "close timed out" Miniflare teardown notice after `15 passed` — a pre-existing
harness quirk, exit 0, "Tests closed successfully".)

New Node-pool test files / additions (real assertions; real D1 where DB is involved; recorded fixtures for network):
- `test/db/migration.test.ts` (+3) — `seed_lists` WITHOUT-ROWID NOT-NULL-PK + NULL-topic rejection; `seed_list_entries` composite PK + FK fires; explicit two-table schema.sql parity.
- `test/db/seed-lists.test.ts` (6, real D1) — upsert+replace round-trip ordered by rank, idempotent upsert, full-swap not append, empty-set clear, unknown→not_found, FK rejection (CC-6).
- `test/ingest/category-members.test.ts` (6) — real-fixture mainspace extraction, ns-filter, empty→[], maxlag→Unavailable, API-error→Response, non-JSON→Response.
- `test/ingest/pageviews.test.ts` (7) — window (2-day lag, 30-day span), time-of-day determinism, fixture sum, 404→0, unicode/space URL encoding, ranking DESC+title-tiebreak, empty.
- `test/ingest/seed-topics.test.ts` (5, real D1) — exactly-two-topics, shape, compose+dedup-by-pageId+rank+persist with fixed clock, unknown-topic throw, empty-category persists empty.
- `test/app/queue-routes.test.ts` (8, real D1) — `enqueueCandidatesForResearch` accepted/skipped/empty/mixed-partition; `getOrRefreshSeedList` fresh-no-refetch / stale-recompute / first-build / unknown→not_found.
- `test/app/parse-wiki-target.test.ts` (9) — bare title, trim, /wiki/ URL, percent-decode + fragment/query strip, other-lang subdomain, non-wikipedia reject, non-article reject, empty reject, malformed-URL reject.

New workers-pool test:
- `test/workers/queue-page-enqueue.test.ts` (1) — candidate persisted → `enqueueCandidatesForResearch` → real `RESEARCH_QUEUE.send` → `worker.queue(...)` consumes → stub `fake-provider/0` pack lands on real D1; message acked, not retried.

## Recorded fixtures (committed REAL responses, never fetched in-test)

- `test/fixtures/category-members/military-procurement-sample.json` — real `categorymembers` of `Category:Military_acquisition` (5 mainspace members), captured via curl with the project UA.
- `test/fixtures/pageviews/alpha-30d.json` / `beta-30d.json` — real Pageviews daily series for `Military_acquisition` / `Arms_industry` over `20260513..20260611` (30 daily items each).

## Deviations

- **D-1 — seed categories chosen for populated mainspace membership.** The plan's illustrative
  `SEED_TOPICS` named `Category:Military procurement` / `Category:Defense procurement` and
  `Category:Megaprojects` / `Category:Proposed infrastructure`. Live checks showed
  `Category:Military procurement` and `Category:Defense procurement` are *container* categories (only
  subcategories, no direct article members) → they would yield empty lists. Shipped sets:
  `military-procurement` → `Category:Military acquisition` + `Category:Arms industry`;
  `infrastructure-megaprojects` → `Category:Megaprojects` + `Category:Proposed infrastructure` (all verified
  to have real ns=0 members). The plan flagged the exact category names as a sketch ("a small committed set
  of seed categories"); this is a value choice, not a behavior change. A code comment in `seed-topics.ts`
  records the rationale.
- **D-2 — migration test uses the project's `freshTestDb()` helper, not the plan's `applyAllMigrations` /
  raw `new Database` sketch.** The plan's Task 4.4 snippet referenced an `applyAllMigrations(db)` helper and
  `new Database(":memory:")` + manual `pragma`. The actual `test/db/migration.test.ts` has no such helper —
  it uses `freshTestDb()` (FK ON + all migrations applied, the documented convention) for the FK/NULL-PK
  assertions and the existing inline `readdirSync(...).sort()` pattern (matching the file's parity test at
  :150) for the two-DB comparison. Same coverage, project-consistent. No behavior change.
- **D-3 — `parseWikiTarget` guards `decodeURIComponent` against malformed `%` sequences.** The plan's
  snippet called `decodeURIComponent(m[1])` unguarded; a pasted URL with an invalid escape (e.g. `%zz`)
  throws `URIError`. Wrapped it in try/catch → `{ ok: false, reason: "invalid_url" }`, honoring the
  "never throws on bad input" contract (defense in depth, since this is also the server-side validator).
- **D-4 — seed-list rows link into the capture flow via a prefilled `target` query param.** The plan said
  "each row linking into lookup." The home `page.tsx` (Phase 3, not to be modified) does not read a query
  param to prefill, so seed rows link to `/queue/capture?target=<title>`; `CaptureForm` reads the `target`
  search param (wrapped in a `<Suspense>` boundary as `useSearchParams` requires) to prefill the input.
  This keeps the link genuinely functional within Phase 4's own surfaces without touching Phase 3 files.
- **D-5 — the `enqueue-research` route wraps `RESEARCH_QUEUE.send` in a void adapter.** Per
  integration-contract §2.2 (corrected note): `Queue.send()` returns `Promise<QueueSendResponse>`, not
  `Promise<void>`, so it does not structurally satisfy the producer param. The route wraps it
  (`{ send: async (m) => { await env.RESEARCH_QUEUE.send(m); } }`) exactly as the existing research route
  does. (Not a deviation from intent — recorded because the plan's route snippet passed `env.RESEARCH_QUEUE`
  directly, which would not typecheck.)

## UI surfaces needing visual QA

These `.tsx` pages have no automated render test (no jsdom/RTL in the project, by design; their logic is
covered by the pure/data-layer tests). They render but should get a lead's design pass against `DESIGN.md`:

1. **`/queue`** (`src/app/queue/page.tsx`) — the easy-win lane: summary stat grid, keyboard triage (focus
   rings, ↑/↓/space/r), per-candidate rust stale marker + ledger-olive "easy win" badge, "research selected"
   action with `aria-live` status. **Verify:** keyboard navigation + visible iron-gall focus ring on each
   candidate row; the rust 2px underline on the stale span; reduced-motion (covered globally in
   `globals.css`).
2. **`/queue/capture`** (`src/app/queue/capture/page.tsx` + `CaptureForm.tsx`) — paste-a-target form with
   client pre-validation; renders `LookupResult` (eligibility badge + candidate list) reusing the home-page
   visual language. **Verify:** invalid-target inline hint; prefill from `?target=`.
3. **`/queue/seed/[topic]`** (`src/app/queue/seed/[topic]/page.tsx`) — ranked seed list: serif topic
   headline, mono rank + mono pageview count (Evidence Mono Rule), iron-gall article links, window/refresh
   metadata line. **Verify:** ranking order, count formatting, link into capture.

A `next build` was run this session and all three pages + three routes compile and prerender cleanly
(`/queue` and `/queue/capture` static; `/queue/seed/[topic]` and the routes dynamic).

## Boundaries honored

- No cron / scheduled refresh enabled (on-demand only; CC-7).
- No parallel MediaWiki/Pageviews fetches — every fan-out is a sequential loop (G14/CC-16). Tests prove the
  sequential producer loop; production clients stay sequential.
- No Wikipedia-dump pipeline (deferred for v1).
- No Brave/third-party search data touched — Wikimedia-only.
- No model-authored text in seed lists, the queue, or the audit log; audit stays codes-only / no-PII (CC-12).
- `getCloudflareContext()` only inside handler bodies; every new route exports `dynamic = "force-dynamic"` (CC-11).
- Single-send `enqueueResearch` in a sequential loop — no `enqueueResearchBatch` / `Promise.all` / `void`-`sendBatch` adapter needed.
- Did not touch `src/detector/**`, `src/research/**`, `src/queue/**` core, or Phase 3 modules.

## Status

**DONE.**
