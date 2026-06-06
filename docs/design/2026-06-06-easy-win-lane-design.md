<!-- ABOUTME: Design v2 for the easy-win lane — the compliance-safe consumer of the G11 safe-lane gate. -->
<!-- ABOUTME: Persisted verdict as cheap pre-filter + audit; authoritative point-of-use re-fetch + re-run-gate before surfacing. -->

# Design — Easy-win lane v1 (the G11 gate's consumer)

**Status:** v2 — hardened over a 5-round adversarial review (`docs/plans/easy-win-lane-review/`,
synthesis in `synthesis.md`); pending Sam sign-off. 2026-06-06.
**Builds on:** the merged safe-lane gate (`src/safelane/*`, `evaluateEligibility`), the lookup
orchestrator (`src/ingest/lookup.ts`), the persistence slice (`src/db/*`), and the detector
candidate store (`stale_candidates`).
**Compliance anchor:** `docs/policy/wikipedia-genai-compliance.md` — **stay-in-the-safe-lane (G11)**
(this is the surfacing path the BLP — biographies of living persons — floor exists to protect),
**audit-log-foundational (G13)**, **responsible-Wikimedia-access (G14)**, **human-verification-gate (G5)**.
**Gate design it consumes:** `docs/design/2026-06-06-safelane-gate-design.md` §6 (the no-persist
decision + the forward invariant: "no easy-win path may surface an article without calling the gate at
point-of-use"; "any persisted verdict MUST be bound to `(page_id, revision_id, gate_version)` and
re-validated at point-of-use").

---

## 1. Goal and non-goals

**Goal.** Make the G11 gate non-inert: surface the *easy-win lane* — the stale candidates of articles
that are **currently** `easy_win`-eligible — without ever letting a stale verdict surface a BLP.
Persist the verdict (cheap pre-filter + auditable history), but treat it as **advisory, never
authoritative**: every surfacing re-fetches and re-runs the gate at point-of-use.

**In scope (v1):** the `eligibility_verdicts` table + migration; verdict write on lookup; the
two-stage lane query with the CRITICAL invariants below; a `POST` lane endpoint; the
`scanWikitextSignals` ReDoS hardening (review finding F, Sam: fix at root in this slice).

**Non-goals (each named, none silent):**
- **No browse UI this slice** (read endpoint only).
- **No re-detection of changed articles** — revision drift → exclude (Phase-3 reprocessing later).
- **No materialized queue table** — derived query.
- **No trust of a cached verdict for surfacing** (the durable fail-OPEN R4-5 forbids).
- **Deferred, named:** lane pagination; caching the freshness re-check; row tombstoning/cleanup of
  gone pages; verdict/audit retention/compaction; D1 `batch()` transactional writes behind the port;
  auth-gating the public endpoint. No auth/quotas, no research/Gemini.

---

## 2. Data model — `eligibility_verdicts`

```sql
CREATE TABLE eligibility_verdicts (
  page_id      INTEGER NOT NULL REFERENCES articles(page_id),
  revision_id  INTEGER NOT NULL,
  gate_version TEXT    NOT NULL,
  eligibility  TEXT    NOT NULL CHECK (eligibility IN ('easy_win','human_only')),
  reasons_json TEXT    NOT NULL,            -- JSON array of canonical reason codes
  evaluated_at TEXT    NOT NULL,            -- ISO 8601 UTC
  PRIMARY KEY (page_id, revision_id, gate_version)
) WITHOUT ROWID;
```

- Composite natural key + `WITHOUT ROWID` → the PK is the real key and a NULL component is rejected
  (DB-1; review R2 confirmed empirically on all three components + FK fires). Bind via `bind()` (DB-2).
- Upsert on the composite key: same `(page, revision, gate_version)` refreshes in place; a new
  revision or `gate_version` bump adds a row (history). `reasons_json` = codes only, never content.
- **`gate_version` semantics:** the gate verdict itself doesn't read `gate_version`; it binds *the
  snapshot under which the verdict was computed*. Stage-1 filters on the **current** `GATE_VERSION`, so
  a gate bump self-invalidates the pre-filter (forces re-validation). Unbounded history growth is a
  **named, accepted** v1 surface (retention deferred).

**Migration discipline (review finding I — `schema.sql` was unread dead doc):**
add `migrations/0002_eligibility_verdicts.sql`; `freshTestDb()` applies migrations **in order**; keep
`src/db/schema.sql` as the cumulative human-readable schema and add a **one-shot end-state-equivalence
test** (schema built from ordered migrations === documented `schema.sql`) so it is no longer untested.
Drop the "byte-identical to 0001" claim.

---

## 3. Write path — persist the verdict during lookup

`lookupAndPersist` already computes `decision`. Changes:
- **One shared revision id per lookup (CRITICAL-B).** Capture `liveRev = fetched.revisionId` once and
  use it for the article row (`revision_id`), every candidate (`source_revision_id`), AND the verdict
  (`revision_id`). The invariant is *not* a write-ordering trick — it is that all three rows describe
  the **same** revision, so `articles.revision_id` can never lead the `stale_candidates` it summarizes.
  (An earlier draft said "write the article row LAST"; that is unworkable because both `stale_candidates`
  and `eligibility_verdicts` FK to `articles(page_id)`, so the parent MUST be written first. The
  shared-revision-id invariant is the correct, FK-compatible expression — `upsertArticle` stays first.)
- Upsert `eligibility_verdicts` with `(pageId, liveRev, GATE_VERSION, decision.eligibility,
  decision.reasons, evaluatedAt)`. The existing `article.lookup` / `article.eligibility` audit events
  are unchanged. No change to the returned `LookupResult`.

---

## 4. Lane query — two-stage, derived, with the CRITICAL invariants

`getEasyWinLane(db, { fetchFn?, now?, userAgent?, maxPages? }) → EasyWinLaneResult`

**Stage 1 — cheap DB pre-filter (no network).** Pages whose **current** snapshot is recorded
`easy_win`: join `articles` × `eligibility_verdicts` on `page_id`,
`revision_id = articles.revision_id`, `gate_version = current GATE_VERSION`, `eligibility = 'easy_win'`,
that also have ≥1 `stale_candidates` row. Order deterministically; **cap at `maxPages`** (CRITICAL-D /
G14) — a named constant (small default); pages beyond the cap are reported as `deferred`, not silently
dropped.

**Stage 2 — authoritative re-validation (per page, network, bounded concurrency).** For each
pre-filtered page, re-fetch by the stored title with a **mandatory identity assertion**
(`fetched.pageId === pageId`) → `toArticleMetadata` → `evaluateEligibility(meta, now, GATE_VERSION)`.
The identity assertion is the fail-closed guard against a title rename/redirect rebinding to a
*different* page (R3-F1): on mismatch the page is excluded, never surfaced. (`fetchArticle` is
title-addressed; a page-id-addressed fetch is a possible future hardening, but title + identity
assertion is already fail-closed and avoids expanding the ingest contract in this slice.) Decide by a
**positive allowlist** (CRITICAL-A):

> **Include the page iff ALL hold:** `fetched.pageId === candidatePageId` (identity) **AND**
> `evaluateEligibility(...).eligibility === "easy_win"` (never "not-known-bad") **AND**
> `fetched.revisionId === articles.revision_id === source_revision_id` (the stored candidates describe
> the live revision; CRITICAL-B).

Anything else → **exclude**, refresh the persisted verdict to the re-run result, and audit with a
specific code. Per-page outcomes:
- `surfaced` — included; emit its `stale_candidates` (existing score order).
- `demoted` — re-run verdict is `human_only` (incl. `blpProbe:"unknown"` → `metadata_unavailable`,
  the fail-closed path). Candidates are **left in place** (still valid detector output), just excluded.
- `revision_drift` — live revision ≠ stored; excluded (re-detection is Phase-3). Does **not** mutate
  `articles.revision_id` (avoids infinite churn; R3-F8).
- `article_gone` — `ArticleNotFoundError` on re-fetch; excluded + logged (row cleanup deferred).
- `fetch_unavailable` — `WikimediaUnavailableError`/timeout; excluded for this read (fail-closed for
  that page), logged.

**Per-page isolation:** one page's fetch failure never fails the lane; a per-fetch **timeout**
bounds a hang. Writes per page are ordered **refresh-verdict → audit** and the audit row is keyed by
`(page_id, live_revision_id, gate_version)` so a re-run is idempotent (CRITICAL-G).

---

## 5. Re-validation & compliance (the load-bearing part)

**Why re-fetch, not cache.** A BLP category can be added to the *categorylinks* of an **unchanged**
revision (job-queue lag), so a verdict cached on `(page, revision)` alone is a *durable* fail-OPEN.
Re-fetching re-runs the `clcategories` probe against **current** categorylinks → a freshly-added BLP
category demotes the page before surfacing. Stays within the four signed-off residuals; does not widen
them. Freshness still applies (a within-window edit → `recently_edited` → excluded).

**Positive allowlist is the floor's expression here:** `fetchArticle` returns *successfully* with
`blpProbe:"unknown"`, so an inverse "exclude-on-bad" test would fail-OPEN on `metadata_unavailable`.
The include-iff-`easy_win` rule + the `unknown`-on-re-fetch exclusion test are **MUST-NOT-weaken**.

**Cost / G14.** `maxPages` cap + bounded concurrency + per-fetch politeness (descriptive UA,
`maxlag`, one article per call). The public-instance fan-out amplifier (R5-L4) is bounded by the cap;
auth-gating is the deferred follow-up the compliance doc §8 already anticipates.

---

## 6. API surface

`POST /api/easy-win` (CRITICAL-E: side-effecting — fetches + audit/verdict writes — so not a cacheable
`GET`). Thin route: resolve D1, `getEasyWinLane(db, { now: new Date() })`, map typed errors.
Response distinguishes empty-healthy from degraded (R3-F9):

```jsonc
{ "items": [ /* { pageId, title, revisionId, candidates: PersistedCandidate[] } */ ],
  "summary": { "considered": N, "surfaced": S, "deferred": D,
               "skipped": [ { "pageId": …, "code": "demoted|revision_drift|article_gone|fetch_unavailable" } ] } }
```

---

## 7. Audit (G13)

Per Stage-2 page: `article.eligibility.revalidated` — `pageId`, `revisionId` (live), `eligibility`
(re-run), `reasons`, `gateVersion`, `outcome` (`surfaced|demoted|revision_drift|article_gone|
fetch_unavailable`). Identifiers/codes only; idempotent on `(page_id, live_revision_id, gate_version)`.
Existing `article.lookup`/`article.eligibility` events unchanged; the audit log stays append-only.

---

## 8. `scanWikitextSignals` ReDoS hardening (review finding F — root fix, in slice)

R5-L2: the template-name regex over `{`-spam costs ~1s CPU at the 2MB article limit (the per-match
length cap bounds match length, not the number of match-start positions); × lane fan-out = Worker-CPU
DoS on attacker-poisoned articles (G15 untrusted content). **Fix at root** in
`src/safelane/wikitext-signals.ts`: bound the work to linear in input length (e.g. anchor/limit
match-start scanning, or a total-input length guard combined with a start-position bound), so
pathological `{{`/`[[`-spam returns promptly with no match. TDD: a perf/behavior test asserting a
multi-MB spam input returns `[]` within a tight bound, plus all existing scan tests stay green.
**Pitfall:** add an entry to `docs/pitfalls/implementation-pitfalls.md` (untrusted-wikitext scan must
be linear; the gate runs it on attacker-controllable content at fan-out scale).

---

## 9. Testing

- **DB layer** (`test/db/eligibility-verdicts.test.ts`): composite-key upsert idempotency;
  NULL-component rejection (DB-1); FK to `articles`; read-back; ordered-migration equivalence test
  (finding I); built via `freshTestExecutor`, bind via `bind()` (DB-2).
- **Lane** (injected `fetchFn` + fixed `now`, no network):
  - easy-win → re-fetch still easy-win, revision matches → **surfaced**;
  - **re-fetch BLP-present → excluded/demoted** (core fail-OPEN prevention — MUST-NOT-weaken);
  - **re-fetch `blpProbe:"unknown"` → excluded (`metadata_unavailable`)** (CRITICAL-A — MUST-NOT-weaken);
  - **page_id identity mismatch on re-fetch → excluded** (CRITICAL-B);
  - **revision drift (live ≠ stored) → excluded, `articles.revision_id` unchanged** (CRITICAL-B/R3-F8);
  - `ArticleNotFoundError` → `article_gone`, excluded, others returned;
  - `WikimediaUnavailableError`/timeout on one page → skipped, others returned;
  - Stage-1 excludes `human_only` and stale-`gate_version` rows; `maxPages` cap → `deferred`;
  - empty-healthy vs all-failed produce distinguishable summaries.
- **Write path**: a lookup writes exactly one `eligibility_verdicts` row (right key + codes); article
  row written last.
- **Scan hardening**: multi-MB `{{`/`[[`-spam → `[]` within a tight time bound; existing scan tests green.
- All gates green + pristine; no network in committed tests.

---

## 10. Compliance mapping

| Guardrail | How honored |
|---|---|
| Stay in the safe lane (G11) | Point-of-use re-fetch + re-run-gate; positive `easy_win` allowlist; persisted verdict never authorizes surfacing; within the four signed-off residuals; fail-closed per page. |
| Audit foundational (G13) | Every re-validation + exclusion logged with codes/identifiers, idempotent; verdict table is upsert-history, audit log append-only. |
| Responsible access (G14) | `maxPages` cap + bounded concurrency + per-fetch UA/`maxlag`; one article per call; no enumeration/talk-page fetch. |
| Fetched content untrusted (G15) | Wikitext scanned as data; the scan is hardened to linear-time so attacker-controlled content can't DoS the Worker. |
| Human-verification gate (G5) | Surfaces *candidates to verify*, never auto-edits; the open-the-source gate is unchanged. |

---

## 11. Reasoning chain & what the review changed

- **Persist-but-advisory + point-of-use re-derive** (brainstorm + R1/R4/R5 affirm): the only reading
  that satisfies §6's persistence binding AND avoids the durable cache fail-OPEN §6 forbids.
- **Positive allowlist** (review CRITICAL-A): the floor must be expressed as include-iff-`easy_win`,
  because `unknown` is a *successful* fetch — an inverse test fail-OPENs on `metadata_unavailable`.
- **Revision/identity invariant** (review CRITICAL-B): re-fetch by stored title + a mandatory
  `fetched.pageId === pageId` identity assertion (fail-closed on rename rebind); require
  `source_revision_id === live === articles.revision_id`; enforce one shared revision id per lookup
  (parent-first under the FK — the "article row last" draft was corrected).
- **Bounded fan-out** (review HIGH-D): `maxPages` cap + concurrency bound or the lane violates G14 as
  the corpus grows; the public endpoint is a deliberate amplifier (auth deferred).
- **POST** (review HIGH-E): side effects make a cacheable `GET` a fail-OPEN one layer up.
- **Scan hardening in-slice** (review HIGH-F, Sam): the lane makes the existing `scanWikitextSignals`
  cost exploitable at fan-out; fix the root, journal a pitfall.
- **Derived over materialized; candidate-level lane; exclude on drift** — unchanged from v1, all
  affirmed by the review (R4 right-sized them).

**Considered and ruled out:** revision-guarded cache (durable fail-OPEN); dropping the verdict table
(§6 signed-off); inline re-detection (Phase-3); deleting `schema.sql` (kept + made testable instead).

**Residual uncertainties (named):** unbounded verdict/audit growth (retention deferred); `reasons_json`
as an untyped blob with the eligibility⟺reasons coupling enforced only in code; the cross-provider
review round was a same-provider stand-in (correlated blind spots may remain).
