<!-- ABOUTME: Phase 3 build report — the core worksheet flow UI (the compliance-shaped loop). -->
<!-- ABOUTME: Tasks + SHAs, test counts, deviations, and the list of .tsx surfaces needing the lead's visual review. -->

# Phase 3 build report — Core worksheet flow UI

**Status:** ✅ SHIPPED
**Date:** 2026-06-13
**Branch:** `feat/v1-build`
**SHA range:** `e3a0a02..c6b2dff` (9 commits)

## Summary

Built the human-editor worksheet loop on top of Phases 1+2: the dark archival design
tokens, the signature rust stale marker, the research worksheet rendering only verbatim
evidence cards across all five honesty states, the mandatory-human-verification source-open
gate (G5) that audit-logs codes-only and unlocks disclosure, a snippet assembler where the
human writes the sentence and the tool mechanically builds the `<ref>` (G1/G2/G16), and the
two-part mechanical disclosure summary (G12). No UI slot anywhere can surface machine-authored
prose.

The compliance-load-bearing logic lives in pure modules under `src/worksheet/` (Node-pool
tested against real D1 via `freshTestExecutor`); the `.tsx` components are thin renderers that
import those tested functions, per the plan's Node-pool / pure-logic split. No jsdom or
@testing-library was added.

## Tasks + SHAs

| Task | Description | SHA |
|------|-------------|-----|
| 3.1 | Dark archival design tokens, iron-gall focus, reduced-motion guard (`globals.css`, `layout.tsx`) | `e3a0a02` |
| 3.2 | Stale-marker span split (`splitSentenceAroundMarker`) | `411221a` |
| 3.3 | All five honesty/degradation states + revision-drift flag (`deriveHonestyState`, `honestyFromSurfaced`) | `8d714d0` |
| 3.4 | Verbatim-only evidence-card view model (`toEvidenceCardView`, G1 structural enforcement) | `a3c1b57` |
| 3.5 | `loadWorksheetView` assembling claim + honesty + cards from Phase 2's `SurfacedPack` (D-2) | `b646a45` |
| 3.6 | G5 source-open gate — codes-only audit log, gated unlock (`confirmSourceOpened`, route) | `5cc03bd` |
| 3.7 | Mechanical wikitext `<ref>` assembler from source metadata (`buildRefWikitext`, G2/G16) | `1168749` |
| 3.8 | Two-part mechanical disclosure summary (`buildDisclosureSummary`, G12) | `b4826ce` |
| 3.9 | Article view + worksheet UI (page + 7 components) + home-page wiring | `c6b2dff` |

## Test counts

| Pool | Before (baseline) | After | Delta |
|------|-------------------|-------|-------|
| Node (`vitest run`) | 650 | 696 | +46 |
| Workers (`vitest run -c vitest.workers.config.mts`) | 10 | 14 | +4 |

New Node-pool test files (all real assertions, real D1 where DB is involved):
- `test/worksheet/stale-marker.test.ts` (6) — first-occurrence match, absent/empty marker, Unicode round-trip
- `test/worksheet/honesty-state.test.ts` (13) — all five kinds, both `not_found` causes, `pack_unreadable`, drift discriminator, the `SurfacedPack` mapping
- `test/worksheet/evidence-card.test.ts` (4) — exact key-set, verbatim pass-through, the poisoned-input negative test (G1)
- `test/worksheet/load-worksheet-view.test.ts` (4, real D1) — supported view, drift, no-pack degradation, unknown-id → null
- `test/worksheet/source-gate.test.ts` (5, real D1) — codes-only audit row, urlHash not raw url, malformed-claimKey rejection writes nothing
- `test/worksheet/ref-assembler.test.ts` (4) — cite-web build, optional omission, injection escape, `@ts-expect-error` no-prose-field
- `test/worksheet/disclosure.test.ts` (4) — model-version verbatim, pluralization, combined, null-fallback "unspecified"
- `test/worksheet/honesty-banner.test.ts` (3) — four spec strings + every kind non-empty (G6)
- `test/worksheet/reason-label.test.ts` (3) — `dispute_template:` guard, known codes, raw-code fallback

New workers-pool test file:
- `test/workers/sources-open-route.test.ts` (4) — POST request-validation 400 paths (the paths reachable before any binding access)

Full gate green at completion: `tsc --noEmit` clean, `eslint .` clean, 696 Node + 14 workers,
and `next build` succeeds (all routes compile; `/articles/[id]` and `/worksheet/[candidateId]`
register as dynamic; `/api/sources/open` registers).

## Compliance verification (the load-bearing guardrails)

- **G1 (no machine-written text):** `toEvidenceCardView` projects exactly `{url, verbatimQuote, advisorySupport}` by explicit field assignment (never `{...card}`); a poisoned-input test proves smuggled `summary`/`explanation` fields cannot leak. No `.tsx` component has a `children`/`dangerouslySetInnerHTML` prose path (grep-verified). `pack.queries`/`dispositions`/`proposedQuote` are never rendered as evidence (grep-verified).
- **G2/G16 (no machine-derived citations / no copying):** `RefAssemblyInput` has no `sentence`/`quote` field — pinned by an `@ts-expect-error` test. `SnippetAssembler` feeds `buildRefWikitext` only `{url, title, publisher, publishedDate, accessedDate}`; the human's textarea value is never an input to the ref builder (code-verified).
- **G5/G13/CC-12 (mandatory-human-verification gate / append-only / codes-only):** `confirmSourceOpened` appends a codes-only audit row (`claimKey`, `sourceRevisionId`, SHA-256 `urlHash` — never the raw url/quote), tested against real D1; the unlock returns only after the append commits; a non-64-hex claimKey is rejected before any write. The client gate (`SourceOpenGate`) reveals the snippet/disclosure only after the POST round-trip returns `{unlocked:true}` — the checkbox alone does nothing; no bulk "open all" shortcut.
- **G12 (mechanical disclosure):** `buildDisclosureSummary` is a deterministic template fill naming `pack.modelVersion`; null → honest `"unspecified model"` (never a fabricated name). Rendered into a human-editable textarea, not a lock.
- **Spec §18.5 / CC-20 (all honesty states, never a false impression of resolution):** all five honesty kinds derive in the single home `honesty-state.ts`; `loadWorksheetView` maps Phase 2's `SurfacedPack` straight through (does NOT re-derive drift). The drift flag renders whenever `revisionDrift` is true.
- **DESIGN.md Two Lanes Rule:** rust appears only on the stale marker + `stale · <year>` badge; iron-gall only on links/source-URLs/focus; the honesty banner uses neutral dust styling (not rust); errors use true red (Reserved Red Rule).

## Deviations

1. **Test imports use relative paths, not the `@/` alias (forced by the vitest config).** The plan's Task 3.2–3.8 test snippets import via `@/worksheet/...`. The Node-pool vitest config (`vitest.config.ts`) has **no `resolve.alias`**, so `@/` does not resolve there — every existing Node-pool test and every `src/` module outside `src/app/**` already uses relative imports. Phase 3's pure modules (`src/worksheet/*.ts`) and their tests therefore use relative imports (`../../src/worksheet/...`); only the `.tsx`/route files under `src/app/**` use `@/` (resolved by Next at build time and by the workers-pool alias). No behavior change — purely the import style the codebase already enforces.

2. **G5 route test placement: load-bearing logic in the Node pool, route validation in the workers pool.** The plan put `test/app/sources-open-route.test.ts` in the Node pool importing `confirmSourceOpened` from the route file. A Node-pool test cannot import the route file because the route imports `@opennextjs/cloudflare` (`getCloudflareContext`) at module scope, which only resolves in the workers/OpenNext context — the same reason Phase 2's route handlers are tested in the workers pool. Resolution (matches the Phase 2 pattern): the load-bearing G5/G13 logic (`confirmSourceOpened`, `gateAuditEntry`, `hashUrl`) lives in `src/worksheet/source-gate.ts` and is tested against **real D1 in the Node pool** (`test/worksheet/source-gate.test.ts`) — exactly the plan's intent (real audit-log assertions, no mocks). The thin `POST` route is tested in the **workers pool** (`test/workers/sources-open-route.test.ts`) for its request-validation 400 paths. The happy-path 200 needs `getCloudflareContext`, covered transitively by the Node-pool `confirmSourceOpened` suite.

3. **Article view is a server component reading D1 directly, not fetching its own HTTP route.** The plan's Task 3.9 step 1 says "fetch `GET /api/articles/[id]/candidates`". A server component calling its own HTTP endpoint requires an absolute URL and adds a self-round-trip; the idiomatic Next pattern is to call `getCandidatesByPageId`/`getArticleByPageId`/`getVerdict` directly with the D1 executor. The existing JSON route is unchanged and remains the entry point for client callers.

4. **Two extra pure modules extracted for testability (not in the plan's file list).** `src/worksheet/honesty-banner.ts` (the `WorksheetHonestyKind → banner text` map) and `src/worksheet/reason-label.ts` (the safe-lane reason-code labels, lifted out of `page.tsx` to share with the article view, DRY). Both have branching logic, so both got Node-pool tests rather than living untested in `.tsx`. This follows the plan's own rule: "If a `.tsx` file grows logic worth testing, extract that logic to `src/worksheet/`."

5. **Serif display font wired (`Source Serif 4`) in `layout.tsx`.** DESIGN.md §3 calls for a serif display face (Source Serif 4 / Newsreader candidates) for page titles and claim sentences. The layout only loaded Geist (sans) + Geist Mono. Added `Source_Serif_4` via `next/font/google` and the `--font-source-serif` variable referenced by the `--font-serif` token. Required to make the `font-serif` utility resolve to an actual face.

6. **Audit actor is `"system"` (no auth yet).** The worksheet page passes `actor: "system"` to the G5 gate because the users/OAuth table lands in a later phase (integration-contract §3.7). The audit-log convention already documents `actor` as "user id or 'system'", so this is the honest interim value. When auth lands, thread the real user id through `WorksheetClient`'s `actor` prop.

## UI surfaces needing the lead's visual review (.tsx-only, not Node-pool tested)

These render correctly (tsc + `next build` clean, the custom design-token utilities are confirmed
present in the generated CSS) but their *visual* fidelity to DESIGN.md was not exercised by an
automated test — the plan's architectural decision is that `.tsx` rendering is verified by tsc +
build + a manual dark-mode keyboard walkthrough, NOT by jsdom. **I did not run the live
`pnpm dev` keyboard/dark-mode walkthrough** (no browser in this session) — that is the one
verification step from Task 3.9 step 9 still outstanding and is why these need the lead's eyes:

- `src/app/page.tsx` (home) — restyled to the dark palette; candidates now link to `/worksheet/:id` with the rust stale marker.
- `src/app/articles/[id]/page.tsx` — article view: stale marker, eligibility badge (olive easy-win / neutral human-only), `stale · <year>` rust badge, per-candidate worksheet links.
- `src/app/worksheet/[candidateId]/page.tsx` — worksheet page: claim + marker, honesty banner, drift flag, then the client orchestrator.
- `src/app/worksheet/components/StaleSentence.tsx` — the signature 2px rust underline span (shared by home + article + worksheet).
- `src/app/worksheet/components/EvidenceCard.tsx` — serif-italic quote, mono iron-gall URL, olive support tick.
- `src/app/worksheet/components/HonestyBanner.tsx` — neutral/dust degradation banner + drift line.
- `src/app/worksheet/components/SourceOpenGate.tsx` — the G5 checkbox + Confirm round-trip.
- `src/app/worksheet/components/SnippetAssembler.tsx` — human-sentence textarea + mechanical `<ref>` preview + copy.
- `src/app/worksheet/components/DisclosureSummary.tsx` — editable mechanical edit-summary + copy.
- `src/app/worksheet/components/WorksheetClient.tsx` — client orchestrator gating the assembler/disclosure behind ≥1 opened source.

**Specific things for the lead to confirm in a live dark-mode keyboard walkthrough:**
- rust appears ONLY on the stale span and the `stale · <year>` badge; iron-gall ONLY on links/focus; no parchment surfaces.
- every interactive element (inputs, checkbox, Confirm, copy buttons, links) shows the iron-gall focus ring and is reachable by keyboard.
- the source-open gate genuinely blocks the assembler/disclosure until Confirm round-trips.
- the four degradation banners + the supported confirmation each read correctly, and the drift line renders when an article has advanced.
- contrast (body ≥7:1, placeholders ≥4.5:1) holds in practice.

## Status

**DONE_WITH_CONCERNS** — all 9 tasks shipped, full automated gate green (696 Node + 14 workers,
tsc + eslint clean, `next build` succeeds), and every compliance guardrail is enforced by a real
test. The single concern is that the **manual live dark-mode keyboard walkthrough (Task 3.9
step 9) was not run** — no browser in this session — so the `.tsx` surfaces above need the lead's
visual QA before this is called fully visually complete. Nothing blocks downstream phases; the
pure-logic contract Phase 4 builds on is fully tested.
