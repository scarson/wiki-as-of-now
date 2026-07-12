<!-- ABOUTME: Design for the safe-lane eligibility gate (G11) — deterministic, fail-closed exclusion of biographies of living persons (BLP) + other non-eligible articles. -->
<!-- ABOUTME: Floor = atomic category probe + namespace + freshness; advisory wikitext signals; four signed-off residuals. -->

# Design — Safe-lane eligibility gate (G11)

**Status:** approved (Sam, 2026-06-06) — design gate passed after a 5-round adversarial review.
**Review trail:** `docs/plans/safelane-design-review/round-{1..5}-*.md` (R1/R3/R5 Claude, R2/R4 Opus).
**Source prompt:** `docs/handoff/2026-06-05-next-safe-lane-gate.md`.
**Compliance anchor:** `docs/policy/wikipedia-genai-compliance.md` — the **stay-in-the-safe-lane (G11)**
guardrail (sacrosanct; its fail-closed BLP floor can only be weakened with explicit human sign-off +
change-log rationale), plus **detection-is-deterministic (G10)**, **audit-log-is-foundational (G13)**,
**responsible-Wikimedia-access (G14)**, **fetched-content-is-untrusted (G15)**.
**Spec anchors:** design spec §13 (data model), §16 (boundaries), §26 (invariants + build order).
**Builds on:** the merged single-article persistence slice (`src/ingest/wikimedia.ts`, `src/ingest/lookup.ts`,
`src/db/*`, the detector).

---

## 1. Goal and non-goals

**Goal.** A deterministic, LLM-free, fail-closed **eligibility gate** that sits between detection and any
future "easy-win" surface. It maps an article's authoritative metadata → `easy_win` | `human_only`
(+ machine reason codes), and above all enforces G11's hard floor: **a biography-of-living-persons (BLP)
article is excluded from the easy-win lane by default.** Fail-closed: default to `human_only` whenever any
check fails or any input is uncertain; return `easy_win` only when an article clearly passes every check.

**Non-goals / explicit scope cuts (each named, none silent):**
- **No LLM anywhere in this path** (G10/G11). Detector and gold sets untouched — consume only.
- **Claim-level contentiousness deferred** — v1 is article-level (BLP-article exclusion + namespace +
  dispute signals). "Contentious/sensitive claim *about* a named living person" is a later milestone;
  merely naming an official in a routine fact stays eligible.
- **Contentious-topic-category denylist deferred** — the weakest G11 mechanism, overlaps the deferred
  claim-level work, and is where the `clcategories` 50-value request ceiling would bite. v1's
  "flagged/disputed" coverage comes from the dispute-template signal. Named-deferred, not dropped.
- **No durable persistence of the verdict in v1** — see §6; computed on the fly, returned, audited.
- **en.wikipedia only** — endpoint and denylist titles are en-specific; stated as a v1 boundary.
- **Talk pages not fetched** — `{{WikiProject Biography|living=yes}}` lives on `Talk:`; out of v1 scope
  (named residual iv).
- No auth, no research/Gemini, no easy-win queue/UI beyond surfacing the verdict.

---

## 2. The eligibility gate (`src/safelane/eligibility.ts`)

Pure, deterministic, **total**, clock-free function:

```ts
evaluateEligibility(meta: ArticleMetadata, now: Date, gateVersion: string): EligibilityDecision
```

```ts
interface ArticleMetadata {                 // every field from ONE resolved page of ONE response (§5)
  resolvedPageId: number;
  resolvedTitle: string;
  revisionId: number;
  revisionTimestamp: string;                // ISO 8601, from the same response
  namespace: number;                        // 0 = mainspace
  blpProbe: "present" | "absent" | "unknown"; // clcategories result for the BLP-set; "unknown" = fetch/probe error
  wikitext: string;                         // same-snapshot revision content, for the advisory scan
  fetchedAt: string;                        // captured at response-parse time (§5)
}
interface EligibilityDecision {
  eligibility: "easy_win" | "human_only";
  reasons: string[];                        // canonical-ordered machine codes; never free text
}
```

**Checks — `human_only` if ANY fire; `easy_win` only if none do.** Floor checks are load-bearing;
advisory checks only ever ADD `human_only` (one-way), never clear the floor.

| # | Kind | Condition | Reason code |
|---|------|-----------|-------------|
| 1 | floor | `blpProbe === "unknown"` | `metadata_unavailable` |
| 2 | floor | `namespace !== 0` | `non_mainspace` |
| 3 | floor | `blpProbe === "present"` | `blp_category` |
| 4 | floor | `now − revisionTimestamp < FRESHNESS_WINDOW` | `recently_edited` |
| 5 | advisory | wikitext contains a literal BLP-set category | `blp_wikitext` |
| 6 | advisory | wikitext contains a denylisted dispute template | `dispute_template:<name>` |

**Canonical reason order** (deterministic, byte-reproducible — R2-11): `metadata_unavailable`,
`non_mainspace`, `blp_category`, `recently_edited`, `blp_wikitext`, then `dispute_template:*` sorted
lexicographically. `now` is **injected** (like the detector's `asOfYear`) so the gate is clock-free and
frozen-testable; `FRESHNESS_WINDOW` is a named constant (**default 15 minutes**, documented tunable).

**Why this shape (review-derived):** the floor reads a single definitive BLP-membership answer
(`blpProbe`), not an enumerated category list — so it is immune to list truncation/pagination
(`clcategories` probe, R2-1). The freshness check (R4-2c) is the only sound deterministic mitigation for
the category-table lag that the probe cannot see (§7). Advisory wikitext signals can only tighten, never
loosen, so their incompleteness cannot fail-OPEN the floor (R4-10).

---

## 3. Denylists & canonicalization (`src/safelane/denylists.ts`)

- **BLP-category set** (the floor's probe targets): `Living people`, `Possibly living people`,
  `Year of birth missing (living people)`, `Recent deaths`, plus any known soft-redirect aliases of these
  (curated). Documented as the machine-readable WP:BLPCAT signal, with a **maintenance note to re-verify
  against live en.wikipedia** on the compliance doc's review cadence. **Invariant test:** `|BLP-set| ≤ 50`
  (the `clcategories` request ceiling — R4-4).
- **Dispute-template set** (advisory wikitext scan): `POV`, `Disputed`, `Disputed inline`, `Contradict`,
  `Current`, `BLP`, `BLP sources` (conservative, extensible).
- **Canonicalizer** (`canonicalizeCategoryTitle` / `canonicalizeTemplateName`): strip a leading
  `Category:`/`Template:` (case-insensitive), trim, fold `_`→space, **NFC-normalize**, uppercase the
  first letter only (MediaWiki rule — the rest is case-sensitive). Applied to denylist constants at module
  load AND to scanned wikitext tokens. **Unit-tested** so a malformed constant breaks CI, not production
  (N1/R4-3). The `clcategories` probe is sent canonical titles; empirically the API itself folds
  underscores + first-letter case but is case-sensitive on the rest — so exact non-first-letter casing of
  constants is safety-critical and the per-category gold cases (§8) guard it.

---

## 4. Wikitext signal scan (`src/safelane/wikitext-signals.ts`)

Pure, deterministic `scanWikitextSignals(wikitext): string[]` returning advisory reason codes. **Strip HTML
comments (`<!-- … -->`) and `<nowiki>…</nowiki>` spans first** so they cannot hide a live signal (R4-2);
then match (a) literal `[[Category:<BLP-set>]]` occurrences and (b) `{{<dispute-template>}}` invocations,
both via the normalized, whitespace-tolerant (`{{\s*`, `_`/space-folded, first-letter-insensitive)
matcher. **Infobox-name matching is intentionally NOT done** — wrapper/specialized person-infoboxes
(`{{Infobox sportsperson}}`, hundreds of variants) and template-injected categories never appear literally
in wikitext, so infobox-name matching is incomplete-by-construction and unmaintainable (R4-2); claiming it
as a backstop is false confidence. These signals are advisory (one-way); the design does not claim they
close the eventual-consistency hole.

---

## 5. Ingest extension (`src/ingest/wikimedia.ts`)

Extend the single combined Action-API call to fetch metadata in **one atomic response** (R4-1 — no
two-snapshot skew): `prop=revisions|categories|info`, `rvprop=content|ids|timestamp`, `rvslots=main`,
`clcategories=<canonical BLP-set, pipe-joined>`, plus the existing `maxlag=5`, `formatversion=2`,
`redirects=1`. From the single `pages[0]`:
- `resolvedPageId`, `resolvedTitle`, `namespace` (`ns`), `revisionId`, `revisionTimestamp`
  (`revisions[0].timestamp`), `wikitext` (`revisions[0].slots.main.content`).
- `blpProbe`: `present` if `pages[0].categories` (the `clcategories`-filtered matches) is non-empty;
  `absent` if the call succeeded and the membership is **definitively** none; `unknown` if the call
  returned but BLP membership cannot be read definitively (a `clcategories` `toomanyvalues`/truncation
  warning, or a malformed/absent categories field) → fail-closed `metadata_unavailable`.
  **Total fetch failures keep their existing typed-error behavior** and abort the lookup before the gate
  runs: `ArticleNotFoundError` → 404, `WikimediaUnavailableError` (network/`maxlag`) → 503. So `unknown`
  is the in-band "response present but indeterminate" guard, not the network-down case.
- `fetchedAt`: captured **at response-parse time** inside the fetch (R4-6), not by a downstream
  `new Date()`.

**Contract invariant (asserted):** all `ArticleMetadata` fields derive from one `pages[0]` of one response.
**G14:** still one article, descriptive UA, `maxlag`. **G15:** wikitext is untrusted data — parsed/scanned
deterministically, never instructions, never to a model, never logged verbatim. Notes: `Living people` is a
**hidden** category but `clcategories` returns it regardless (no `clshow` filter — empirically confirmed);
the BLP-set is small so the request never approaches the 50-value ceiling and never paginates.

---

## 6. Wiring, audit, and the no-persistence decision

`lookupAndPersist` (`src/ingest/lookup.ts`): after fetch+detect+persist (unchanged), build
`ArticleMetadata`, call `evaluateEligibility(meta, now, GATE_VERSION)` (`now = new Date()` supplied by the
app layer, injectable in tests), include `eligibility` + `reasons` in `LookupResult`, and **audit-log an
`article.eligibility` event** with identifiers/codes only (R2-6/G13): `pageId`, `revisionId`, `namespace`,
`blpProbe`, `recentlyEdited`, matched reason codes, `fetchedAt`, `gateVersion`, and `(probeFired,
wikitextFired)` (R4-7). No title/wikitext/PII.

**No durable persistence in v1 (R4-5 — reversal of an earlier draft).** A stored `easy_win` becomes a
*durable* fail-OPEN once a subject later becomes a BLP, and freezes the category-lag error instead of
letting a re-fetch self-heal. With **no easy-win consumer in v1**, persisting buys nothing and adds a
durable fail-OPEN surface. So the verdict is computed on the fly, returned, shown, and audited only.
**Forward invariant (design + pitfalls):** `GET /api/articles/:id/candidates` returns *detected
candidates, not easy-wins*; **no easy-win path may surface an article without calling the gate at
point-of-use.** When the easy-win queue is built, any persisted verdict MUST be bound to
`(page_id, revision_id, gate_version)` and re-validated at point-of-use — captured now, not built now.

**API + UI:** the `POST /api/articles/lookup` response carries `eligibility` + `reasons`; the UI shows a
clear per-article banner ("Eligible for easy-win lane" vs "Human-only — excluded: <reasons>"). Detector
output still renders; the banner governs whether anything is offered as an *easy win* (nothing is, in v1).

---

## 7. Freshness fail-closed (the category-lag backstop)

MediaWiki's `categorylinks` is populated by the deferred job queue and read from lagging replicas;
`maxlag` bounds replica lag, not job-queue lag (R2-2). So a freshly-(re)categorized BLP can briefly probe
`absent`. The freshness check (#4) routes any article whose resolved revision is younger than
`FRESHNESS_WINDOW` (default 15 min) to `human_only(recently_edited)` — a deterministic, enumeration-free,
fail-closed mitigation that also catches recent category-removal vandalism within the window (R4-8). Cost:
rare false-excludes of just-edited articles (few looked-up articles were edited in the last 15 min);
fail-closed philosophy makes that the correct trade. The window is a named, tunable constant.

---

## 8. Testing & measure-first

- **Gate** (`test/safelane/eligibility.test.ts`): each floor + advisory branch; canonical reason order;
  `easy_win` only when all clear; injected `now` for the freshness branch (frozen, deterministic).
- **Canonicalizer + wikitext scan**: unit-tested incl. comment/`<nowiki>` stripping, whitespace/underscore
  tolerance, NFC, and a deliberately mis-cased constant caught by a test.
- **Eligibility gold set** (`test/gold/eligibility-set.json`) — **frozen raw API response envelopes**
  captured from live en.wikipedia (committed; suite stays network-free — R2-10): a hidden-`Living people`
  BLP (per primary BLP category — N1), a redirect-to-BLP, an indeterminate-membership (`unknown`) envelope
  (synthetic `clcategories` truncation/warning shape), a non-mainspace page, a recently-edited (freshness)
  case, and a clean non-BLP from the existing corpus. (A broken/missing redirect target is an ingest 404,
  tested in the ingest suite, not a gate case.) **Composition
  guard** asserts *shape coverage* (≥1 each of: BLP-present, definitively-absent, `unknown`, non-mainspace,
  recently-edited) plus ≥N positives AND ≥N negatives — not just counts (R2-10). The gate consumes the
  **raw envelope** via the ingest mapper, never pre-cleaned fields, so the normalization/probe paths are
  actually exercised.
- **Ingest** (`test/ingest/wikimedia.test.ts` additions): injected `fetchFn` returns a canned combined
  envelope; assert the request carries `clcategories=<canonical BLP-set>` and the new props, and that
  `blpProbe`/`revisionTimestamp`/`fetchedAt` map correctly; `unknown` on fetch error.
- **Orchestrator** (`test/ingest/lookup.test.ts` additions): a BLP envelope → `human_only`/`blp_category`
  + one identifiers-only `article.eligibility` audit row; a non-BLP → `easy_win`; a recently-edited
  envelope → `recently_edited`. All gates green + pristine (testing-pitfalls §1/§8/§9). No network in
  committed tests.

---

## 9. The named residual fail-OPENs (G11 sign-off obtained 2026-06-06)

A deterministic gate over public category data cannot be a perfect BLP oracle. Four narrow residuals
remain, **signed off by Sam** and recorded in the compliance change log:
(i) category-table lag *beyond* the freshness window; (ii) suppressed / uncategorized / sub-categorized /
unknown-category-redirected BLPs not carrying an enumerated BLP title; (iii) current-revision category
removal beyond the freshness window; (iv) BLP-by-talk-page-banner-only. All are mitigated by
**defense-in-depth**: the freshness fail-closed (covers i/iii within the window) and the mandatory
**downstream human-verification gate (G5)** — no edit ships without a human opening the source. The floor's
intent and text are unchanged; these document the deterministic implementation's known limits (naming them
is the G11 honesty requirement). A future biography-scope expansion should evaluate a *wikitext-literal
birth-year-without-death-year* signal (fresher than the lagged probe on new stubs — R4 §R2-3 challenge);
deferred for v1 because the corpus is non-biographical (0/136 fixtures are bios).

---

## 10. Compliance mapping

| Guardrail | How honored |
|---|---|
| Stay in the safe lane (G11) | Fail-closed BLP-category floor + namespace + freshness; conservative dispute denylist; four residuals named + signed off; human-only is the default under any uncertainty. |
| Detection deterministic & LLM-free (G10) | Pure, total, clock-free gate (injected `now`); zero model calls; detector consumed unchanged. |
| Audit log foundational (G13) | Every decision logged with inputs as codes/identifiers; append-only; reproducible-in-intent. |
| Responsible Wikimedia access (G14) | One atomic single-article call; descriptive UA; `maxlag`; no enumeration/pagination; no talk-page fetch. |
| Fetched content untrusted (G15) | Wikitext scanned deterministically as data; never instructions, never to a model, never logged verbatim. |

---

## 11. Module layout

```
src/safelane/eligibility.ts        evaluateEligibility (pure, total, clock-free)  [NEW]
src/safelane/denylists.ts          BLP-set, dispute-template set, canonicalizer   [NEW]
src/safelane/wikitext-signals.ts   comment/nowiki-stripping advisory scan         [NEW]
src/domain/types.ts                + ArticleMetadata, EligibilityDecision         [EDIT]
src/ingest/wikimedia.ts            atomic combined metadata call + mapping        [EDIT]
src/ingest/lookup.ts               compute eligibility, return, audit             [EDIT]
src/app/api/articles/lookup/route.ts   surface eligibility in the response        [EDIT]
src/app/page.tsx                   per-article eligibility banner                 [EDIT]
test/safelane/*, test/gold/eligibility-set.json, test/ingest/* additions          [NEW/EDIT]
```

## 12. Reasoning chain (what the 5-round review changed)
- **Probe, don't enumerate** (R2-1): the floor asks `clcategories` "is this page in *these*?" — bounded,
  truncation-proof — instead of fetching and intersecting the full category list.
- **One atomic snapshot** (R4-1): wikitext + categories + revision must come from one response, or the
  "fresh backstop" can adjudicate a different revision than the categories it backstops.
- **Demote the wikitext scan; add freshness** (R4-2): infobox-name matching is unmaintainable and
  incomplete; the only sound lag backstop is a deterministic freshness fail-closed.
- **Don't persist the verdict in v1** (R4-5): a stored `easy_win` is a *durable* fail-OPEN; point-of-use
  re-evaluation is the enforcement model (reversed an earlier draft pick).
- **Name the residuals honestly** (R2-3/R4-8/R4-9): four residual fail-OPENs, signed off, mitigated by
  defense-in-depth — naming them is the G11 honesty requirement.
- **Still uncertain / deferred:** the contentious-topic-category denylist; claim-level contentiousness;
  the biography-scope birth-year signal; persistence (only when the easy-win queue exists, then
  revision-bound + gate-versioned + re-validated).
