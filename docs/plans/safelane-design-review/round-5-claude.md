<!-- ABOUTME: Adversarial design review for the safe-lane (G11) gate — Round 5 (Claude, final synthesis + decisions). -->
<!-- ABOUTME: Resolves every R4 finding, reverses two of my own earlier picks, and fixes the honestly-named residual set. -->

# Safe-lane gate (G11) — adversarial design review, Round 5 (Claude, final)

(Throughout, **BLP** = *biography of a living person* — the Wikipedia policy class the hard floor excludes.)

Five rounds converged. Round 4 (Opus) landed two CRITICAL fail-OPENs rounds 1–3 missed (two-snapshot
skew R4-1; wikitext-scan false-OPENs R4-2) and a decisive correction to my own Round-3 persistence
flip (R4-5). This round makes the final decisions, **reverses two of my earlier picks**, and pins the
honestly-named residual set. Decisions are binding for the spec.

## Decisions on every Round-4 finding

**R4-1 (two-snapshot skew) → ACCEPT, fix by construction.** The floor must read from ONE atomic API
response. The ingest issues a single combined `prop=revisions|categories|info` call with
`clcategories=<BLP-set>` and `rvprop=content|ids|timestamp`, so wikitext, `revisionId`, revision
timestamp, namespace, and the BLP-probe result all come from the same `pages[0]`. **Contract invariant:
every `ArticleMetadata` field comes from one resolved page object of one response** (extends R2-4). This
deletes the skew (my Round-3 "validate the probe as a standalone call" was an *evidence* step, not the
production shape — the production shape is the combined call).

**R4-2 (wikitext-scan false-OPENs) → ACCEPT; demote the scan; ADD a freshness fail-closed.** The
BLP-wikitext scan cannot be a floor backstop: template-injected categories and wrapper/specialized
infoboxes (`{{Infobox sportsperson}}`, hundreds of variants) never appear literally in wikitext, so
infobox-name matching is incomplete and unmaintainable. **Decisions:**
- **Drop infobox-name matching entirely** (false confidence, unmaintainable). 
- Keep only a **bounded, advisory** wikitext scan: presence of a literal `[[Category:Living people]]`
  (and BLP-set variants) and of dispute templates (`{{POV}}`, `{{Disputed}}`, …), after stripping HTML
  comments and `<nowiki>` spans, matched by normalized (first-letter-insensitive, `_`/space-folded,
  `{{\s*`-tolerant) names. These only ever ADD `human_only`; the design does NOT claim they close the
  eventual-consistency hole.
- **Adopt R4-2c — a freshness fail-closed as the real backstop:** if the resolved revision's timestamp
  is within a short window of "now" (default **15 minutes**, a named tunable constant), return
  `human_only(recently_edited)`. Rationale: the categorylinks lag the probe can't see is a
  seconds-to-minutes job-queue/replica window; routing very-recently-edited pages to human-only closes
  it deterministically and, as a bonus, also catches R4-8 (vandalism category-removal) *within* the
  window. "Now" is **injected** into the gate (exactly like `asOfYear` in the detector), so the gate
  stays clock-free and frozen-testable. Cost: rare false-excludes (few looked-up articles were edited in
  the last 15 min); fail-closed philosophy makes that the correct trade.

  *Challenge to R4-2c (mine):* R4 proposed freshness without sizing the over-exclusion. I sized it: a
  short (minutes) window targets the lag window specifically, not a broad volatility gate (a multi-hour
  window would gut utility). 15 min is the floor of "comfortably past typical job-queue lag" with
  negligible false-excludes. Documented as tunable. **This is the one genuinely-added v1 component and
  the one I'll flag to Sam as a judgment call** (include freshness vs name-the-residual-only).

**R4-3 (canonicalization + category redirects) → ACCEPT.** Canonicalize denylist titles at module load
(first-letter upper, `_`→space, NFC, trim, normalize `Category:` prefix) with a unit test; enumerate any
known soft-redirect aliases of the BLP categories into the set; add a **non-committed live canary**
(opt-in, network) asserting each BLP denylist title still resolves to a real, non-redirected en.wikipedia
category. Unknown category redirects/renames fold into named residual (ii).

**R4-4 (50-value `clcategories` ceiling) → ACCEPT, and it dissolves because of a scope cut.** The BLP set
is tiny (~3–6 titles), far under 50, and goes in the combined floor call. **Decision: DEFER the
contentious-category (topic) denylist out of v1 entirely** (it overlaps the deferred claim-level
contentiousness work, is the weakest G11 mechanism, and is where the 50-ceiling risk lives). So v1
probes ONLY the BLP set — never near 50. Assert `|BLP-set| ≤ 50` as an invariant test; when the
contentious denylist is built later it gets its OWN probe call(s), never sharing the floor's budget.
G11's "exclude flagged/disputed" is covered in v1 by the dispute-template signal; the broader
topic-category denylist is named-deferred.

**R4-5 (durable persistence fail-OPEN) → ACCEPT, and I REVERSE my Round-3 N3 flip.** R4-5 is right: a
bare persisted `easy_win` becomes a *durable* fail-OPEN once the subject becomes a BLP, and it *freezes*
the eventual-consistency error instead of letting a re-fetch self-heal. Since v1 has **no easy-win
consumer**, persisting buys nothing and adds a durable fail-OPEN surface. **Decision: v1 does NOT persist
the verdict** (reverting N3 back to my original pick, now for a sharper reason). v1 computes eligibility
on the fly, returns it in the `LookupResult`, shows it in the UI, and **audit-logs it (codes only)**.
Enforcement model, stated as an invariant in the design + pitfalls: *`GET /api/articles/:id/candidates`
returns DETECTED candidates, not easy-wins; no easy-win path may exist without calling the gate at
point-of-use.* When the easy-win queue is built, any persisted verdict MUST be revision-bound +
`gate_version`-stamped + re-validated at point-of-use (R4-5) — captured now as a forward invariant, not
built now. Net: both my Round-3 flip and its reversal converge on "no v1 persistence," but the reasoning
is now correct (point-of-use re-eval beats a stale durable flag).

**R4-6 (fetchedAt clock fidelity) → ACCEPT.** Capture `fetchedAt` (and the revision timestamp) inside
`fetchArticle` at response-parse time; thread through `ArticleMetadata`; the freshness check consumes the
injected "now" vs that captured revision timestamp. No `new Date()` downstream in the decision path.

**R4-7 (probe/scan disagreement) → ACCEPT (audit only).** Record `(probeFired, wikitextFired)` as a
2-bit audit code; the union resolves fail-closed so there's no fail-OPEN, but persistent disagreement is
a denylist-quality signal worth logging. Cheap; makes the residual list honest.

**R4-8 / R4-9 → ACCEPT as named residuals.** (iii) current-revision category removal beyond the freshness
window; (iv) BLP-by-talk-page-banner-only — **drop the talk-page-banner from the signal list** (it lives
on `Talk:`, which v1 does not fetch — listing an unreachable signal was misleading) and name it as a
residual. No talk-page fetch in v1 (G14, scope).

**R4-10 (contract split) → ACCEPT.** Floor inputs are first-class and separate from advisory ones (below).

## Challenge to Round 4's births-without-deaths re-opening (R4 §"On rejecting R2-3")
R4 agrees v1 should defer it but argues a **wikitext-literal birth-year** variant is *fresher* than the
lagged `Living people` probe on new stubs. Fair and correct in principle — but it only matters for
**biography inputs**, and v1's input scope is explicitly non-biographical (0/136 fixtures are bios; the
tool targets temporal claims in tech/procurement/infrastructure). So for v1 it stays **deferred**, and I
record R4's refinement as the *named leading candidate* for the day the tool's scope includes biographies
(ties to the en-wiki/scope boundary N2). Not built in v1.

## Final converged design (binding for the spec)

**Floor (load-bearing, fail-closed):**
1. **BLP-category probe** — combined atomic call, `clcategories=<BLP-set>`; any match → `human_only(blp_category)`.
2. **Namespace** — resolved `ns !== 0` → `human_only(non_mainspace)`.
3. **Freshness** — resolved-revision-timestamp within the window of injected-now → `human_only(recently_edited)`.
4. **Probe definitiveness** — fetch/probe error → `human_only(metadata_unavailable)` (fail-closed on uncertainty).

**Advisory (one-way ADD `human_only`, best-effort, never clears the floor):**
5. Wikitext literal `[[Category:Living people]]`/variants → `human_only(blp_wikitext)`.
6. Wikitext dispute templates (`{{POV}}`, `{{Disputed}}`, `{{Contradict}}`, `{{Current}}`, …) → `human_only(dispute_template:<x>)`.

`easy_win` iff none of 1–6 fire. Reasons emitted in canonical order (R2-11). Decision + inputs
audit-logged as codes/identifiers (R2-6): `pageId, revisionId, namespace, blpProbe(present|absent),
recentlyEdited(bool), matched codes, fetchedAt, gate_version, (probeFired,wikitextFired)`.

**Contract:**
```
ArticleMetadata = {
  resolvedPageId, resolvedTitle, revisionId, revisionTimestamp, namespace,   // one resolved page, one response (R4-1)
  blpProbe: "present" | "absent" | "unknown",   // load-bearing floor input (probe; unknown = fetch error)
  wikitext: string,                              // for the advisory deterministic scan (same snapshot)
  fetchedAt,                                     // captured at response parse (R4-6)
}
evaluateEligibility(meta, now, gateVersion) -> { eligibility, reasons[] }   // now injected; clock-free, total, pure
```

**Module layout:** `src/safelane/eligibility.ts` (pure gate), `src/safelane/denylists.ts` (BLP-set +
dispute-template set + canonicalizer, with maintenance/re-verify note), `src/safelane/wikitext-signals.ts`
(deterministic comment/nowiki-stripping scan); ingest extended for the combined metadata call; wired in
`lookupAndPersist`; surfaced in `LookupResult` + UI + audit. Gold set = **frozen raw API envelopes**
(R2-10): a hidden-`Living people` BLP, a redirect-to-BLP, a broken-redirect/`unknown`, a non-mainspace, a
recently-edited (freshness) case, a clean non-BLP (from the existing corpus), and a per-BLP-category case
(N1). Composition guard asserts shape coverage, not just counts.

## The honestly-named residual fail-OPENs (G11 requires Sam's sign-off to ship these)
1. **(i) Eventual-consistency beyond the freshness window** — categorylinks still lagged for a BLP edited
   longer ago than the freshness threshold. Mitigated within the window (freshness fail-closed); rare beyond.
2. **(ii) Suppressed / uncategorized / subcategory / category-redirected BLPs** not carrying an enumerated
   BLP-set title — the probe is closed-world exact-match by construction.
3. **(iii) Current-revision category removal** (vandalism/error) beyond the freshness window — a BLP whose
   current revision doesn't say so; needs cross-revision history we don't do.
4. **(iv) BLP-by-talk-page-banner-only** — `{{WikiProject Biography|living=yes}}` lives on `Talk:`, which
   v1 does not fetch.

All four are mitigated by **defense-in-depth**: the downstream human-verification gate (G5 — no edit
ships without a human opening the source) and the freshness fail-closed (covers (i)/(iii) within window).
Per G11 ("excluded… period"), these narrow the floor and so require **explicit human sign-off + a
change-log rationale** in the compliance doc before the gate ships. This naming is itself the G11 honesty
requirement — the alternative (an unstated gap) is the actual violation.

## Round 5 verdict — DESIGN FROZEN pending two things from Sam
1. **A judgment call:** include the **freshness fail-closed** (recently-edited → human_only, ~15 min) in
   v1 — my recommendation, the one sound mitigation for the deepest fail-OPEN — vs name-the-residual-only.
2. **G11 sign-off** on the four named residual fail-OPENs (i)–(iv) as the documented, accepted v1 limits,
   recorded in `docs/policy/wikipedia-genai-compliance.md`'s change log. **This is a sacrosanct-contract
   touch — I will not weaken the floor's framing without your explicit yes.**

Everything else is decided. On Sam's answers I write the spec to `docs/superpowers/specs/`, self-review,
and hand it back before the implementation plan.
