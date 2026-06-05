# WikiAsOfNow — Implementation Pitfalls & Review Findings

> **Purpose:** Document implementation traps, design flaws, and corrected decisions that would cause production failures, security vulnerabilities, or data correctness bugs if shipped. This document is the primary code review reference for the WikiAsOfNow codebase.
>
> **Relationship to testing-pitfalls.md:** This document specifies *what* to implement and *why*. `docs/pitfalls/testing-pitfalls.md` specifies *how to verify* those implementations work correctly. They are complementary — cross-references are noted inline.
>
> **Last validated against codebase:** 2026-06-04 (replace when you audit against the current code)

---

## How to Use This Document

This document serves three audiences. Start here, then go directly to the section you need.

**If you're implementing code:** Go to the domain section matching your work area. Each entry has a clear *Flaw → Why It Matters → Fix → Lesson* structure. Follow the Fix. The Lesson teaches the generalizable principle so you'll catch the next instance of this pattern.

**If you're reviewing code:** Go to your domain section's **Review Checklist** at the end. Each item is a pass/fail check derived from the pitfalls above it. If a checklist item fails, read the referenced pitfall for context.

**If you're maintaining this document:** Every pitfall discovered during implementation, review, or debugging MUST be added here. See the maintenance sections at the end of this file. Partial updates cause drift.

---

## Table of Contents

<!-- TODO: replace the example rows below with your project's actual domain sections. -->

| § | Section | You're working on... | Entries | Checklist |
|---|---------|---------------------|---------|-----------|
| 1 | [Data Layer (D1 / SQLite)](#section-1-data-layer-d1--sqlite) | Schema, migrations, SqlExecutor, audit-log persistence | DB-1 | §1.C |
| 2 | [Detector (deterministic stale-claim detection)](#section-2-detector-deterministic-stale-claim-detection) | `src/detector/*` — markers, suppression, scoring, orchestration, fixtures | DET-1 – DET-3 | §2.C |
| — | [Orchestration](#orchestration) | Parallel subagent dispatch and output persistence | ORCH-1 – ORCH-2 | §Orchestration.C |
| A | [Historical Changelog](#appendix-a-historical-changelog) | Provenance, validation dates, review process meta-observations | — | — |
| B | [Unified Summary Table](#appendix-b-unified-summary-table) | All pitfalls at a glance, with severity and status | — | — |

---

# Section 1: Data Layer (D1 / SQLite)

> **Reader context:** I'm building or reviewing schema (`migrations/*.sql`, `src/db/schema.sql`), the `SqlExecutor`/audit-log code, or anything that reads/writes D1.
>
> D1 is SQLite under the hood, and SQLite has sharp, non-obvious edges around rowid tables, type affinity, and constraint evaluation order. Local tests run on `better-sqlite3`, which is the same engine but not configured identically (see testing-pitfalls §8). These pitfalls are about not getting silently-wrong behavior that passes tests but corrupts data.

---

### DB-1: `NOT NULL` Is a No-Op on an `INTEGER PRIMARY KEY` (Rowid Alias)

**The Flaw:** Declaring `page_id INTEGER PRIMARY KEY NOT NULL` (or `... NOT NULL PRIMARY KEY`, or adding `CHECK (page_id IS NOT NULL)`) to *prevent* a NULL insert. None of these reject NULL. An `INTEGER PRIMARY KEY` is an alias for the table's rowid, and SQLite **replaces a NULL with an auto-assigned rowid before any `NOT NULL`/`CHECK` constraint is evaluated.** Verified on SQLite 3.53.1: all three variants accept `INSERT ... (page_id) VALUES (NULL)` and silently fabricate a key.

**Why It Matters:** For a table keyed by a *natural external ID* (e.g. `articles.page_id` = a Wikipedia pageid), a NULL insert from a bug upstream doesn't fail loudly — it creates a row with a fabricated id that collides with nothing and looks valid. Downstream joins/FKs resolve against a garbage key. The "guard" you added gives false confidence because it reads as if NULL is impossible.

**The Fix:** Make the table `WITHOUT ROWID` with the natural key as `PRIMARY KEY NOT NULL`. In a `WITHOUT ROWID` table the PK is the real key (not a rowid alias), so NULL is rejected. This cannot be applied via `ALTER` — it must be set at `CREATE TABLE`, so it belongs in the initial migration (edit the unreleased migration directly; once a migration has run against real D1, you cannot retrofit `WITHOUT ROWID` without a table rebuild migration). Example: `articles` uses `CREATE TABLE articles (page_id INTEGER PRIMARY KEY NOT NULL, …) WITHOUT ROWID;`. FKs that reference a `WITHOUT ROWID` table's PK work normally. Add a regression test that a NULL key is rejected.

**The Lesson:** In SQLite, `PRIMARY KEY` does NOT imply `NOT NULL` (a long-standing spec deviation), and for the special `INTEGER PRIMARY KEY` rowid alias, `NOT NULL` is silently ineffective. Whenever a column is a *natural* key (not a surrogate you're happy to auto-generate), reach for `WITHOUT ROWID` and verify NULL-rejection with an actual insert test — don't trust the DDL to mean what the SQL standard says.

---

### Review Checklist

- [ ] **Natural-key tables are `WITHOUT ROWID` with `PRIMARY KEY NOT NULL`** — a plain `INTEGER PRIMARY KEY` silently auto-assigns a rowid on NULL insert; `NOT NULL`/`CHECK` don't stop it (DB-1)
- [ ] **NULL-rejection is proven by a test, not assumed from the DDL** — insert a NULL key and assert it throws (DB-1)

---

# Section 2: Detector (deterministic stale-claim detection)

> **Reader context:** I'm building or reviewing `src/detector/*` — the pure, LLM-free stale-claim detector (parse → markers → suppress → score → detect) or its fixture/gold-set tests.
>
> The detector flags sentences that make a future-tense/expectation claim anchored to a year now in the past. Its hard invariant is that it is **deterministic and LLM-free** (the "detection is deterministic and explainable" guardrail — `docs/policy/wikipedia-genai-compliance.md`): zero model calls, zero network, zero clock reads anywhere in `src/detector/`. Its design bias is **precision over recall** — a false "stale" flag wastes an editor's attention, so the queue must stay trustworthy. These pitfalls are about keeping precision high without smuggling in nondeterminism.

---

### DET-1: Historical Dateline Narration Is the Dominant False-Positive Class

**The Flaw:** A naive "expectation marker + a past year" detector flags huge numbers of false positives on real articles, because the most common shape of "marker + past year" in Wikipedia prose is **historical narration of a past announcement/statement**, not an unresolved forward claim. Empirically (Phase 2 fixtures), the *majority* of raw flags were sentences like "In March 2013, the administration announced plans to add 14 interceptors", "In 2008, Rear Admiral X said these changes will make…", "In 2021, … with no plans to continue". These are reporting what happened/was said at a past date — the year is the **dateline of the statement**, not a forward target.

**Why It Matters:** Without suppressing this class, precision on real procurement articles is poor (well below the 0.9 gate) and the easy-win queue fills with noise — exactly the failure the compliance doc's "when the detector is wrong" section warns spends editor attention for nothing.

**The Fix:** Suppress a sentence when it **opens with a temporal frame** (`In|By|During|As of|On` + up to three *date-ish tokens* — a day number, a real month name, or an `early|late|mid` qualifier — + a 4-digit year) **AND that frame year equals the claim's anchor year** (`suppress.ts` Rule 1, `DATELINE_REGEX`). The year-match is what makes it precise — a leading dateline whose year is the claim year is narration; a sentence whose forward target differs from the dateline is treated separately. Three sub-traps caught while building the corpus + in review:
- **`On` + full dates dominate at corpus scale.** The single largest FP class across 46 real articles was leading full-date narration: "On 30 August 2018, the Navy announced…", "On April 6, 2009, …Gates announced plans to cut…", "On 21 October 2013, executives stated that the Army plans to downselect…". The frame MUST include `On` and absorb day-numbers (a bounded `(?:<token>){0,3}` run), or these slip through. A sentence that *opens* with a date is narrating an event at that date; genuine forward claims open with their subject.
- The pre-year token slot MUST be constrained to day-numbers + month names + `early|late|mid`, **not** any word (`[A-Za-z]+`). An unconstrained slot matches the filler "the", so "In **the** 2008 budget, the Navy plans to procure…" is wrongly read as a dateline and the real forward claim is lost.
- The year alternatives MUST stay grouped: `(1[89]\d\d|20[0-2]\d)`. An un-grouped `…|20[0-2]\d` lets the bare-year branch match any 20xx year anywhere in the sentence and over-suppress. (The `{0,3}` token bound also keeps the regex linear — no catastrophic backtracking.)

**The Lesson:** For a temporal-claim detector, the lexicon (markers) is the easy 20%; the false-positive suppression is the load-bearing 80%. Build the gold set from **real article output** (run the detector, read what it actually flags) rather than idealized sentences, or you will not discover that dateline narration dominates until production. Tune precision by *improving suppression*, never by deleting gold-set negatives (see testing-pitfalls "Precision gate is a regression gate").

---

### DET-2: Precision-Over-Recall Means Named, Accepted Recall Gaps — Document Them

**The Flaw:** The deterministic detector deliberately trades recall for precision, but the specific recall gaps are non-obvious and easy to mistake for bugs (or to "fix" in a way that tanks precision). If they aren't written down, a future agent either rediscovers them by debugging or removes the suppression that creates them and reintroduces the DET-1 false positives.

**Why It Matters:** Each gap is a real stale claim the detector silently misses. That is acceptable per the design (a missed claim costs nothing; a false flag costs editor trust), but only if it is a *named, deliberate* choice — otherwise it reads as a defect and invites a "fix" that breaks precision.

**The Fix:** Know and preserve these accepted gaps (all verified in Phase 2 review; all are recall losses, never precision losses):
- **Inline-year requirement.** A claim with no 4-digit year *in the same sentence* is never flagged (e.g. SBX-1's "the first such vessel is scheduled to be based in Adak Island" — famously stale, but no inline year). The detector cannot resolve cross-sentence/relative dates deterministically.
- **Earliest-past-year selection + dateline (`detect.ts` Step 3 × `suppress.ts` Rule 1).** `detect.ts` anchors each candidate to the *earliest* past year. For "In 2015, … was expected to deliver in 2020." the chosen year is the dateline (2015), so Rule 1 suppresses the whole sentence and the 2020 forward target is missed. Switching to "prefer the later target year" would re-flag a large set of genuinely-ambiguous historical-announcement sentences (the gold negatives), *lowering* precision — so the earliest-year choice is the precision-favoring one. Do not "fix" it without re-running the precision gate.
- **`By <year>` deadline ambiguity.** "By 2025, the fleet will reach full strength." (a forward deadline, stale once past) is suppressed by the same dateline rule that correctly suppresses "By May 2022, the Navy shifted its plans…". Distinguishing them needs verb-tense analysis; precision-over-recall keeps `By` in the frame and accepts the deadline-recall loss.
- **Mid-sentence attribution (now handled by Rule 4 for the clear cases).** Historical narration where a reporting/event verb is dated *mid*-sentence ("The Indian Army first announced plans to acquire 145 M777s … **in January 2010**.", "Reuters **reported on 1 June 2022** that … plans to sell…", "**released** a draft solicitation **on June 22, 2018** …") is suppressed by `suppress.ts` Rule 4: a past reporting/event verb (`announced|reported|stated|…|awarded|ordered|signed|published|…`) followed, within the same clause, by an `on/in <date>` whose year is the claim's anchor year. **Keep the verb list to event/reporting verbs only** — never forward-action verbs (deliver, field, build, complete, launch), which are often the claim itself ("will be **completed in 2024**"), and require the verb to *precede* the date, so a directly-asserted forward target is never read as a dateline. The remaining residuals — date-*then*-verb ("**in February 2025** it announced…"), `by <year>` deadlines, and non-reporting verbs — are the rising-risk long tail, left unlabeled in the gold set rather than mislabeled.

- **Cross-sentence resolution is a residual FALSE POSITIVE (not a recall gap).** `suppress.ts` Rule 3 only sees resolution cues *within the same sentence*. When a forward claim is resolved/scrapped by the NEXT sentence — e.g. "The Fehmarn Belt bridge was originally expected to be completed by 2018. **However, in late 2010 … an immersed tunnel would instead** present fewer construction risks…" — the detector flags the first sentence (marker + inline year) as stale, but it is not (the plan was abandoned). Surfaced by the recall work, which correctly labels these not-stale; the precision gold has one such entry (fehmarn) labeled `stale:false` to document the class. Catching it would need cross-sentence context, which the sentence-level detector lacks — same root as the other DET-2 gaps (no notion of which year/claim is live). Left as a documented residual FP, caught downstream by the human-verification gate.

**The Lesson:** When a design bias (precision over recall) creates deliberate blind spots, enumerate them next to the code and in the plan's Discoveries. A recall gap that is written down is a design decision; the same gap undocumented is a latent bug report waiting to waste a future session.

---

### DET-3: Incidental Historical Years Are an Irreducible False-Positive Class

**The Flaw:** The detector flags `marker + earliest past year`. But a sentence can contain a future-tense marker whose claim has **no target year at all**, alongside an *incidental* past year that belongs to background context — a founding/built/launch date, a year range, or a parenthetical. The year-gate and dateline rules don't catch these because the year is real and past; it just isn't the claim's anchor. Surfaced across the 100-fixture corpus (the new-domain wave especially):
- "The Portal Bridge Replacement **will replace** the existing Portal Bridge, **built in 1910**, with the Portal North Bridge…" → flagged at year 1910, score 117.
- "A station of the same name existed on the Curzon Street site **between 1838 and 1966**; the surviving … building **will be retained**…" → 1966.
- "HMS Belfast (C35), a museum ship, **will be named** 'HMS Belfast **(1938)**'…" → 1938.
- "The Trace Gas Orbiter (TGO), **launched in 2016**, **will operate** as the data-relay satellite…" → 2016.

Two register-specific variants seen in the policy/biomedical wave (same root — the flagged year is not the claim's stale target): **years inside named standards** ("the EPC will need … **SAP 2005**", "dwellings built to **Part L 2010** will be completed…") and **regulatory effective-dates** ("**From July 2022** new buildings **will need** provision…", "**will apply** … in 2023") — a standing legal requirement that reads as stale but is in force. Neither is safely suppressible (a leading `From` frame collides with the "From 2015 to 2022 … will be manufactured" positive). See `docs/design/detector-precision-methodology.md` §5.

**Why It Matters:** These produce *high* scores (old year ⇒ large `temporalRisk`), so they look like the most confident flags while being clearly wrong — corrosive to queue trust. They are a meaningful slice of the residual end-to-end false positives.

**The Fix (cut 1 shipped — `src/detector/governs.ts`):** the obvious *whole-sentence* fixes are traps:
- Suppressing the year when it sits in a `from X to Y` / `between X and Y` range **over-suppresses a genuine positive** ("**From 2015 to 2022**, 24 units **will be manufactured**" is a real stale production plan — a gold positive). Range ≠ historical.
- Adding `built|launched|completed|opened` to the Rule-4 verb list **breaks forward claims** ("will be **completed in 2024**") because those verbs are tense-ambiguous (`was built` vs `will be built`) and regex can't reliably read the auxiliary.

The working fix is NOT whole-sentence suppression but a **year-eligibility filter**: in `detect.ts` Step 3, before choosing the anchor, filter the past years to those the marker actually governs (`governedYears`), then take `min` of those; skip if none. Each year is classified by local role — cross-clause aside (a clause boundary sits between the marker and the year), noun-modifier ("the 2021 update"), named-entity ("PzH 2000"), parenthetical/range — and incidental roles are dropped. This sidesteps both traps because it filters **years, not sentences**, so the mixed case ("the **2021** roadmap expects production in **2024**") keeps its real target 2024 while dropping the incidental 2021. Result: the 23-entry curated DET-3 FP set (`test/gold/det3-fp-set.json`, 5 sub-shapes, all hard-gated to `expect([])` in `test/detector/det3-fp.test.ts`) plus ~8 uncurated incidental FPs dropped over the 136-fixture corpus, **precision held 0.9697, reachable recall 1.0** (2 genuine claims un-masked). A leading **sentence-initial dateline** year is deliberately kept eligible (deferred to suppress Rule 1) so this stays DET-3-only and does not stray into DET-2 (`docs/design/2026-06-05-marker-governs-year-design.md` §2.2). **Known residuals** (accepted, not yet fixed): named-entity over-KEEP when a genuine entity name follows the marker; a leading deadline-frame edge; the one-marker-per-sentence limit — see the lever's plan Discoveries.

**The Lesson:** "no deterministic discriminator exists" was too pessimistic — it was true only for the *whole-sentence* framing. Re-framing the question from "should this sentence be suppressed?" to "which year does the marker govern?" exposed a deterministic signal (clause position + per-year role) that closes most of the class without trading a visible FP for an invisible recall loss. When a deterministic approach hits a wall, check whether you're solving at the wrong granularity before declaring the floor irreducible.

---

### Review Checklist

- [ ] **No model/network/clock/async in `src/detector/`** — grep the dir AND its import graph for `Date`, `now`, `fetch`, `random`, `async`, `await`, `Promise`, `import .*research`; matches must be doc-comment-only (DET-1 invariant; testing-pitfalls §8 has the determinism check)
- [ ] **Dateline suppression uses the grouped year regex AND a constrained month/qualifier slot** — not `[A-Za-z]+` (which matches "the"); year alternatives grouped (DET-1)
- [ ] **Suppression rules require their disambiguating context** — Rule 3 needs a resolution verb after `later/subsequently/ultimately`, not the bare adverb (DET-1)
- [ ] **Gold set built from real detector output, not idealized sentences** — run the detector on the fixtures and label what it actually flags (DET-1)
- [ ] **Accepted recall gaps are documented in the plan + here, not silently present** — inline-year requirement, earliest-year/dateline interaction, `By`-deadline, mid-sentence attribution (DET-2)
- [ ] **Mid-sentence attribution (Rule 4) uses event/reporting verbs ONLY, verb-before-date** — never forward-action verbs (deliver/build/complete/launch), or "will be completed in 2024" gets wrongly suppressed (DET-2)
- [ ] **Incidental historical years are NOT "fixed" with a range/verb rule** — those traps over-suppress real positives ("From 2015 to 2022 … will be manufactured") or break forward claims; leave the FP unlabeled, don't game precision (DET-3)

---

## Orchestration

Pitfalls that arise when a session dispatches parallel subagents and consolidates their output. The canonical rules live in `docs/git-strategy.md` → §Multi-agent coordination → Output persistence. This section is the discovery hook for plan writers who arrive here via the `writing-plans-enhanced` (or equivalent) mandated-read path — it does NOT restate the rules in full.

### ORCH-1: Analysis Dispatches Must Persist Findings Before Returning

**Trigger:** Your plan dispatches parallel subagents (bug hunts, audits, phased analysis, parallel investigations) whose findings would be expensive to regenerate if lost.

**What you need to do:** Every such dispatched subagent MUST write its complete report to a persistent file BEFORE returning; the response message is not the sole record.

**Read the full rule:** `docs/git-strategy.md` → §Multi-agent coordination → Output persistence. That section carries the copy-pasteable prompt block (with `<PERSISTENCE_PATH>` substitution), file-path conventions, orchestrator commit cadence, and the cases where the rule doesn't apply.

**Why this is in implementation-pitfalls:** because the plan-writing skill mandates reading this file, and this rule has to be noticed at plan-write time (when the dispatch prompts are being drafted), not at execution time (when it's too late). The failure mode — orchestrator context compacting mid-consolidation and lossily dropping findings — is predictable and preventable if the plan author builds persistence into the dispatch prompts from the start.

### ORCH-2: Subagents Sharing the Working Tree Must Not Move HEAD

**The Flaw:** A dispatched subagent (commonly a *review* subagent inspecting a specific commit) runs `git checkout <sha>` / `git switch` / `git reset` in the shared repository. Subagents in this environment operate in the *same* working tree as the orchestrator, so moving HEAD detaches it for everyone.

**Why It Matters:** After a reviewer detaches HEAD at some commit, the orchestrator's next `git commit` lands on the **detached HEAD**, not on the feature branch. The branch ref silently stops advancing; `git push` fails with `HEAD (no branch)` or, worse, the commit looks fine locally but isn't on the branch anyone is tracking. Recovery is possible (`git branch -f <branch> <sha>` + `git checkout <branch>`) but only if you notice before more work piles on the wrong ref. This actually happened in Phase 1: a Task 1.2 reviewer ran `git checkout` to inspect a commit and a follow-up controller commit detached off the branch.

**The Fix:** (1) Every review/inspection subagent prompt MUST forbid HEAD-moving commands and direct the agent to inspect via `git show <sha>`, `git diff <a> <b>`, `git log`, and reading files in place — none of which move HEAD. (2) The orchestrator checks `git status -sb` (first line shows `## <branch>...`, not `## HEAD (no branch)`) after each subagent batch and before each commit.

**The Lesson:** In a shared-working-tree multi-agent setup, HEAD/branch state is global mutable state. Treat any subagent git command that moves HEAD the way you'd treat a subagent `cd` that escapes the repo — prohibit it in the prompt, and verify the invariant after the batch.

### Review Checklist

- [ ] **Dispatch prompts include the mandatory-persistence block** — copy from `docs/git-strategy.md` §Output persistence; substitute `<PERSISTENCE_PATH>` with a durable per-subagent path (ORCH-1)
- [ ] **Plan specifies exact persistence paths, not "write somewhere useful"** — ambiguous paths default to `/tmp` under pressure, which doesn't survive (ORCH-1)
- [ ] **Orchestrator commits subagent artifacts wave-by-wave** — committed files land on the campaign branch before consolidation begins (ORCH-1)
- [ ] **Review/inspection subagent prompts forbid `git checkout`/`switch`/`reset`** — shared working tree; use `git show`/`diff`/`log` instead (ORCH-2)
- [ ] **Orchestrator verifies `git status -sb` shows the branch (not detached HEAD) after each subagent batch and before committing** (ORCH-2)

---

# Appendix A: Historical Changelog

<!-- TODO: Add changelog entries as the document evolves. Format: -->
<!-- ## YYYY-MM-DD — <event> -->
<!-- - Added PREFIX-N (<title>) — <what and why> -->
<!-- - Updated PREFIX-M — <what changed> -->

## 2026-06-05 — Phase 2 (deterministic detector) shipped
- Added Section 2 (Detector) with DET-1 (historical dateline narration is the dominant false-positive class; suppress via leading-frame + year-match, with a constrained month slot and grouped year regex) and DET-2 (named, accepted precision-over-recall recall gaps: inline-year requirement, earliest-year/dateline interaction, `By`-deadline, mid-sentence attribution). Both surfaced building the Phase 2 precision gate and were confirmed by the 3-round batch review (`docs/plans/phase2-review/`).
- **Corpus expansion (50-fixture gold set):** updated DET-1 — the leading-dateline frame must include `On` and absorb full dates ("On 30 August 2018, …"), the dominant FP at corpus scale; updated DET-2 — mid-sentence attribution ("X reported on &lt;date&gt; that … plans to …") is the main remaining residual FP, left unlabeled in the gold set. See `docs/plans/phase2-review/round-4-corpus.md`.
- **100-fixture corpus + new domains:** implemented `suppress.ts` Rule 4 (mid-sentence attribution — reporting/event verb + `on/in <date>` of the claim year), updating DET-2. Added 50 new-domain fixtures (space, rail/transit, infrastructure, nuclear, civil aviation, naval); gold set → 59 entries, precision 1.0. The new domains surfaced **DET-3** (incidental historical years — "will replace the bridge, built in 1910" flags at 1910), documented as an irreducible deterministic FP floor with no safe regex fix.

---

# Appendix B: Unified Summary Table

<!-- TODO: One row per pitfall for at-a-glance review. Keep in sync with the sections above. -->

| ID | Title | Severity | Status | Domain |
|----|-------|----------|--------|--------|
| ORCH-1 | Analysis Dispatches Must Persist Findings | HIGH | VALIDATED | Orchestration |
| ORCH-2 | Subagents Sharing the Working Tree Must Not Move HEAD | HIGH | VALIDATED | Orchestration |
| DB-1 | `NOT NULL` Is a No-Op on an `INTEGER PRIMARY KEY` (Rowid Alias) | MEDIUM | VALIDATED | Data Layer |
| DET-1 | Historical Dateline Narration Is the Dominant False-Positive Class | HIGH | VALIDATED | Detector |
| DET-2 | Precision-Over-Recall Means Named, Accepted Recall Gaps | MEDIUM | VALIDATED | Detector |
| DET-3 | Incidental Historical Years Are an Irreducible False-Positive Class | MEDIUM | VALIDATED | Detector |

Severity levels: `CRITICAL` (production data loss / security), `HIGH` (correctness bug under predictable conditions), `MEDIUM` (correctness bug under edge cases), `LOW` (cleanliness / clarity).

Status values: `VALIDATED` (prescribed fix is implemented and tested), `UNIMPLEMENTED` (pitfall documented but fix not yet in code), `SUPERSEDED` (replaced by another entry or no longer applicable).

---

# Appendix C: Document Maintenance Guide

## When to Update This Document

Update this document when any of the following occur:

| Trigger | Action |
|---------|--------|
| Bug hunt finds a generalizable pattern | Add a pitfall to the appropriate domain section |
| Health review flags a cross-cutting issue | Add or strengthen a pitfall |
| Implementation reveals a prescribed fix was wrong | Update the existing pitfall to match reality — the code is the source of truth |
| Code review catches a pitfall already documented here | Strengthen the entry with the new example |
| A pitfall's prescribed fix is implemented | Update the entry's status in Appendix B |
| A feature is removed or an approach abandoned | Mark the pitfall as SUPERSEDED with a note explaining why |
| testing-pitfalls.md adds a new section | Check if a cross-reference should be added here |

**Do NOT update this document for:**

- One-off implementation bugs that don't generalize to a pattern
- Code style preferences or formatting choices
- Performance optimizations without correctness implications

---

## How to Add a Pitfall

### Step 1: Choose the domain section

If the pitfall spans two domains, place it where the reader is most likely to look when they encounter the bug. Add a "See Also" cross-reference in the other section.

### Step 2: Assign the next ID

IDs are sequential within each section (`AUTH-3`, `DB-12`, etc.). Check the last entry in the section and increment. Use a short prefix that matches the section (2-5 letters, uppercase, descriptive).

### Step 3: Write the entry

**For complex findings** (non-obvious failure mode or architectural fix):

```markdown
### SECTION-N: Title

**The Flaw:** What the code does wrong or what's missing.
**Why It Matters:** The production failure mode — what breaks, for whom, and why it's hard to detect.
**The Fix:** The specific code change or pattern to apply. Include a code example when the fix is non-trivial.
**The Lesson:** The generalizable principle. What should the reader watch for in future code?
```

**For simple findings** (one-line pattern substitution, self-evident why):

```markdown
### SECTION-N: Title
[One paragraph: what's wrong, what to do instead, and why. No code example needed.]
```

**Use the right heuristic:** If an implementing agent could correctly apply the fix from just a one-line description without understanding the failure mode, use the condensed format. If they'd need to understand WHY to apply it correctly, use the full format.

### Step 4: Update the review checklist

Add a checkbox item to the section's review checklist (§X.C) that captures the key check for this pitfall.

### Step 5: Update the Table of Contents

Update the entry count in the TOC table (e.g., `AUTH-1 – AUTH-12` becomes `AUTH-1 – AUTH-13`).

### Step 6: Update the Summary Table

Add a row to Appendix B with the pitfall ID, title, severity, status, and domain.

### Step 7: Check for cross-references

- Does testing-pitfalls.md need a corresponding test guidance entry?
- Does another domain section need a "See Also" pointer?
- Does the same pattern exist elsewhere in the codebase? Grep for other instances.

---

## How to Update an Existing Pitfall

1. **Read the current entry** and understand its intent
2. **Check the code** to see what actually changed
3. **Update the entry** to reflect reality — never preserve a prescription that contradicts the code
4. **Update Appendix B** status if it changed (e.g., `UNIMPLEMENTED` → `VALIDATED`)
5. **Check Appendix A** — add a changelog line noting the update date and reason

---

## How to Mark a Pitfall as Superseded

Do NOT delete pitfall entries. Mark them:

```markdown
### SECTION-N: Title

> **SUPERSEDED (YYYY-MM-DD):** [Reason — e.g., "Feature removed in Phase 12" or "Replaced by SECTION-M which covers the broader pattern"]

[Original content preserved below for historical context]
```

Update Appendix B status to `SUPERSEDED`.

---

## Completeness Checklist

**A pitfall update is not complete until ALL of these are done.** Partial updates are how this document drifts — and a drifted document is worse than no document, because it creates false confidence in protections that don't exist.

- [ ] Entry written in the correct domain section with the correct format
- [ ] Entry has the next sequential ID for its section
- [ ] TOC entry count updated
- [ ] Appendix B summary table row added/updated
- [ ] Review checklist (§X.C) updated with the corresponding check item
- [ ] Cross-references checked: testing-pitfalls.md, other domain sections, See Also block
- [ ] If the pattern could exist elsewhere in the codebase: grepped for other instances
- [ ] Appendix A changelog updated with date and source

**If you skip any of these steps, the next agent to read this document will not find your pitfall.** The TOC is the routing table — without it, your entry is invisible. The summary table is the audit trail — without it, the next health review won't know your finding was addressed.

---

## Voice and Style Reference

This document uses persuasion principles to ensure agents follow critical practices:

- **Authority** for bright-line rules: "MUST", "Never", "Always", "No exceptions"
- **Implementation intentions** for triggers: "When writing a PATCH handler, ALWAYS use pointer types"
- **Social proof via failure modes**: "Without this, the webhook client follows redirects to internal metadata endpoints — every time"
- **Commitment** via checklists: the review checklists at the end of each section

When writing pitfall entries, apply these principles. A pitfall that says "consider using X" will be ignored under pressure. A pitfall that says "MUST use X — without it, Y happens every time" will be followed.

Reference: the `superpowers:writing-skills` skill (or equivalent in your skill library) carries the full persuasion-principles framework if you want to go deeper.
