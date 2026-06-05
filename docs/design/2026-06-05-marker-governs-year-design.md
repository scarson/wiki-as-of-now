<!-- ABOUTME: Design spec for the deterministic "marker-governs-year" lever (cut 1: DET-3 incidental-year precision slice). -->
<!-- ABOUTME: Anchors a stale-claim candidate to a year the marker actually governs, not the earliest year by position. -->

# Marker-governs-year — deterministic year-eligibility lever (cut 1: DET-3 precision slice)

**Status:** approved design, 2026-06-05. **Scope:** one focused cut of the roadmap item in `docs/design/detector-precision-methodology.md` §3/§6 ("teach the detector which year a marker governs"). This cut closes the **DET-3 incidental-year false-positive** class. The **DET-2 recall recovery** (re-flagging dateline-and-target sentences at the governed target) is a deliberately deferred follow-up — see §5 (Out of scope).

**Goal (one sentence):** stop the detector from anchoring a stale-claim candidate to a year the marker does not govern (an incidental year in a side-clause, a noun label, a named entity, a parenthetical, or a range), so those false positives disappear — while never dropping a real forward target.

## 1. Background — why the earliest-year choice is the root cause

The detector pairs a sentence's forward **marker** with a past **year**, then suppresses known false-positive shapes (full pipeline: `docs/design/detector-precision-methodology.md` §1–2). The year it anchors to is chosen in `detect.ts` Step 3:

```ts
const chosenYear = Math.min(...pastYears);   // the EARLIEST past year, by value
```

That single choice causes the **DET-3** residual (`docs/pitfalls/implementation-pitfalls.md` DET-3): when the earliest past year is *incidental* — not the marker's target — the candidate is flagged on a year the claim isn't about.

- **"…will replace the Portal Bridge, built in 1910."** — marker `will`; `Math.min` picks 1910; flagged. But 1910 is the bridge's construction date in a participial aside; `will replace` governs no year at all. False positive.
- **"the 2021 update of the IRDS will…"** — 2021 is a noun label, not a target.
- **"CES 2025", "SAP 2005", "(2003)", "2024–2034"** — named-entity / parenthetical / range years that are never temporal targets.

This is distinct from DET-2 (earliest-year × dateline: "In 2015, X was expected to deliver in 2020" anchors to 2015 and is dateline-suppressed, losing the 2020 target). DET-2 is a *recall* loss and is out of scope for this cut; DET-3 is a *precision* loss and is what we fix here.

## 2. Mechanism — a year-eligibility filter (`governs.ts`)

A new pure, deterministic module `src/detector/governs.ts` exposes one function:

```ts
/** Returns the subset of pastYears that `marker` grammatically governs (anchorable targets). */
export function governedYears(sentence: string, marker: string, pastYears: number[]): number[];
```

It classifies each past year by its **local role** and returns only the **target** years, dropping **incidental** ones. The role discriminators (each a small, independently-tested pure predicate):

| Discriminator | Drops a year that is… | Example (dropped year **bold**) |
|---|---|---|
| **cross-clause aside** | in a comma/`;`/`—`/relative-pronoun-bracketed phrase separated from the marker | "will replace the Portal Bridge, built in **1910**" |
| **noun-modifier** | an attributive label on a following noun, or "the `<year>` `<noun>`" | "the **2021** update of the IRDS"; "**2024** Update" |
| **named-entity** | immediately preceded by a non-month proper-noun token | "CES **2025**"; "SAP **2005**" |
| **parenthetical / range** | inside `(...)`, or part of a `<year>[–-]<year>` / "from `<year>` to `<year>`" range | "(**2003**)"; "**2024**–2034" |

A year matching no discriminator is a **target** (anchorable). The single orchestrator change in `detect.ts` Step 3:

```ts
const anchorable = governedYears(text, chosenMarker, pastYears);
if (anchorable.length === 0) continue;   // marker governs no past year → not stale (DET-3 incidental-only)
const chosenYear = Math.min(...anchorable);
```

Everything downstream (`suppress.ts`, `score.ts`) and the marker choice are **unchanged**. This placement preserves the **mixed case**, which is why a filter beats whole-sentence suppression: "the **2021** IRDS roadmap expects production in **2024**" drops 2021, keeps 2024 — the real claim survives, the FP doesn't.

### 2.1 The crux risk — a participle is target *or* incidental depending on clause boundary

The same surface form means opposite things:

- **target:** "…is expected to be **completed in 2024**." → 2024 is the marker's target. **KEEP.**
- **incidental:** "The bridge, **completed in 1998**, will be replaced." → 1998 is a side-clause aside. **DROP.**

So the cross-clause discriminator MUST NOT key on "past-participle + `in` + year." It must key on whether a **clause boundary** (comma, `;`, `—`, or a relative pronoun `which`/`that`/`who`) sits *between the marker and the year* — the lightweight, marker-relative essence of "different clause." This predicate carries the precision risk of the whole cut and gets the heaviest test coverage, including the two examples above as locked regression cases.

### 2.2 Keeping DET-2 out of scope — preserve the leading-dateline year

There is one year a clause-boundary rule could wrongly drop: the **leading sentence-initial dateline** ("**In 2015**, X is expected to deliver in 2020"). That year sits in a different clause from the marker, so a naive cross-clause rule would drop it — leaving 2020 as the sole anchorable year and re-flagging the sentence at 2020. That is exactly the **DET-2 recovery** behavior this cut defers (and its precision risk). So `governedYears` MUST **leave a leading-dateline year eligible**, deferring it to `suppress.ts` Rule 1, which suppresses such sentences today. Net effect for cut 1: "In 2015 … expected … in 2020" stays anchored to 2015 and dateline-suppressed exactly as now — a locked regression test. Only *non*-leading incidental years (trailing/embedded participial asides, noun/label/named-entity/parenthetical/range) are dropped.

## 3. Test strategy — what makes touching the precision-critical core safe

1. **Curate a DET-3 false-positive set** (`test/gold/det3-fp-set.json`). DET-3 FPs are currently *unlabeled* in the gold (the precision methodology deliberately left them out). We must assemble them first: run the **current** detector over the 136-fixture corpus, collect every flagged candidate whose anchor year is incidental, hand-verify, and record each with its sub-shape and `stale: false`. This set (a) sizes the sub-shapes so we build only the discriminators that actually occur (YAGNI), and (b) becomes the regression gate.
2. **`test/detector/governs.test.ts`** — unit tests for each discriminator, the mixed case, the §2.1 participle trap (both directions), and the §2.2 leading-dateline preservation.
3. **Three regression gates, all green:**
   - **Precision** (`precision.test.ts`) stays **≥0.97** — the lever must never reclassify a real target year as incidental and drop a genuine positive.
   - **Reachable-recall floor** (`recall.test.ts`) stays **≥0.90** — a tiny give-back is acceptable (at most one reachable-set entry, 10/11 = 0.909) but MUST be reported in the commit subject and the methodology; the goal remains 1.0.
   - **DET-3 FP gate** — the detector flags **none** of the curated cross-clause + noun-modifier FP set (the dominant sub-shapes; rarer sub-shapes targeted as the curated set warrants).

## 4. Guardrails / invariants

- **Deterministic, pure, LLM-free** (compliance guardrail G10; `docs/policy/wikipedia-genai-compliance.md`). `governs.ts` is pure text classification — no network, no model, no `new Date()`.
- **The filter may only REMOVE anchorable years, never add a flag.** It cannot introduce a new false positive of any other class; the only failure it can introduce is over-aggressively dropping a real target (a recall loss), which the precision gate and recall floor bound.
- **When genuinely ambiguous, keep the year.** Sam's stance for this cut: a *tiny* recall give-back is acceptable for a large precision gain, so discriminators may lean confident — but the gates arbitrate, and any recall give-back is surfaced, never silent.
- **Smallest reasonable change:** one new pure module + one line changed in `detect.ts` Step 3. No change to suppression, scoring, the marker lexicon, or the year regex.

## 5. Out of scope (deferred / YAGNI)

- **DET-2 recall recovery** — re-flagging "In 2015 … expected … in 2020" at the governed target 2020 instead of dateline-suppressing it. This re-engages the precision risk the methodology flagged and needs a broader-corpus recall sample to verify (the 12-fixture recall set is already at 1.0). Explicit follow-up cut; `governs.ts`'s clause-association is the reusable machinery it will build on.
- **Year ranges as a recall *feature*** ("From 2015 to 2022, 24 units will be manufactured" — a real positive the methodology notes a naive range-suppress rule would kill). Here a range is only ever *excluded as an incidental anchor* where safe; it is not *recovered* as a target.
- **Any semantic/LLM parsing**, POS taggers, or dependency-parser dependencies — over-engineered for a bounded set of shapes and a wider trust surface.

## 6. Reasoning — approaches considered and ruled out

- **Incidental-year suppression patterns (in `suppress.ts` style).** Leave year selection alone; suppress the whole candidate when the chosen year is incidental. **Ruled out:** suppresses the whole sentence, so the *mixed* case ("the 2021 roadmap expects production in 2024") loses the real 2024 claim — it trades a precision fix for a recall loss. It also doesn't build the clause-association machinery the deferred DET-2 cut needs. Its only advantage (fits the existing pattern-rule style) is preserved anyway, since our discriminators are themselves small pattern predicates — just applied to *year eligibility* rather than whole-sentence suppression.
- **Deterministic POS/dependency library (wink-nlp / compromise).** **Ruled out:** heavy dependency, taggers are imperfect on Wikipedia prose, over-engineered for ~4 bounded shapes, and widens the trust/compliance surface for no proportionate gain. (Still deterministic, so not G10-disqualified — just not worth it.)
- **Why a filter, not a re-ranker:** we considered "prefer the latest target year." That is the DET-2 move and the methodology's documented trap (re-flags ambiguous historical announcements, lowers precision). The filter only *removes* clearly-incidental years and takes `min` of what remains, so it stays precision-positive by construction.

### Open uncertainties (revisit during execution)
- The empirical sub-shape distribution is unknown until the curated set exists; it may show some discriminators (named-entity, range) are too rare to justify building. Build to the data.
- The cross-clause predicate (§2.1) is the one most likely to need iteration against real corpus sentences; budget review rounds for it specifically.
- Whether changing an anchor from an incidental year to a later target year ever *re-triggers* a suppression rule in a surprising way (e.g. a dateline that now matches) — the precision gate should catch it, but watch for it explicitly.
