<!-- ABOUTME: Adversarial design review for the safe-lane (G11) gate — Round 4 (Opus), attacking the converged Round-3 design. -->
<!-- ABOUTME: Hunts NEW fail-OPEN vectors in the wikitext scan, the probe, the named residuals, and the N3 persistence flip. -->

# Safe-lane gate (G11) — adversarial design review, Round 4 (Opus)

Reviewer lens, unchanged across all rounds: **the worst outcome is a silent fail-OPEN** — a
biography-of-living-persons article wrongly marked `easy_win`. G11's hard floor ("any article in a
BLP category is excluded from the easy-win queue by default, period") is sacrosanct; weakening it
needs Sam's explicit sign-off + a change-log rationale. Every finding is rated against that floor.

Round 3 converged well and the two load-bearing reframes (probe-not-enumerate; fresh-wikitext
backstop because both `categorylinks` AND `templatelinks` lag) are correct and I keep them. But
Round 3 introduced a NEW deterministic component — the wikitext scan — and waved it through as
"deterministic + one-way, therefore safe." That is where most of the remaining fail-OPEN risk now
lives, because Round 3 reasoned about the scan's *false-EXCLUDES* (infobox-person on dead people) and
declared them acceptable, but never seriously attacked its *false-OPENS* — the cases where the scan
**fails to fire when it should**, leaving the lagged probe as the only line of defence on exactly the
fresh-edit window the scan exists to cover. Sam, the headline below (R4-1) is a fail-OPEN that none of
rounds 1–3 named.

---

## R4-1 — [CRITICAL, fail-OPEN] The content revision and the categorylinks the probe reads are two different snapshots — the "fresh wikitext backstop" can be a STALE backstop

**Problem.** Round 3's whole defence against eventual consistency is: "the probe (`categorylinks`) may
be lagged, but the **revision wikitext we already fetch** is fresh, so the wikitext scan catches the
fresh BLP signal." This silently assumes the wikitext and the categorylinks come from the *same point
in time*. They do not, and worse — the design as it stands fetches them in **two separate API calls**.

Look at the actual code path. `fetchArticle` (wikimedia.ts) issues ONE request with
`prop=revisions&rvprop=content|ids` and returns `revisionId` + `wikitext`. The Round-3 probe is a
*separate* `clcategories` call (the design even validated it as a standalone call: "in ONE call, no
continue"). So:

- Call A returns wikitext for revision **R**.
- Call B (`clcategories`) returns category membership read from a **replica**, reflecting some revision
  **R′** where `R′ ≤ R` (replica lag) OR `R′` whose `categorylinks` rows the job queue has not yet
  written (job-queue lag). The two calls are not even guaranteed to hit the same revision: between A
  and B, a new edit can land, so `R′` can also be **> R** (a newer edit's categories against an older
  revision's wikitext).

This breaks the one-way union's soundness in BOTH directions:
- **Probe newer than wikitext (R′ > R):** category `Living people` was just *removed* by vandalism in
  R′ but is *present as a literal* in the older wikitext R → harmless here (wikitext scan still fires).
- **Probe older than wikitext (R′ < R), the dangerous case:** the article was just recategorized as a
  BLP. The fresh wikitext R has the `Living people` literal OR the infobox — *if and only if* the
  category was added as a literal. But the standard way `Living people` lands on a bio is **bot- or
  template-injected** (`{{BLP}}`/`{{WikiProject Biography|living=yes}}` adds it via the category-link
  machinery, or a bot edits the article to add `[[Category:Living people]]`). Round 3's own named
  residual (ii) covers "template-injected, no infobox." But there's a sharper case Round 3 missed: a
  bot edit that adds the **literal** `[[Category:Living people]]` to wikitext is the fresh revision R —
  yet if our content fetch (Call A) happened *before* that bot edit and the probe (Call B) *after*, we
  scan **old wikitext without the literal** and probe **new categorylinks that haven't propagated** →
  neither fires → fail-OPEN. The "we already have fresh wikitext" guarantee is only as fresh as Call A,
  which is a different instant from Call B.

**Why it matters.** Round 3 sells the wikitext scan as the thing that *closes* the eventual-consistency
hole except for one narrow named residual. In reality, because the wikitext and the categories come
from two unsynchronized fetches, the scan can be operating on a **different (older) revision than the
one whose BLP status we're adjudicating**. The "fresh backstop" is only fresh relative to its own call.
This is a genuine, unnamed fail-OPEN — distinct from residual (ii), which assumed wikitext and probe
were the same snapshot.

**Concrete fix (and it's cheap):** Make the floor read from **one atomic API response**. The combined
call `prop=revisions|categories|info` with `clcategories=<union>` returns, in a single request, the
revision id, the revision *content*, AND the `clcategories` matches — all keyed to the same `pages[0]`
object and the same `revisions[0].revid`. Round 3's own live evidence already proved the combined call
works ("revid+wikitext+52 cats+217 templates, no continue"). So:
1. Probe via `clcategories` *inside the combined revisions call*, not as a second request.
2. Assert the contract invariant (extends R2-4): `wikitext`, `revisionId`, AND `blockingCategories`
   MUST all come from the same `pages[0]` of the same response. The wikitext scan then provably runs on
   the same revision the page object describes.
3. This does NOT fix replica/job-queue lag (categorylinks can still be behind the revid in the same
   response — that's residual (ii)), but it DELETES the "two-snapshot skew" as a separate fail-OPEN and
   restores the soundness Round 3 *claimed* it had. Add an audit field for the gap between
   `revisionId` and the revision the categories reflect if the API exposes it; if not, name that we
   cannot observe it.

This finding alone justifies Round 4: the converged design's core safety argument has a hidden
two-snapshot assumption that the current two-call code does not satisfy.

---

## R4-2 — [CRITICAL, fail-OPEN] A naive wikitext scan has its OWN false-OPENs and is spoofable/evadable — Round 3 only analyzed false-EXCLUDES

Round 3 asked "does `{{Infobox person}}` fire on dead people?" (a false-EXCLUDE, deemed acceptable
because one-way). It never asked the inverse and more dangerous question: **can the wikitext scan FAIL
to fire on a real BLP, or be made to fail?** A regex over raw wikitext has at least five such holes:

1. **Commented-out / nowiki'd signals (evasion, but also organic).** `<!-- [[Category:Living people]] -->`
   or `{{Infobox person|...}}` inside `<nowiki>...</nowiki>` is inert wikitext — it does NOT categorize
   the page — but a naive `includes("[[Category:Living people]]")` *would* fire on it. That's a
   false-EXCLUDE (safe, one-way). The dangerous inverse: an editor *temporarily comments out* the
   infobox during an edit while the category is still live via a template — scan sees the commented
   infobox as "present" only if you DON'T strip comments, and sees nothing if you DO. Either way the
   scan's behaviour on comments is undefined in the design. **It must be specified**, and the
   fail-closed choice is: strip comments/nowiki BEFORE scanning so they can't *suppress* a real signal,
   but understand that stripping then *loses* a commented literal — which is fine because the literal
   isn't categorizing the page anyway; the *probe* is the authority for live categories.

2. **Transclusion / indirection (the big one).** Round 3's signal list includes `{{Infobox person}}`,
   `{{Infobox officeholder}}`, "…". But a BLP can carry an infobox via a **wrapper template** that the
   raw wikitext never spells out: `{{Infobox sportsperson}}`, `{{Infobox NFL biography}}`,
   `{{BLP person}}`, `{{Infobox military person}}`, or a wikiproject-specific infobox that *transcludes*
   `Infobox person` internally. The literal string `Infobox person` is **absent from the article
   wikitext** — it only appears after template expansion, which we never do. So the wikitext scan
   silently misses every bio that uses a specialized or wrapper infobox. Round 3's "{{Infobox
   person/officeholder/…}}" ellipsis is doing enormous undeclared work, and the set is **open-ended and
   unmaintainable** — there are hundreds of person-infobox variants. This is the same class of problem
   Round 3 *correctly* identified for templatelinks (lag) but reintroduced via the scan (incomplete
   enumeration).

3. **Literal category inside a template parameter or ref (false-OPEN-adjacent).** `[[Category:Living
   people]]` can appear inside a `<ref>`, a `{{cite}}` parameter, or a documentation/example block and
   NOT categorize the page (or be the result of a template's category logic). A scan that treats any
   occurrence as "BLP signal present" is a false-EXCLUDE (safe). But the inverse case — relying on the
   literal's *absence* to conclude "no fresh BLP signal" — is the fail-OPEN, because the literal is
   absent in the overwhelmingly common bot/template-injected case. **The literal-category scan catches
   almost nothing real**; its true value is near-zero and Round 3 overstates it.

4. **Redirects.** `wikimedia.ts` sets `redirects=1`. A redirect page's *own* wikitext is `#REDIRECT
   [[Target]]` plus rcats — it has NO infobox and NO `Living people` literal. If the resolved target is
   a BLP, the probe (on the resolved page) saves us — but only if the probe is on the resolved page AND
   not lagged. The wikitext scan contributes **nothing** on a freshly-created redirect-to-BLP. Named
   residual coverage: this folds into R4-1's two-snapshot problem when the redirect was just created.

5. **Section redirects / `{{Infobox person}}` via `{{Excerpt}}`.** The Artemis fixture literally uses
   `{{Excerpt|Artemis II}}` (line 220). Excerpt/transclusion pulls another page's content at render
   time. A page that excerpts a BLP's lead would render an infobox-person that **never appears in this
   page's wikitext**. Edge, but it's the same indirection class.

**Why it matters.** Round 3 declared the scan "deterministic + one-way, so incompleteness only causes
soft false-negatives." That reasoning is **only valid for the contentious/dispute signals**, which are
genuinely advisory. It is **NOT valid for the BLP-signal half of the scan**, because the BLP wikitext
scan is the *designated backstop for the floor's eventual-consistency hole* (R2-2/B). When a backstop
for the floor is incomplete, the floor fails OPEN in exactly the window the backstop exists to cover.
"One-way" guarantees the scan never *clears* the floor — true — but it does NOT guarantee the scan ever
*fires* when it should. Round 3 conflated "can't make things worse" (true) with "closes the hole"
(false). The hole stays open; the scan just narrows it by an unquantified and probably small amount.

**Concrete fix:**
- (a) **Specify the scan precisely and fail-closed on ambiguity**: strip HTML comments and `<nowiki>`
  spans before matching (so they can't *hide* a signal); match templates by a **normalized
  case-insensitive name with `{{\s*` tolerance and `_`/space folding** (template names are
  first-letter-insensitive, whitespace-tolerant: `{{ infobox_person }}` is valid).
- (b) **Demote the BLP-literal and infobox-name matching from "backstop" to "best-effort advisory,"
  exactly like the dispute signals**, and be honest in the design that the wikitext scan does NOT
  meaningfully close residual (ii) — it catches only the rare hand-added-literal case. This collapses
  R4-2 into the named-residual discipline instead of pretending the scan is a real backstop.
- (c) If a genuine fresh-BLP backstop is wanted, the *only* sound one is not wikitext pattern-matching
  but a **second probe of the recently-changed signal**: e.g. re-issue the `clcategories` probe with no
  `maxlag` and/or check the page's last-revision-timestamp against a freshness threshold and route
  "edited within N minutes" → `human_only` (a freshness fail-closed). That's a real, deterministic,
  enumeration-free fail-closed; the wikitext infobox-name scan is not. **Recommend (c) be evaluated in
  Round 5** as the honest replacement for the infobox-name backstop.

---

## R4-3 — [HIGH, fail-OPEN] `clcategories` requires pre-canonicalized titles, and a denylist entry that is a CATEGORY REDIRECT silently never matches

**Problem.** R2-1/Round-3 lean on `clcategories=<our titles>` returning only matches. Two title-shape
assumptions are load-bearing and unstated:

1. **Canonical input form.** `clcategories` matches the page's category membership against the *exact
   titles you send*, after MediaWiki's own title normalization (first-letter uppercase, `_`↔space). If
   we send `Category:living people` (lowercase l) it canonicalizes to `Living people` and matches; if we
   send `Category:Living People` (capital P) it does **not** — MediaWiki only uppercases the first
   letter, the rest is case-sensitive. N1 covers "a typo breaks the probe," but the subtler trap is that
   the probe gives **no signal** that a title was malformed — a denylist entry that doesn't correspond
   to a real category just silently never matches. There is no "you sent me a category that doesn't
   exist" error. Fail-OPEN with zero observability.

2. **Category redirects (soft redirects).** This is the genuinely new one. Some BLP-relevant categories
   are **soft-redirected** (`{{Category redirect|Target}}`): pages tagged with the redirect title are,
   by Wikipedia convention, supposed to live in the *target*, but bots lag and pages routinely sit in
   the **redirect category** for extended periods. If our denylist contains the *target* canonical name
   but a page is currently in the *redirect* category (or vice-versa), `clcategories` reports `absent`
   for the name we probed even though the page IS in a BLP-equivalent category. R2-8 flagged
   "category-redirect resolution is hard" for the *full-list* path; Round 3 deleted the full-list path
   entirely, which means the probe now has **no way at all** to see a redirect-category membership it
   didn't explicitly enumerate. The probe is exact-match-only by construction.

**Why it matters.** The probe's precision (its great virtue — bounded, truncation-proof) is also its
trap: it is a **closed-world exact-title match**. Anything categorized under a title not literally in
our list — typo'd, renamed, soft-redirected, or a subcategory (R2-3) — reads as `absent` = eligible.
There is no truncation here, just silent non-match.

**Concrete fix:**
- (a) **Canonicalize denylist titles at module-load with a deterministic normalizer** (first-letter
  upper, `_`→space, NFC, trim, strip/normalize the `Category:` prefix) AND unit-test the normalizer, so
  a malformed constant is caught in CI, not in production.
- (b) **Enumerate the known soft-redirect aliases of the primary BLP categories into the denylist**
  (e.g. if `Living people` ever had/has redirecting aliases, include them) — a bounded, curated
  addition, fully compatible with the probe model. Document the residual that *unknown* category
  redirects remain a gap (fold into named residual (ii)/(C)).
- (c) Add a **non-committed live canary** (already proposed in N1) that asserts each denylist title
  resolves to a real, non-redirected category on en.wikipedia — this is the only way to catch a denylist
  entry that has silently become a redirect after a Wikipedia category rename.

---

## R4-4 — [HIGH, fail-OPEN] `clcategories` has a value-count ceiling — probing the FULL (BLP ∪ contentious) union in one call can silently drop tail entries

**Problem.** Round 3's key simplification (section A) is "probe the **union** of BLP-set ∪
contentious-category-denylist in a single bounded call, enumerate nothing." This assumes `clcategories`
accepts an arbitrarily long `|`-separated list. It does not. MediaWiki multi-value parameters are capped
at **50 values** for normal users (500 for clients with the `apihighlimits` right, which an anonymous/
ordinary bot does NOT have). If the union of BLP categories + the contentious-category denylist exceeds
50 titles, the API **truncates or errors on the parameter** — and depending on how the client handles
it, the *tail* of the list (which could include a BLP category if BLP entries are ordered last) is
silently not probed → fail-OPEN.

**Why it matters.** Round 3 treats the probe as "bounded by our list size, cannot truncate." That's true
for the *response* (only matches come back) but FALSE for the *request*: the request has a 50-value
ceiling. The contentious-category denylist is explicitly meant to grow (F5: "seed small… documented as
partial," but it WILL grow). The moment (BLP ∪ contentious) crosses 50 titles, the single-probe design
breaks, and it breaks *silently* and *worst-case on the safety-critical BLP tail*.

**Concrete fix:**
- (a) **Order the probe list BLP-categories-first**, so if any truncation occurs it bites the *advisory*
  contentious tail, never the floor. Defence-in-depth, cheap.
- (b) **Assert `|union| ≤ 50` as a hard invariant with a unit test**; if the union would exceed 50,
  **split into multiple probe calls** (BLP-set in its own guaranteed-complete call; contentious in
  additional calls). The BLP probe must ALWAYS be a standalone, never-truncated call — never share the
  50-slot budget with the growable contentious list. This also cleanly separates the load-bearing probe
  from the advisory probe (realizing R2-9's intent at the request layer).
- (c) Detect and fail-closed on the API's `toomanyvalues`/truncation warning rather than ignoring it.

---

## R4-5 — [HIGH, fail-OPEN] Persisting the verdict (N3) creates a DURABLE fail-OPEN: a stored `easy_win` goes stale when the article becomes a BLP

**Problem.** Round 3 flips to persisting `eligibility` + `eligibility_reasons` on `articles` (N3). The
review prompt flags this. It is real and it is the worst kind of fail-OPEN: **time-extended**. Today's
gate is a *point-in-time* snapshot. Persisting it means:

- We store `easy_win` for page P at revision R. Later, P's subject becomes notable, gets a
  `Living people` category, or a dispute template lands. The stored row still says `easy_win`. A future
  easy-win consumer reads the **stale durable verdict** and surfaces a now-BLP article as an easy win —
  a fail-OPEN that persists for as long as the row is not refreshed, with no fetch in the loop to catch
  it. The point-in-time gate at least failed OPEN only momentarily; the persisted gate fails OPEN
  **durably**.
- This is strictly *worse* for the eventual-consistency problem (R2-2), not better: if we persist a
  verdict computed during the lagged window (probe said `absent` because categorylinks hadn't
  propagated), we now have a **frozen wrong answer** that will be served indefinitely, long after the
  categorylinks caught up. Persisting *freezes* the eventual-consistency fail-OPEN instead of letting a
  re-fetch self-heal it.

**Why it matters.** G11's floor is "excluded… period." A durable `easy_win` on an article that has since
become a BLP is a standing violation of the floor that no live check would have made. The persistence
decision converts a transient fail-OPEN into a durable one — that is a *floor weakening* and per G11
needs the same sign-off treatment as the two named residuals. Round 3 presented N3 as a clean
fail-closed improvement ("the read path carries the floor"); it is actually a **new fail-OPEN surface**
that Round 3 did not name as one.

**Concrete fix (the verdict must be revision-bound and consumer-gated, not a bare flag):**
- (a) **Persist the verdict bound to `(page_id, revision_id, gate_version, fetched_at)`**, never as a
  bare `eligibility` column detached from the revision and gate that produced it. A consumer MUST treat
  a verdict as valid only for the revision it was computed on.
- (b) **The easy-win consumer (when it exists) MUST re-validate freshness**: a stored `easy_win` is
  *advisory until re-checked*; before an article is actually surfaced as an easy win, the gate runs
  again on the current revision. Persisting is then a **cache for display/listing**, explicitly NOT the
  authority for "is this safe to edit now." State this invariant in the design and pitfalls: *a
  persisted `easy_win` is never sufficient on its own to put an article in front of an editor as an easy
  win; the floor is re-evaluated at point-of-use.* This preserves N3's read-path benefit (the list view
  shows a verdict without a fetch) while denying the durable fail-OPEN.
- (c) Reasons persisted as **codes only** (no free text) — consistent with F7/G13 and the no-PII rule.
- (d) Stamp a `gate_version` so a future gate-logic change invalidates old verdicts deterministically
  (same discipline as `detector_version` in `stale_candidates`).

Net: N3's persistence is defensible **only** as a revision-bound, gate-versioned, re-validated-at-use
cache. As a bare durable flag it is a floor weakening requiring sign-off. Surface this to Sam as a
correction to Round 3's framing.

---

## R4-6 — [MEDIUM, determinism] The gate's audit timestamp and `fetchedAt` use `new Date()` — clock in the decision path; and `lookupAndPersist` writes `fetchedAt` separately from the fetch instant

**Problem.** G10 requires deterministic detection. The gate verdict is pure given `ArticleMetadata`,
good. But `fetchedAt` is set in `lookupAndPersist` via `new Date().toISOString()` (lookup.ts line 57),
which is a *different instant* from when `fetchArticle` actually hit the network — and in the Round-3
contract `fetchedAt` is the field the audit trail relies on to reason about eventual-consistency
staleness (R2-6). A `fetchedAt` that is "whenever we got around to building the article record" rather
than "the instant the API response was received" mis-dates the lag window. Minor, but it's the exact
field a post-hoc audit of a fail-OPEN would lean on.

**Why it matters.** For a compliance floor, the audit must let you reconstruct "was this verdict
computed during a lag window?" If `fetchedAt` is a loosely-related wall-clock read, the reconstruction
is off by however long the pipeline took. Determinism of the *verdict* is fine; faithfulness of the
*audited inputs* is the gap.

**Concrete fix:** Capture `fetchedAt` (and ideally the response `Date` header / `maxlag`-observed value)
**inside `fetchArticle`, at the moment the response is parsed**, and thread it through
`ArticleMetadata`. Make the gate and audit consume that single captured instant, not a fresh
`new Date()` downstream. Keep `asOfYear` injection (lookup.ts already does this well) as the template for
clock-injection in tests so the gate path is fully frozen-testable.

---

## R4-7 — [MEDIUM, fail-OPEN/testability] The wikitext scan and the probe can DISAGREE, and the design has no rule for it — an unnamed third residual

**Problem.** The prompt asks whether the two named residuals are the minimal honest set. They are not.
There's a third case the converged design doesn't name: **probe says `absent`, wikitext scan says BLP**
(or vice-versa). The union rule ("`human_only` if probe OR scan fires") makes *disagreement* resolve
fail-closed, which is correct — so this is safe *as long as the union is actually OR*. But the design
never states what happens when they disagree in the *audit/observability* sense, and more importantly
the inverse disagreement — **probe says `present` (BLP) but wikitext shows a clean non-bio** — is a
signal that *our denylist or probe is wrong* (e.g. probing a category that over-matches). That's not a
fail-OPEN, but it's a silent correctness smell that should be logged, because a probe that fires on
non-BLPs erodes trust in the floor and pushes toward "relax the denylist," which IS a fail-OPEN risk
downstream.

**Why it matters.** "Two named residuals" implies the residual set was enumerated exhaustively. A third
(probe/scan disagreement) exists and should at least be *named and logged*, even if its disposition is
"union resolves fail-closed, disagreement is audited." Completeness of the *named-residual list* is
itself a G11 honesty requirement.

**Concrete fix:** Add an audit field recording `(probeFired, wikitextFired)` as a 2-bit code on every
verdict. Name the disagreement case in the design's residual section: union resolves fail-closed (no
fail-OPEN), but persistent disagreement is a denylist-quality signal worth monitoring. This is cheap and
makes the residual list honestly complete.

---

## R4-8 — [MEDIUM, fail-OPEN] Vandalism / mid-edit category removal: the probe reads a transient non-BLP state

**Problem.** The prompt raises "vandalism that removed the category seconds ago." This is a real
fail-OPEN distinct from eventual consistency: an edit (vandalism or good-faith error) *removes*
`[[Category:Living people]]` from a live BLP. The categorylinks update propagates and the probe
correctly reports `absent` for the *current* (vandalized) revision. The page IS a BLP; its current
revision just doesn't say so. Neither the probe (faithfully reporting current state) nor the wikitext
scan (faithfully scanning the vandalized wikitext) fires → fail-OPEN. This is NOT covered by residual
(ii) (eventual-consistency, where the category WAS added) — here the category was *removed*, and the
"fresh" data is fresh-and-wrong.

**Why it matters.** It's a fourth residual, orthogonal to the two named. It's also low-probability and
arguably out of any tractable v1 scope (detecting that a *removed* category *should* be present requires
historical/cross-revision analysis we explicitly don't do). But "we can't catch a BLP whose current
revision has had its BLP category vandalized away" must be **named**, not silently absent — same G11
discipline as residuals (i) and (ii).

**Concrete fix:** Name it as residual (iii): "current-revision category removal (vandalism/error) makes
a BLP momentarily indistinguishable from a non-BLP; not detectable without cross-revision history, out
of v1 scope, mitigated by the downstream human-verification gate (G5)." No mechanism in v1; just
honest naming + Sam sign-off, since it's a (narrow, transient) floor gap.

---

## R4-9 — [MEDIUM, fail-OPEN] Talk-page / WikiProject BLP banners are invisible to both the probe and the article-wikitext scan

**Problem.** The strongest *editorial* signal that an article is a BLP is often the **talk-page banner**
`{{WikiProject Biography|living=yes}}` (or `{{BLP}}` on the talk page), not anything in the article
itself. WP:BLP explicitly applies based on the subject being a living person, and the talk-page
WikiProject banner is where `living=yes` is asserted. Our pipeline fetches **only the article
(namespace 0) wikitext** and probes **only the article's categories**. The talk page (namespace 1) is
never fetched. So a BLP whose article-namespace categorization is incomplete but whose talk page
unambiguously declares `living=yes` reads as eligible. Round 3's signal list even includes
`{{WikiProject Biography|living=yes}}`-class signals (carried from R2-2) — but that banner lives on the
*talk page*, which we don't fetch. The signal is listed but **unreachable by the current fetch scope**.

**Why it matters.** This is a real, common BLP-identification path that the design *names a signal for*
but has *no data source for*. Either the signal is dead (we can never see it) — in which case listing it
is misleading — or we need to fetch the talk page. Round 3 didn't notice that its own signal list
references data outside its fetch scope.

**Concrete fix:** Two honest options, decide explicitly:
- (a) **Drop the talk-page-banner signal from the list** and name "BLP-by-talk-page-banner-only" as an
  additional residual (cheapest; fits v1 article-only scope).
- (b) **Add a bounded talk-page probe**: one extra `clcategories`/content fetch on the `Talk:` page for
  the `{{WikiProject Biography|living=yes}}` banner. This is real coverage but doubles the fetch and
  pulls the design toward "scan templates" (which lag). Given G14 (responsible access) and the
  enumeration-avoidance ethos, (a) is more consistent with the converged design. Recommend (a) +
  explicit residual naming.

---

## R4-10 — [LOW, scope/YAGNI] The contract still carries `wikitextSignals: string[]` as load-bearing when R4-2 shows the BLP half should be advisory

**Problem.** Round 3's contract puts `wikitextSignals` on equal footing with `blockingCategories` in the
gate rule. R4-2 argues the BLP-wikitext-signal half is not a sound backstop (incomplete, indirection-
blind) and should be demoted to advisory. If that's accepted, `wikitextSignals` becomes purely advisory
(dispute templates + best-effort BLP literal), and the **only** load-bearing inputs are `probeStatus`,
`namespace`, and the BLP subset of `blockingCategories`. The contract should make that explicit rather
than implying the wikitext scan carries floor weight it can't bear.

**Concrete fix:** Split `blockingCategories` into `blpCategories` (floor, load-bearing) and
`contentiousCategories` (advisory), OR document that only BLP-prefixed codes in `blockingCategories` are
floor-load-bearing. Keep `wikitextSignals` as advisory-only in the gate rule (it can ADD `human_only`
but the design must not claim it *closes* the eventual-consistency floor hole). This is R2-9's "floor
input is first-class" taken one level further now that R4-2 has shown the scan can't be a floor backstop.

---

## Challenges to Round 3 (explicit engagement)

### On the wikitext-scan robustness — Round 3 is HALF RIGHT and dangerously over-sold it
Round 3 was right that both `categorylinks` and `templatelinks` lag, and right that the revision wikitext
is the freshest data we hold. But it analyzed the scan's *false-excludes* (infobox-person on dead people
→ fine, one-way) and never attacked its *false-opens*. R4-2 shows the BLP-wikitext scan is incomplete by
construction (template indirection, wrapper infoboxes, bot/template-injected categories that never touch
wikitext) and R4-1 shows it can even run on a *different revision* than the one being adjudicated.
**Verdict: keep the dispute-template scan as advisory; do NOT bill the BLP-wikitext scan as a backstop
that closes the eventual-consistency hole.** It narrows the hole by an unquantified, probably-small
amount. The honest backstop, if one is wanted, is a freshness fail-closed (route recently-edited pages
to `human_only`, R4-2c), not infobox-name matching.

### On REJECTING R2-3 (births-without-deaths heuristic) — Round 3 is RIGHT to reject it as-specified, but for partly the wrong reason; a cheaper variant deserves a look
Arguing both sides honestly:
- **For Round 3's rejection:** "births without deaths" genuinely false-excludes every pre-modern figure
  whose death category is merely missing, and bounding it needs an `asOfYear`/recency cutoff — new gate
  surface for a heuristic whose population (`a living bio with NO Living people category`) is rare
  *because* bots apply `Living people` near-universally. And our tool's actual inputs are non-bios (0/136
  fixtures), so it never fires on the real corpus. All true.
- **Against (where Round 3 overreaches):** Round 3's "marginal value because Living people covers ~all
  bios" leans on the *same* eventual-consistency-clean assumption R4-1 just broke. The births-category is
  itself a category and lands via the *same* lagged machinery, so it's no fresher. BUT — and this is the
  cheaper variant worth naming — the **birth-year category is far more likely to be present as a
  *literal* `[[Category:1994 births]]` in wikitext** on a new bio stub than `Living people` is (stub
  creators routinely type the birth-year category by hand; `Living people` is bot-added later). So a
  *wikitext-literal* "has a `NNNN births` category AND no `NNNN deaths`/`Recent deaths`" check, with a
  recency cutoff (`birthYear > asOfYear − ~110`), is a genuinely *fresher* fail-closed BLP signal than
  the lagged `Living people` probe for exactly the new-stub case residual (ii) cares about.
- **Verdict:** Round 3 is right to reject the *full categorylinks-based* births-without-deaths heuristic
  for v1 (low marginal value on our corpus, adds `asOfYear` to the gate). But it should NOT claim the
  heuristic has no value on freshness grounds — a *wikitext-literal birth-year* variant is one of the
  few signals that's actually fresh on a new bio stub. **Recommend: keep it deferred for v1 (corpus is
  non-bio), but name the wikitext-literal-birth-year variant as the leading candidate if/when the tool's
  input scope ever broadens to include biographies** (ties to N2's en-wiki/scope boundary).

### On the N3 persistence flip — Round 3 UNDERSOLD the risk; persisting is right ONLY with revision-binding + re-validation
Round 3 framed N3 as a clean fail-closed improvement. R4-5 shows it introduces a **durable** fail-OPEN
(stale `easy_win` after a subject becomes a BLP; frozen eventual-consistency error). The flip is
defensible — recomputing on read would mean a Wikimedia fetch per read (real G14 violation) — but **only
if** the persisted verdict is (1) bound to `(page_id, revision_id, gate_version)`, (2) treated as a
display cache that is **never** sufficient to surface an easy win without point-of-use re-validation, and
(3) reasons-as-codes. As a bare `eligibility TEXT` column (Round 3's literal proposal), it's a floor
weakening that needs sign-off. **Verdict: accept the migration, reject the bare-column shape; require
revision-binding + gate-version + re-validate-at-use.** The "forces freshTestDb to apply all migrations"
benefit is real and orthogonal — good either way.

### On whether the two named residuals are the minimal honest set — NO, they're incomplete
Round 3 names (i) eventual-consistency template-injection and (ii) suppressed/uncategorized/subcategory
BLPs. R4 adds at least three more that belong in the named set: **(iii)** current-revision category
*removal* (vandalism/error) makes a BLP momentarily look non-BLP (R4-8); **(iv)** BLP-by-talk-page-banner-
only, which the design lists a signal for but can't fetch (R4-9); and the **two-snapshot skew** (R4-1),
which is arguably a *bug to fix* (combined atomic call) rather than a residual to accept — but until
fixed, it's an unnamed fail-OPEN broader than (i). **Verdict: the "two named residuals" framing is not
yet the minimal honest set; it's missing (iii) and (iv), and (R4-1) should be eliminated by the atomic
combined call rather than accepted.**

---

## Round 4 verdict

The converged Round-3 design is directionally sound and its two reframes (probe-not-enumerate;
fresh-wikitext because both link tables lag) hold. But Round 3 introduced a new component — the wikitext
scan — and validated it against the wrong failure mode (false-excludes), missing that **as a backstop
for the floor it is incomplete and possibly stale**. Two CRITICAL fail-OPENs that rounds 1–3 did not
name:

1. **R4-1 (two-snapshot skew):** the wikitext (Call A) and the `clcategories` probe (Call B) are
   *separate, unsynchronized fetches*, so the "fresh backstop" can be adjudicating a different revision
   than the one whose categories we read. **Fix: one atomic combined `revisions|categories` call**, with
   the same-`pages[0]` invariant asserted. This is the single highest-leverage fix in Round 4 and it
   makes Round 3's own safety argument actually true.
2. **R4-2 (scan false-opens + spoofability):** the BLP-wikitext scan misses template-injected categories
   and wrapper/specialized infoboxes by construction, and its comment/nowiki/transclusion behaviour is
   unspecified. It is **not** the eventual-consistency backstop Round 3 claims; demote it to advisory and,
   if a real backstop is wanted, use a **freshness fail-closed** (recently-edited → `human_only`).

Plus: a **request-side 50-value `clcategories` ceiling** (R4-4) that silently truncates the
floor-critical tail if the union grows; **category-redirect/canonicalization** blind spots in the
exact-match probe (R4-3); and the **N3 persistence flip as a durable fail-OPEN** (R4-5) unless
revision-bound, gate-versioned, and re-validated at point-of-use. The named-residual set is **not yet
complete** — add current-revision category removal (R4-8) and BLP-by-talk-page-banner-only (R4-9).

Round 3's instincts on rejecting the births-without-deaths heuristic and on persisting are right in
direction but oversold in safety. The deeper lesson, consistent with the whole review trail: **every
"fresh" or "authoritative" data source in this pipeline is fresh/authoritative only relative to its own
fetch, and the floor's soundness depends on the floor's inputs being a single coherent snapshot.** Round
3 lost that coherence the moment it split the probe and the content into two calls. Re-unify them, demote
the scan to advisory, name the missing residuals, and constrain persistence to a re-validated cache —
then the converged design is shippable behind Sam's sign-off on the (now four) honestly-named residuals.

Carrying R4-1 through R4-10 into Round 5 (final) to confirm the atomic-call fix closes R4-1 cleanly, to
decide R4-2c (freshness fail-closed) vs advisory-demotion, and to ratify the corrected N3 shape.
