<!-- ABOUTME: Implementation plan for measuring and safely improving the deterministic detector's recall. -->
<!-- ABOUTME: Measure-first (reachable vs absolute recall), durable recall gate, then precision-safe marker-lexicon wins. -->

# WikiAsOfNow — Detector Recall: Measure + Safe Wins Implementation Plan

**Goal:** Establish the detector's **recall** — the fraction of genuinely-stale Wikipedia claims it actually flags — which has never been measured (all prior work measured precision). Build a durable recall gate symmetric with the precision gate, then recover the precision-safe portion of the recall gap (chiefly an expanded marker lexicon), while deferring the harder, semantics-dependent misses to the roadmap.

**Architecture:** No change to the detector's deterministic, LLM-free shape (parse → markers → suppress → score → detect; the "detection is deterministic and explainable" guardrail, G10, holds). This work adds (a) an independently-labeled **recall-gold set** (`test/gold/recall-set.json`), (b) a **recall harness/gate** (`test/detector/recall.test.ts`) symmetric with `test/detector/precision.test.ts`, and (c) precision-safe additions to `MARKER_STRENGTH` in `src/detector/markers.ts`. Every detector change is gated on the existing 73-entry precision gate (`test/detector/precision.test.ts`, threshold ≥ 0.9) staying green.

**Tech Stack:** TypeScript (Node 24 per `.nvmrc`; this environment runs Node 22 — see the Deviations section of `docs/plans/2026-06-04-wikiasofnow-foundation-detector-plan.md`), Vitest, `wtf_wikipedia`, `better-sqlite3` (unrelated to this work). pnpm@11.5.1 pinned. Same toolchain as the detector foundation work.

## Living Document Contract

This plan is a living document. Every executing agent MUST update it as
execution progresses, not only at completion.

- **On phase claim:** the executor MUST flip the banner to 🚧 IN PROGRESS
  with a claim timestamp (ISO 8601 UTC) and the active branch name. The
  banner MUST NOT include an expected-completion estimate — agents cannot
  reliably estimate their own wall-clock, and a fabricated duration
  becomes a stale anchor that misleads future readers. Followers
  encountering a 🚧 banner determine liveness by observable signals (PR
  existence, recent branch commits), not by arithmetic on expected times.
  See Step 5's stale-claim reclaim protocol.
- **On phase ship:** the executor MUST update that phase's **Execution
  Status** banner with the shipped commit SHA(s) and date. If a PR is
  open, the PR number and URL MUST appear in the top-of-plan Execution
  Status table.
- **On phase defer:** the executor MUST update the banner with ⏸ status
  AND a prose description of the unblock condition + a link to the
  likely-unblocker artifact (plan page, task, or PR whose own Execution
  Status banner will signal completion). Prose + link is durable across
  paraphrases and scope edits; exact-string coordination between agents
  is not.
- **On PR merge:** the executor MUST record the merge SHA in the banner
  + the top-of-plan Execution Status table.
- **On deviation from the written plan** (scope edits, structural
  refactors, dropped tasks, reordered phases): the executor MUST
  inline-document the deviation in the affected task AND summarize it
  in the top-of-plan Execution Status as a "Deviations" subsection.
  Deviation state MUST NOT live only in PR notes or status reports.
- **On discovery** (pre-existing drift surfaced during execution, new
  bugs found, architectural issues noted): the executor MUST add a
  "Discoveries" subsection at the top of the plan with pointers to the
  files/lines affected. Follow-up dispatches read this subsection to
  avoid duplicate discovery work.

The plan SHOULD reflect reality at the end of every session that touches
it. Anything worth putting in a status report to the user is worth
putting in the plan.

Rationale: `/writing-plans-enhanced` Step 5. Writing at ship time is
cheap; reconstruction by downstream readers is expensive, compounds
across dispatches, and fails silently when state is split across PR
notes and commit messages.

---

## Execution Status

**Overall:** Both phases built. Phase 1 (measure) shipped; Phase 2 (safe wins) built, PR pending.

| Phase | Status | Ship SHA(s) | Notes |
|---|---|---|---|
| 1 — Recall ground truth + baseline | ✅ Built 2026-06-05 (`84184bd`…`<review>`) | `84184bd`…`4ab4d36` | measurement: reachable recall **0.636**, absolute **0.583**, zero `simple` missed; rubric + recall set + harness + miss-hunt; reviewed sound |
| 2 — Precision-safe recall wins (lexicon) | ✅ Built 2026-06-05 (`667b44e`…`62ebd1e`) | `667b44e`…`62ebd1e` | reachable recall 0.636→**1.0**, absolute 0.583→**0.917**, precision held 0.97; 5 markers added, `intended to` dropped; 0.90 floor. PR pending |

---

## Deviations

- **2026-06-05 (Task 1.2) — recall composition guard relaxed ≥3 → ≥1 not-reachable (Sam-approved).** Exhaustive labeling of the 12-fixture sample yielded only ONE genuine not-reachable stale claim under a strict reading of the rubric's §1 condition 2 (target time now past): a no-inline-year forward claim is stale only when the article gives evidence it lapsed (the `sbx-1` Adak standard). Undated commitments without such evidence (m777 "19 guns", AMPV "scheduled to deliver 2,897", Fehmarn funding tied to a future 2031) were dropped after the label review. Rather than inflate the denominator with borderline entries or broaden the sample, Sam chose to relax the guard and treat the scarcity as a finding (see Discoveries). The headline reachable recall (0.636) is unaffected.

---

## Discoveries

- **2026-06-05 (Phase 2) — lexicon expansion recovered the full reachable-recall gap, precision-safe.** Reachable recall 0.636→**1.0** (all 4 `marker-gap` misses caught), absolute 0.583→**0.917**, **precision gate held at 0.97** (no gold negative newly flagged). 5 markers added; `intended to` DROPPED (~50% FP density — rank candidates by FP-gated value, not raw frequency). bare `expected to` kept but flagged: non-load-bearing, ~15-20% FP density (all cataloged DET-2/DET-3, no new class) — the first marker to drop if precision-tightening is later prioritized (methodology §7.4). Durable 0.90 reachable-recall floor (`recall.test.ts`).
- **2026-06-05 (Task 1.2 baseline) — first-ever recall numbers; genuine not-reachable stale claims are rare.** Over a 12-fixture exhaustive sample: **reachable recall 0.636 (7/11)**, **absolute recall 0.583 (7/12)**, **zero `simple` claims missed → no detector bug**. The misses are 4 `marker-gap` (reachable; forward phrase outside the lexicon — Phase-2-fixable) + 1 `inline-year-absent` (`sbx-1` Adak). KEY FINDING: only 1 genuine not-reachable stale claim in 12 fixtures — most genuinely-stale claims DO carry an inline year, so the inline-year requirement (DET-2) costs less absolute recall than feared; the dominant addressable gap is `marker-gap`. See `test/gold/recall-set-README.md`.
- **2026-06-05 (operational) — session resume flipped Node 20/21/22 → Node 24, requiring a `better-sqlite3` rebuild.** The `.nvmrc` pins Node 24; the resumed session finally had it, but the native `better_sqlite3.node` was compiled earlier against Node 22 → 11 DB tests failed with "Module did not self-register" (ABI mismatch). Fixed with `pnpm rebuild better-sqlite3`. Not committed (binary). Future sessions: after a resume, if DB tests fail to load the native module, rebuild it.
- **2026-06-05 (Task 1.1) — precision-gold mislabel surfaced + fixed: cross-sentence resolution FP.** The recall labeling rubric correctly classed `fehmarn_belt_fixed_link` "The Fehmarn Belt bridge was originally expected to be completed by 2018." as NOT stale — the very next sentence ("However, in late 2010 … an immersed tunnel would instead…") scraps/resolves the plan. But that sentence was a `stale:true` POSITIVE in `test/gold/gold-set.json`. The detector flags it (marker + inline year) because Rule 3's resolution check is within-sentence only; this resolution is cross-sentence. Relabeled `true→false` in the precision gold (now a documented FP of the **cross-sentence-resolution** class, DET-2 family); precision gate stays green (≥0.9, ~0.97). Verified the sibling infra positives (`gordie_howe`, `robotic_combat_vehicle`) are genuinely stale and correctly labeled. The Task 1.2 recall labeling MUST apply the rubric consistently (do not label fehmarn-style resolved/scrapped plans as stale).

---

## Source documents (read before executing)

- **`docs/design/detector-precision-methodology.md`** — the methodology this extends. §4 states recall is uncharacterized; §6 names "marker-governs-year" + recall as the open roadmap. Add a recall section here at ship time.
- **`docs/pitfalls/implementation-pitfalls.md`** §2 (DET-1 dateline narration; DET-2 accepted recall gaps — inline-year requirement, earliest-year/dateline, `By`-deadline; DET-3 incidental years). These DET-2 gaps are *known* recall misses — the measurement must quantify them, not rediscover them.
- **`docs/pitfalls/testing-pitfalls.md`** §9 (gold-set honesty: build from real output, real negatives, composition guard, no overfit). The recall set inherits these honesty rules — inverted (see "circularity" below).
- **`docs/policy/wikipedia-genai-compliance.md`** — the detector stays deterministic/LLM-free (G10). This plan adds NO model calls.
- **Code to keep green / extend:** `test/detector/precision.test.ts` + `test/gold/gold-set.json` (the 73-entry precision gate, threshold ≥ 0.9, composition guard ≥3/≥3 — MUST stay green); `src/detector/markers.ts` (`MARKER_STRENGTH` lexicon (9 entries at Phase 1; 14 after Phase 2), `findExpectationMarkers`, `extractYears` 1900–2099); `src/detector/detect.ts` (`detectStaleClaims(article, asOfYear)`); `src/detector/suppress.ts`.

---

## Key design concepts (bind every task)

These are the load-bearing decisions from brainstorming. Tasks reference them by name.

### C1 — Reachable vs absolute recall (REQUIRED distinction)
The detector by design only reaches a stale claim if it has an **inline 4-digit past year** in the same sentence (the year gate). So a single recall number is misleading. Measure two:
- **Reachable recall** = (flagged stale claims) / (stale claims that HAVE an inline past year). This is the *fair* denominator for the deterministic design. **This is the number the gate floors.** It will stay **below 1.0 even after Phase 2**: Phase 2 only moves the `marker-gap` portion (lexicon); the `suppression-collateral` portion (reachable claims dropped by a suppression rule, DET-2) is deliberately left unfixed (suppression is out of scope here — touching it risks precision). So reachable recall partitions into: caught + `marker-gap` (Phase-2-fixable) + `suppression-collateral` (deferred).
- **Absolute recall** = (flagged stale claims) / (ALL genuinely-stale claims, including no-inline-year ones). Lower; bounded by the inline-year limit. Moving it needs the semantic marker-governs-year lever (out of scope — deferred).

Every recall-set entry therefore carries a `reachable: true|false` flag.

### C2 — Avoid the precision gold's circularity (REQUIRED)
The precision gold set was built FROM detector output (label what it flags / correctly suppresses). The recall set MUST be built the **inverse** way: read each sample article's prose, find genuinely-stale claims **independently of what the detector does**, label them, and only THEN run the detector to see which were caught. Labeling from detector flags would make recall trivially 1.0 and meaningless. (Inverts testing-pitfalls §9 "build from real output".)

### C3 — "Genuinely stale" labeling rubric (defined in Task 1.1)
A sentence is genuinely stale iff it makes a **future-tense / expectation claim whose target time is now past** relative to `asOfYear = 2026`, AND a human editor would plausibly want to review/update it. **Exclude:** historical narration of a past event ("In 2013, X announced…" — describes the past, not a stale prediction), claims the article resolves nearby ("…expected in 2018, later delivered in 2019"), and pure background facts. Task 1.1 turns this into a concrete, example-backed rubric so labeling is consistent and reviewable.

### C4 — Precision is the hard constraint (REQUIRED)
Every detector change (Phase 2 lexicon additions) MUST keep `test/detector/precision.test.ts` green (precision ≥ 0.9 over the 73-entry gold set, composition guard intact) AND introduce no new corpus false-positive *class*. A recall win that costs precision is NOT a safe win — it is escalated, not shipped.

---

## TDD discipline (applies to every task that writes code)

- **BEFORE starting any code task:** invoke `superpowers:test-driven-development` if available (it is referenced in CLAUDE.md; if not installed, follow TDD by hand); read `docs/pitfalls/testing-pitfalls.md`. Write the failing test → watch it fail for the right reason → minimal code → green → refactor green → commit.
- **Data-labeling tasks** (`recall-set.json`) are NOT TDD (JSON data, not code) but carry their own honesty discipline (C2 + a label-honesty review round, symmetric to the Phase 2 gold-honesty review).
- **Gates per code task:** `pnpm test` green + pristine output, `pnpm exec tsc --noEmit` clean, `pnpm lint` clean. The **precision gate MUST stay green** on every Phase 2 change (C4).
- **After each phase:** the "After completing Phase N" review block (minimum 3 rounds) is mandatory. Review subagents MUST NOT move HEAD (ORCH-2) and MUST persist findings to a file before returning (ORCH-1).

---

## Phase 1 — Recall ground truth + baseline measurement

**Execution Status:** ✅ BUILT 2026-06-05 — branch `claude/wikiasofnow-recall`, commits `84184bd`…`4ab4d36`. All 4 tasks done (rubric, exhaustive recall set, harness, corpus miss-hunt), each per-task reviewed, plus a consolidated final review (`docs/plans/recall-review/round-1-phase1-final.md`: SOUND/HONEST, gate-green). **First recall baseline: reachable 0.636 (7/11), absolute 0.583 (7/12), zero `simple` missed (no detector bug).** marker-gap ranking (for Phase 2): expected-to(bare) 45, planned-to 38, scheduled-for 20, intended-to 15, was-scheduled-to 13.

> No detector code changes in this phase — measurement only. The detector is read-only; we add the labeling rubric, the independently-labeled recall set, the recall harness, and the targeted miss-hunt.

### Task 1.1: Define the "genuinely stale" labeling rubric

**Files:** Create `docs/design/recall-labeling-rubric.md`.

- Write a concise, example-backed rubric operationalizing C3 + C1: what counts as genuinely stale, the reachable/absolute distinction, and the exclusions (historical narration, resolved-nearby, background facts). Include 6–8 worked examples drawn from the existing corpus (cite fixture + sentence), each labeled stale/not-stale + reachable/not, with a one-line reason. Cross-reference DET-1/2/3 so the labeler knows which misses are *expected* (design limits) vs which would be *bugs*.
- Add a short "labeler protocol" section enforcing C2: read prose first, label independently, run the detector only afterward.

**Do NOT** define stale in a way that depends on detector behavior (that reintroduces circularity). **Do NOT** include any LLM/model step.

This is a documentation task (no TDD). BEFORE marking complete: re-read against C1–C3 and confirm a fresh labeler could apply it without seeing detector output.

### Task 1.2: Independently label the exhaustive recall sample

**Files:** Create `test/gold/recall-set.json` (a flat JSON array of entries — NO `_meta` element inside the array; it would pollute the typed `RecallEntry[]` the harness reads). Record the chosen-fixture list + selection rationale in a sibling `test/gold/recall-set-README.md` instead.

- Select **10–12 fixtures** spanning all four registers already in `test/fixtures/`. **Recommended default set** (small-to-medium, register-balanced — adjust only with a noted reason in the README): military — `sbx-1`, `m777_howitzer`, `robotic_combat_vehicle`; engineering — `fehmarn_belt_fixed_link`, `gordie_howe_international_bridge`, `long_range_discrimination_radar`; biomedical/policy — `hiv_vaccine_development`, `m72_as01e`, `windsor_framework`; corporate/software — `3_nm_process`, `project_kuiper`, `wi-fi_7`. (All already in `test/fixtures/`; these are modest-sized so exhaustive reading is tractable.)
- For each chosen fixture, **read every sentence** (`parseArticle` output is the unit) and label **every** genuinely-stale sentence per the Task 1.1 rubric (C2: independently of detector flags). Each entry:
  ```json
  { "fixture": "<file>.wikitext", "sentenceSubstring": "<distinctive verbatim substring>",
    "stale": true, "reachable": true|false, "expectedYear": <n|null>,
    "shapeClass": "<simple | marker-gap | suppression-collateral | inline-year-absent | relative-date | other>",
    "note": "<why this sentence is genuinely stale per the rubric>" }
  ```
  - `stale` is always `true` (this is a recall set of genuinely-stale claims).
  - `reachable` = the sentence contains an inline 4-digit past year (per C1) — observable from the text, label-time, independent of the detector.
  - `shapeClass` is the labeler's **structural** categorization of the claim's shape (also label-time, detector-independent), used to bucket the recall gap. It is NOT keyed to `reachable`: a reachable claim (has a year) can still be hard. Values:
    - `simple` — has an inline past year AND its forward marker is already in `MARKER_STRENGTH` (so the detector *should* catch it; a missed `simple` entry at measurement time is a surprise worth investigating).
    - `marker-gap` — has an inline past year but its forward phrase is NOT in the lexicon ("set to", "on track to", …) → reachable, fixable by Phase 2.
    - `suppression-collateral` — has an inline past year + an in-lexicon marker, but a suppression rule (leading dateline / `By`-deadline, DET-2) drops it → reachable, NOT fixed by Phase 2 (deferred).
    - `inline-year-absent` — genuinely stale but no 4-digit year in the sentence (relies on a relative/cross-sentence date) → not reachable; needs the semantic lever (deferred).
    - `relative-date` — uses a relative anchor ("next year", "within five years", "by the end of the decade") instead of a 4-digit year → not reachable (deferred).
    - `other` — anything that fits none of the above (note why).
  - `expectedYear` is the inline past year for reachable entries, `null` otherwise.
- The substring MUST be a verbatim slice of the **parsed** sentence text (so `c.sentenceText.includes(substring)` works), distinctive enough not to collide with another sentence in the same fixture.

**Do NOT** label from detector output (C2). **Do NOT** cherry-pick only reachable claims — the no-inline-year and suppression-collateral misses are the whole point of the absolute-recall number. **Do NOT** drop a genuinely-stale claim because the detector misses it (that is exactly the FN we are measuring).

This is data labeling (no TDD), but apply the honesty discipline: every entry independently re-checkable from the fixture text. BEFORE marking complete: confirm the sample has a healthy mix of `reachable: true` and `reachable: false` entries (if it is nearly all reachable, the sample under-represents the design-limit misses — broaden it).

### Task 1.3: Build the recall harness + baseline (reporting first, gate later)

**Files:** Create `test/detector/recall.test.ts`.

- BEFORE starting: invoke TDD; read `docs/pitfalls/testing-pitfalls.md` (esp. §9). The harness is code — TDD it.
- Define a typed `RecallEntry` interface for the parsed JSON and cast to `RecallEntry[]` — do NOT use `as any[]`. (The lint config errors on `@typescript-eslint/no-explicit-any`; `precision.test.ts` already hit this and uses a typed `GoldEntry` interface — follow that precedent exactly.)
- The harness reads `test/gold/recall-set.json`, and for each entry runs `detectStaleClaims(parseArticle({title, revisionId:1, wikitext}), 2026)` on the entry's fixture, and computes `flagged = cands.some(c => c.sentenceText.includes(sentenceSubstring))`. Cache per-fixture detector runs (do not re-parse per entry — fixtures are large; one detect call per fixture, reused).
- Compute (this phase is **reporting**, not yet a hard floor):
  - **reachable recall** = flagged among `reachable:true` / count(`reachable:true`).
  - **absolute recall** = flagged among all / count(all).
  - **precision-on-sample** = (detector flags on the sampled fixtures whose sentence matches a recall-set stale entry) / (all detector flags on the sampled fixtures). A flag NOT matching any stale entry for that fixture counts as a sample FP. **Caveat to record:** because the recall set is hand-labeled, a flag counted as an FP *could* instead be a stale claim the labeler missed — so precision-on-sample is a lower bound; if a flag looks genuinely stale, add it to the recall set (it is a real FN→TP correction) rather than accepting it as an FP. (Together these give a true F-measure on the same articles.)
  - **shape-class histogram of the MISSES** = among entries the detector did NOT flag, the count by `shapeClass` (this is what ranks the recall gap: how much is `marker-gap` (Phase-2-fixable) vs `suppression-collateral`/`inline-year-absent`/`relative-date` (deferred to the semantic lever)). Also flag any **surprise**: a `simple` entry that was missed, or a `marker-gap`/`suppression-collateral`/etc. entry that was caught (the structural tag was wrong) — surprises are findings, not noise.
- **Output discipline (testing-pitfalls §1 — pristine output):** the metric numbers are *intentional measurement output*, not stray debug prints. Emit them through a single clearly-labeled block (e.g. one `console.log` of a formatted summary object), never scattered ad-hoc prints, and ensure no stderr/unhandled-rejection noise. The committed test's PASS/FAIL is driven by the assertions below, not by the logged numbers.
- Tests in THIS phase: (a) a structural test that the recall set is well-formed (every entry has the required fields; `stale === true`; `reachable` is boolean; `shapeClass` is one of the allowed values; a non-reachable entry's `shapeClass` is one of `inline-year-absent`/`relative-date`/`other` and its `expectedYear` is null; a reachable entry's `shapeClass` is one of `simple`/`marker-gap`/`suppression-collateral`/`other`; substrings are non-empty and actually occur in the named fixture's parsed sentence text) and satisfies a composition guard of **≥6 `reachable:true` AND ≥1 `reachable:false`** entries (the set must carry both the tuning denominator and a real share of the design-limit denominator — a token single hard entry is not enough); (b) a reporting test that surfaces the four metrics (per the output discipline above) and passes unconditionally (the FLOOR is added in Task 2.2 once the post-improvement baseline is known). Record the measured baseline numbers in the plan's Discoveries.

**Do NOT** add a hard recall-floor assertion yet (Phase 2 sets it after the safe wins, so the floor reflects the shipped state, not a pre-improvement number). **Do NOT** weaken or special-case any assertion to make a number look better — if a metric is low, that is the finding (testing-pitfalls assertion-rigor rule).

BEFORE marking complete: review against testing-pitfalls §9; confirm precision-on-sample is computed honestly (a flagged sentence not in the stale labels counts as an FP, not silently dropped — and the missed-label caveat above is recorded); run `pnpm test` (green + pristine — confirm the metric output is the single labeled block, not debug cruft), `pnpm exec tsc --noEmit`, `pnpm lint`.

### Task 1.4: Targeted miss-hunt across the broader corpus

**Files:** Append findings to `docs/design/detector-precision-methodology.md` (new "Recall" section) — do NOT create a parallel doc.

- Beyond the exhaustive sample, scan the full 136-fixture corpus to size the **absolute**-recall gap by `shapeClass` (the sample alone is too small to rank classes). Use a throwaway, deleted-before-commit scratch harness (the `_scratch_*.test.ts` pattern from Phase 2, run with `--disableConsoleIntercept`): for each fixture, surface sentences that look stale-ish but are NOT flagged — e.g. sentences containing a candidate forward marker NOT in the lexicon ("set to", "on track to", "slated for", "due to be", "targeting", "intended to", "expected to" without the leading "is", "to be delivered/launched/fielded") together with a past year (the `marker-gap` class); and sentences with a future-expectation shape but no 4-digit year ("next year", "by the end of the decade", "within five years" — the `relative-date`/`inline-year-absent` classes).
- Produce a ranked `shapeClass` table (which classes dominate the gap, with 2–3 real examples each) in the methodology doc's new Recall section. This directly feeds Phase 2's lexicon candidates (the `marker-gap` class) and confirms which classes are deferred (`suppression-collateral`, `inline-year-absent`, `relative-date` → the §6 semantic roadmap).

**Do NOT** commit the throwaway scan harness (delete before commit; do not `git add` it). **Do NOT** treat the miss-hunt as exhaustive truth — it is biased toward what we thought to grep for; the exhaustive sample (1.2/1.3) is the honest recall number, the miss-hunt is for category breadth (mirrors the precision methodology's sample-vs-hunt split).

### After completing Phase 1
Minimum 3 review rounds, each dispatched to a subagent that persists its report to `docs/plans/recall-review/round-N-*.md` BEFORE returning (ORCH-1) and inspects read-only without moving HEAD (ORCH-2):
1. **Label honesty (the inverse of Phase 2's gold-honesty round):** independently re-derive a sample of `recall-set.json` entries from the fixture text — is each genuinely stale per the rubric? Is `reachable` correct (does the sentence actually contain an inline past year)? Is `shapeClass` correct (a reachable+in-lexicon-marker claim tagged `simple`, a reachable-but-unknown-marker claim tagged `marker-gap`, etc.)? Are any entries secretly labeled from detector behavior (C2 violation)? Is the sample biased toward reachable claims (under-counting the design-limit gap)?
2. **Metric correctness:** is reachable/absolute recall computed over the right denominators? Is precision-on-sample honest (FPs not dropped)? Any nondeterminism?
3. **Rubric soundness:** could a fresh labeler apply Task 1.1's rubric and reach the same labels? Are the exclusions (historical/resolved/background) correctly drawn vs DET-1/2/3?
Update banners + the top-of-plan table; record baseline numbers in Discoveries.

---

## Phase 2 — Precision-safe recall wins (marker lexicon)

**Execution Status:** ✅ BUILT 2026-06-05 — branch `claude/wikiasofnow-recall`, commits `667b44e`…`497a0b6`. Lexicon expanded by 5 precision-gated markers (`expected to`, `expected by`, `scheduled to`, `scheduled for`, `planned to`; `intended to` dropped for FP density). **Reachable recall 0.636→1.0, absolute 0.583→0.917, precision held 0.97.** Durable 0.90 reachable-recall floor added. bare `expected to`/`scheduled for` are non-load-bearing broader-recall markers flagged for a future precision-tightening pass (methodology §7.4). Final review + PR next.

> Depends on Phase 1 (the recall set, harness, baseline, and the `marker-gap` ranking from the miss-hunt). The ONLY detector change in scope is expanding `MARKER_STRENGTH`. No suppression changes, no year-gate changes, no relative-date handling (deferred — see Task 2.3).

### Task 2.1: Expand the marker lexicon (each addition precision-gated)

**Files:** Modify `src/detector/markers.ts` (`MARKER_STRENGTH`); add tests to `test/detector/markers.test.ts`.

- BEFORE starting: invoke TDD; read `docs/pitfalls/testing-pitfalls.md`. Current lexicon (9 entries): `is expected to:2, is scheduled to:2, is slated to:2, is due to:2, plans to:2, aims to:1, anticipated:1, to be completed by:2, will:1`.
- **Candidate markers** (from Phase 1's `marker-gap` ranking — evaluate these, plus any the miss-hunt surfaced): `set to`, `on track to`, `slated for`, `due to be`, `targeting`, `intended to`, `intends to`, `expected to` (the bare form, to catch "was/now expected to"), `to be delivered`, `to be launched`, `to be fielded`. Assign strength 1 (weak/generic) or 2 (explicit scheduling) per the existing pattern.
- **Per-candidate gate (REQUIRED, C4):** for EACH candidate, in order: (1) write a `markers.test.ts` assertion that `findExpectationMarkers` detects it on a positive example AND does NOT match a near-miss (word-boundary, like the existing "will"/"goodwill" test); (2) add it to `MARKER_STRENGTH`; (3) run `pnpm test` — **`precision.test.ts` MUST stay green** (precision ≥ 0.9, composition guard intact); (4) run a **throwaway corpus flag-diff** to confirm no new FP *class*: a deleted-before-commit scratch test (pattern: the `_scratch_*.test.ts` harnesses used in Phase 2, run with `--disableConsoleIntercept`) that runs `detectStaleClaims` over all `test/fixtures/*.wikitext` and prints the flagged sentences; compare the flag set before vs after the marker and inspect ONLY the newly-flagged sentences. "New FP *class*" means a structurally-new false-positive shape (see the structural-vs-instance distinction and the pattern catalog in `docs/design/detector-precision-methodology.md` §2/§5) — in particular watch for DET-3 incidental-year flags (e.g. the marker firing on a sentence whose only year is a founding/version/event-name year). A handful of new *instances* of already-catalogued classes is acceptable; a new class or a precision-gate regression is not; (5) run `recall.test.ts` — reachable recall SHOULD rise (note: lexicon additions only ADD flags, so recall is monotonically non-decreasing under this task — it cannot drop; the binding constraint is therefore PRECISION in step 3/4, not recall). **Keep the candidate only if precision holds; drop it (with a one-line note in the plan's Discoveries) if it regresses precision or introduces a new FP class.** Word-boundary + case-insensitive matching is already handled by `findExpectationMarkers` — do not reimplement it. Delete the scratch flag-diff harness before committing (do not `git add` it).

**Do NOT** add a marker that is tense-ambiguous in a way that floods FPs ("expected" bare without "to" matches "lower than expected"; "due" alone matches "due to weather"). **Do NOT** touch `suppress.ts`, the year gate, or `extractYears` in this task. **Do NOT** keep any marker that drops `precision.test.ts` below 0.9 — precision is the hard constraint (C4); a marker that needs suppression help is escalated, not forced.

BEFORE marking complete: every kept marker has a word-boundary test; `precision.test.ts` green; `recall.test.ts` reachable recall ≥ the Phase 1 baseline; `pnpm test` pristine, `tsc` clean, `lint` clean.

### Task 2.2: Set the durable recall floor

**Files:** Modify `test/detector/recall.test.ts` (turn the reporting test into a gate).

- BEFORE starting: invoke TDD. After Task 2.1's lexicon expansion, the reachable-recall number is the **shipped** baseline. Add a hard assertion `expect(reachableRecall).toBeGreaterThanOrEqual(<floor>)` where `<floor>` is set **conservatively below** the measured shipped reachable recall (e.g. round down to the nearest 0.05, leaving a small margin) — the gate's job is to catch *regressions* (a future suppression tweak quietly dropping reachable claims), not to assert an aspirational target.
- Keep the structural/composition guard from Task 1.3 (≥1 reachable + ≥1 non-reachable entry) so a future edit cannot pass the floor by deleting hard entries (symmetric to the precision composition guard). Add a comment explaining the floor is a regression gate, not a target, and how to re-baseline it if the recall set legitimately changes.

**Do NOT** set the floor AT the measured value (zero margin → flaky gate on legitimate re-labeling). **Do NOT** assert on absolute recall as a floor — it is bounded by the deferred design limit (C1); report it, don't gate it. **Do NOT** lower the floor to make a future failing change pass — a drop in reachable recall is a real regression to investigate, not a number to re-baseline downward; re-baselining is only legitimate when the recall *set itself* changes (entries added/removed), and any re-baseline MUST be called out in the commit subject (per the assertion-rigor rule), never folded silently into an unrelated change.

BEFORE marking complete: confirm the floor fails if a marker is removed (prove the gate bites — temporarily delete a Task-2.1 marker, watch recall.test.ts go red, restore); `pnpm test` green; `tsc`/`lint` clean.

### Task 2.3: Document results + defer the hard classes

**Files:** Update `docs/design/detector-precision-methodology.md` (Recall section: before/after reachable + absolute recall, what the lexicon recovered, the shape-class ranking; and the §6 roadmap if the numbers change the priority order of the deferred levers); `docs/pitfalls/implementation-pitfalls.md` (if a new recall pitfall emerged, e.g. a marker that looked safe but flooded FPs — capture it).

> **Shared-file note:** Task 1.4 already CREATED the "Recall" section in `detector-precision-methodology.md` (the miss-hunt ranking). This task EXTENDS that same section with the before/after numbers — append/update, do NOT rewrite or drop 1.4's miss-class table. (1.4 and 2.3 are the only two tasks touching this file, and they run in phase order, so there is no concurrent-edit conflict under the sequential subagent-driven flow.)

- Record: baseline vs post-lexicon reachable recall; absolute recall (and the gap to it = the deferred design limit); the dominant deferred miss-classes (`inline-year-absent`, `relative-date`) and that closing them needs the marker-governs-year semantic lever (out of scope here, named in the methodology §6).

**Do NOT** claim absolute recall improved beyond what the lexicon actually moved. **Do NOT** silently expand scope into relative-date/no-year handling — those are deferred; if they look tempting, write them as a future-work item, not code.

### After completing Phase 2
Minimum 3 review rounds (persisted reports, ORCH-1; read-only, ORCH-2):
1. **Precision preservation:** prove `precision.test.ts` is still green and no new corpus FP class slipped in with the new markers (independently flag-diff a sample of fixtures before/after).
2. **Recall gate integrity:** is the floor a genuine regression gate (does it bite when a marker is removed)? Is the composition guard intact? No assertion weakening?
3. **Honesty of the recall claim:** do the documented before/after numbers match a fresh run? Is the reachable/absolute distinction reported clearly (not conflated to flatter the result)?
Update banners + the top-of-plan table; open a PR → `dev`.

---

## Self-review (run before the review cycle)

- **Scope coverage:** measures recall (reachable + absolute), builds a durable gate, recovers the precision-safe lexicon portion, defers the semantics-dependent misses. Matches the brainstorming scope (measure-then-safe-wins; both exhaustive + hunt; durable gate).
- **Circularity:** C2 is enforced in Task 1.2 (label independently) and audited in the Phase 1 label-honesty review — the recall denominator is not derived from detector output.
- **Precision safety:** C4 gates every detector change on the existing precision gate; Task 2.1 drops any marker that regresses it.
- **Placeholder scan:** every task names exact files, exact artifacts, and exact gates; no TBD-as-implementation.
- **Type/contract consistency:** `recall-set.json` entry shape is fixed in Task 1.2 and consumed unchanged in 1.3/2.2; `detectStaleClaims(article, 2026)` is the only detector entry point used.

## Plan review record

Ran `/plan-review-cycle` (6 rounds, ended clean: R1=8, R2=3, R3=3, R4=1, R5=2, R6=0). Findings fixed:
- **R1 (8):** concrete recommended fixture list for the sample; removed the `_meta`-in-array (→ sibling README); strengthened the recall composition guard (≥6 reachable / ≥3 non-reachable — the ≥3 was later relaxed to ≥1 during execution, see Deviations); resolved the pristine-output tension for the metric `console.log`s (single labeled block, testing-pitfalls §1); specified the throwaway flag-diff mechanism for the precision-safety check; defined "new FP *class*" via the methodology doc + a DET-3 cross-ref; called out the 1.4↔2.3 shared-file sequencing; added the missed-label caveat to precision-on-sample.
- **R2 (3):** fixed the `missClass`/`reachable` contradiction (a reachable claim can still be missed via marker-gap/suppression-collateral) by reframing it as a detector-independent `shapeClass` enum; disambiguated "the Phase 2 plan" references (foundation-detector plan / methodology §6); clarified reachable recall stays < 1.0 after Phase 2 (suppression-collateral deferred).
- **R3 (3):** aligned `shapeClass` terminology across the miss-hunt + review block; noted reachable recall is monotonic under lexicon-only additions (precision is the binding constraint); fixed the Phase-2 dependency wording (the gate is built in Phase 2).
- **R4 (1):** mandate a typed `RecallEntry` interface (no `as any[]` — the `no-explicit-any` lint trap already hit on `precision.test.ts`).
- **R5 (2):** hedged the (not-installed) `superpowers:` skills with a manual subagent fallback; added an explicit anti-weakening rule on the recall floor.
- **R6:** clean.

## Execution strategy recommendation

**Recommended: subagent-driven development (fresh subagent per task, review between tasks), executable in a fresh session.** If `superpowers:subagent-driven-development` is installed, use it; if not (the `superpowers:` plugin skills were NOT installed in the environment that wrote this plan — brainstorming and writing-plans both failed to resolve), follow the equivalent **manual** flow proven on the detector foundation work: per task, dispatch an implementer subagent (strict TDD) → a spec/code-quality review subagent → controller triages, runs gates, commits; review subagents inspect read-only and MUST NOT move HEAD (ORCH-2) and MUST persist findings before returning (ORCH-1). Reasoning:
- Tasks are largely sequential (1.1 rubric → 1.2 labels → 1.3 harness → 1.4 hunt → 2.1 lexicon → 2.2 floor → 2.3 docs) with clear file ownership and no two tasks editing the same file simultaneously, so subagent isolation is clean.
- The labeling (1.2) and lexicon (2.1) tasks are judgment-heavy and benefit from focused attention + an explicit review round each (label-honesty; precision-preservation) — exactly the per-task review the subagent-driven flow provides.
- The plan is self-contained (rubric + C1–C4 + exact gates), so a fresh session loses nothing; this session has consumed substantial context, so a fresh start is preferable for execution.
- Parallel agents are NOT warranted — the tasks are sequential and the risky ones (labels, lexicon) want serialized review, not concurrency.
