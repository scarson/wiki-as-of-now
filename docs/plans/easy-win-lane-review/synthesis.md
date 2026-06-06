# Easy-win lane — adversarial review synthesis & dispositions

Consolidates the 5-round adversarial design review (`round-{1..5}-*.md`) into prioritized,
cross-validated findings with a disposition each (FOLD = into design v2; DEFER = named follow-up;
REJECT = considered, not taken). Cross-validation (a finding raised independently by ≥2 rounds)
raises priority — those are the load-bearing ones.

**Cross-provider note:** round 5 was a same-provider Opus stand-in (no second-provider credential in
this env), per Sam's choice. Correlated blind spots remain vs a true second provider.

## What the review confirmed SOUND (do not regress)
- The **persisted-verdict-as-advisory + point-of-use re-fetch/re-run-gate** architecture correctly
  implements gate-design §6 and closes the durable-cache fail-OPEN. (R1, R4, R5 all affirm; R5-L7
  explicitly says resist the load-driven pressure to cache.)
- The `eligibility_verdicts` DDL is correct: **empirically** (R2) `WITHOUT ROWID` + composite PK
  rejects NULL on all three components, the FK to the `WITHOUT ROWID` parent fires, upsert works, no
  D1/better-sqlite3 divergence.
- Typed-error taxonomy, append-only audit split, verdict upsert idempotency, once-per-read `now`.

## CRITICAL — block the move to plan (FOLD)

- **A. Positive allowlist at re-validation** — *cross-validated R1-C1 + R3-F5.*
  Include a page **iff `evaluateEligibility(...).eligibility === "easy_win"`** (positive equality),
  never "exclude on known-bad reasons, include otherwise." `fetchArticle` returns *successfully* with
  `blpProbe: "unknown"` on a clcategories truncation/malformed-categories, so an inverse test
  fail-OPENs on `metadata_unavailable`. **FOLD:** spec the include-test as a hard allowlist invariant;
  add the `unknown`-on-re-fetch → excluded test as **MUST-NOT-weaken** (the §8 list omitted it).

- **B. Revision-identity invariant** — *cross-validated R1-C2 + R3-F1 + R4-F4.*
  Two distinct defects: (i) candidates are keyed by `stale_candidates.source_revision_id` but the
  drift check used `articles.revision_id`; non-atomic lookup writes can make them disagree → surface
  candidates from a different revision while the check "passes." (ii) Stage-2 fetches by **title**, but
  a rename/redirect rebinds a title to a *different* `page_id` → mis-attributed verdict/audit, latent
  fail-OPEN. **FOLD:** surface only candidates where
  `source_revision_id === liveRevisionId === articles.revision_id`; fetch by **page_id** (or assert
  `fetched.pageId === candidate.pageId` and drop on mismatch); write the `articles` row **last** in
  the lookup path so revision never leads its candidates.

## HIGH (FOLD unless noted)

- **C. Deleted/renamed page handling** — *R3-F2.* `ArticleNotFoundError` on re-fetch is unhandled →
  aborts the lane or re-404s forever. **FOLD:** treat as a per-page exclusion with an `article_gone`
  audit code; v1 simply excludes + logs (cleanup/tombstone of rows = DEFER, named).
- **D. Bounded fetch fan-out** — *cross-validated R4-F5 + R5-L1 + R5-L4.* One live fetch per
  pre-filtered page per read, uncapped, is a G14 violation as the corpus grows (and a public-instance
  amplifier). **FOLD (resolves open-Q2):** a hard **top-N cap** per lane read (named constant, small
  default) + **bounded sequential/low-concurrency** fetching. DEFER: pagination, caching the freshness
  re-check, auth-gating the public endpoint (named; the compliance doc §8 already pre-flags hosted-
  instance abuse).
- **E. POST, not GET** — *cross-validated R4-F6 + R3-F7 + R1-H4.* The lane has fetch + audit/verdict
  write side-effects; a cacheable/prefetchable/retried `GET` reintroduces a fail-OPEN one layer up.
  **FOLD:** `POST /api/easy-win` (matches the lookup route).
- **F. Bound the advisory scan's input** — *R5-L2.* `scanWikitextSignals`'s template regex costs
  ~1s CPU at the 2MB article limit on `{`-spam (the per-match length cap guards match length, not the
  number of match-start positions); × fan-out = Worker-CPU DoS on attacker-poisoned corpus articles.
  **FOLD (lane-scope mitigation):** cap the wikitext length handed to the scan at the ingest/lane
  boundary (a generous constant well above real articles). **DEFER (named, journaled):** hardening the
  regex itself / a start-position bound in `src/safelane/wikitext-signals.ts` — a pre-existing
  detail in already-merged code; out of this slice but must be journaled as a pitfall + follow-up.
  → *Sam decision flagged below: fix-in-slice vs journal-only.*
- **G. Pin write order + audit idempotency under non-atomic executor** — *cross-validated R1 + R2-5 +
  R3-F6 + R5-L6.* The SqlExecutor has no transaction primitive (DB-2); "exclude→refresh→audit" needs a
  pinned order and the re-validation audit must be idempotent/deduped so a mid-fan-out crash can't
  leave verdict/audit disagreement or duplicate events. **FOLD:** pin order; make the re-validation
  audit carry the `(page_id, live_revision_id, gate_version)` key so re-runs are detectable. DEFER:
  D1 `batch()` behind the port (named; DB-2 already anticipates this extension).

## MEDIUM (FOLD small / DEFER)

- **H. `gate_version` is a key the gate ignores** — *R1-H1 + R3-F10.* `evaluateEligibility` doesn't
  read `gateVersion`; it's a persistence/audit binding only. **FOLD:** document that the stored
  `gate_version` binds the *snapshot under which the verdict was computed*; Stage-1 filters on the
  *current* `GATE_VERSION` so a gate bump invalidates the pre-filter (forces re-validation), which is
  the desired self-invalidation.
- **I. `src/db/schema.sql` is unread dead documentation** — *R2-1/R2-2 (empirical: zero test refs).*
  The design's "byte-identical to 0001" invariant exists only as a comment. **FOLD (resolves
  open-Q1, simpler than designed):** add `migrations/0002_eligibility_verdicts.sql`; make `freshTestDb`
  apply migrations **in order**; keep `schema.sql` as the cumulative human-readable schema **and add a
  one-shot end-state-equivalence test** (apply-migrations schema == documented schema) so it stops
  being dead. REJECT deleting schema.sql (it's useful human doc once tested).
- **J. Verdict/audit unbounded growth + unowned retention** — *R2-3 + R5-L5.* History rows with no
  reader. **FOLD-small:** v1 keeps only the **latest verdict per `(page_id, gate_version)`** is
  tempting but loses the §6 per-revision binding; instead accept growth for single-user v1 and **name
  it** as a known unbounded surface (retention/compaction = DEFER). The audit log is append-only by
  contract — growth there is expected.
- **K. Empty-vs-degraded distinction** — *R3-F9 + R3-F7.* A `200 {items:[]}` can't tell
  "empty-healthy" from "all-upstream-down." **FOLD:** the response includes a small summary
  (`considered`, `surfaced`, `skipped[]` with codes) so a blind/degraded read is visible.
- **L. `reasons_json` untyped blob / eligibility⟺reasons coupling uncon­strained** — *R2-4.* Mirrors
  the audit payload; enforced in code, not DB. **DEFER (named):** acceptable for v1; note it.

## REJECT / not taken
- Revision-guarded cache for surfacing (R5-L7 pressure) — already rejected in brainstorm; reintroduces
  the durable fail-OPEN beyond the signed-off residuals.
- Dropping the `eligibility_verdicts` table for this slice (R4-F2 alternative) — §6 persistence is
  signed-off and the table is the audit/history of record; keep it.
- Re-detecting changed articles inline (R4) — Phase-3 reprocessing; out of slice.

## Resolved open questions (from the design doc §10)
1. **Migration discipline** → finding I: 0002 migration + ordered `freshTestDb` + equivalence test;
   don't claim byte-identicality.
2. **Fetch fan-out** → finding D: hard top-N cap + bounded concurrency in v1; pagination deferred.
3. **Candidates on demotion** → leave them (still valid detector output), just exclude from the lane.
4. **GET vs POST** → finding E: POST.

## Post-review scope additions (Sam, after the synthesis)
- **R3-F8 Stage-1 self-heal** pulled into v1: on `revision_drift`/`article_gone`, delete the stale
  `(page, stored_revision, gate_version)` verdict so the page stops re-fetching every read and eating
  the `maxPages` cap (the `demoted` case already self-heals via the same-revision upsert). `deleteVerdict`
  added to the DB module.
- **R3-F3 per-fetch timeout** pulled into v1: an explicit `Promise.race` timeout (default 10 s) bounds
  how long the lane waits on a hung fetch (the ingest `FetchLike` has no abort signal).
- **Finding F (scan ReDoS)** confirmed: root-cause regex hardening in `src/safelane/wikitext-signals.ts`
  in-slice (Plan Phase 1), not just a boundary cap.

## One decision flagged for Sam (resolved)
- **Finding F (wikitext-scan CPU):** fold a *lane-boundary input cap* into this slice (cheap, in-scope
  because the lane is what makes it exploitable at fan-out), AND journal the regex hardening of the
  already-merged `scanWikitextSignals` as a separate pitfall+follow-up? Or journal-only and accept the
  per-read input cap as the sole v1 mitigation? (Recommend: lane-boundary cap in-slice + journal the
  regex hardening.)
