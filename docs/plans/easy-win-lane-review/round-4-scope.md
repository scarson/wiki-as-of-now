<!-- ABOUTME: Round-4 adversarial scope review of the easy-win-lane v1 design — simplest-correct-slice lens. -->
<!-- ABOUTME: Challenges scope from both directions (over-engineering + missing-for-correctness); keep/cut/add per finding. -->

# Round 4 — Scope review (simplest-correct-slice lens)

**Design under review:** `docs/design/2026-06-06-easy-win-lane-design.md`
**Reviewer lens:** the simplest version that still satisfies the requirements AND is compliance-safe. Find over-engineering and missing-for-correctness gaps with equal weight.
**Reviewer date:** 2026-06-06.

## Verdict in one line

The two-stage shape and the point-of-use re-fetch are **right-sized and load-bearing — keep them**. The biggest scope question is the `eligibility_verdicts` **table**, and on inspection it is *justified but currently underpowered* for the very job it claims (pre-filter). The biggest correctness gaps are the **revision-drift check (mis-specified against the actual data model)**, the **unbounded fetch fan-out (open Q2 — not actually optional)**, and the **GET-with-side-effects verb (open Q4 — a real correctness/compliance smell, not a style nit)**.

---

## Findings

### F1 — Two-stage query: KEEP. Right-sized. Stage 1 is NOT premature optimization.

**Question posed:** could v1 just re-validate looked-up articles directly and skip Stage 1?

**Finding: keep both stages.** Stage 1 is not an optimization bolted onto a correct core — it is what makes the lane *bounded*. Without a pre-filter, "the easy-win lane" has no source set: you'd either (a) re-validate **every** article in the `articles` table on every read, or (b) have no way to enumerate which articles even have candidates worth surfacing. Option (a) is an unbounded fetch fan-out that directly threatens G14 (responsible access) and gets monotonically worse as the corpus grows; option (b) isn't a lane at all. Stage 1 (DB join, no network) is the cheapest correct way to answer "which pages were easy-win at last lookup under today's gate" and bound Stage 2's fetch count. This is the "extensible shape, small cost now" case from CLAUDE.md §Designing software, not YAGNI speculation.

**What's right-sized:** Stage 2 doing the authoritative re-derive is non-negotiable for compliance (see F3); the design correctly refuses to let Stage 1 authorize anything.

### F2 — The `eligibility_verdicts` table: KEEP, but it is the closest call, and it is currently underpowered for its stated job.

**Question posed:** is persisting the verdict needed in THIS slice if it's "never authoritative"? Could the lane derive purely from re-validating articles that *have candidates*?

**The cheaper alternative is real and must be named.** Stage 1's stated job is "narrow to pages that were easy-win at last lookup." But there is an *even cheaper* source set already in the schema: **the set of pages that have rows in `stale_candidates`.** A page with zero candidates is never surfaced regardless of eligibility, so the natural pre-filter is `SELECT DISTINCT page_id FROM stale_candidates`. That set is strictly ⊇ the surfaceable set and requires **no new table at all**. Stage 2 re-derives eligibility authoritatively anyway, so correctness does not depend on the verdict table existing.

**So why keep the table? Two reasons, one weak, one decisive:**

- *Weak reason — fetch-volume narrowing.* The verdict table narrows Stage 1 from "pages with candidates" to "pages with candidates **that were easy-win last time**." That removes `human_only` pages (BLPs, non-mainspace) from the fetch set. For single-user v1 with a small corpus this saving is marginal — the candidate-bearing set and the easy-win-candidate-bearing set are similar in size early on. On its own this would not clear the YAGNI bar.

- *Decisive reason — §6 binding + audit history is a stated requirement, not an optimization.* The gate design (`2026-06-06-safelane-gate-design.md` §6) mandates that *any* persisted verdict be bound to `(page_id, revision_id, gate_version)`. The easy-win design's own goal (§1) is "persist the verdict so the lane has an auditable history." If persisting a verdict is a **requirement of this slice**, the table is the smallest correct shape for it (the "store on `articles` row" alternative is correctly ruled out in §10 — it can't express per-revision/per-gate history). The table earns its place as the *audit-history substrate*, with pre-filtering as a secondary benefit.

**Recommendation: KEEP the table, but fix the framing in the design.** The design oversells the table as primarily a "cheap pre-filter" (§1, §4) when its marginal pre-filter value over `DISTINCT page_id FROM stale_candidates` is small in v1. Its real load-bearing justification is the §6-mandated persisted-verdict-with-history. **Cut defers nothing if dropped — but the §6 requirement forbids dropping it.** Sam should confirm: *is the persisted-verdict-with-history a firm requirement of THIS slice, or could it defer to when reprocessing/browse actually consume the history?* If it could defer, then the leaner slice is "pre-filter on `stale_candidates`, re-validate, no new table," and the table moves to the increment that first reads the history. **This is the single most important scope question in the review and should go to Sam explicitly.** My lean: keep it, because §6 is a signed-off binding and the table is its natural home — but the design must stop justifying it on pre-filter economics it doesn't really have.

### F3 — Point-of-use re-fetch (no cache for surfacing): KEEP. This is the compliance core; do not touch.

The re-fetch-and-re-run-the-gate-before-surfacing is the whole reason the lane is compliance-safe (§5, durable-fail-OPEN avoidance, the category-lag-on-unchanged-revision case). The non-goal "no trust of a cached verdict for surfacing" is **load-bearing and correctly placed in non-goals** — it prevents the exact reversal R4-5 made in the gate slice. Right-sized. Any reviewer pressure to "just trust the stored easy_win to save a fetch" must be rejected; the design already rejects it and explains why. Good.

### F4 — MISSING/MIS-SPECIFIED (correctness): the revision-drift check does not match the data model. **ADD a fix.**

§4 Stage 2 says: include iff "the live `revisionId` still equals the page's stored `revision_id` (so the persisted candidates describe the live revision)." But trace the write path:

- `lookupAndPersist` writes `articles.revision_id = fetched.revisionId` and `stale_candidates.source_revision_id = fetched.revisionId` **from the same fetch, in the same call** (`lookup.ts` L64–70). They are **always equal** at write time.

So comparing live `revisionId` against `articles.revision_id` is correct *only because* `articles.revision_id` happens to equal `source_revision_id`. The design narrates the check as "live == stored article revision," but what actually matters for candidate validity is "**live == the revision the candidates were detected from**" = `stale_candidates.source_revision_id`. Today these coincide; the design relies on that coincidence **without stating it**, and nothing enforces it. If a future increment ever updates `articles.revision_id` without re-detecting (e.g. a lightweight metadata refresh), the drift check would pass while candidates are stale — a silent fail-OPEN on staleness.

**ADD:** the drift check MUST compare live `revisionId` against the candidates' `source_revision_id` (the revision the candidates actually describe), not against `articles.revision_id`. State the invariant explicitly ("candidates are surfaced iff `live_revision == source_revision_id`"). This is the correct, self-defending shape and costs nothing extra now (both columns are present). It also makes the Stage-1 join clearer: the join condition the design writes (`revision_id = articles.revision_id`) should be reconsidered in light of this — the authoritative revision for candidate validity is `source_revision_id`.

### F5 — MISSING (open Q2 is not optional): fetch fan-out cap. **ADD a bound.**

Open Q2 ("cap N / paginate?") is framed as optional. It is **not** — it is a G14 correctness requirement. "One fetch per pre-filtered page per lane read" with no cap means lane-read cost grows unbounded with the easy-win corpus, and a single lane read could fire dozens-to-hundreds of sequential Wikimedia fetches. §5 hand-waves this with "the pre-filter keeps the set small" — true for single-user v1 *today*, false as a standing property. The design even admits Stage 2 cost is the expensive part.

**ADD (smallest correct form):** a hard cap `N` on pages re-validated per lane read (e.g. take the top-N pages by top-candidate score from Stage 1, re-validate only those). This is a few lines (`LIMIT` in Stage 1 + ordering already specified in §4). It bounds fetch volume deterministically and is the honest expression of "single-user v1." Full pagination/cursor is correctly deferrable; an unbounded fan-out is not. **What the cut defers:** pagination semantics (offset/cursor, "next page" of the lane) — fine to defer. **What must NOT defer:** the cap itself.

### F6 — Open Q4 (GET with side-effects): this is a real correctness/compliance smell. **CHANGE the verb or remove the side-effects from the read.**

§6 makes `GET /api/easy-win` perform Stage-2 fetches that **write** (verdict refresh on demotion, audit appends). A `GET` that mutates state violates HTTP semantics, but more importantly here it has *compliance* consequences: GETs are the things that get retried, prefetched, cached by intermediaries, and issued by link-followers. A retried/prefetched `GET` would re-fire Wikimedia fetches (G14 volume) and re-append audit rows. The design flags this as an open question; given the side-effects are **fetches against Wikimedia + audit writes + verdict upserts**, the answer is not cosmetic.

**Recommendation — pick the leanest safe option and stop deferring:**
- **Preferred:** make it `POST /api/easy-win` (or `POST /api/easy-win/refresh`) returning the items. The action genuinely is "re-validate-and-surface," which is a command, not a pure read. Matches the existing `POST /api/articles/lookup` convention (which also fetches+writes). This is the smallest change and the most honest verb.
- *Alternative (more work, defer):* split into a pure-read `GET` over last-known verdicts + an explicit `POST .../revalidate`. This is the browse-surface shape and overlaps the deferred UI increment — do NOT build it now.

**KEEP** the per-page fail-open-skip-on-`WikimediaUnavailableError` behavior (§6) — that is exactly right (fail-closed for the unreadable page, lane still returns the rest). Right-sized.

### F7 — Open Q3 (remove candidates on demotion): the design's lean is correct. KEEP as "leave + exclude."

§10/Q3 leans "leave the candidates, just exclude the page." That is the right minimal call: the candidates are still valid deterministic detector output for that revision; eligibility is an *article-level surfacing gate*, not a statement about candidate validity. Deleting them on demotion would (a) lose deterministic work, (b) conflate the gate with the detector, and (c) require re-detection to recover if the page later re-qualifies. **KEEP leave+exclude.** No change needed beyond removing the "open" framing — this one is decided correctly.

### F8 — Migration-discipline refactor (open Q1): right-sized, but scope it tightly. KEEP, with a guard.

Making `schema.sql` cumulative + `freshTestDb()` apply ordered migrations is the correct fix and is genuinely required (testing-pitfalls §8: the schema-under-test must be the real migration path, or the verdict-table tests test fiction). **KEEP.** Guard against scope creep: this slice should add exactly `migrations/0002_eligibility_verdicts.sql`, make `freshTestDb` apply `0001` then `0002` in order, and redefine `schema.sql` as the cumulative readable copy. It should NOT turn into a general migration-framework build (versioning table, up/down, CLI) — that's an ocean; flag if it starts growing.

### F9 — `WITHOUT ROWID` + composite PK upsert: right-sized. KEEP.

The `(page_id, revision_id, gate_version)` PK with `WITHOUT ROWID` and upsert-on-conflict matches the existing `articles` discipline (DB-1, NULL-rejection) and the §6 binding exactly. The CHECK constraint on `eligibility` mirrors the gate's two-value output. Good, idiomatic, not over-built. KEEP.

### F10 — Audit event shape: right-sized, one nit. KEEP with a note.

The `article.eligibility.revalidated` event (§7) with codes/identifiers only is consistent with the existing `article.eligibility` event and G13. One **note (not a blocker):** the design says the verdict table is "upsert-history" while the audit log is append-only. Be precise in the plan — the *audit log* is the append-only history (the compliance invariant); the *verdict table* is latest-state-per-snapshot (upsert overwrites within a `(page,rev,gate)` key, but a new revision/gate-version adds a row). The design mostly says this (§2) but §1 calls the table "an auditable history," which slightly overclaims — the append-only audit log is the history; the table is queryable current-state-per-snapshot. Tighten the wording so no one later treats the upsertable table as the immutable trail.

---

## Summary table

| # | Item | Direction | Recommendation |
|---|------|-----------|----------------|
| F1 | Two-stage query (Stage 1 pre-filter) | over-eng? | **KEEP** — Stage 1 bounds fan-out; not premature opt |
| F2 | `eligibility_verdicts` table | over-eng? | **KEEP** (closest call) — justified by §6 binding, NOT by pre-filter economics; ask Sam if §6-persist can defer |
| F3 | Point-of-use re-fetch (no surfacing cache) | over-eng? | **KEEP** — compliance core, do not weaken |
| F4 | Revision-drift check vs data model | missing/wrong | **ADD/FIX** — compare live rev to `source_revision_id`, not `articles.revision_id`; state the invariant |
| F5 | Fetch fan-out cap (open Q2) | missing | **ADD** — hard top-N cap; not optional (G14) |
| F6 | GET with fetch+write side-effects (open Q4) | wrong shape | **CHANGE** — make it `POST`; matches lookup route + HTTP/compliance semantics |
| F7 | Remove candidates on demotion (open Q3) | — | **KEEP leave+exclude** — decided correctly |
| F8 | Migration cumulative-schema refactor (open Q1) | right-sized | **KEEP**, scope tightly (no migration framework) |
| F9 | `WITHOUT ROWID` composite PK + upsert | — | **KEEP** — idiomatic, matches `articles` |
| F10 | `revalidated` audit event | nit | **KEEP** — tighten "history" wording (audit log = the history, table = current-state) |

## The leanest still-correct slice (what I'd build)

1. `migrations/0002` + cumulative `schema.sql` + ordered `freshTestDb` (F8).
2. `eligibility_verdicts` table + `upsertVerdict` + write it in `lookupAndPersist` (F2/F9) — **pending Sam's call on whether §6-persist is firm for this slice.**
3. `getEasyWinLane`: Stage 1 join → **top-N cap** (F5) → Stage 2 per-page re-fetch+re-gate, include iff `easy_win` AND `live_revision == source_revision_id` (F4), exclude+refresh+audit otherwise, skip-on-unavailable (F6 keep).
4. **`POST /api/easy-win`** (F6), thin route mirroring the lookup route.
5. Tests exactly as §8 enumerates (the BLP-on-re-fetch demotion test is the non-negotiable core).

**What each cut/deferral defers explicitly:**
- No fan-out cap → deferred = unbounded fetch growth (so NOT deferred; cap added).
- Top-N cap (no cursor) → defers lane pagination/"next page" (fine; arrives with browse UI).
- Leave candidates on demotion → defers candidate-lifecycle GC (fine; arrives with reprocessing).
- No materialized queue / no re-detection of changed articles → defers Phase-3 reprocessing (correctly deferred; the exclude-on-drift conservative choice covers v1).
- If Sam defers the verdict table → defers §6 persisted-history substrate to the first increment that reads it; lane pre-filters on `DISTINCT page_id FROM stale_candidates` meanwhile.

## Single highest-value question for Sam

Is the **persisted-verdict-with-history a firm requirement of THIS slice** (per gate-design §6), or may it defer until reprocessing/browse actually consume it? If it may defer, the table is cuttable now and the lane pre-filters directly on candidate-bearing pages — a strictly smaller slice. My lean is keep (§6 is signed-off), but the design currently justifies the table on pre-filter economics it doesn't really have, and that framing should be corrected regardless of the answer.
