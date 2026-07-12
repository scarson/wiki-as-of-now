<!-- ABOUTME: Round-1 adversarial compliance review of the easy-win lane v1 design — BLP fail-OPEN surface lens. -->
<!-- ABOUTME: Findings, severities, scenarios, and design fixes; confirms what is sound. Read-only review, no source edits. -->

# Easy-win lane v1 — Round 1 adversarial review (compliance / BLP fail-OPEN lens)

**Reviewer role:** adversarial design reviewer. **Single lens:** can a biography of a living person (BLP) — or any non-eligible article — reach the easy-win surface? This lane is the exact surfacing path the G11 fail-closed BLP floor exists to protect; any fail-OPEN here defeats the floor.

**Documents reviewed:**
- `docs/design/2026-06-06-easy-win-lane-design.md` (under review)
- `docs/design/2026-06-06-safelane-gate-design.md` (the gate it consumes — §6 forward invariant, §7 freshness, §9 residuals)
- `docs/policy/wikipedia-genai-compliance.md` (stay-in-the-safe-lane / G11, audit-foundational / G13, responsible-access / G14, human-verification / G5; 2026-06-06 change-log entry naming the four signed-off residuals)
- `src/safelane/eligibility.ts`, `src/safelane/denylists.ts`, `src/ingest/wikimedia.ts`, `src/ingest/lookup.ts`, `src/db/articles.ts`, `src/db/audit-log.ts`, `src/db/schema.sql`

**Verdict in one line:** the core architecture (advisory-verdict + point-of-use re-fetch/re-run-gate) is the right shape and genuinely closes the durable fail-OPEN that §6 warned about. **But there are two CRITICAL seams where the design as written can surface a BLP or surface stale candidates that no longer describe the live article, plus several HIGH/MEDIUM gaps.** None require widening the four signed-off residuals to fix; they are implementation-seam defects, not new policy residuals. The design MUST NOT go to plan until C1 and C2 are resolved.

---

## CRITICAL findings

### C1 — Stage-2 "include" gate omits the indeterminate/total-fetch-error fail-closed wiring; the per-page "skip" can silently become "include" if re-fetch returns a *parsed-but-degraded* envelope

**Severity: CRITICAL.**

**Scenario.** Stage 2 runs `fetchArticle → toArticleMetadata → evaluateEligibility`. The design (§4, §6) names exactly one failure it handles: a *thrown* `WikimediaUnavailableError` → skip that page (fail-closed). But `fetchArticle` does **not** throw on every non-eligible-determining condition. Per `src/ingest/wikimedia.ts`:
- A response with a `clcategories` truncation/warning, or a malformed `categories` field, returns **successfully** with `blpProbe === "unknown"` (it does not throw — see `deriveBlpProbe`). The gate then maps `unknown → human_only(metadata_unavailable)`, so it is excluded **only if** the include-test is written as "include iff `eligibility === 'easy_win'`." That is correct *as long as the include-test is exactly that*. The design's prose in §4 says "If the re-run verdict is `easy_win` AND the live `revisionId` still equals … → include; **Otherwise → exclude**." That is fail-closed — good. **The CRITICAL risk is that the design never states this as an invariant with the same force the gate design uses ("`easy_win` only when an article clearly passes every check; default `human_only` on any uncertainty").** A plan author reading §4 could reasonably implement the natural-looking inverse — "exclude iff verdict is a known bad reason (BLP/non-mainspace/recent); include otherwise" — which fail-OPENs on `metadata_unavailable` and on any future reason code. The whole gate design's load-bearing property is *allowlist semantics* (include only on an affirmative `easy_win`), and the lane design does not restate it as a hard, testable invariant for Stage 2.

**Why it breaks the floor.** `metadata_unavailable` exists precisely because a `clcategories` truncation means "we could not read BLP membership." If Stage 2's include-test is anything other than a positive `eligibility === 'easy_win'` equality check, an unreadable-BLP-membership page surfaces. That is a direct BLP fail-OPEN, and it widens residual (i)/(ii) without sign-off.

**Recommended fix.** State as a numbered, testable design invariant: **"Stage 2 includes a page if and only if the re-run `EligibilityDecision.eligibility === 'easy_win'` (positive equality on the affirmative verdict) AND the live revision equals the stored revision. Every other outcome — any non-empty `reasons`, any thrown error, any indeterminate fetch — excludes. The include predicate is an allowlist, never a denylist of known-bad reasons."** Add an explicit test for the `unknown`/`metadata_unavailable` re-fetch path (the §8 test list currently covers BLP-present, revision-drift, and thrown-unavailable, but **not** the parsed-but-indeterminate `blpProbe==='unknown'` re-fetch — that is the exact gap). Mark that test MUST-NOT-be-weakened alongside the BLP-present test.

---

### C2 — Stage-1 join binds candidates to `articles.revision_id`, but candidates are bound to `stale_candidates.source_revision_id`; these can diverge, surfacing candidates that do not describe the live revision even when the live-revision-equality check "passes"

**Severity: CRITICAL.**

**Scenario.** Trace the keys:
- `articles` stores exactly **one** `revision_id` per page; `upsertArticle` overwrites it on every lookup (`src/db/articles.ts`).
- `stale_candidates` rows carry `source_revision_id` (the revision the candidates were *detected* from); `insertCandidates` full-replaces the page's candidate set.
- The proposed `eligibility_verdicts` row carries its own `revision_id`.
- Stage 1 (§4) joins `articles × eligibility_verdicts ON revision_id = articles.revision_id`. Stage 2's include-test compares the **live** `revisionId` to "the page's stored `revision_id`" — i.e. `articles.revision_id`.

Now the seam: **`lookupAndPersist` is not atomic and the three writes (article upsert, candidate replace, verdict upsert) are independent statements** (the code explicitly notes `insertCandidates` is "sequential statements, not a single atomic transaction"). Consider a lookup at revision R that is interrupted *between* `upsertArticle` (writes `articles.revision_id = R`) and `insertCandidates` (which would replace candidates for R). Because the prior run left candidates at `source_revision_id = R-1`, the DB now holds: `articles.revision_id = R`, candidates at `source_revision_id = R-1`, and (if the verdict upsert is ordered after the audit append as §3 shows, and also did not run) possibly a verdict row for R-1 or none. Stage 1 + Stage 2 can then find `articles.revision_id (R)` matching a live revision `R`, re-validate `easy_win` for R, and **surface candidates that were detected from R-1** — stale candidate text that may no longer exist in the live article. The design's own non-goal ("No re-detection of changed articles… excludes that page") is silently violated because the *equality check is on the wrong revision column*. The live-revision check guards `articles.revision_id`, not the candidates' `source_revision_id`.

A second, simpler instance of the same root cause: the design never specifies that Stage 2's surfaced `stale_candidates` MUST have `source_revision_id === articles.revision_id === liveRevisionId`. §4 says "include the page's `stale_candidates`" with no revision predicate on the candidates themselves.

**Why it matters for the floor.** This is not strictly a BLP fail-OPEN, but it is a G11-adjacent integrity break and a G5 problem: the lane surfaces a "candidate to verify" whose text/section may not be in the live revision, so the human verifies against a phantom. It also undermines the whole "advisory verdict, authoritative re-derive" contract — the re-derive authorizes the *article's* eligibility but not the *candidates'* currency. Worst case, combined with the BLP-by-talk-banner / category-lag residuals, a candidate detected on an old revision is surfaced under a fresh "easy_win" verdict that was computed against different content.

**Recommended fix.** Make the three-way revision identity an explicit, enforced invariant: **Stage 2 includes a page only when `liveRevisionId === articles.revision_id` AND every surfaced candidate's `source_revision_id === liveRevisionId`.** Filter `stale_candidates` by `source_revision_id = liveRevisionId` in the surfacing query (don't trust `articles.revision_id` as a proxy for candidate currency). Additionally, specify the write ordering and consistency contract in `lookupAndPersist` so a partial write cannot leave `articles.revision_id` ahead of the candidate/verdict rows — either (a) wrap the three writes in a D1 batch/transaction, or (b) order them so the article row (the Stage-1 join anchor) is written **last**, after candidates and verdict, so an interrupted run never advertises a revision whose candidates/verdict aren't yet present. Add a test for the interrupted-write / drifted-`source_revision_id` case.

---

## HIGH findings

### H1 — `gate_version` is recorded but the gate logic ignores it; a gate-version bump does not re-derive old verdicts, and Stage 1's "current GATE_VERSION" filter is the *only* thing forcing re-evaluation — which Stage 2 re-fetch does not actually key on

**Severity: HIGH.**

**Scenario.** `evaluateEligibility` takes `_gateVersion` and **ignores it** (`src/safelane/eligibility.ts` — the parameter is prefixed `_`). `GATE_VERSION` is a module constant `"1.0.0"`. The design relies on Stage 1 filtering `eligibility_verdicts.gate_version = current GATE_VERSION` so that after a gate-version bump, old `easy_win` rows (computed under the old, possibly-more-permissive gate) are excluded from the pre-filter until re-looked-up. That is sound *for the pre-filter*. **But there is no mechanism that ever re-runs the gate for a page whose only stored verdict is under an old gate_version** — Stage 1 won't select it (good, it's excluded), but it also never self-heals, and the design's §4 "refresh the persisted verdict … so Stage 1 self-heals next time" only fires for pages that *were* selected by Stage 1. So a gate-version bump that makes the gate *stricter* is safe (old easy-win rows drop out of the pre-filter), but the design should state explicitly that **a gate-version bump can only ever shrink the lane until re-lookup, never grow it** — i.e., confirm the monotonicity direction. If a future gate version is *more permissive*, the same mechanism correctly withholds those pages until re-evaluated under the new version, which is the fail-closed direction. This holds, but it is load-bearing and unstated.

The sharper HIGH issue: **Stage 2 calls `evaluateEligibility(meta, now, GATE_VERSION)` but the function ignores the version**, so the verdict it computes is "current gate logic" regardless of the string. That's fine *today* because the deployed code is one version. But the design persists `gate_version` as if it were a semantic key (PK component, Stage-1 filter) while the runtime gate has no version dispatch. If two gate versions ever coexist (rolling deploy, or a verdict written by an older Worker still in flight), the `gate_version` column can be *mislabeled*: a verdict computed by old code could be written with a new `GATE_VERSION` constant or vice-versa, because the version is a deploy-time constant, not derived from the logic that produced the verdict. Then Stage 1 trusts a `gate_version` label that doesn't match the logic that produced the row.

**Recommended fix.** (a) State the monotonicity invariant explicitly: "a gate-version transition removes affected pages from the lane until re-lookup re-derives them under the new version; it never surfaces a page on a stale-version verdict." (b) Because `gate_version` is now a persisted semantic key, require that the gate version stamped on a verdict is the version of the logic that actually produced it (it is, since both come from the same module constant at the same deploy — but document that invariant and add a guard/test so a future refactor that adds version dispatch to `evaluateEligibility` keeps the stamp and the logic in lockstep). (c) Since Stage 2 re-derives at point-of-use anyway, consider having Stage 2 ignore the persisted verdict's gate_version entirely for the *authorization* decision (it already does — the persisted verdict only narrows Stage 1), and document that Stage 1's gate_version filter is a pre-filter optimization with no authorization weight. This de-risks any version-label skew: even a mislabeled Stage-1 row gets re-derived by current logic in Stage 2.

### H2 — Category-table/job-queue lag *beyond the freshness window* is residual (i), but the lane can re-surface the same lagged BLP on every read with no additional mitigation, turning a "narrow residual" into a *standing* exposure for slow-to-propagate categorizations

**Severity: HIGH (residual-boundary concern — confirm with Sam whether this stays inside residual (i) or widens it).**

**Scenario.** Residual (i) (signed off) is "category-table lag *beyond* the freshness window." The gate's freshness check excludes anything edited in the last 15 min, which covers the *common* case (a fresh edit that added the BLP category is recent). But the lane re-fetches on **every** read. Consider a BLP category added by a job-queue/replication process to an article whose **last user edit was > 15 min ago** (category added without a new revision — exactly the "added to categorylinks of an unchanged revision" case §5 calls out). The freshness window does **not** fire (the *revision* is old), and the `clcategories` probe reads from a lagging replica that hasn't propagated the categorization yet → `blpProbe === 'absent'` → `easy_win` → **surfaced**. This is residual (i) by the letter. But §5 of the lane design claims re-fetching "demotes the page *before* it is surfaced" — that claim is **only true once the replica catches up**, which is precisely the lag residual (i) admits can exceed the window. So §5's framing slightly oversells: re-fetch closes the *durable cache* fail-OPEN (the page self-heals on the *next* read after propagation), but within the lag window the lane will surface the BLP on reads, same as the gate would. The design correctly says it "does not widen" the residuals — and I agree it does not widen them in *kind* — but it does change their *exposure profile*: the gate surfaced the verdict once per lookup; the lane re-surfaces on every read, so a long-lagged categorization is exposed repeatedly until propagation.

**Why flag it.** The compliance contract's honesty requirement (G11) means the change-log/residual framing must be accurate. "Re-fetch demotes before surfacing" is true for the *category-added-with-a-new-revision* case (freshness catches recent ones; propagated ones probe `present`) but **not** for the *category-added-without-a-revision-and-still-lagging* case. The defense-in-depth backstop (G5 human-open gate) still holds, so this is not a new uncovered hole — but the design should not imply re-fetch closes lag-residual (i) when it does not.

**Recommended fix.** Soften §5's claim to: "re-fetch demotes any page whose categorization has *propagated to the queried replica*; the category-lag residual (i) remains for categorizations not yet propagated, unchanged from the gate and still bounded by the G5 human-open gate." No code change; this is an honesty/accuracy fix so the residual framing stays truthful. Confirm with Sam that "re-surface on every read until propagation" stays inside the signed-off residual (i) (I read it as inside-by-kind but worth an explicit nod, since the change-log entry described the gate's once-per-lookup exposure, not a repeated-read surface).

### H3 — Audit trail (G13) does not capture Stage-1 pre-filter exclusions, only Stage-2 outcomes; pages silently dropped by the pre-filter have no decision record

**Severity: HIGH.**

**Scenario.** §7 specifies an `article.eligibility.revalidated` audit event **per Stage-2 page**. But Stage 1 is where most exclusion happens — it drops every page that is `human_only` at last lookup, every stale-gate_version row, every page whose `articles.revision_id` doesn't match a verdict row. Those exclusions produce **no audit event** (Stage 1 is "cheap DB pre-filter, no network" and the design adds no logging there). The G13 requirement, as the prompt frames it, is that the audit trail "captures every surfacing/exclusion **decision**." A page excluded by Stage 1 *is* an exclusion decision — and it is the one most likely to be excluding a BLP (a `human_only/blp_category` verdict is exactly what Stage 1 filters out). If a reviewer later asks "was page X ever excluded as a BLP, and when?", the only record is the original `article.lookup`/`article.eligibility` event at lookup time — there is no record that the *lane* honored that exclusion on a given read.

This is arguably acceptable (the lane is a derived query; logging every non-selected row on every read is noisy and itself a load concern), but the design must make an explicit decision rather than leave Stage-1 exclusions silently unlogged. The compliance mapping table (§9) claims "**every** re-validation + **every** exclusion logged" — that is currently **false** for Stage-1 exclusions.

**Recommended fix.** Either (a) correct §9's claim to "every Stage-2 re-validation and every Stage-2 exclusion are logged; Stage-1 pre-filter exclusions are not separately logged because the excluding verdict was already logged at lookup time (`article.eligibility`)" — and add a cross-reference so the trail is reconstructable; or (b) emit a compact, aggregate Stage-1 audit event per lane read (codes + counts only: "pre-filter selected N, excluded M by reason-class") so there is a positive record that the lane ran and what it withheld. Option (a) is YAGNI-correct and honest; pick it explicitly. Do not leave the §9 "every exclusion logged" overclaim standing.

### H4 — `GET` with fetch side-effects (verdict refresh + audit writes) makes the lane non-idempotent and cacheable-by-intermediaries; an HTTP cache or prefetch could serve a stale lane that surfaced a now-BLP page

**Severity: HIGH** (the design's own open question #4 flags the verb, but understates the compliance angle).

**Scenario.** `GET /api/easy-win` triggers Stage-2 fetches, verdict upserts, and audit writes (§4, §6). `GET` is, per HTTP semantics, safe and idempotent and freely cacheable. A reverse proxy, browser, or `Cache-Control`-honoring intermediary could cache a 200 lane response. If the cached body listed page X as an easy-win and X subsequently gains a BLP category, a cache hit re-serves X as easy-win **without** re-running Stage 2 — reintroducing exactly the durable-cache fail-OPEN the whole design exists to avoid, one layer up. The design's no-durable-cache stance (§5: "A caching/TTL optimization … would require new compliance sign-off") is undercut if the transport layer caches the response by default because the verb says it's safe to.

**Recommended fix.** Resolve open-question #4 in favor of either `POST` (semantically correct for a request with side-effects, and non-cacheable by default) or, if `GET` is kept for ergonomics, mandate `Cache-Control: no-store` (and `Vary`/`Pragma` as needed) on the lane response as a hard design invariant, with a test asserting the header. State that no intermediary may cache the lane response, mirroring the in-app no-durable-verdict rule. Tie it explicitly to the §5 no-cache compliance stance.

---

## MEDIUM findings

### M1 — Stage-1/Stage-2 split has a TOCTOU window: a page selected by Stage 1 can be re-looked-up (changing `articles.revision_id` and the verdict) by a concurrent `lookupAndPersist` while Stage 2 is mid-fetch

**Severity: MEDIUM** (single-user v1 makes concurrency rare, but the lane API and a concurrent lookup can interleave).

**Scenario.** Stage 1 snapshots `(page_id, articles.revision_id)` for candidate pages. Between that read and Stage 2's per-page include-test (which re-reads "the page's stored `revision_id`"), a concurrent `lookupAndPersist` for the same page could upsert `articles.revision_id` to a new value. If Stage 2 re-reads `articles.revision_id` fresh, it sees the new revision and (correctly) excludes on drift — fine. But if Stage 2 carries the Stage-1-snapshotted `revision_id` and compares the *live fetched* revision against the *stale snapshot*, the comparison can spuriously pass or fail. The design says Stage 2 compares "live `revisionId`" to "the page's stored `revision_id`" without specifying whether "stored" is the Stage-1 snapshot or a fresh re-read. Combined with C2 (non-atomic writes), this is a real interleaving hole.

**Recommended fix.** Specify that Stage 2's revision-equality check re-reads `articles.revision_id` (and the candidates' `source_revision_id`) **within the same logical step as the surfacing decision**, not from a Stage-1 snapshot — or, better, that the surfacing query joins live-fetched `revisionId` against the current DB rows atomically. Note single-user v1 bounds the blast radius, but state the contract so the materialized-queue increment (a later phase) inherits it.

### M2 — `eligibility_verdicts.revision_id` has no FK to a revision and `articles` keeps only the latest revision; a verdict row can reference a revision the `articles` row has moved past, and the Stage-1 join silently drops it (correct) — but nothing prunes or flags orphaned verdict rows

**Severity: MEDIUM** (correctness holds; hygiene/observability gap).

**Scenario.** The verdict table keeps history (one row per `(page, revision, gate_version)`), but `articles` keeps only the latest revision. After a few re-lookups, most verdict rows are for superseded revisions and will never again match the Stage-1 join. That's *fine* for correctness (Stage 1 only matches the current revision). But there's no defined retention, and an old `easy_win` verdict row for a superseded revision sitting in the table is a latent fail-OPEN *if any future query ever joins on something other than the current `articles.revision_id`* (e.g., a future "lane history" feature). The design should state that **no query may ever surface from a verdict row whose `revision_id` is not the article's current `revision_id`**, making the Stage-1 join's revision predicate a named invariant rather than an incidental property.

**Recommended fix.** Name the invariant: "a verdict authorizes nothing on its own; only a verdict row whose `(page_id, revision_id, gate_version)` matches the live article's current revision under the current gate may even enter the pre-filter, and even then Stage 2 re-derives." Optionally note a future retention/cleanup as out-of-scope-but-flagged.

### M3 — Demotion path leaves stale candidates in place (open question #3, "leaning leave"); a left-behind candidate set for a now-`human_only` page is a fail-OPEN waiting for any future query that reads candidates without re-checking eligibility

**Severity: MEDIUM.**

**Scenario.** Open question #3 leans toward leaving a page's `stale_candidates` when it demotes easy-win→BLP on re-fetch. The candidates are "still valid detector output." Agreed for the detector's own purposes. But the candidate rows now exist for a page the gate says is `human_only/blp_category`. The lane is safe *today* because Stage 1 requires an `easy_win` verdict row to even select the page. The risk is forward-coupling: any future surface that reads `stale_candidates` and forgets to AND it with a current eligibility check will surface a BLP's candidates. This is the same class of forward invariant §6 of the gate design established ("no easy-win path may surface an article without calling the gate at point-of-use") — it should be restated here as binding on candidate reads.

**Recommended fix.** Keep "leave the candidates" (don't destroy valid detector output), but (a) refresh the persisted verdict to `human_only` on demotion (the design already says this — good), and (b) restate the forward invariant explicitly for this table: "the presence of `stale_candidates` rows never implies eligibility; every surface MUST gate at point-of-use." Add it to the pitfalls doc per the three-layer memory pattern.

### M4 — Audit payload for the revalidated event includes `surfaced` (bool) and a `reason-for-exclusion` code — confirm no compound/free-text leakage and that the `dispute_template:<name>` codes don't carry article-identifying specifics

**Severity: MEDIUM (verify, likely sound).**

**Scenario.** §7's `article.eligibility.revalidated` payload lists `reasons` (codes) and a `reason-for-exclusion` code. The gate's reason codes include `dispute_template:<name>` where `<name>` is a template name (e.g. `dispute_template:POV`). Those are denylist-constant names, not article content, so they are codes, not PII — consistent with the existing `article.eligibility` event. This is sound **provided** the lane event reuses the gate's canonical codes verbatim and adds no title/snippet. The one thing to confirm: `reason-for-exclusion` values (`demoted`/`revision_drift`/`fetch_unavailable`) are a closed code set — keep them enumerated, never free text, never an error message (the `WikimediaUnavailableError.message` must not be logged; log the code `fetch_unavailable` only).

**Recommended fix.** State the closed enum for `reason-for-exclusion` and add the explicit rule "never log the caught error's `.message` — map to the `fetch_unavailable` code." Confirm the lane event payload is byte-for-byte the same code vocabulary as `article.eligibility` (no new free-text field).

### M5 — Migration-discipline refactor (open question #1) changes `schema.sql` semantics; a botched cumulative-schema/migration split could leave `freshTestDb()` testing a schema that differs from the deployed migration set — masking a fail-OPEN in tests

**Severity: MEDIUM (testing-integrity, indirectly compliance).**

**Scenario.** The design (§2 migration note) proposes making `src/db/schema.sql` the cumulative canonical schema and having `freshTestDb()` apply ordered migrations. If the cumulative `schema.sql` and the ordered migrations ever drift (the exact pitfall testing-pitfalls §8 warns about), the test DB could have the `eligibility_verdicts` table with constraints the production migration lacks (or vice-versa). A missing `CHECK (eligibility IN ('easy_win','human_only'))` or a nullable key column in production-but-not-test would let a malformed/`NULL`-eligibility verdict row exist in production that the tests never exercise — and a `NULL` or unexpected `eligibility` value could break the Stage-1 `WHERE eligibility='easy_win'` filter in a way that depends on SQLite's NULL handling. The design correctly flags this as a refactor to handle explicitly; I'm raising the *compliance* stake: the fail-closed property depends on the constraint being identical in test and prod.

**Recommended fix.** Require that `freshTestDb()` apply the **actual ordered migration files** (not a separate `schema.sql`), and add a CI assertion that the cumulative `schema.sql` equals the concatenated migrations (the design already gestures at this — make it a hard test). Add a test that a `NULL`/out-of-enum `eligibility` is rejected by the real migration (`WITHOUT ROWID` + `CHECK`), so Stage 1's filter can never see an ambiguous row.

---

## LOW findings

### L1 — `evaluateEligibility`'s unused `_gateVersion` parameter is a latent trap for the verdict-key semantics
The gate ignores the version (correct today), but persisting it as a PK component (§2) implies semantic weight it doesn't have at runtime. Low risk now; document that the version is a *provenance stamp*, not a logic input (overlaps H1). Fix: one sentence in §2.

### L2 — `now` injection consistency across Stage 2 pages
§4 passes a single `now` to all per-page `evaluateEligibility` calls (good — deterministic within a read). Confirm the freshness check uses the lane-read `now`, not each fetch's `fetchedAt`, so a slow fan-out doesn't drift the freshness boundary across pages. Already implied by `getEasyWinLane({now})`; state it. Low.

### L3 — `Emptyset`/no-easy-win-pages response shape
Not specified: `GET /api/easy-win → 200 {items: []}` when nothing qualifies. Trivial, but state it so an empty lane isn't an error path that could be mishandled. Low.

---

## What is genuinely SOUND (so the author knows what holds)

1. **The central architecture is correct and is the right answer to §6.** Persisting the verdict as an *advisory pre-filter* + *audit record* while re-fetching and re-running the gate at point-of-use to *authorize* is exactly the reading that satisfies §6's "persist bound to (page,revision,gate_version)" without reintroducing the durable fail-OPEN R4-5 forbade. The two-stage Stage-1-narrows / Stage-2-authorizes split is sound in concept.

2. **Re-fetch-don't-cache is the right call and is correctly justified.** The §5 rationale (a BLP category can be added to an unchanged revision's categorylinks, so a `(page,revision)`-keyed cache is a durable fail-OPEN) is accurate and matches the gate design's §7 reasoning. The decision to require new compliance sign-off before any TTL cache is exactly right.

3. **Freshness re-applies at re-validation for free.** Because Stage 2 re-runs the unchanged gate, the freshness fail-closed (#4) and the indeterminate fail-closed (#1, `metadata_unavailable`) both re-fire at point-of-use — the lane inherits the gate's fail-closed floor rather than reimplementing it. Good reuse; no second copy of the floor to drift.

4. **Per-page fetch isolation is the right fault model.** One page's `WikimediaUnavailableError` excluding only that page (not failing the whole lane) is correct *and* fail-closed for that page (unreadable → not surfaced). The fault containment is sound (the C1 caveat is about making the *include* predicate an allowlist, not about this isolation).

5. **The composite natural key `(page_id, revision_id, gate_version)` with `WITHOUT ROWID` is the correct binding** and matches §6's mandate exactly; rejecting NULL components via `WITHOUT ROWID` is good DB discipline.

6. **G14 honored:** one article per fetch, descriptive UA, `maxlag`, no enumeration; Stage-1 pre-filter bounds fan-out. Consistent with the gate's access posture.

7. **G5 unchanged and respected:** the lane surfaces candidates-to-verify, never auto-edits; the downstream human-open gate is the defense-in-depth backstop the residuals lean on, and it is untouched.

8. **`reasons_json` / audit payloads are codes-only by construction** (mirroring the existing `article.eligibility` event), and the audit log module is genuinely append-only (only `append`/`read` exposed). G13's append-only property holds at the module level. (The gap is *coverage* — H3 — not mutability.)

9. **Honest non-goals.** Each scope cut (no UI, no re-detection, no materialized queue, no verdict-trust-for-surfacing) is named, not silent — consistent with the project's "none silent" discipline.

---

## Summary of required actions before this design goes to plan

- **C1 (CRITICAL):** make Stage-2 include an *allowlist* — include iff `eligibility==='easy_win'` AND revision matches; every other outcome excludes. Add the `blpProbe==='unknown'`/`metadata_unavailable` re-fetch test as MUST-NOT-weaken.
- **C2 (CRITICAL):** surface only candidates whose `source_revision_id === liveRevisionId === articles.revision_id`; fix the non-atomic write ordering (article row written last, or batched) so a partial lookup never advertises a revision ahead of its candidates/verdict.
- **H1–H4 (HIGH):** name the gate-version monotonicity invariant + de-weight Stage-1 version label (H1); soften §5's "re-fetch demotes before surfacing" lag claim for accuracy (H2); correct §9's "every exclusion logged" overclaim re Stage-1 (H3); resolve the `GET` side-effect/cacheability problem with `POST` or mandatory `no-store` (H4).
- **M1–M5 (MEDIUM):** close the Stage-1/Stage-2 TOCTOU; name the "verdict authorizes nothing on its own" invariant; restate the forward invariant for left-behind candidates; lock the audit reason-codes to a closed enum (never log error messages); harden the migration cumulative-schema CI assertion.

None of these require widening the four signed-off residuals — they are seam defects in the consumer, fixable in-design. The architecture is sound; the seams are where a BLP leaks.
