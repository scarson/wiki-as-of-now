<!-- ABOUTME: Phase 2 holistic final code review of the marker-governs-year DET-3 precision lever (governs.ts). -->
<!-- ABOUTME: Read-only review; independently verifies precision/recall, corpus flag-diff, §2.2 DET-2 invariant, discriminator soundness, honesty. -->

# Phase 2 batch + final review — marker-governs-year (cut 1, DET-3 precision slice)

**Scope:** holistic final pass over the whole `src/detector/governs.ts` filter (all 5 discriminators) + the cumulative picture, on branch `claude/wikiasofnow-detector-phase2-ZP1uQ` at `a822d4b`.
**Mode:** review-only. All verification done with read-only commands + throwaway `npx tsx` scripts (deleted; nothing committed; tree clean).
**Rounds run:** 4 (Round 4 — edge/defensive-path probe — found only confirmations, so review is complete).

---

## Verdict (one line)

**The whole DET-3 lever is sound, precision-safe, honest, and ready to PR → dev.** No MUST-FIX, no SHOULD-FIX, no NIT. Every claim in the plan reproduced independently.

---

## Direct answers to the four required questions

**(1) Precision 0.9697 with no new gold FP and no gold positive dropped?** — YES.
Independently recomputed over `test/gold/gold-set.json` (32 positives / 41 negatives): **TP = 32, FP = 1, precision = 0.9697**. The 1 FP is the pre-existing **fehmarn** case (`fehmarn_belt_fixed_link` "originally expected to be completed by 2018") — no new gold FP. All **32** `stale:true` gold positives are still flagged (dropped-positive set is empty). The precision ratio AND the per-positive flag check were both verified, so a silently-dropped positive masked by the ratio is ruled out.

**(2) Every newly-flagged corpus sentence genuine — any new FP?** — YES genuine, NO new FP.
Corpus flag-diff (current detector vs reconstructed pre-governs detector — `Math.min(...pastYears)` with no skip — over all 136 `test/fixtures/*.wikitext`):
- **Truly newly-flagged sentences (flagged now, absent before): 0.**
- **Anchor-shifted (same sentence, flag year changed): 2** — both beneficial un-maskings, neither a new FP:
  - `flamanville_nuclear_power_plant` **2016→2017**: old anchored to the incidental report-date 2016 ("when in December 2016 The Economist reported…"); the filter drops it, re-anchoring to the marker's real target "the regulator **will** rule on the future of Unit 3 **mid-2017**". Genuine stale claim.
  - `high_speed_2` **1995→2025**: old anchored to the range start 1995 ("doubling from 1995 to 2015"); the range discriminator drops it, re-anchoring to "was **expected to** have insufficient capacity… around **2025**" (the README mixed case). Genuine stale claim.

  (The plan's Task 2.5 deviation called the HS2 sentence "1 newly-flagged"; my diff classifies it as an anchor-shift because the identical `sentenceText` was flagged before at 1995. Same sentence, same beneficial outcome — a methodology-of-comparison difference, not a discrepancy in fact.)
- **Dropped entirely (was flagged, now not): 31** — all legitimate incidental-anchor FP removals: the 23 curated DET-3 FPs plus 8 uncurated incidental drops (ariane_6 `2020–2023` range, crossrail `2017–2018` range, iter `2018–2030` range, inflation_reduction_act `2024–2034` range, m109 `1985-1987` range, stuttgart_21 leading-dateline 2019 → Rule 1 suppress, high_speed_2 `—completed in 2008—` cross-clause, plus the curated set). Spot-checked stuttgart_21 / m109 / ariane_6 directly: each dropped year is genuinely a year the marker does not govern; no real target lost.

  Crucially, **anchor-shift-induced re-triggering of suppress Rules 3/4 produced ZERO new FPs** — the pitfall the plan warned about (dropping an incidental year shifting the anchor so a previously-suppressed sentence flags) did not materialize anywhere in the corpus.

**(3) Recall 1.0, no recall-set loss, §2.2 DET-2 invariant holds?** — YES to all three.
- Reachable recall recomputed over `recall-set.json`: **11/11 = 1.0000**, floor 0.90 green, **no give-back**. Absolute 11/12 (the 12th is the deferred `reachable:false` inline-year-absent entry, by design). No recall-set entry dropped.
- **§2.2 DET-2-out-of-scope invariant verified directly** (`governedYears` + full detector): for "In 2015, X is expected to deliver in 2020", `governedYears` returns `[2015, 2020]` (leading dateline **kept eligible, not dropped**) → detect anchors to min = 2015 → Rule 1 suppression fires at 2015 (penalty 100) → **full detector returns empty** (NOT re-flagged at 2020). This is the load-bearing invariant keeping cut 1 from accidentally performing DET-2 recovery; it holds exactly as designed.

**(4) All 5 sub-shapes gated + gold honest + residuals documented + code clean + gates green?** — YES to all.
- All 5 det3-fp sub-shapes hard-gated to `expect(flaggedFpEntries(s)).toEqual([])` in `det3-fp.test.ts` (cross-clause-aside, noun-modifier, named-entity, parenthetical, range). Min-count composition guard `CURATED_FP_COUNT = 23` intact and equals the actual entry count (23).
- **Gold honest:** the panzerhaubitze mislabel fix is correct — fixture line 96 reads "it is expected to be ready **by 2028**" (future, not stale); 2000 is the product name "PzH 2000 A5". The gold entry is now `stale:false` with an accurate note. Independently re-read the sentence to confirm.
- **Residuals documented honestly:** the two named-entity over-KEEP residuals reproduce exactly (entity-after-marker "models will be shown at CES 2025" → KEEPs 2025; entity-after-bare-prep "During CES 2025 …" → KEEPs 2025) and are recorded in the plan Discoveries as accepted-not-fixed (tightening risks the load-bearing "FY 2022" recall positive). The one-marker-per-sentence / markerIndex-position limitation and the leading-deadline-frame edge are documented in Deviations. Phase 3 (methodology) is the appropriate carrier and is correctly listed as not-yet-started.
- **Code clean:** `governs.ts` is pure/deterministic/LLM-free (no `new Date`, `Date.now`, `fetch`, `require`, `Math.random` — G10 satisfied). No dead code: every internal symbol has ≥2 uses; the unused `flaggedOnAnchorYear` helper is fully removed (zero references in `test/` or `src/`). Readable, well-commented, design-faithful.
- **Gates green + pristine:** `pnpm test` → 16 files / **127 tests passed**, output pristine (no stray errors/warnings/stderr beyond the labeled informational `console.log` blocks). `pnpm exec tsc --noEmit` clean. `pnpm lint` clean. `git status` clean.

---

## Round-by-round findings

### Round 1 — Precision preservation (the contract)
- Recomputed precision independently: **0.9697 (32 TP / 1 FP)**, FP = pre-existing fehmarn, no new gold FP, no gold positive dropped. ✓
- Corpus flag-diff over all 136 fixtures: 0 truly-new sentences, 2 beneficial anchor-shifts (flamanville, HS2 — both genuine stale claims), 31 legitimate FP drops. No new FP from anchor-shift re-triggering suppress Rules 3/4. ✓
- **No findings.**

### Round 2 — Recall integrity
- Reachable recall 11/11 = 1.0, floor 0.90 green, no give-back, no recall-set entry lost. ✓
- Beneficial recall effect noted: the filter un-masked 2 genuine claims (flamanville mid-2017, HS2 ~2025) that the old earliest-incidental-year anchor hid — a positive side-effect of a precision-focused change. ✓
- Commit subjects honest: Task 2.2 states "precision held 0.9706"; no commit claims a recall give-back (correct — there was none). ✓
- **No findings.**

### Round 3 — Discriminator soundness, scope, honesty
- Read all of `governs.ts`. Each discriminator is faithful to design §2 / §2.1:
  - **cross-clause** (incl. `NONLEADING_DATELINE` + `LEADING_SUBORDINATE`): keys on a clause boundary between marker and year (§2.1), never on "participle + in + year" alone — so the forward target "expected to be completed in 2024" (no boundary) survives. ✓
  - **noun-modifier** (incl. deadline-frame escape + marker-position split): determiner/possessive/cap-noun label dropped UNLESS a bare `<prep> <year>` frame, a marker-precedes-year determined frame, or a `by/before/until the <year>` deadline frame. Verified against the KEEP regression cases. ✓
  - **named-entity** (two guards: temporal-prep-as-token, marker-position; plus bare-prep guard): drops `<ProperNoun> <year>`, keeps frames and the marker's complement. ✓
  - **parenthetical/range** (between / from-to + sentence-initial KEEP): balanced-paren detection + adjacency/keyword ranges; sentence-initial "From X to Y" kept as the marker's own window. ✓
- No discriminator strays into DET-1 (historical narration) or DET-2 (dateline recall) territory. §2.2 leading-dateline year is kept eligible and deferred to suppress Rule 1 — DET-2 stays out of scope (verified end-to-end, see Q3).
- All 5 sub-shapes hard-gated; min-count 23 intact; gold mislabel fix correct; residuals honestly recorded.
- **No findings.**

### Round 4 — Defensive-path / edge probe (extra)
- Probed `markerIndex < 0` (marker not literally re-locatable). Found: the position-dependent discriminators (cross-clause, named-entity) correctly bail to KEEP, while position-independent ones (noun-modifier, parenthetical, range) still fire. Confirmed this is **correct-by-design**, not a defect: `markerPosition` uses the identical `\b<phrase>\b` case-insensitive match as `findExpectationMarkers` (markers.ts line 45), so in the production pipeline `chosenMarker` is always word-boundary-locatable → `markerIndex >= 0`. The `< 0` branch is a pure defensive fallback, and bailing-to-KEEP there honors the §4 "when genuinely ambiguous, keep the year" guardrail.
- Probed multi-word markers, balanced-paren-with-later-unrelated-close, hyphenated entity tokens, mid-sentence vs sentence-initial ranges — all behaved as designed.
- **No findings.**

---

## Residuals carried (not blockers — Phase 3 / future tightening)
1. **named-entity over-KEEP** (2 shapes: entity-after-marker, entity-after-bare-prep) — accepted; tightening risks the FY 2022 recall positive. Documented (plan Discoveries).
2. **one-marker-per-sentence / marker-position dependence** — the discriminators reason about a single chosen marker's position; multi-marker sentences use the strongest marker only. Documented (Deviations).
3. **leading-deadline-frame edge** — handled by the deadline-prep escape; documented (Task 2.3 review deviation `1cbe407`).

All three are honestly recorded and appropriately deferred to the Phase 3 methodology write-up (correctly listed as not-yet-started). None affects correctness of the shipped filter.

---

## Evidence trail (commands run, all read-only; scripts deleted)
- `pnpm test` → 16 files / 127 tests passed, pristine.
- `pnpm exec tsc --noEmit` → clean. `pnpm lint` → clean. `git status` → clean.
- Throwaway `npx tsx` scripts (deleted, uncommitted): independent gold-precision + dropped-positive check; 136-fixture corpus flag-diff vs reconstructed pre-governs detector (`git show f6c4dbd:src/detector/detect.ts` confirmed the old Step 3 was `Math.min(...pastYears)`); recall recompute; §2.2 DET-2 end-to-end invariant; named-entity residual repro; edge/defensive-path probes.
