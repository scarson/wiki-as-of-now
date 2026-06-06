<!-- ABOUTME: Adversarial design review for the safe-lane (G11) gate — Round 1 (Claude, self-critique). -->
<!-- ABOUTME: Attacks the design for fail-OPEN risk, fail-closed correctness, determinism, and under-build. -->

# Safe-lane gate (G11) — adversarial design review, Round 1 (Claude)

Reviewer lens: **a fail-closed BLP floor whose worst outcome is a silent fail-OPEN** (a BLP
article wrongly marked `easy_win`). Every finding is rated by that lens.

## F1 — [CRITICAL, fail-OPEN] Category-name normalization is unspecified — the most likely way the floor silently breaks
The gate matches `categories ∩ BLP-set`. But the MediaWiki API (`prop=categories`,
`formatversion=2`) returns category titles **with the namespace prefix and spaces**, e.g.
`"Category:Living people"` — not `"Living people"`. If the BLP-set holds `"Living people"`
and matching is naïve `Array.includes`, **every BLP article passes the floor** (fail-OPEN).
Same trap with underscore-vs-space (`Living_people`) and MediaWiki's first-letter-uppercase
title rule.
**Fix:** specify a single canonical normalization applied to BOTH the API output and the
denylist constants: strip a leading `Category:` (case-insensitive), trim, collapse
underscores→spaces, and compare case-insensitively (defensive — more fail-closed than
exact). The gold set MUST feed the gate the **raw API title shape** (`"Category:Living
people"`), never a pre-cleaned string, or the test gives false confidence. This is the #1
thing to get right.

## F2 — [HIGH] `complete` conflates two cases and creates a fail-closed-to-uselessness trap on templates
I lumped "fetch failed" and "list truncated" into one `complete` flag. Two problems:
(a) **Templates routinely exceed the 500-item API page** on large articles; if ANY
truncation → `human_only`, then most big articles are excluded — fail-closed so aggressively
the tool is useless on exactly the high-traffic articles it targets.
(b) **Categories rarely exceed 500**, and category-completeness is what the *BLP floor*
actually depends on.
**Fix:** the ingest must **paginate metadata to completeness** (follow the `continue` token)
rather than fail-closed on first truncation. `complete:false` is reserved for a genuine
*pagination/fetch error*, not normal multi-page results. Categories drive the floor and must
be complete; templates (a softer signal) should also be paginated, but if pagination fails
the conservative result is still `human_only`. State the pagination contract explicitly.

## F3 — [MEDIUM, architectural] The v1 gate is advisory-only — nothing prevents a future easy-win path from bypassing it
There is no easy-win queue yet, so v1 computes + surfaces + audits a verdict but *enforces*
nothing. Risk: a later milestone builds the queue and forgets to consult the gate → the
fail-closed floor is silently absent in production.
**Fix:** make `evaluateEligibility` the **single source** of easy-win eligibility and state
the invariant in the design + compliance-adjacent docs: *no code may surface an "easy win"
without an `easy_win` verdict from this function.* Consider a typed shape that makes the
verdict a required precondition of any future "easy win" object (so the queue cannot be built
without it). At minimum, document it as a hard precondition and add it to the pitfalls so a
future agent hits it on the normal path.

## F4 — [MEDIUM] One combined API call vs metadata pagination — interaction with revision content
Adding `categories|templates|info` to the existing `prop=revisions` call is efficient (one
round trip, good for G14), but `continue`-pagination of categories/templates interacts with
the (large) revision content — you don't want to re-pull 100KB of wikitext on each continue.
**Fix:** either (a) one initial combined call + continue requests that drop `rvprop` content
on the continuations, or (b) split into a content fetch and a separate paginated metadata
fetch (cleaner code, one extra round trip). Recommend (b) for clarity unless the extra call
is a real concern; decide explicitly. Whichever, the metadata fetch is its own testable unit.

## F5 — [MEDIUM] Contentious-category denylist: under-build vs false-exclude
A near-empty category denylist under-delivers the "topic/category denylist" component of
G11; a broad one causes false-excludes of legitimate articles. The honest position: the
*load-bearing* mechanisms are the BLP floor + namespace + dispute-template denylist; the
contentious-*category* denylist overlaps heavily with the (deferred) claim-level
contentiousness work.
**Fix:** seed the category denylist **small, curated, and explicitly documented as partial**,
and state in the design that broad topic-contentiousness is deferred with claim-level work —
so "thin v1 category denylist" is a *named decision*, not an accidental gap.

## F6 — [MEDIUM] BLP set omits the recently-deceased, who are still under WP:BLP
WP:BLP extends to the recently deceased (roughly 6mo–2yr). My set
(`Living people`, `Possibly living people`, `Year of birth missing (living people)`) misses
`Recent deaths` and recently-deceased articles.
**Fix:** add recently-deceased-indicating categories to the fail-closed set (conservative);
document the set as the curated WP:BLPCAT machine signal with a maintenance note to re-verify
against live Wikipedia category names.

## F7 — [LOW] Audit event modeling
Two events per lookup (`article.lookup` + `article.eligibility`) vs folding eligibility into
the lookup payload. A separate `article.eligibility` event is cleaner for a "decisions"
audit trail; specify the exact identifiers-only payload (`pageId`, `eligibility`, `reasons[]`
as codes) and that reason codes carry **no free-text article content**.

## F8 — [LOW] Title-case / Unicode edge in category compare
MediaWiki titles are first-letter-case-insensitive but otherwise case-sensitive, and may
carry Unicode. Folded into F1's normalization, but call it out: normalize via a documented
function with a unit test over `Category:Living people` / `Living_people` / `living people`.

## Round 1 verdict
Design is directionally sound but has **one fail-OPEN landmine (F1)** and **one
fail-closed-to-uselessness trap (F2)** that MUST be fixed before the spec. F3 (advisory-only
enforcement) is the subtle architectural risk to the actual guarantee. Carrying F1–F8 into
Round 2 for an independent (Opus) reviewer to attack — especially to find failure modes I'm
blind to and to challenge F2's "paginate to completeness" and F5's "thin denylist is fine."
