<!-- ABOUTME: Adversarial design review for the safe-lane (G11) gate — Round 3 (Claude), synthesizing + challenging Round 2. -->
<!-- ABOUTME: Converges the floor on a bounded category PROBE + fresh wikitext backstop; pushes back on R2-3; adds N1–N3. -->

# Safe-lane gate (G11) — adversarial design review, Round 3 (Claude)

(Throughout, **BLP** = *biography of a living person* — Wikipedia's policy class the hard floor excludes.)

Round 2 (Opus) was strong and shifted the frame correctly: the floor is a
*membership-under-eventual-consistency* problem, not a string-match. I accept R2-1 and R2-2 as the
two load-bearing reframes. Below I (a) **strengthen** R2-1 with live evidence, (b) **refine** R2-2's
fix and note where it doesn't close its own hole, (c) **push back** on R2-3's birth-year heuristic,
(d) **simplify** R2-7/R2-9's contract, and (e) add three findings Round 2 missed (N1–N3).

## Live evidence gathered this round (measure-first, against en.wikipedia)
- Categories/templates come back **prefixed** (`"Category:Living people"`, `"Template:Abbr"`) →
  F1/normalization mandatory. `Living people` is a **hidden** category → must not filter hidden.
- **R2-1 validated and extended:** `clcategories=Category:Living people|…` returns ONLY the matched
  denylist categories (BLP probe on Tim Berners-Lee → `['Category:Living people']`; on Artemis program
  → none), in ONE call, **no `continue`**. So we can probe the **union of BLP + contentious denylists**
  in a single bounded call and **never enumerate categories at all** — for the floor *or* the soft
  denylist.
- One combined `prop=revisions|categories|templates|info` call returns revid+wikitext+52 cats+217
  templates with no `continue` (so enumeration "works" but is unnecessary given the probe).

## A. Accept + strengthen R2-1 — probe the whole disqualifying set, enumerate nothing
The floor and the contentious-category denylist both reduce to: "is this page in any of *these specific*
categories?" Answer with a single `clcategories` probe over **(BLP-set ∪ contentious-category-denylist)**.
Result: the design **never enumerates categories**, so F2/R2-5's truncation/pagination failure class is
deleted everywhere, not just for the floor. `clcategories` is bounded by our list size, cannot truncate.
This is strictly better than R2-1's two-tier (probe for floor, enumerate for soft signal) — there's no
reason to enumerate at all.

## B. Refine R2-2 — union the probe with a FRESH wikitext scan; note the fix is partial; name the residual
R2-2 is right: `categorylinks` is job-queue + replica lagged, so the probe can fail-OPEN on a
freshly-(re)categorized BLP, and `maxlag` does not bound job-queue lag. Two refinements:
1. **`prop=templates` lags identically.** The templatelinks table is the same kind of derived,
   job-queued, replica-read structure. So detecting `{{POV}}`/`{{BLP}}` via the API is *also* stale.
   The genuinely fresh source is the **revision wikitext we already fetch for the detector**. Therefore
   move the dispute-template and BLP-literal/infobox detection to a **deterministic wikitext scan**, and
   make the BLP floor the **one-way union**: `human_only` if the `clcategories` probe matches **OR** the
   wikitext scan finds a BLP signal (`[[Category:Living people]]` literal, `{{Infobox person/officeholder/…}}`,
   `{{BLP…}}`). One-way: these only ever ADD disqualifiers, never clear the floor.
2. **The fix is partial — say so.** R2-2's own worst case (a `Living people` category injected *only*
   by a template, on an edit too fresh for the job queue, with no infobox-person signal in wikitext)
   is caught by neither the lagged probe nor the wikitext scan. This residual fail-OPEN cannot be
   eliminated at v1 without the primary DB. Per G11 ("period"), even a transient fail-OPEN is a floor
   weakening → it MUST be a **named limitation with Sam's explicit sign-off + a change-log rationale**,
   not an unstated gap. Mitigations that DON'T eliminate it but shrink/observe it: log the decision
   inputs incl. `revisionId` + `fetchedAt` (R2-6), and rely on the downstream human-verification gate
   (G5) as defence-in-depth (no edit ships without a human opening the source).

## C. Push back on R2-3 — DEFER the birth-year-without-death-year heuristic for v1; NAME the residual
R2-3 proposes treating "`X births` present AND no death category → fail-closed BLP." I disagree this
belongs in v1:
- **False-exclude + new dependency.** "Births without a death category" fires on every historical
  figure whose death category is merely missing (extremely common for pre-1900 bios). To bound it you
  need a recency cutoff (`born > asOfYear − N`), which injects an `asOfYear` input into the gate and a
  tuning parameter — added surface for a heuristic whose marginal catch is small.
- **Marginal value.** `Category:Living people` is bot/infobox-applied to ~every living-person bio;
  the population R2-3 targets (a living person with NO "Living people" category) is rare, and our tool's
  inputs are tech/procurement/infrastructure articles that carry *no* births category at all (so the
  heuristic never fires on them — confirmed: 0/136 fixtures are bios).
- **Verdict:** do NOT build the births-without-deaths heuristic in v1. Keep the BLP-set probe + fresh
  wikitext union (A+B). **Agree with R2-3's other half:** the floor is a *category/wikitext signal*, not a
  *BLP oracle*; the suppressed/uncategorized-BLP residual is real and MUST be a named, Sam-signed-off
  limitation (same disposition as B's residual). I'm rejecting the *mechanism*, keeping the *honesty*.

## D. Simplify R2-7/R2-9 — advisory signals are best-effort; only the probe + namespace are load-bearing
R2-7 wants per-signal `categoriesStatus`/`templatesStatus`. With A (probe, no enumeration) this is
unnecessary. Reasoning: the dispute-template and contentious-category checks are **one-way ADD-ons** to
`human_only`. An *incomplete* advisory signal can only cause a soft **false-negative** (miss a
disqualifier) — which cannot fail-OPEN the **floor** (the floor is the probe + namespace + wikitext-BLP
union). The contentious denylist is already "deliberately imperfect" (F5), so a missed soft signal is
within its accepted tolerance. So drop the status bits. The only definitiveness that matters is the
**probe outcome** (`ok` vs `unknown`-on-error) and the **namespace**. Simpler contract:
```
ArticleMetadata = {
  resolvedPageId, resolvedTitle, revisionId, namespace,          // identity (one resolved page — R2-4)
  blockingCategories: string[],   // denylisted categories the probe matched (BLP ∪ contentious); [] = none
  probeStatus: "ok" | "unknown",  // "unknown" (fetch/probe error) → fail-closed
  wikitextSignals: string[],      // fresh deterministic codes from the revision wikitext (BLP/dispute)
  fetchedAt,                       // audit reproducibility (R2-6)
}
```
The gate: `human_only` if `probeStatus==="unknown"` OR `namespace!==0` OR `blockingCategories` non-empty
OR `wikitextSignals` contains a disqualifier; else `easy_win`. Reasons emitted in **canonical order**
(R2-11): `metadata_unavailable`, `non_mainspace`, `blp_category`, then sorted `denied_category:*`,
sorted `dispute_template:*`, `blp_wikitext`. Keeps R2-9's "floor input is first-class, enumerate-then-
intersect is unwritable-by-accident" intent without R2-7's extra status axes.

## New findings Round 2 missed

### N1 — [HIGH, fail-OPEN] The denylist canonical titles are themselves safety-critical and silently fragile
The probe is only as good as the EXACT category titles we send. A typo (`Living People`), a Wikipedia
rename, or a missing variant → the probe returns `absent` → fail-OPEN, with no error. Mitigations:
(a) the eligibility gold set MUST include a real, frozen BLP envelope **per primary BLP category**
(at least `Living people`; ideally `Possibly living people`, `Recent deaths`) so a typo in any of them
breaks CI; (b) a maintenance note + dated "re-verify against live Wikipedia" cadence (the compliance doc
already mandates periodic re-verification of WP rules — fold the category-name check in); (c) consider a
non-committed, opt-in live "canary" check that the BLP categories still exist on en.wikipedia (NOT in
the deterministic suite — it's network).

### N2 — [MEDIUM, scope] The en.wikipedia assumption is unstated and baked in
The ingest endpoint (`en.wikipedia.org`) and every denylist title are **en.wikipedia-specific**. A
future multi-wiki expansion would silently run an English BLP denylist against another language's
categories → fail-OPEN. State "en.wikipedia only" as an explicit v1 scope boundary in the design and a
precondition assertion (the ingest already hardcodes the host; document *why* the gate may assume it).

### N3 — [MEDIUM, architectural] The read path drops the verdict — reopens the "don't persist" decision
Decision (3) was compute-on-the-fly + audit, no DB column. But `GET /api/articles/:id/candidates`
re-reads persisted candidates with **no eligibility verdict attached**. Recomputing eligibility on read
means a Wikimedia fetch per read (violates G14, and is absurd for a list view). So the durable read path
**cannot carry the floor verdict** unless we persist it. For v1 there's no easy-win queue consuming it,
so this is a latent seam rather than an active breach — but "wire it now" (Sam) + fail-closed favour
closing it. **Recommendation: flip decision (3) to persist the verdict** — a small additive migration
adding `eligibility TEXT` + `eligibility_reasons TEXT` to `articles`, set in `lookupAndPersist`, returned
by both endpoints, shown in the UI. This also forces the `freshTestDb`/schema work to apply *all*
migrations (a clean improvement). Surface this flip to Sam explicitly since he originally picked
on-the-fly. (If Sam prefers to keep v1 column-free, the fallback is: document that `GET /candidates`
returns *detected candidates, not easy-wins*, and that no easy-win consumer may exist without consulting
the gate — but persisting is the cleaner fail-closed answer.)

## Round 3 verdict
Converged design: **(1)** floor = one `clcategories` probe over (BLP ∪ contentious) — no enumeration,
truncation-proof (A); **(2)** one-way union with a fresh deterministic **wikitext scan** for BLP +
dispute signals, since both `categorylinks` and `templatelinks` lag (B); **(3)** simplified contract,
advisory signals best-effort, only probe-definitiveness + namespace load-bearing (D); **(4)** two named,
Sam-signed-off residual fail-OPENs (eventual-consistency template-injection B; suppressed/uncategorized
BLP C) — G11 requires sign-off to ship these; **(5)** persist the verdict (N3) so the read path carries
the floor. Rejected R2-3's births-without-deaths heuristic. Open for Round 4 (Opus) to attack: the
wikitext-scan signal list (is it deterministic + sufficient? false-positive infobox-person on dead
people?), the union's one-way correctness, N3's migration, and whether the two named residuals are
truly the minimal honest set.
