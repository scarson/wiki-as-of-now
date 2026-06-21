<!-- ABOUTME: Phase 6 build report — transparency show-your-work view, About/compliance page, abuse-report path, session-completion feedback. -->
<!-- ABOUTME: Records tasks + SHAs, test counts, deviations, and the UI surfaces needing the lead's visual review. Authored 2026-06-13. -->

# Phase 6 build report — Transparency, About, polish

**Status:** ✅ SHIPPED on 2026-06-13 (branch `feat/v1-build`, commits `4605985`…`a5c96bc`, 7 commits).
**Suite:** tsc + lint clean · 857 Node (+40) · 26 workerd (unchanged) · `next build` succeeds.
**Merge classification:** **Review — domain (audit-log write path + public compliance surface).** This phase adds two new append-only audit event types (`session.feedback`, `abuse.report`) and renders the project's guardrail posture on public pages. Agent does NOT self-merge; Sam reviews the codes-only payloads and the About-page content against the compliance contract.

---

## Tasks shipped (in order)

| Task | What | Commit | Tests added |
|---|---|---|---|
| 6.1 | Reason-label map for dropped dispositions (pure) | `4605985` | 5 |
| 6.2 | Defensive `ResearchPackRead → TransparencyView` transformer (pure) | `ac2050d` | 6 |
| 6.3 | Per-row-isolated audit-trail reader + feedback summary (real D1) | `281e869` | 6 |
| 6.4 | Codes-only session-completion feedback over `audit_log` (real D1) | `3e78527` | 7 |
| 6.5 | About/compliance content builder (pure, no machine prose) | `79d3269` | 6 |
| 6.6 | Abuse-report path: pure validator + thin route (real D1) | `9def0c4` | 10 |
| 6.7 | Transparency + About pages, abuse form, feedback route, footer wiring (thin glue) | `a5c96bc` | 0 (UI shells; logic covered by 6.1–6.6) |
| 6.8 | Phase verification gate | — | — |

**Total Phase 6 tests: 40** (Node pool 817 → 857).

---

## Files created

**Pure logic + data layer (Node-pool tested):**
- `src/transparency/reason-labels.ts` — `labelForReason` / `DISPOSITION_REASONS`: humanizes every `DroppedProposal.reason` (the verbatim-check `quote_*` results + the real `SourceFetchFailureReason` union) into a non-empty evidence-lane label; unknown codes fall back to a generic "Candidate dropped" label so no dropped row is ever hidden (G6/G7).
- `src/transparency/surface-pack.ts` — `toTransparencyView`: maps a `ResearchPackRead` into a render-ready view. Handles all three states (`found`/`pack_unreadable`/`not_found`) without throwing (CC-19); preserves disposition + query counts exactly (G7); no model-prose slot (G1/G9).
- `src/db/audit-queries.ts` — `readAuditTrail` (per-row JSON isolation; one corrupt row degrades to `{ payload: null, corrupt: true }` instead of aborting — the isolation `makeAuditLog().read()` lacks, CC-19) + `summarizeFeedback` (counts `session.feedback` rows by outcome code; skips corrupt rows). Codes-only — never joins in PII (G13/CC-12).
- `src/db/feedback.ts` — `recordFeedback` / `appendFeedbackStatement`: emits a codes-only `session.feedback` audit row over the EXISTING `audit_log`. Rejects any outcome outside `edit_made | no_edit | abandoned` so no free text can leak (G13/CC-12). Quality-not-volume: the enum encodes verified acceptance, never speed.
- `src/about/compliance-content.ts` — `aboutContent`: hardcoded constants transcribed from the compliance contract (the §5 "will never do" list verbatim, the 16 named guardrails, the canonical contract path + repo + abuse URLs). No LLM, no fetch, no provider import (a test asserts this — G1).
- `src/abuse/report.ts` — `validateAbuseReport` / `recordAbuseReport` / `ABUSE_CATEGORIES`: validates a category code + optional 64-hex claim key and writes a codes-only `abuse.report` audit row; any free-text description on the input is dropped and never reaches the audit log (G13/CC-12).

**UI / route shells (thin glue; excluded from Node-pool coverage by design):**
- `src/app/articles/[id]/transparency/page.tsx` — the show-your-work view (server component): resolves D1, calls `getSurfaceablePack` + `toTransparencyView`, renders selected evidence (reusing the Phase-3 `EvidenceCard` component), the full dropped-candidate set, and the LLM query log in the dark-archival system. Degraded reads render as calm "recompute it" notices, never red alarms.
- `src/app/about/page.tsx` — the public About/compliance page (server, `force-static`): renders `aboutContent()`; links the canonical contract + repo; embeds the abuse-report form.
- `src/app/about/AbuseReportForm.tsx` — minimal client form: a category select + optional claim-key field. Codes-only by construction — there is no free-text field, so no reporter prose can be sent.
- `src/app/api/abuse-report/route.ts` — `POST /api/abuse-report`: thin glue → `recordAbuseReport`; returns the public issue-tracker URL.
- `src/app/api/feedback/route.ts` — `POST /api/feedback`: thin glue → `recordFeedback`; actor resolved from the current user (Phase 5 identity), defaulting to `system`.

**Tests created:** `test/transparency/reason-labels.test.ts`, `test/transparency/surface-pack.test.ts`, `test/db/audit-queries.test.ts`, `test/db/feedback.test.ts`, `test/about/compliance-content.test.ts`, `test/abuse/report.test.ts`.

## Files modified
- `src/app/page.tsx` — added an `/about` footer link, keeping the existing `"use client"` inline-types pattern (no server-module import).

## Files NOT created (Phase-6 boundary honored)
- **No `migrations/0009_feedback_columns.sql`.** Per the plan's DEFAULT DECISION, session-completion feedback is recorded as additive `session.feedback` audit rows over the existing `audit_log` (`event_type` is free `TEXT`, `payload_json` holds the outcome code). No structured columns were required, so no migration and no `schema.sql` change. **No second analytics/event table or pipeline was added** (verified: `grep "CREATE TABLE" migrations/` shows no feedback/analytics/events table).

---

## Verification gate (Task 6.8) — evidence

1. `tsc --noEmit` — exit 0 (clean).
2. `eslint .` — exit 0 (clean; confirms no `better-sqlite3`/`local-db` import leaked into `src/db/**`, `src/abuse/**`, `src/transparency/**`, or `src/app/**`).
3. `vitest run` (Node pool) — **857 passed (84 files)**; the 6 Phase-6 suites all green (40 tests), pristine output (no stray stderr — the corrupt-row tests use silent internal catches).
4. `vitest run -c vitest.workers.config.mts` (workerd pool) — **26 passed (8 files)** (unchanged; Phase 6 added no worker tests). The "Vite server" teardown message is the pre-existing benign warning.
5. Migration parity — **N/A** (no `0009` migration added).
6. `next build` — succeeds; new routes compile: `/about` (static), `/api/abuse-report`, `/api/feedback`, `/articles/[id]/transparency` (dynamic).

**Compliance spot-check (step 6):**
- **G6/G7 (show-your-work / full candidate set):** `toTransparencyView` preserves ALL dispositions + ALL queries (tested: `preserving counts (G7)`, `still shows queries and any dispositions`); the transparency page renders the full dropped set + query log with counts.
- **G1 (no machine prose):** the About content builder imports no AI/provider/fetch surface (tested via a source-text `readFileSync` assertion); the transparency view has no summary field (closed-shape key assertion).
- **G13/CC-12 (codes-only audit):** the abuse + feedback paths persist only codes — the abuse test asserts a free-text description never appears in `JSON.stringify(payload)`; feedback rejects any non-enum outcome.
- **CC-19 (defensive read):** `readAuditTrail` isolates a corrupt `payload_json` row (tested with a deliberately-malformed row); `toTransparencyView` degrades `pack_unreadable`/`not_found` without throwing.
- **Phase-6 boundary:** no second event/analytics table or pipeline (verified).

---

## Deviations

- **D-1 (Phase 6) — new non-app modules use relative imports, not `@/` (matches the established convention; the plan's sketches showed `@/`).** The Node-pool vitest config (`vitest.config.ts`) has no `resolve.alias`, and NO existing `src/` module outside `src/app/**` uses `@/` — they all use relative imports. So `src/transparency/*.ts`, `src/db/audit-queries.ts`, `src/db/feedback.ts`, and `src/abuse/report.ts` use relative imports (`../db/client`, `./reason-labels`); only the `.tsx`/route files under `src/app/**` use `@/` (resolved by Next + the workers config alias). The plan's Task 6.1–6.6 code sketches used `@/` — a sketch detail, not a behavior change. This is the same deviation Phase 3 recorded as D8.

- **D-2 (Phase 6) — reason-label keys aligned to the REAL `SourceFetchFailureReason` union, not the plan sketch's invented names.** The plan's Task 6.1 sketch used `fetch_failed` / `fetch_timeout` / `fetch_blocked` / `not_html`, and explicitly instructed (the "Note on the fetch-reason keys") to `grep` the real union and align. The real union (`src/research/source-fetch.ts`) is `blocked_scheme | blocked_host | redirect_not_allowed | timeout | too_large | unsupported_content_type | decode_error | http_error | network_error | empty_after_extraction`. The label map names all ten real members; the unknown-code fallback covers any future addition. The plan's `labelForReason("fetch_failed")` test still passes (the fallback satisfies its lane/non-empty/not-raw assertions); I broadened that test to assert all ten real members humanize.

- **D-3 (Phase 6) — About-page test regex corrected to match the contract's verbatim wording.** The plan's Task 6.5 test asserted `/citation the human has not verified/i`, but the contract's §5 wording (the source of truth, transcribed verbatim into the builder) is "a citation **that** the human has not verified against the real source." The transcription is faithful to the contract; the test regex was a sketch typo (missing "that"). Corrected the regex to `/citation that the human has not verified/i` rather than alter the verbatim transcription away from the contract. No weakening — the assertion still proves the unverified-citation commitment is present.

- **D-4 (Phase 6) — UI uses Tailwind utility classes mapped to design tokens, not the plan's `className="transparency"`/`"evidence-card"` hooks.** The Phase-3 design system (`src/app/globals.css`, Tailwind v4 `@theme inline`) exposes the dark-archival palette as Tailwind utilities (`text-iron-gall`, `bg-shelf-gray`, `border-hairline-gray`, `font-serif`, `font-mono`, …) — there are no bespoke `.transparency`/`.evidence-card` CSS classes. The plan's Task 6.7 page sketch used those class hooks; the real pages use the established utility-class convention (matching `src/app/page.tsx` and the `EvidenceCard` component) and reuse the existing `EvidenceCard` component for selected cards (DRY). No new color tokens defined; the Two Lanes / Reserved Red / No-Parchment / Borders-Not-Shadows rules are honored (dropped dispositions sit in the evidence/iron-gall lane, never red; degraded reads are calm notices).

- **D-5 (Phase 6) — `pnpm` in the plan ran as `node_modules/.bin/*` under `fnm`** (this session's `node`-not-on-PATH environment): `eval "$(fnm env)"` + `node_modules/.bin/{vitest,tsc,eslint,next}`. Same gate, no behavior change. (Same operational note as Phase 5 D-6.)

---

## UI surfaces needing the lead's visual review

The `.tsx` page shells are thin glue excluded from automated coverage by design (no React-Testing-Library / DOM env in this project), and the pure transformers they call are fully tested. `next build` compiles all of them. The following still want a human's eye in a real dark-mode browser:

1. **`/about`** — rendered and content-verified via HTML fetch (HTTP 200; the "will never do" list, named guardrails, repo link, and abuse form all present in the markup). Wants a visual pass for archival calm, hierarchy, and the abuse-form interaction (submit → "Report recorded" status; an uppercase/short claim key → inline validation error).

2. **`/articles/[id]/transparency?claimKey=…`** — NOT screenshotted in this session: it requires a real D1 binding and a seeded research pack (the OpenNext preview harness, not bare `next dev`). Wants a manual check against (a) a real pack with selected cards + dropped dispositions + queries (confirm full candidate set shown, humanized reasons, no red error treatment, no model-prose slot), (b) a deliberately-corrupt pack (confirm the calm `unreadable` notice), and (c) a stale-revision claim (confirm the `not_found` notice). The `EvidenceCard` reuse means selected cards already match the Phase-3 worksheet styling.

3. **Home-page footer** — the new `/about` link; trivial, but worth confirming it sits correctly under the candidate list.
