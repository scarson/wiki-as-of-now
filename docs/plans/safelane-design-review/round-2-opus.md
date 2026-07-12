<!-- ABOUTME: Adversarial design review for the safe-lane (G11) gate — Round 2 (Opus, independent attack). -->
<!-- ABOUTME: Attacks fail-OPEN vectors, the "authoritative API" assumption, F2/F5 from Round 1, and the contract shape. -->

# Safe-lane gate (G11) — adversarial design review, Round 2 (Opus)

Reviewer lens, unchanged from Round 1: **the worst outcome is a silent fail-OPEN** — a
biography-of-living-persons article wrongly marked `easy_win`. G11's hard floor ("any article in a
BLP category is excluded from the easy-win queue by default, period") is sacrosanct and can only be
weakened with explicit human sign-off. Every finding is rated against that floor.

Round 1 found the right two headline problems (F1 normalization, F2 truncation) but treated the
MediaWiki API as a trustworthy oracle of "what categories is this page in." It is not — and that
assumption is where most of the remaining fail-OPEN risk lives. The single most important structural
move (R2-1) makes the BLP floor stop depending on category-list completeness at all.

---

## R2-1 — [CRITICAL, fail-OPEN] The BLP floor should ASK about specific categories, not ENUMERATE all of them

**Problem.** The whole design — and all of Round 1's F2 anguish about pagination — rests on
fetching the page's *entire* category list and then intersecting it with the BLP set. That is the
wrong primitive for a fail-closed floor. `prop=categories` accepts a `clcategories=` parameter that
asks the API "**is this page in any of these specific categories?**" and returns only the matches.
For the BLP floor we know exactly which categories we care about (`Living people`, `Possibly living
people`, `Recent deaths`, …). Querying `clcategories=Category:Living people|Category:Possibly living
people|…` returns at most |BLP-set| rows, **needs no pagination, cannot truncate, and is immune to
F2's entire failure class** for the load-bearing check.

**Why it matters.** Enumerate-then-intersect has a fail-OPEN mode that ask-directly does not: if the
full list is long and pagination drops/truncates/reorders the page that *would* have contained
`Living people`, you fail OPEN unless every partial-failure path is perfectly wired to
`complete:false`. The `clcategories` form removes the landmine instead of guarding it. The general
category-denylist (R2-? contentious set) still needs the full list, but the **hard floor must not**.
Keep enumeration for the soft contentious-category signal; pin the BLP floor to a `clcategories`
probe.

**Fix.** Two-tier ingest: (1) a `clcategories` probe for the exact BLP-set (and any category the
floor depends on) — its result is `present | absent | unknown(fetch error)`; (2) a separate
paginated full-category fetch for the soft contentious denylist. The floor consumes only tier (1).
`unknown` → `human_only(metadata_unavailable)`. This also shrinks the contract problem in R2-9.

---

## R2-2 — [CRITICAL, fail-OPEN] "Authoritative API categories" are eventually-consistent, not authoritative at fetch time

**Problem.** The design's decision (2) asserts category metadata from the API is "authoritative,"
contrasted with wikitext parsing. But MediaWiki's `categorylinks` table is populated by the
**deferred link-update job queue**, not synchronously on save, and is read from **replica DBs** that
lag the primary. Concretely:
- A **newly created or just-recategorized BLP** can return an *empty or stale* category list for
  seconds-to-minutes after the edit that added `Living people` (job queue + replica lag). During
  that window the API authoritatively reports "not in Living people" — fail-OPEN.
- `maxlag=5` (carried over from `wikimedia.ts`) bounds *replication* lag but does **not** bound
  job-queue lag. The two are different mechanisms; maxlag gives false comfort here.

**Why it matters.** This is a true fail-OPEN against exactly the freshest articles a temporal-claim
tool is most likely to be pointed at. It is not caught by F1 (normalization) or F2 (truncation) — the
list is *complete and well-formed*, just wrong.

**Fix.** Accept that the signal is eventually-consistent and add a conservative backstop the *floor*
can use: cross-check the BLP probe against a cheap wikitext signal for the most dangerous case. The
spec already notes `Living people` is often template-injected and may be absent from raw wikitext —
true — but the presence of an `{{BLP...}}`/`{{WikiProject Biography|living=yes}}`-class signal, an
infobox-person template, or a `[[Category:Living people]]` literal in wikitext is a **one-way**
escalation: any of them → `human_only`, never used to *clear* the floor. Document explicitly that the
API category probe can fail-OPEN on fresh edits and that the wikitext signals exist to *only ever add*
disqualifiers, never remove them. At minimum, log the fetch revision timestamp so a wrong decision is
auditable (G13) — see R2-7.

---

## R2-3 — [HIGH, fail-OPEN] Subcategories of "Living people" and BLP-by-other-means are not in the BLP set

**Problem.** The floor matches membership in an enumerated BLP *category set*. But:
- WP:BLP applies to a living person regardless of whether `Category:Living people` is literally
  present. Articles exist that are unambiguously BLPs yet are **not** in `Living people` (suppressed
  for privacy/BLP-protection reasons, very new stubs, or miscategorized).
- `Living people` has **subcategories** in some maintenance trees; a page can be a descendant BLP
  without carrying the parent category title the set checks for.
- Lists-of-living-people, and people categorized only via birth-year categories (`Category:1980
  births`) without a death-year category, are BLP-adjacent and the current set misses them.

**Why it matters.** F1 fixes *string* mismatch; it does nothing for *semantic* membership gaps. Each
of these is a genuine fail-OPEN where the category title we check simply isn't on the page.

**Fix.** This cannot be fully solved at v1 with a flat denylist, and pretending otherwise would be
dishonest — so (a) add the high-value machine signals that *are* tractable: treat "`X births`
category present AND no `Y deaths`/`Recent deaths`/death-year category present" as a **fail-closed
BLP heuristic** (a living person almost always has a birth-year-but-no-death-year shape); (b)
explicitly document in the design and the compliance-adjacent note that the floor is a *category
signal*, not a *BLP oracle*, and that the residual gap (suppressed/uncategorized BLPs) is a **named,
human-signed-off limitation** of v1 — because narrowing G11's floor coverage is exactly the kind of
weakening that requires Sam's explicit sign-off. Do not let this gap be silent.

---

## R2-4 — [HIGH, fail-OPEN] Redirects, cross-namespace redirects, and the namespace check interact badly

**Problem.** `wikimedia.ts` sets `redirects=1`. So a lookup of title *A* may resolve to target *B*.
The categories returned are *B*'s, the `pageId` is *B*'s, the namespace is *B*'s — generally what we
want. But two traps:
- A redirect can point into a **non-mainspace** target (e.g. a `Draft:` or `Portal:` BLP), or a
  mainspace title can redirect to a **section of a BLP article**. The namespace check on the resolved
  page is correct in principle, but the design never states that eligibility is computed on the
  **resolved** page, not the requested title. If any code path evaluates the requested title's
  namespace (0) while categories come from the resolved page, the two are desynchronized.
- A redirect target that is itself **missing/broken** (double redirect, deleted target) can yield a
  page object with no categories — which must be `metadata_unavailable`, not "no BLP categories →
  eligible."

**Why it matters.** Desync between "which page's namespace" and "which page's categories" is a
classic fail-OPEN. Broken-redirect → empty-categories → `easy_win` is the same empty-list trap as
R2-2.

**Fix.** State the invariant explicitly: **all five `ArticleMetadata` fields MUST come from one and
the same resolved page object** (single source page; if `redirects` produced a chain, use the final
`to`). Add gold-set cases: a redirect resolving to a BLP, and a cross-namespace redirect. Empty
categories from a resolved page is only valid if the probe (R2-1) returned a definitive `absent`; a
missing/broken page → `metadata_unavailable`.

---

## R2-5 — [HIGH, fail-OPEN] `cllimit` defaults to 10, not 500 — Round 1's F2 understates the truncation problem

**Problem.** Round 1's F2 frames truncation as a >500-item edge ("templates routinely exceed the
500-item API page"). The actual default for `prop=categories` is **`cllimit=10`**. Without an
explicit `cllimit=max`, *any article with more than 10 categories* — i.e. essentially every real
article, including the Artemis fixture with 9 categories sitting right at the boundary — paginates or
truncates. If the enumerate-then-intersect path is used (R2-1 notwithstanding) and the code forgets
`cllimit=max` and forgets to follow `continue`, **the BLP category can be on page 2 and silently
absent from page 1**. That is a fail-OPEN that triggers on the *common* case, not an edge.

**Why it matters.** F2's mental model ("rare >500 truncation") would lead an implementer to deprioritize
pagination as an edge case. It is not an edge case; it is the default behavior. This materially changes
F2's severity and urgency.

**Fix.** If R2-1 is adopted, the floor doesn't enumerate and this is moot for the floor. For the
soft contentious-category enumeration that *does* list all categories: set `cllimit=max` explicitly,
follow `continue` to completeness, and unit-test against a fixture with >10 categories so the default
bites in CI. Correct F2's framing in the spec: the truncation boundary is 10 by default, raised to
500 with `cllimit=max`, not 500 inherently.

---

## R2-6 — [MEDIUM, determinism] The gate is pure but its INPUT is non-reproducible — a G13 auditability gap

**Problem.** `evaluateEligibility(meta)` is deterministic given `meta`. But `meta` is a snapshot of a
mutable, replica-lagged, job-queue-driven external system at an unrecorded instant (R2-2). The audit
event logs `pageId, eligibility, reasons[]` — but **not the inputs that produced the verdict**. So a
later "show your work" (G13) cannot answer "*why* was this `easy_win`?" or reproduce the decision: the
category list that drove it is gone, and re-fetching gives a possibly-different answer.

**Why it matters.** G13 says the audit log must make decisions *real rather than asserted*. A verdict
whose inputs aren't captured is asserted, not reproducible. For a fail-closed compliance floor this is
exactly the decision you most need to be able to defend after the fact.

**Fix.** Log the **decision inputs** as identifiers, not content: the resolved `pageId`, `revisionId`,
the `namespace`, the **BLP-probe result** (present/absent/unknown), the matched denylist **codes**,
and the **fetch timestamp + maxlag-observed**. These are all identifiers/codes, not PII or article
prose, so they satisfy the identifiers-only audit rule while making the verdict reproducible-in-intent.
Reason codes already carry no free text (F7) — extend the same discipline to inputs.

---

## R2-7 — [MEDIUM, fail-closed/testability] `complete: boolean` is too coarse AND the wrong axis — agree with F2's diagnosis, reject its shape

**Problem.** Round 1 (F2) correctly says `complete` conflates "fetch failed" with "list truncated."
But its implied fix (one `complete` flag, reserved for genuine errors, after paginating to
completeness) still collapses **independent** completeness facts into one boolean. Categories and
templates have *different* criticality: category-completeness is load-bearing for the floor;
template-completeness is a soft signal. A single boolean forces you to either fail-closed on
template-truncation (uselessly aggressive — F2's own (a) complaint) or fail-OPEN on
category-truncation (catastrophic). One bit cannot express "categories definitive, templates
truncated."

**Why it matters.** The boolean is the contract seam between ingest and the gate. Getting it wrong
either guts utility or punches a hole in the floor. This is the F2 problem one level deeper.

**Fix.** Replace `complete: boolean` with **per-signal status**, e.g.
`categoriesStatus: "complete" | "incomplete"` and (only if templates are enumerated)
`templatesStatus`. With R2-1 the floor's input is the BLP-probe result
(`present | absent | unknown`), which is the cleanest shape of all — the floor never sees a list, only
a definitive yes/no/unknown. The gate's rule becomes: BLP-probe `unknown` → `human_only`;
template/category enumeration incomplete → still `human_only` (conservative) but for a *distinct* reason
code, so the two cases are auditable and tunable separately.

---

## R2-8 — [MEDIUM, fail-OPEN] Localized/aliased category names and namespace-prefix aliases

**Problem.** Even on en.wikipedia, the `Category:` prefix has localized/alias forms, and categories
can be reached via redirected category titles. F1 normalizes `Category:` (English) + case +
underscores. It does **not** address: (a) category **redirects** (a page tagged with a
soft-redirected category title that resolves to `Living people`), (b) the `Category` namespace alias,
(c) Unicode normalization forms (NFC vs NFD) so that a composed vs decomposed character in a category
title compares unequal. Any of these → the floor's string match misses a real BLP categorization.

**Why it matters.** F1 declared category normalization "the #1 thing to get right" but scoped it to
prefix/case/underscore. The harder cases (category redirects, Unicode NF) are still open fail-OPEN
seams.

**Fix.** Adopt R2-1 (probe by canonical title) which sidesteps prefix aliasing for the floor. Apply
**Unicode NFC normalization** in the canonicalizer (document it; unit-test a decomposed-character
category). Category-redirect resolution is genuinely hard at v1 — name it as a residual limitation
(R2-3 discipline). The floor never *clears* on the basis of "no alias matched"; it clears only on a
definitive probe `absent`.

---

## R2-9 — [MEDIUM, architectural/scope] `ArticleMetadata` mixes load-bearing and advisory inputs in one flat bag

**Problem.** `{ pageId, namespace, categories: string[], templates: string[], complete: boolean }`
puts the BLP floor's input (BLP-category membership) in the same `categories: string[]` field as the
soft contentious-category signal, and gives no place for the probe result, the resolved-page identity,
or the revision/timestamp the verdict depends on (R2-6). The shape invites the enumerate-then-intersect
anti-pattern (R2-1) and the desync risk (R2-4).

**Why it matters.** The contract shape is where the next implementer's defaults get set. A shape that
makes the floor depend on a `string[]` you must fully enumerate is a shape that makes fail-OPEN the
easy mistake.

**Fix.** Reshape to make the floor's input first-class and unmissable:
```
ArticleMetadata = {
  resolvedPageId, resolvedTitle, revisionId, namespace,
  blpProbe: "present" | "absent" | "unknown",   // tier-1, load-bearing (R2-1)
  templates: string[], templatesStatus,          // advisory denylist
  contentiousCategories: string[], categoriesStatus, // advisory denylist
  fetchedAt, maxlagObserved,                      // for audit reproducibility (R2-6)
}
```
The gate reads `blpProbe` for the floor and the `*Status` fields for fail-closed-on-incomplete. This
also realizes F3's intent: the verdict's load-bearing input is structurally separated from advisory
ones.

---

## R2-10 — [MEDIUM, testability] The gold set is gameable and currently cannot test the floor honestly

**Problem.** Measured fact: 0 of 136 fixtures carry `Category:Living people`; the corpus is
non-biographical. The gold set is *proposed* as committed JSON with "real BLP biographies (hidden
`Living people`)" — but:
- If the gold JSON stores **pre-cleaned** category strings (`"Living people"`), it tests the
  matcher against the answer key, not against the **raw API shape** (`"Category:Living people"`,
  `cllimit=10` truncation, the probe response envelope). F1 flagged this for strings; it's worse for
  the probe — the gold set must encode the *actual `clcategories` response JSON*, including the
  `absent` (empty) shape and the `unknown` (error) shape.
- A composition guard "≥N BLP positives AND ≥N eligible negatives" guards *count*, not *fidelity*. It
  can be satisfied by N hand-typed clean strings that never exercise truncation, redirect resolution,
  job-queue-empty, or Unicode-NF cases. The guard is gameable.

**Why it matters.** A green gold set that never feeds the gate a raw API envelope gives false
confidence on exactly the fail-OPEN paths (R2-1/2/4/5/8) that matter most.

**Fix.** The gold set MUST store **raw API response envelopes** (captured from live Wikipedia, then
frozen), not hand-cleaned fields, for: a hidden-`Living people` BLP, a `>10`-category article (so
`cllimit` truncation is exercised), a redirect-to-BLP, a broken-redirect/empty-categories case, a
non-mainspace case, a fetch-error (`unknown`) case, and a Unicode-NF category case. Strengthen the
composition guard to assert **shape coverage** (at least one truncation case, one redirect case, one
`unknown` case), not just positive/negative counts. Provenance note: capture these via the
`url-to-markdown`/API-fetch evidence path and commit the frozen envelopes so the suite stays
network-free.

---

## R2-11 — [LOW, determinism] Category/template ordering and Set semantics

**Problem.** The gate does set-intersection; result `reasons[]` ordering must be deterministic. If
`reasons` is built by iterating a `Set` or the API's returned order, two runs on the same inputs could
emit reasons in different order — a (minor) determinism wart that makes audit diffs noisy and
gold-set assertions brittle.

**Fix.** Emit `reasons[]` in a **fixed canonical order** (e.g. floor checks first in a documented
sequence: `metadata_unavailable`, `non_mainspace`, `blp_category`, then sorted
`dispute_template:*`, then sorted `denied_category:*`). Sort the dynamic codes lexicographically.
Trivial, but make it explicit so the gate is byte-reproducible.

---

## Challenges to Round 1

### F2 ("paginate metadata to completeness") — PARTIALLY AGREE, but the framing is wrong and the fix is incomplete
Round 1 is right that `complete` conflates fetch-failure with truncation, and right that fail-closing
on every truncation guts utility. But F2 is **wrong in two ways**:
1. **Severity/threshold framing.** F2 treats truncation as a rare >500 edge. The real default is
   `cllimit=10` (R2-5) — truncation is the *common* case, not the edge. An implementer reading F2
   would under-prioritize pagination; that's a fail-OPEN waiting to happen.
2. **Wrong primitive.** "Paginate to completeness" makes the floor depend on perfectly enumerating a
   mutable list and perfectly wiring every partial-failure path to `complete:false`. The floor
   should not enumerate at all — it should **probe specific categories** (`clcategories`, R2-1),
   which is immune to truncation by construction. Pagination is still needed for the *soft*
   contentious-category list, but anchoring the *floor* on pagination correctness is the more
   fragile design. **Verdict: keep pagination for advisory signals; do NOT let the BLP floor depend
   on it.** And replace `complete:boolean` with per-signal status / probe-result (R2-7).

### F5 ("thin category denylist is acceptable for v1") — AGREE on the denylist, but F5 hides a real gap behind a true statement
F5's narrow claim is correct: a small, curated, explicitly-partial **contentious-category** denylist
is fine for v1, because that signal overlaps the deferred claim-level work and the load-bearing
mechanisms are the BLP floor + namespace + dispute-template denylist. I agree with that.
**But F5 is used to wave past a thing it doesn't actually cover:** the gap that matters isn't the
*contentious* category denylist being thin — it's the **BLP floor's own coverage** being a flat
category-title match that misses subcategories, suppressed/uncategorized BLPs, and the
birth-year-without-death-year shape (R2-3). "Thin contentious denylist = fine" is true and "thin BLP
floor = fine" is **not** true, and F5's framing risks conflating the two. **Verdict: accept F5 for
the contentious denylist; explicitly carve the BLP-floor coverage gap out of F5 and treat narrowing
it as requiring Sam's sign-off (G11).**

### Where else Round 1 is materially off
- **F1 scoped normalization too narrowly.** "The #1 thing to get right" was string prefix/case/underscore.
  It omits Unicode NF and category redirects (R2-8) and — more importantly — frames the floor as a
  *string-matching* problem when the deeper risk is *semantic membership* and *input non-reproducibility*
  (R2-2, R2-3). Normalization is necessary but nowhere near sufficient.
- **F4 (one combined call) ignores `cllimit=10` and the probe option.** F4 optimizes round-trips for
  the revision-content interaction but never notices that the BLP floor can be a single tiny
  `clcategories` probe decoupled from the 100KB content fetch entirely (R2-1) — which is both cleaner
  *and* safer than either of F4's options.
- **Round 1 never questioned "authoritative API."** Its entire frame trusts the API's category list
  as ground truth. R2-2 (job-queue/replica eventual consistency) is the biggest blind spot in
  Round 1, and it's a fail-OPEN that none of F1–F8 touch.

---

## Round 2 verdict

The design is salvageable and directionally right, but **two new CRITICAL fail-OPEN vectors that
Round 1 did not see** must be addressed before the spec freezes:

1. **R2-1** — anchor the BLP floor on a `clcategories` **probe**, not full-list enumeration. This
   single change deletes F2's entire failure class for the floor and is the highest-leverage fix in
   either round.
2. **R2-2** — stop calling the API category list "authoritative." It is eventually-consistent
   (job-queue + replica lag) and fail-OPENs on the freshest BLPs. Add one-way wikitext escalation
   signals (only ever *add* disqualifiers) and log decision inputs for reproducibility.

Beyond those: the BLP floor's *coverage* (R2-3) is narrower than G11's "period" floor implies, and
narrowing it silently would breach G11 — so the residual gap must be a **named, human-signed-off
limitation**, not an unstated one. Reshape the contract (R2-9) so the floor's input is first-class and
the enumerate-then-intersect anti-pattern is impossible to write by accident, and make the gold set
store **raw API envelopes** (R2-10) so the fail-OPEN paths are actually tested rather than asserted.

Round 1's instincts were sound; its blind spot was treating the data source as trustworthy and the
floor as a string-matching exercise. The floor is a *membership-under-eventual-consistency* exercise,
and that reframing drives every CRITICAL finding above.
