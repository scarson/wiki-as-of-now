<!-- ABOUTME: Design for the easy-win lane v1 — the compliance-safe consumer of the G11 safe-lane eligibility gate. -->
<!-- ABOUTME: Persisted verdict as cheap pre-filter + audit; authoritative point-of-use re-fetch + re-run-gate before surfacing. -->

# Design — Easy-win lane v1 (the G11 gate's consumer)

**Status:** draft (pending 5-round adversarial review + Sam sign-off) — 2026-06-06.
**Builds on:** the merged safe-lane gate (`src/safelane/*`, `evaluateEligibility`), the lookup
orchestrator (`src/ingest/lookup.ts`), the persistence slice (`src/db/*`), and the detector
candidate store (`stale_candidates`).
**Compliance anchor:** `docs/policy/wikipedia-genai-compliance.md` — **stay-in-the-safe-lane (G11)**
(this is the surfacing path the BLP floor exists to protect), **audit-log-foundational (G13)**,
**responsible-Wikimedia-access (G14)**, **human-verification-gate (G5)**.
**Gate design it consumes:** `docs/design/2026-06-06-safelane-gate-design.md` — esp. §6 (the
no-persist decision + the forward invariant: "no easy-win path may surface an article without
calling the gate at point-of-use"; "any persisted verdict MUST be bound to
`(page_id, revision_id, gate_version)` and re-validated at point-of-use").

---

## 1. Goal and non-goals

**Goal.** Make the G11 gate non-inert: surface the *easy-win lane* — the stale candidates of
articles that are **currently** `easy_win`-eligible — without ever letting a stale verdict surface a
biography of a living person (BLP). Persist the verdict (so the lane has a cheap pre-filter and an
auditable history), but treat the persisted verdict as **advisory, never authoritative**: every
surfacing re-fetches and re-runs the gate at point-of-use.

**Non-goals (each named, none silent):**
- **No browse UI this slice.** The lane is exposed as a read API; the in-app browse surface is a
  later increment.
- **No re-detection of changed articles.** If an article's live revision has moved past the stored
  candidates' `source_revision_id`, the candidates are stale; v1 **excludes** that page from the
  lane rather than re-detecting (changed-article reprocessing is the spec's Phase-3 milestone).
- **No materialized queue table.** The lane is a derived query; a persisted worklist (population,
  invalidation, ordering, claim/lock) is deferred until reprocessing exists.
- **No trust of a cached verdict for surfacing** (the durable fail-OPEN R4-5 warned about). The
  persisted verdict only *narrows what to re-validate*; it never *authorizes* a surfacing.
- No auth/quotas, no research/Gemini, no ranking changes beyond the detector's existing score order.

---

## 2. Data model — `eligibility_verdicts`

A new table records the gate's verdict per evaluated snapshot:

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

- **Composite natural key** `(page_id, revision_id, gate_version)` — exactly the binding §6 mandates.
  `WITHOUT ROWID` so the PK is the real key and a NULL component is rejected (DB-1 discipline).
- One row per `(page, revision, gate_version)`: re-looking-up the same revision under the same gate
  version **upserts** (idempotent); a new revision or a gate-version bump adds a row (history kept).
- `reasons_json` mirrors the audit payload's codes — identifiers/codes only, never content.

**Migration strategy (implementation concern, flagged for review):** today
`migrations/0001_init.sql` is byte-identical to `src/db/schema.sql`, and `freshTestDb()` applies only
`0001`. Adding a table needs `migrations/0002_eligibility_verdicts.sql` AND a decision on the
schema.sql relationship: make `src/db/schema.sql` the **cumulative** canonical schema (= concatenation
of all migrations) and have `freshTestDb()` apply migrations in order. The "byte-identical to 0001"
note becomes "cumulative; equals the ordered migrations." This is a small migration-discipline
refactor the plan must handle explicitly (testing-pitfalls §8: schema-under-test is the real migration).

---

## 3. Write path — persist the verdict during lookup

`lookupAndPersist` already computes `decision = evaluateEligibility(...)`. Add one upsert after the
existing `article.eligibility` audit append:

```
upsertVerdict(db, { pageId, revisionId, gateVersion: GATE_VERSION,
                    eligibility: decision.eligibility, reasons: decision.reasons,
                    evaluatedAt: <iso> })
```

No change to the returned `LookupResult`. The audit event stays (audit = the immutable trail; the
verdict table = the queryable latest-state-per-snapshot). Both are identifiers/codes only.

---

## 4. Lane query — two-stage, derived

`getEasyWinLane(db, { fetchFn?, now?, userAgent? }) → EasyWinItem[]`

**Stage 1 — cheap DB pre-filter (no network).** Select pages whose **current** snapshot is recorded
`easy_win`: join `articles` × `eligibility_verdicts` on
`(page_id, revision_id = articles.revision_id, gate_version = current GATE_VERSION)` where
`eligibility = 'easy_win'`. This yields *candidate* pages without fetching anything — it bounds the
expensive Stage 2 to pages that were easy-win at last lookup under today's gate.

**Stage 2 — authoritative re-validation (per candidate page, network).** For each pre-filtered page,
`fetchArticle` → `toArticleMetadata` → `evaluateEligibility(meta, now, GATE_VERSION)`:
- If the re-run verdict is **`easy_win`** AND the live `revisionId` still equals the page's stored
  `revision_id` (so the persisted candidates describe the live revision) → **include** the page's
  `stale_candidates`, ranked by the existing score order.
- Otherwise → **exclude**, refresh the persisted verdict to the new verdict (so Stage 1 self-heals
  next time), and audit the demotion/revision-drift (codes only).

The returned `EasyWinItem` carries the article identifiers + its surfaced candidates (the existing
`PersistedCandidate` shape). Ordering across pages: a later concern; v1 orders pages by their
top candidate score (stable, deterministic).

---

## 5. Re-validation mechanics & compliance (the load-bearing part)

**Why re-fetch, not cache.** A BLP category can be added to the *categorylinks* of an **unchanged**
revision (MediaWiki job-queue lag), so a verdict cached on `(page, revision)` alone can be a *durable*
fail-OPEN even though nothing in our stored snapshot changed — exactly the reversal R4-5 made when it
chose not to persist in the gate slice. Re-fetching at point-of-use re-runs the `clcategories` probe
against **current** categorylinks, so a freshly-added BLP category demotes the page *before* it is
surfaced. This keeps the lane within the four **signed-off residuals** (compliance change log,
2026-06-06) — it does not widen them.

**Freshness still applies at re-validation** (the gate is unchanged): a page edited within the
freshness window re-validates to `human_only(recently_edited)` and is excluded — correct, and it also
naturally covers the "live revision moved" case for very-recent edits.

**Cost.** One fetch per pre-filtered page per lane read. Acceptable for single-user v1 (the pre-filter
keeps the set small); G14 honored (descriptive UA, `maxlag`, one article per call, no enumeration).
A caching/TTL optimization is explicitly out of scope and would require new compliance sign-off
because it reintroduces the durable fail-OPEN.

---

## 6. API surface

`GET /api/easy-win` → `200 { items: EasyWinItem[] }`. Thin route (like the lookup route): resolve the
D1 binding, call `getEasyWinLane(db, { now: new Date() })`, map typed fetch errors. Because Stage 2
fetches, a single upstream `WikimediaUnavailableError` on one page must **not** fail the whole lane —
that page is skipped (and audited), the rest return. (Fail-closed for *that page*: an unreadable page
is not surfaced.)

---

## 7. Audit (G13)

- `article.eligibility.revalidated` per Stage-2 page: `pageId`, `revisionId` (live), `eligibility`
  (re-run), `reasons`, `gateVersion`, `surfaced` (bool), and a `reason-for-exclusion` code
  (`demoted` / `revision_drift` / `fetch_unavailable`). Identifiers/codes only — no title/content.
- The existing `article.lookup` / `article.eligibility` events are unchanged.

---

## 8. Testing

- **DB layer** (`test/db/eligibility-verdicts.test.ts`): upsert idempotency on the composite key;
  NULL-component rejection (DB-1); FK to `articles`; read-back; the migration applied via the real
  `freshTestExecutor` (testing-pitfalls §8). Bind via `bind()` (DB-2).
- **Lane** (`test/.../easy-win-lane.test.ts`, injected `fetchFn` + fixed `now`, no network):
  - a page that was easy-win and **stays** easy-win on re-fetch → surfaced with its candidates;
  - a page that was easy-win but **re-fetches BLP-present** → excluded, verdict refreshed, demotion
    audited (the core fail-OPEN-prevention test — MUST NOT be weakened);
  - a page whose **live revision moved** past the stored candidates → excluded (`revision_drift`);
  - a page whose re-fetch throws `WikimediaUnavailableError` → skipped, others still returned;
  - Stage-1 pre-filter excludes `human_only` and stale-`gate_version` rows.
- **Write path** (`lookup.test.ts` addition): a lookup writes exactly one `eligibility_verdicts` row
  with the right key + codes.
- All gates green + pristine; no network in committed tests.

---

## 9. Compliance mapping

| Guardrail | How honored |
|---|---|
| Stay in the safe lane (G11) | Point-of-use re-fetch + re-run-gate; persisted verdict never authorizes a surfacing; within the four signed-off residuals; fail-closed per page (unreadable/indeterminate → not surfaced). |
| Audit foundational (G13) | Every re-validation + every exclusion logged with codes/identifiers; verdict table is upsert-history, the audit log stays append-only. |
| Responsible access (G14) | One article per fetch, descriptive UA, `maxlag`; Stage-1 pre-filter bounds fetch volume; no enumeration/talk-page fetch. |
| Human-verification gate (G5) | The lane surfaces *candidates to verify*, never auto-edits; the downstream open-the-source gate is unchanged. |

---

## 10. Reasoning chain (for the reviewer + future revisors)

- **Persist, but as advisory.** Brainstorm settled that the verdict is a *pre-filter + audit record*,
  not the surfacing authority — this is the only reading that both satisfies §6's "persist bound to
  (page,revision,gate_version)" AND avoids the durable fail-OPEN §6 forbids. The two-stage query is
  the concrete expression: Stage 1 uses the cache to *narrow*, Stage 2 *re-derives* to *authorize*.
- **Derived over materialized (YAGNI).** No reprocessing pipeline exists yet, so a worklist table
  (population/invalidation/locking) buys nothing and overlaps the Phase-3 milestone. Chosen: a query.
- **Candidate-level lane, article-level gate.** The product fixes claim-level stale candidates; the
  gate is article-level. The lane = candidates filtered by *current* article eligibility.
- **Exclude on revision drift (don't re-detect).** Re-detecting on the fly = re-running the whole
  lookup; that's a reprocessing feature, out of this slice. Excluding is the conservative v1 choice.

**Considered and ruled out:**
- *Revision-guarded cache (no re-fetch).* Cheaper, but reintroduces the category-lag durable
  fail-OPEN as a standing condition beyond the signed-off residuals → would need new G11 sign-off.
  Rejected for v1 (Sam's call in brainstorm).
- *Store the verdict on the `articles` row.* Can't express per-revision/per-gate-version history or
  the §6 binding; conflates "latest article" with "verdict for a snapshot."
- *Re-detect changed articles inline.* Scope creep into Phase-3 reprocessing; deferred.

**Open questions for the review:**
1. Migration-discipline refactor (cumulative `schema.sql` + ordered-migration `freshTestDb`) — confirm
   the shape before the plan.
2. Lane-read fetch fan-out: is per-read re-fetch of *all* pre-filtered pages acceptable, or do we cap
   N / paginate the lane in v1?
3. Should the demotion path (easy-win → BLP on re-fetch) also *remove* the page's stale candidates, or
   leave them (they're still valid detector output, just not easy-win)? Leaning leave + exclude.
4. Is `GET` the right verb given Stage 2 has fetch side-effects (audit writes, verdict refresh)? Or a
   `POST`/explicit "refresh" semantics?
