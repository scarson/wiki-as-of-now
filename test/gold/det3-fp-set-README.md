<!-- ABOUTME: Companion to det3-fp-set.json — how the DET-3 incidental-anchor false-positive set was built, its sub-shape distribution, mixed cases, and the honesty protocol followed. -->
<!-- ABOUTME: Read alongside docs/design/2026-06-05-marker-governs-year-design.md (§1 sub-shapes, §2 discriminators, §3 test strategy), which this set was built to support. -->

# DET-3 false-positive gold set — build, distribution, and protocol

`det3-fp-set.json` is the curated set of **DET-3 incidental-anchor false positives**:
sentences the *current* deterministic detector flags where the anchor year it chose
(`Math.min(...pastYears)`) is **incidental** — not the year the forward marker governs.
This set is Task 1.1 of the marker-governs-year work (design
`docs/design/2026-06-05-marker-governs-year-design.md`). It exists so Phase 2 can
(a) prove its year-eligibility filter (`governs.ts`) drops these FPs, and (b) gate
against regressions; and so its **sub-shape distribution** decides which discriminators
Phase 2 builds (a discriminator is built only for sub-shapes with ≥2 instances — YAGNI,
design §3 / Open uncertainties).

## How the set was built

1. **Scan (throwaway).** A script (`npx tsx`, deleted before commit) ran the current
   detector — `detectStaleClaims(parseArticle({title, revisionId:1, wikitext}), 2026)`
   — over every one of the **136** `test/fixtures/*.wikitext` fixtures and printed each
   flagged candidate's `sentenceText`, `year` (the anchor), `marker`, and `fixture`. The
   scan produced **262 flagged candidates** across the 136 fixtures.
2. **Hand-verify + label.** Every one of the 262 flagged candidates was read. For each,
   the judgment was: *is the anchor year the marker's actual forward target, or
   incidental?* Only the **incidental-anchor** candidates were kept, recorded with their
   sub-shape, `anchorYear`, `stale: false`, and a per-entry note explaining why the anchor
   is incidental. Candidates whose anchor year **is** the marker's target — including
   resolved-historical narration where the target year is governed (e.g. m109_howitzer
   "scheduled for 1985-1987") and range-as-target forward windows (see "Excluded as
   not-incidental" below) — were left out: those are either correct flags or out-of-scope
   FP classes, not DET-3.

The detector was run with `asOfYear = 2026` (pinned), against committed fixtures — no
network at scan or test time (testing-pitfalls §9 determinism).

## Honesty protocol (testing-pitfalls §9)

- **Built from real detector output, never idealized sentences.** Every entry is a
  sentence the current detector *actually flags*; nothing was hand-written to inflate a
  number. The scan → read → label order was followed exactly.
- **Labeled from the sentence, not to hit a target.** A sentence is a DET-3 FP **only**
  when the anchor year is genuinely *not* the marker's target. Borderline cases where the
  year frames the marker's own forward window, or is the temporal horizon of the
  expectation, were **excluded**, not stretched into the set (see below).
- **Already-suppressed sentences are not in the set.** The scan reports post-suppression
  flags only, so every entry is a *live* FP — not a sentence `suppress.ts` already drops.
- **Min-count composition guard.** `det3-fp.test.ts` hardcodes the curated total (**23**)
  and asserts `fpSet.length >= 23`, so a future edit cannot pass a (Phase 2) FP gate by
  deleting curated entries instead of legitimately suppressing them. The baseline-reporting
  test also asserts flagged-today == curated per sub-shape, so a silently-unflagged entry
  is caught before it becomes an `expect([])` gate.

## Sub-shape distribution (drives Phase 2)

**Total curated DET-3 FPs: 23.** A discriminator is built in Phase 2 only for sub-shapes
with **≥2** instances — by this distribution, **all five** sub-shapes clear the bar.

| Sub-shape | Count | Build discriminator? | Examples (anchor year **bold**) |
|---|---|---|---|
| **noun-modifier** | 9 | yes | "the **2021** update of the IRDS"; "the **2009** estimate"; "the **2025** federal government shutdown" |
| **parenthetical** | 6 | yes | "(fiscal **2010** dollars)"; "(in **2025** prices)"; "(estimated at $12 billion as of April **2024**)" |
| **cross-clause-aside** | 3 | yes | "…built in **1910**"; "Though tunneling had still not begun by mid-**2025**, … scheduled to begin in mid-2026" |
| **named-entity** | 3 | yes | "PzH **2000**"; "CES **2025**"; "MSPO **2024**" |
| **range** | 2 | yes (exactly at threshold) | "between 1838 and **1966**"; "from **1995** to 2003" |

Notes on classification judgment calls:

- **Dual-classifiable entries are assigned to the most specific predicate.** Several
  entries match more than one discriminator (e.g. "between 1838 and 1966" is both a *range*
  construct and sits before a `;` clause boundary; the "2020 survey" noun-modifier is also
  before a `;`). The rule applied: **if the anchor sits inside an explicit range construct
  (`from X to Y`, `X–Y`, `between X and Y`), classify as range**; otherwise prefer the
  noun-modifier / named-entity / parenthetical role over the broader cross-clause role.
  This keeps `range` at a real 2 (meeting its build threshold) rather than collapsing it
  into cross-clause. Either discriminator would catch these in Phase 2, so the assignment
  affects only which discriminators are *built*, not correctness.
- **named-entity vs noun-modifier** is keyed on order: `<ProperNoun> <year>`
  ("CES 2025") is named-entity; `<year> <Noun>` ("2011 Fukushima nuclear disaster") is
  noun-modifier.

## Mixed cases (incidental earliest year **+** a real governed target — NOT FPs)

Per the design (§2) and task: a sentence with **both** an incidental earliest year **and**
a real later target the marker governs is **not** a DET-3 FP — the detector *should* flag
it, at the target. Phase 2's filter drops the incidental year and anchors to the target.
These are recorded here (fixture + both years) but deliberately **excluded** from the
`stale: false` set:

| Fixture | Incidental earliest year (role) | Governed target year | Sentence gist |
|---|---|---|---|
| `m109_howitzer.wikitext` | 1984 ("Developed from 1984", leading participial) | 1991 | "Developed from 1984 … with original plans to **field the weapon in 1991** …" |
| `high_speed_2.wikitext` | 1995 ("doubling from 1995 to 2015" range, em-dash aside) | 2025 | "…doubling from 1995 to 2015… **was expected to have insufficient capacity sometime around 2025**" |
| `stuttgart_21.wikitext` | 2010 ("(made in 2010)" parenthetical) | 2025 | "…operations had been **expected to start in December 2025** … (made in 2010)" |

All three governed targets (1991, 2025, 2025) are < 2026, so each is a valid past anchor
the detector should keep. Phase 2's filter must preserve these — they are the reason a
year-eligibility *filter* beats whole-sentence suppression (design §2, §6).

## Excluded as not-incidental (range-as-target and temporal-horizon years)

These flagged candidates were read and **deliberately not labeled FPs** because the anchor
year is the marker's own forward window or temporal horizon — the year *is* governed:

- **Range that is the marker's forward window.** `k9_thunder` "**From 2015 to 2022**, 24
  units will be manufactured" (the design's named real positive — range ≠ historical,
  design §5 / implementation-pitfalls DET-3); `iter` "in the **2018**–2030 period, it will
  generate…"; `ariane_6` "transitional period of **2020**–2023 when Ariane 5 will be phased
  out"; `inflation_reduction_act` "$851 billion in new revenue from **2024**–2034";
  `crossrail` "scheduled to be tested … over the winter of **2017**–2018"; `armored_multi-purpose_vehicle`
  "**After 2020**, the Army planned to buy … over ten years". In each the range/frame year
  is the start of the forward action's own window, so dropping it would be a recall loss.
  Contrast the two *kept* range FPs (1966, 1995), where the range belongs to a *different
  subject's past*, not the marker's future.
- **Year is the expectation's temporal horizon (noun-modifier surface, but governed).**
  `inflation_reduction_act` "a boost in **the 2022 midterm elections**" and "not be felt
  before **the 2024 election**" surface-match "the `<year>` `<noun>`", but the year is the
  *when* of the expectation, not an inert label. These are a **noun-modifier over-drop
  risk** for Phase 2: a naive `the <year> <noun>` predicate would wrongly drop them. Flagged
  here so the Phase 2 discriminator is tested against them (it must not drop a year that is
  the marker's temporal target).
- **Leading-dateline residual outside this lever's scope.** `square_kilometre_array`
  "**By mid-2019**, … were expected to start no earlier than 2027" is flagged only because
  the hyphen in "mid-2019" defeats `suppress.ts` Rule 1's date-token run; design §2.2 keeps
  leading-dateline years *eligible* (deferred to suppression), so Phase 2's filter does not
  drop it. It is a dateline/suppression gap (DET-1 family), not a DET-3 incidental-anchor
  FP, and is excluded.

## What the test (`det3-fp.test.ts`) asserts

1. **Structural** — every entry has all fields; `stale === false`; `subShape` ∈ the five
   allowed values; `anchorYear` is a number; `sentenceSubstring` is non-empty and occurs in
   the named fixture's parsed sentence text.
2. **Min-count guard** — `fpSet.length >= 23` (the curated total, hardcoded), so the gate
   can't be passed by deletion.
3. **Baseline reporting (passes unconditionally for now)** — one labeled `console.log`
   block reporting `flaggedFpEntries(subShape).length` per sub-shape. Today every curated
   entry is flagged (these are the current detector's FPs), so flagged-today == curated per
   sub-shape. **Phase 2 replaces each sub-shape's baseline line with a hard
   `expect(flaggedFpEntries("<shape>")).toEqual([])`** as its discriminator lands.
