<!-- ABOUTME: Round-3 adversarial design review of the easy-win lane — lens: failure modes & partial input. -->
<!-- ABOUTME: Stage-2 fan-out partial-failure analysis; mid-operation dependency misbehavior; atomicity/ordering of exclude+refresh+audit. -->

# Round 3 — Failure Modes & Partial Input

**Reviewer lens:** what fails when a dependency misbehaves *mid-operation*. The lane's Stage 2 (§4)
fans out one `fetchArticle` per pre-filtered page and, per page, must do up to three writes
(exclude/include decision, verdict refresh, audit append). This review stress-tests every partial
failure of that fan-out against the actual mechanism in `src/ingest/wikimedia.ts`,
`src/ingest/lookup.ts`, `src/db/articles.ts`, and `src/db/audit-log.ts`.

**Scope note.** This is a *design* doc (§4–§6 are prose, not code). Several findings are "the design
does not specify X," which for a failure-modes lens is itself the defect: an unspecified failure path
becomes whatever the implementer happens to write, and the compliance contract (fail-closed per page,
append-only audit) does not tolerate "happens to." Severities reflect blast radius on the
**compliance invariants** (G11 fail-closed surfacing, G13 append-only audit) first, correctness
second.

---

## Severity legend

- **CRITICAL** — can surface a BLP / violate a signed-off compliance residual, or corrupt the audit/verdict trail.
- **HIGH** — wrong lane contents, silent data loss, or inconsistent persisted state after a crash.
- **MEDIUM** — degraded behavior, hidden systemic failure, or operational footgun.
- **LOW** — polish / hardening.

---

## F1 — CRITICAL — Re-validation fetches by **title**, but the lane keys on **page_id**: a rename/redirect rebinds the snapshot

**Scenario.** `fetchArticle(title, …)` (wikimedia.ts:169) takes a **title**, runs `redirects=1`, and
returns whatever `pages[0]` the API resolves. Stage 1 (§4) selects rows from
`articles × eligibility_verdicts` keyed on `page_id`. The only title the lane has is the
`articles.title` stored at *last lookup*. Between lookup and lane-read, the article can be **renamed**
(its title now points at a *different* page, or a redirect), or a **new page** can be created at the
old title. Re-fetching by the stored title then resolves to a **different `page_id`** than the one the
verdict/candidates belong to.

**Consequence.** The §4 include rule checks "re-run verdict is `easy_win` AND live `revisionId` still
equals the page's stored `revision_id`." It does **not** check that the **re-fetched `page_id` equals
the candidate page's `page_id`.** If the title now resolves to a *different* easy-win page that happens
to share… no — revision IDs are global in MediaWiki, so a revid match across two pages is essentially
impossible, which means in practice this fails *closed* (excluded on revision mismatch). BUT the
**audit and verdict-refresh** then record the wrong page: §4 says "refresh the persisted verdict to the
new verdict" — keyed by which page_id? If keyed by the *candidate* page_id but computed from the
*re-fetched (different) page's* metadata, the verdict table now holds a verdict for page A derived from
page B's content. That is a corrupted advisory record and a mis-attributed audit event (G13: the audit
trail now asserts something false about page A).

**Worse sub-case.** If the implementer "fixes" the revision check by *dropping* it (because renames
make it flaky), the rebinding becomes a live fail-OPEN: a re-fetch of a *different, currently-easy-win*
page surfaces page A's stored candidates under page B's authority.

**Recommended fix.** Stage 2 MUST fetch by **`page_id`**, not title (MediaWiki Action API supports
`pageids=`), and MUST assert `fetched.pageId === candidate.pageId` as a hard precondition before any
include/refresh/audit. A page_id that no longer resolves, or resolves to a different id, is treated as
F2 (gone). `fetchArticle`'s title-only signature is the root cause — the design needs a
`fetchArticleByPageId` (or a `by: {pageId}` variant) and must say so. **This is the single most
important finding; the title→page_id rebinding is invisible in the prose because the prose says
"fetch the page" as if identity were free.**

---

## F2 — CRITICAL — `ArticleNotFoundError` (page deleted/renamed since lookup) is unhandled: the design only names `WikimediaUnavailableError`

**Scenario.** A page that was easy-win at lookup is **deleted** (or its title now 404s) before the lane
read. `fetchArticle` throws `ArticleNotFoundError` (wikimedia.ts:207–208). §6 *only* discusses
`WikimediaUnavailableError` ("a single upstream `WikimediaUnavailableError` on one page must not fail
the whole lane"). §7's exclusion codes are `demoted` / `revision_drift` / `fetch_unavailable` — there
is **no code for "gone."** `ArticleNotFoundError` is neither `WikimediaUnavailableError` nor a verdict
demotion.

**Consequence (two failure shapes, both bad):**
1. If the Stage-2 loop's catch only matches `WikimediaUnavailableError` (mirroring the lookup route at
   route.ts:36–45), an `ArticleNotFoundError` **propagates out of the loop and aborts the entire lane
   read** → one deleted page 500s the whole `GET /api/easy-win`. That is the opposite of the
   "one bad page is skipped" contract.
2. If the implementer catches "any error → skip," the deleted page is silently dropped but its
   **stored `eligibility_verdicts` row and `stale_candidates` rows are never cleaned up** (see F8), so
   Stage 1 keeps re-selecting it and re-fetching (and re-404ing) on *every* lane read forever — a
   permanent wasted fetch against Wikimedia (G14 pressure) with no self-heal.

**Recommended fix.** Enumerate `ArticleNotFoundError` explicitly in §6 as a distinct outcome:
exclude, audit with a new `article_gone` (or `not_found`) reason code, and **tombstone** the stored
verdict/candidates so Stage 1 stops re-selecting (resolve F8's open question #3 in the *delete*
direction for the gone case specifically — candidates for a deleted page are not "still valid detector
output," they describe a revision that no longer exists). The design must state which.

---

## F3 — HIGH — No fetch timeout / hang handling anywhere in the design or the fetch primitive

**Scenario.** `fetchArticle` does `await fetchFn(url, …)` with **no `AbortController`, no timeout**
(wikimedia.ts:176). One pre-filtered page's fetch **hangs** (TCP stall, Wikimedia edge holding the
connection, slow-loris). Stage 2 awaits it.

**Consequence.** If Stage 2 fetches **sequentially** (the natural reading of "for each pre-filtered
page"), one hung fetch **stalls the entire lane read indefinitely** — and on Cloudflare Workers it
will instead hit the Worker's wall-clock/CPU limit and the whole `GET` dies with a platform error,
losing *all* pages, not just the hung one. There is no per-page deadline, so "skip the bad page and
return the rest" is unachievable for the hang case — the design's own resilience promise (§6) cannot
hold without a timeout.

**Recommended fix.** Add a per-fetch timeout (AbortController with a bounded deadline, e.g. a few
seconds) to `fetchArticle` or to the Stage-2 wrapper; on timeout, throw/treat as
`WikimediaUnavailableError` (retryable, page skipped). The design MUST specify the per-page deadline
and the total lane-read budget (see F4). Workers also imposes a **subrequest cap** (50 on the free
tier) — independently a reason the lane cannot fan out unboundedly (ties to open question #2).

---

## F4 — HIGH — Fan-out is unbounded and its concurrency/ordering is unspecified; partial failure semantics depend entirely on that unspecified choice

**Scenario.** Open question #2 already flags "is per-read re-fetch of *all* pre-filtered pages
acceptable?" From a failure-modes view this is not just a cost question — the **partial-failure
behavior is undefined until the execution shape is pinned:**

- **Sequential await loop:** one hang (F3) blocks everything; a mid-loop crash (Worker eviction, OOM)
  leaves pages 1..k processed (verdict-refreshed + audited) and k+1..N untouched — a **partially
  reconciled** lane with no record of where it stopped.
- **`Promise.all`:** the first rejection (an unhandled `ArticleNotFoundError`, F2) rejects the whole
  batch — *every* page's result is discarded even though most succeeded.
- **`Promise.allSettled`:** survives partial failure, but now N concurrent fetches hit Wikimedia at
  once, violating G14's spirit ("one article per call" was about *per-fetch* shape, but a burst of N
  parallel calls is exactly the enumeration-pressure G14 guards against) and risks the subrequest cap.

**Consequence.** Until the design picks one, the implementer's choice silently determines whether one
bad page degrades gracefully, aborts the batch, or DOSes Wikimedia. The §8 test "others still
returned" only exercises *one* unavailable page in presumably a 2-page set — it will pass under
`allSettled` and *also* under a sequential loop, so it does **not** pin the contract.

**Recommended fix.** §4/§6 MUST specify: bounded concurrency (small pool, e.g. 2–3) with per-page
isolation (each page's failure caught independently — `allSettled`-style), a cap N on pages per lane
read (paginate beyond it), and a total wall-clock budget. Add a test with ≥3 pages where page 2 fails
*and* page 1 and page 3 differ in verdict, asserting all three are correctly classified independently.

---

## F5 — CRITICAL — `blpProbe: "unknown"` (indeterminate / maxlag-warning categories) at re-validation: fail-closed exclusion is implied but never specified or audited

**Scenario.** `deriveBlpProbe` (wikimedia.ts:112–119) returns `"unknown"` when the `clcategories`
probe is indeterminate — a `warnings.categories` fired (truncation/lag) or the `categories` field is
malformed. `fetchArticle` does **not** throw on `unknown` — it returns a `FetchedArticle` with
`blpProbe: "unknown"` (it only throws on missing structural fields). So Stage 2 gets a *successful*
fetch whose BLP signal is **indeterminate**. The gate (`evaluateEligibility`) presumably maps
`unknown → human_only` fail-closed (the compliance contract requires it), so §4's "otherwise →
exclude" *should* fire.

**Why this is still a finding.** The design never *names* the `unknown` case. §4 reduces Stage 2 to
two buckets (verdict `easy_win` + revision match → include; else exclude). That happens to fail-closed
**only if** `evaluateEligibility(unknown) === human_only`. But:
1. The §7 exclusion codes (`demoted`/`revision_drift`/`fetch_unavailable`) have **no code for
   "indeterminate probe."** An `unknown`-driven exclusion would be mis-audited as `demoted`, conflating
   "we confirmed a BLP" with "we couldn't tell" — a meaningful G13 distinction (an indeterminate probe
   is an *operational* signal worth alerting on; a genuine demotion is routine).
2. The §8 test matrix has no `blpProbe: "unknown"` re-validation case. The compliance note in §8 calls
   the BLP-present test "the core fail-OPEN-prevention test — MUST NOT be weakened," yet the
   *indeterminate* path — the one most likely to silently regress if someone later "optimizes"
   `deriveBlpProbe` — is untested.

**Consequence.** If a refactor ever makes `evaluateEligibility(unknown)` anything but `human_only`, an
indeterminate page surfaces — a direct fail-OPEN — and **no test catches it** and **no audit code
distinguishes it.**

**Recommended fix.** §4 MUST explicitly state: re-validation treats `blpProbe === "unknown"` (and any
gate `human_only` arising from it) as fail-closed exclusion. Add an `indeterminate_probe` exclusion
code to §7. Add a §8 test: pre-filtered easy-win page → re-fetch returns `unknown` probe → excluded +
audited as indeterminate. This is the highest-leverage missing test for the lens.

---

## F6 — HIGH — Order/atomicity of "exclude → refresh verdict → audit" is unspecified; a crash mid-page leaves an inconsistent, un-resumable state

**Scenario.** §4 says, for an excluded page: "**exclude, refresh** the persisted verdict to the new
verdict (so Stage 1 self-heals next time), **and audit** the demotion." Three writes. The
`SqlExecutor` port is deliberately non-transactional (articles.ts:66–72 explicitly notes delete+insert
are "sequential statements, not a single atomic transaction"), the audit log is a separate `INSERT`
(audit-log.ts:39–42), and the verdict upsert is a third. **No transaction wraps them.** A crash
(Worker eviction, D1 hiccup) between any two leaves a torn state:

- refresh-verdict succeeds, audit-append fails → Stage 1 self-heals (good) but the **G13 trail is
  missing the exclusion event** — the audit log no longer faithfully records that a page was demoted
  and why. Append-only does not mean *complete*, but a silently-dropped compliance event is a
  contract gap.
- audit-append succeeds, refresh-verdict fails → the trail says "demoted to human_only," but the
  verdict table still says `easy_win`, so **Stage 1 re-selects the page next read** and (because
  re-validation is authoritative and re-runs) correctly excludes it again — *but* now appends a
  **second, duplicate demotion audit event.** Repeated crashes → unbounded duplicate audit events for
  the same demotion.

**Consequence.** The verdict table and the audit log can disagree, and the audit log can accumulate
duplicate or missing events depending on crash timing. Because the design declares no ordering, the
implementer can pick the *worse* order (audit-then-refresh produces duplicates; refresh-then-audit
produces gaps).

**Recommended fix.** Pin the ordering and the idempotency story in §4/§7:
1. **Audit-first is not safe alone** (duplicates); **refresh-first is not safe alone** (gaps).
2. Since the lane read is **idempotent by construction** (Stage 2 re-derives every time), the right
   frame is: the *only* durable mutation that must be crash-consistent is the verdict refresh; the
   audit event should be **keyed/deduplicated** on `(page_id, revision_id, gate_version, eligibility,
   surfaced)` so a re-run after a torn write does not double-log. Specify: refresh verdict, then append
   audit; on the next read, if the verdict already equals the re-derived verdict AND an audit event for
   that exact tuple exists, suppress the duplicate. Document that the audit log is append-only so the
   dedup is a *write-time* check, never a delete.
3. Alternatively, batch the verdict-refresh + audit into a D1 `batch()` (atomic) — but that extends the
   `SqlExecutor` port (flagged, not free). The design must choose and say so.

---

## F7 — MEDIUM — `GET` returning 200 with a silently-partial set hides systemic upstream failure (and open question #4 is real)

**Scenario.** §6: any page that fails to fetch is "skipped (and audited), the rest return," and the
contract is `200 { items }`. Consider **Wikimedia is broadly down / maxlag storm**: *every* Stage-2
fetch throws `WikimediaUnavailableError`. The lane returns **`200 { items: [] }`** — indistinguishable
from "no articles are currently easy-win." The caller (and any future browse UI) sees an empty lane and
concludes there's nothing to do, when in fact the lane is **blind** because its sole upstream is down.

**Consequence.** Silent per-page skipping is correct for *one* flaky page but **masks systemic
failure** when the skip rate is high. A monitoring/UX consumer cannot distinguish "empty because
healthy" from "empty because Wikimedia is down" from the 200 alone. This is the classic "fail-closed on
safety, but also fail-*silent* on availability" trap.

Open question #4 ("is `GET` right given Stage 2 has fetch side-effects — audit writes, verdict
refresh?") compounds it: a `GET` that mutates verdict rows and appends audit events on every call
violates HTTP `GET` idempotency/safety expectations. Caches, prefetchers, link-scanners, and
double-fetches will silently trigger Wikimedia fan-out + audit writes. That is both a correctness and a
G14 concern (a browser prefetch could fan out N Wikimedia fetches the user never asked for).

**Recommended fix.**
1. Surface partial-failure telemetry in the response: include a `skipped: [{ pageId, reason }]` (codes
   only — pageId is already an identifier the API returns, no PII) and/or a `degraded: true` flag when
   the skip rate crosses a threshold, so a consumer can tell "empty-healthy" from "empty-blind." At
   minimum, return a **non-200** (e.g. 503) when *all* candidate pages failed to fetch — an all-fail
   lane read is an upstream outage, not an empty result.
2. Reconsider the verb (open question #4): either make Stage 2 side-effects acceptable-under-`GET` by
   … they aren't (verdict refresh + audit are writes), so prefer `POST /api/easy-win/refresh` returning
   the lane, or split "read last-known lane (no fetch)" from "refresh lane (fetch + mutate)." The design
   should not ship a side-effecting `GET`.

---

## F8 — MEDIUM — Demotion/gone leaves `stale_candidates` and verdict rows un-reconciled (open question #3), causing permanent re-selection churn

**Scenario.** Open question #3 leans "leave + exclude" for the BLP-demotion case. For a *demoted*
(now-BLP) page that's fine — the candidates are still valid detector output, just not surfaceable, and
the refreshed verdict (`human_only`) stops Stage 1 from selecting it. **But** this only works if the
verdict refresh actually flips the row to `human_only` AND Stage 1's filter is `eligibility='easy_win'`
(§4) — which it is, so a demoted page self-heals out of Stage 1. Good.

The **gap** is the cases where the verdict *can't* be refreshed to a non-easy_win value:
- **F2 gone (404):** no metadata to compute a new verdict from → verdict row stays `easy_win` → Stage 1
  re-selects forever (the churn described in F2).
- **F4 mid-loop crash before refresh:** verdict stays `easy_win`, re-selected next read.
- **Revision drift (`revision_drift`):** §4 says refresh the verdict — but to *what*? The new revision's
  verdict is for a *different* `revision_id`, so the upsert writes a **new** PK row
  `(page_id, new_revision_id, gate_version)`. The **old** `(page_id, old_revision_id, gate_version)`
  row is left behind as `easy_win`. Stage 1 joins on `revision_id = articles.revision_id`
  (§4) — `articles.revision_id` was *also* updated? Only if Stage 2 calls `upsertArticle`. **The design
  never says Stage 2 updates the `articles` row.** If it doesn't, `articles.revision_id` still holds the
  *old* revision, Stage 1 re-selects the stale snapshot, re-fetches, re-detects drift — **infinite
  drift churn**, never self-healing.

**Consequence.** The "Stage 1 self-heals next time" claim (§4) holds *only* for the clean demotion
case. For gone, crash, and revision-drift, the page is re-selected and re-fetched on every lane read
indefinitely (G14 fetch waste) and the self-heal narrative is false.

**Recommended fix.** Specify, per exclusion reason, the **exact reconciliation write**:
- demoted → upsert verdict `human_only` for the *current* revision; (per open q#3) leave candidates.
- revision_drift → Stage 2 MUST `upsertArticle` the live revision so Stage 1's join no longer matches
  the stale snapshot; decide whether the old candidates are deleted (they describe a dead revision —
  lean delete, matching the "exclude, don't re-detect" stance) or left until reprocessing.
- gone (F2) → tombstone: delete or mark the verdict so Stage 1 stops selecting, and clean up candidates
  for the dead revision.
Add a test that calls the lane **twice** and asserts the second read does **not** re-fetch the
gone/drifted page (the self-heal property, currently untested — §8 only tests single reads).

---

## F9 — MEDIUM — Empty-lane and all-fail cases are conflated and untested

**Scenario.** Two distinct "empty" states: (a) Stage 1 returns **zero** candidate pages (nothing was
easy-win at last lookup under today's gate) — Stage 2 does no fetches, returns `{ items: [] }`,
correct and cheap. (b) Stage 1 returns pages but **all** Stage-2 fetches fail — also `{ items: [] }`
(F7). §8 has no test for either. The empty-Stage-1 case is the *trivially correct* one and should be
asserted (no fetch attempted); the all-fail case is the *dangerous* one (F7) and must be asserted to
return non-200 / `degraded`.

**Consequence.** Without tests, a refactor that, e.g., makes Stage 2 throw on empty input, or makes
all-fail look identical to empty-healthy, ships unnoticed.

**Recommended fix.** Add both to §8: empty Stage-1 → `{ items: [] }`, `fetchFn` asserted **never
called**; all-Stage-2-fail (≥1 candidate, every fetch throws) → the F7 degraded/non-200 contract.

---

## F10 — LOW — Gate-version skew mid-fan-out and the `now` clock are fixed per-read (sound), but the verdict refresh must use the **read's** GATE_VERSION, not a re-imported constant

**Scenario.** Stage 1 filters on "current GATE_VERSION" and Stage 2 re-runs
`evaluateEligibility(meta, now, GATE_VERSION)`. If `GATE_VERSION` were read twice from different
sources this would skew, but it's a module constant (eligibility.ts), so within one process it's
stable — **sound.** The `now` is captured once per lane read (§6 `now: new Date()`), so all pages
re-validate against one freshness instant — **sound and good** (matches the gate's clock-injection
discipline). One nit: the verdict-refresh write (F6/F8) must stamp the **same** `gate_version` used for
Stage-1 selection and Stage-2 evaluation, or a self-heal could write a row that Stage 1's *next* filter
won't match.

**Recommended fix.** State that one `(GATE_VERSION, now)` pair is captured at the top of the lane read
and threaded through Stage 1 filter, Stage 2 evaluation, and the verdict-refresh write. Low severity
because the current shape already does this implicitly; making it explicit prevents a future regression.

---

## What is sound (do not regress)

- **Re-fetch-don't-cache (§5).** The core decision — re-running the `clcategories` probe against *live*
  categorylinks at point-of-use — correctly closes the category-lag durable fail-OPEN that R4-5
  identified. This is the right architecture and the per-page fail-closed framing is correct in spirit.
- **`fetchArticle`'s typed-error taxonomy** (`ArticleNotFoundError` / `WikimediaUnavailableError` /
  `WikimediaResponseError`) is a good substrate for per-page failure handling — the design just has to
  *use all three* (it currently names only one; see F2).
- **`deriveBlpProbe` fail-closed-to-`unknown`** (wikimedia.ts:112–119) is well-built and conservative;
  the design's gap is not testing/auditing the `unknown` path, not the probe itself (F5).
- **Per-page isolation as a stated goal** (§6 "must not fail the whole lane") is the correct contract —
  it just isn't backed by a specified execution shape or timeout (F3/F4).
- **`now` captured once per read** (§6) and the gate staying clock-free is consistent with the gate
  design's discipline (F10).
- **Idempotent re-derivation** (Stage 2 re-computes every read) means the lane is naturally
  self-correcting *for the demotion case* — the foundation F6/F8's dedup recommendations build on.
- **`WITHOUT ROWID` composite-PK verdict table** (§2) correctly rejects NULL key components and makes
  the upsert idempotent — the right shape for the advisory record.

---

## Priority order for the design revision

1. **F1** (fetch by page_id + identity assertion) and **F2** (`ArticleNotFoundError` handling) — both
   CRITICAL, both stem from the title-vs-page_id and the incomplete-error-taxonomy gaps; fix together.
2. **F5** (specify + test + audit the `unknown` probe fail-closed path) — CRITICAL compliance, cheap fix.
3. **F6** (ordering/atomicity + audit dedup) and **F8** (per-reason reconciliation + self-heal test) —
   the persisted-state-consistency core.
4. **F3** (timeout) and **F4** (bounded concurrency + cap + budget) — make per-page isolation actually
   achievable.
5. **F7** (degraded/non-200 on all-fail + reconsider side-effecting `GET`) and **F9** (empty vs all-fail
   tests).
6. **F10** (thread one `(GATE_VERSION, now)` pair) — hardening.

**Cross-cutting test gap.** Every CRITICAL/HIGH finding above corresponds to a missing §8 case:
gone-page, `unknown`-probe, ≥3-page partial fail with mixed verdicts, twice-read self-heal,
empty-Stage-1 (no fetch), and all-fail. The §8 matrix as written tests the *happy demotion* path well
but under-tests the *partial-failure* surface that is this lane's entire risk profile.
