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
| 1 | [Data Layer (D1 / SQLite)](#section-1-data-layer-d1--sqlite) | Schema, migrations, SqlExecutor, audit-log persistence | DB-1 – DB-2 | §1.C |
| 2 | [Detector (deterministic stale-claim detection)](#section-2-detector-deterministic-stale-claim-detection) | `src/detector/*` — markers, suppression, scoring, orchestration, fixtures | DET-1 – DET-3 | §2.C |
| 3 | [Safe-lane / untrusted-content scanning](#section-3-safe-lane--untrusted-content-scanning) | `src/safelane/*` — wikitext signal scans running on attacker-controllable article content | SAFE-1 | §3.C |
| 4 | [Deploy / CI (wrangler, GitHub Actions, OpenNext)](#section-4-deploy--ci-wrangler-github-actions-opennext) | `wrangler.jsonc`, `workers/research/wrangler.jsonc`, `.github/workflows/*`, OpenNext build | CI-1 – CI-2 | §4.C |
| 5 | [Research enqueue gating & metered spend](#section-5-research-enqueue-gating--metered-spend) | every path onto the metered/G11 research lane; per-user + global quota | GATE-1 – GATE-2 | §5.C |
| — | [Orchestration](#orchestration) | Parallel subagent dispatch and output persistence | ORCH-1 – ORCH-3 | §Orchestration.C |
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

### DB-2: The `SqlExecutor` Port Must Bind Params via `bind()`, Shaped by D1's Stricter Contract

**The Flaw:** The `SqlExecutor` seam (`src/db/client.ts`) stands in for two engines with *different* calling conventions. better-sqlite3 accepts params inline (`stmt.run(...args)` / `stmt.all(...args)`), has no required bind step, and `all()` returns a bare array. Cloudflare D1 **requires** `stmt.bind(...params)` *before* `run()`/`all()` (which take no args), and `all()` returns a `{ results }` **envelope**, not an array. An async port that keeps better-sqlite3's convention (params passed to `run(...args)`, `all()` returning an array) works locally and silently mis-shapes the D1 adapter — green tests, broken prod.

**Why It Matters:** Tests run on better-sqlite3 (testing-pitfalls §8); D1 only runs in deployed Workers. A seam shaped by the lenient local engine passes every test and then throws or mis-binds the moment it touches real D1 — exactly the divergence the local↔D1 parity discipline exists to prevent, but at the API-shape level rather than the FK level.

**The Fix:** Shape the port by the **stricter** engine. The port is async and binds uniformly: `prepare(sql).bind(...params).run()` / `.all<T>()` (run/all take no args). The D1 adapter delegates to D1's `bind` and **unwraps `all().results`** to a plain array; the better-sqlite3 adapter captures params in `bind()` and applies them at `run`/`all`, returning resolved Promises. Do **not** surface `lastInsertRowid`/`changes` on the port unless a caller needs it — the two engines report it differently (better-sqlite3 `lastInsertRowid` vs D1 `meta.last_row_id`), so adding it later (shaped, again, by both) is cheaper than carrying a wrong abstraction. Likewise, the port has no transaction/batch primitive yet; a multi-statement replace (delete-then-insert) is sequential and idempotent-on-re-run rather than atomic — if atomicity becomes required, add D1 `batch()` behind the port, don't special-case better-sqlite3 transactions.

**The Lesson:** When one interface abstracts two implementations, design it against the **least forgiving** contract, not the one your tests happen to run on. The lenient engine will pass anything; only the strict engine's requirements (D1's mandatory `bind`, its result envelope, its distinct metadata field names) tell you the true shape of the seam.

---

### Review Checklist

- [ ] **Natural-key tables are `WITHOUT ROWID` with `PRIMARY KEY NOT NULL`** — a plain `INTEGER PRIMARY KEY` silently auto-assigns a rowid on NULL insert; `NOT NULL`/`CHECK` don't stop it (DB-1)
- [ ] **NULL-rejection is proven by a test, not assumed from the DDL** — insert a NULL key and assert it throws (DB-1)
- [ ] **Data-layer calls bind via `prepare(sql).bind(...).run()/.all()`** — never pass params to `run`/`all`; that's better-sqlite3-only and breaks on D1 (DB-2)
- [ ] **The D1 adapter unwraps `all().results` to a plain array** — callers must never see D1's `{ results }` envelope (DB-2)

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

# Section 3: Safe-lane / untrusted-content scanning

> **Reader context:** I'm building or reviewing `src/safelane/*` — the wikitext signal scanner that the safe-lane gate and the easy-win lane both call on article content fetched from Wikipedia.
>
> Fetched article wikitext is **attacker-controllable** (G15 of the compliance contract — `docs/policy/wikipedia-genai-compliance.md`): any Wikipedia editor can craft a maximally-adversarial article and request a scan. The easy-win lane runs this scanner at fan-out scale across many articles per Worker invocation. These two facts combine to make **superlinear-time input scans a Cloudflare Worker CPU-DoS vector**, cheaply amplified on the public instance. Scans that are provably linear in input length are a hard requirement here.

---

### SAFE-1: Untrusted-Input Scans MUST Be Linear-Time in Input Length

**The Flaw:** `scanWikitextSignals` in `src/safelane/wikitext-signals.ts` used a `matchAll` regex where the captured body group started with a bounded class — e.g. `([^…]{1,100})`. This causes the engine to scan up to the bound length from **every delimiter start position**: on a `{{`/`[[` delimiter-spam article, that is O(n × bound) work — quadratic-feeling in practice, reaching ~1 s CPU at the 2 MB MediaWiki article size ceiling. The standard mental model of "bounded quantifier ⇒ bounded cost per match" misses that cost is **match-start count × per-start work**, and delimiter spam maximises start count without ever producing a real match.

**Why It Matters:** The scanner runs on attacker-controllable wikitext. The easy-win lane calls it at fan-out scale (many articles per Worker invocation). A superlinear scan converts an article-shaped HTTP request into a Cloudflare Worker CPU-DoS — no auth bypass required, cheaply amplified on the public instance. The safe-lane gate has the same exposure; it checks every article before allowing it into the research queue.

**The Fix:** Make each **failing** match-start O(1) by requiring the **first captured character** to exclude the opening/closing delimiters and common separators. For a `{{template|…}}` scan: require the first body char to be `[^{}|\n]`; for a `[[link|…]]` scan: `[^[\]|\n]`. With this in place, delimiter spam (`{{{{{{{{…}}}}}}}}`) is rejected at position 0 of the potential body — no body scan occurs. Verify linearity with a **pathological-input perf test**: construct a multi-MB string of pure delimiter spam, run `scanWikitextSignals` on it, and assert the result is `[]` within a tight time bound (see `test/safelane/wikitext-signals.test.ts`).

**The Lesson:** When a regex runs over untrusted input, reason about **match-start count × per-start work**, not just per-match length. A bounded body group caps per-match cost but does nothing to limit start count. Cap the **number of viable starts** by constraining the first character of the match body so delimiter spam is rejected O(1) per position. Prove linearity with a pathological-input perf test asserting a tight time bound — don't rely on casual benchmarking or visual inspection of the regex. See `docs/pitfalls/testing-pitfalls.md` §1 (pristine output) for the perf-test discipline.

---

### Review Checklist

- [ ] **Every regex that scans article wikitext is provably linear in input length** — reason about match-start count × per-start work, not just per-match length; delimiter spam (`{{{{…}}}}`, `[[[[…]]]]`) must be rejected O(1) per position (SAFE-1)
- [ ] **A pathological-input perf test asserts `[]` within a tight time bound** — multi-MB delimiter spam run through the scanner; absence of this test leaves linearity unproven (SAFE-1)
- [ ] **The first character of every captured body group excludes the relevant delimiters and separators** — e.g. `[^{}|\n]` for `{{…}}`, `[^[\]|\n]` for `[[…]]`; a body starting with a delimiter means the regex must scan the full bounded window before rejecting (SAFE-1)

---

# Section 4: Deploy / CI (wrangler, GitHub Actions, OpenNext)

> **Reader context:** I'm editing `wrangler.jsonc` / `workers/research/wrangler.jsonc`, a `.github/workflows/*.yml`, or the OpenNext build wiring — anything in the provision/deploy path.
>
> These are silent footguns: the config/workflow *looks* right, lints/parses fine, and the failure only shows up at deploy time (or never visibly fails at all — it just never runs).

---

### CI-1: GitHub Actions Forbids the `secrets` Context in a JOB-Level `if:` — It Silently Never Runs

**The Flaw:** Gating a whole job on a secret's presence with `jobs.<id>.if: ${{ secrets.SOME_TOKEN != '' }}` to make a deploy pipeline "dormant until the secret is added." GitHub Actions does **not** expose the `secrets` context in a job-level `if:` — only `github`, `needs`, `vars`, and `inputs` are available there. The expression evaluates `secrets.SOME_TOKEN` to empty, the condition is always false, and the job **silently never runs** — even after the secret is added. No error, no warning; the job just stays grey forever.

**Why It Matters:** A dormant deploy pipeline that "skips cleanly until the secret arrives" is exactly the intended design — but a job-level `secrets.*` guard inverts it into "never deploys, ever," and the failure is invisible because a skipped job looks identical to a correctly-dormant one. You discover it only when the first real deploy mysteriously doesn't happen.

**The Fix:** Use a **step-level** `if: ${{ secrets.SOME_TOKEN != '' }}` on each meaningful step (the `secrets` context IS available at step level), and map the secret into job-level `env:` for the step bodies to consume. With the secret absent the steps skip (green, not red); once it's added they run. `.github/workflows/deploy.yml` implements this. Assert the step-level form in a config test and assert the guard is NOT on the job's own `if:` so the broken form can't regress back in.

**The Lesson:** Context availability in GitHub Actions is position-dependent and not symmetric — `secrets` works in `env:`, `with:`, and step `if:`, but not job `if:`. When a workflow "doesn't run and doesn't error," suspect a context-availability mismatch before anything else, and verify against GitHub's contexts table rather than assuming an expression that parses also evaluates.

---

### CI-2: The OpenNext Build Shells Out to `pnpm build` — `--env=""` Silences the Multi-Env Dry-Run Warning

**The Flaw (two parts):** (1) `opennextjs-cloudflare build` internally runs `pnpm build` via a child process — so a session where `pnpm` is not on PATH (the fnm / `node`-not-on-PATH setup) can't complete the OpenNext build locally even though the underlying `next build` runs fine. CI has the pnpm toolchain (`pnpm/action-setup`), so it's the authoritative gate for the OpenNext build + app-worker dry-run; the cheaper research-worker `wrangler deploy --dry-run` runs credential-free anywhere and is the in-session check. (2) Once a wrangler config has `env.*` blocks, `wrangler deploy --dry-run` (no `--env`) emits a `no target environment specified` WARNING that trips the pristine-output rule.

**Why It Matters:** "The OpenNext build failed locally" reads as a real breakage when it's just the pnpm-PATH quirk; and a benign multi-env warning in CI output looks like a config defect. Both waste a debugging cycle if you don't know they're expected.

**The Fix:** For local credential-free validation, run the research-worker dry-run (`bunx wrangler deploy --dry-run --env="" -c workers/research/wrangler.jsonc`) and trust CI for the full OpenNext build. Pass `--env=""` to target the top-level/default config explicitly and silence the multi-env warning — both the CI steps and local checks use it. The static bundle-cleanliness backstop (`scripts/check-research-bundle-clean.mjs`) runs under plain `node` and needs neither pnpm nor wrangler.

**The Lesson:** A "build" command that shells out to your package manager inherits your package manager's PATH assumptions — a clean `node` is not enough. And once you add named environments to a wrangler config, every bare `--dry-run`/`deploy` invocation needs an explicit `--env` (or `--env=""`) or it warns; bake the flag into the committed CI step, not just your shell history.

---

### Review Checklist

- [ ] **No deploy/job is gated on `secrets.*` in a job-level `if:`** — that condition silently never runs; the dormancy guard must be a step-level `if:` (or `env:`-mapped), verified against GitHub's contexts table (CI-1)
- [ ] **A config test pins the step-level dormancy guard and forbids a job-level `secrets.` guard** — so the broken form can't regress in (CI-1)
- [ ] **Credential-free local validation uses the research-worker `--dry-run` with `--env=""`; the full OpenNext build is trusted to CI** — don't read the pnpm-PATH quirk as a real build breakage (CI-2)
- [ ] **Every `wrangler deploy`/`--dry-run` on a multi-env config carries an explicit `--env` (or `--env=""`)** — a bare invocation warns about no target environment and trips pristine-output (CI-2)

---

# Section 5: Research enqueue gating & metered spend

> **Reader context:** I'm adding or changing any path that can put a job on the research queue (`RESEARCH_QUEUE.send` / `enqueueResearch`), or anything that meters/limits research spend. The research lane is the project's only metered (LLM + Brave) path and is governed by the **safe-lane guardrail (G11)** — only `easy_win` claims may enter it, BLP/`human_only` never. Both of these were breached by real code that passed every per-component test; they were caught only by adversarial cross-phase review.

---

### GATE-1: EVERY enqueue path onto the metered lane must go through the composed gate — a second route is a silent bypass

**The Flaw:** The single-candidate route `POST /api/research/[candidateId]` was carefully gated (kill-switch → auth → G11 eligibility → quota). A *separate* batch route `POST /api/queue/enqueue-research` → `enqueueCandidatesForResearch` looked up candidates and called `enqueueResearch` directly with **no** auth, kill-switch, G11, or quota check. An anonymous caller could enqueue arbitrary candidate ids — including `human_only`/BLP — driving unbounded metered research. It passed CI because its only tests called the (ungated) helper directly and asserted it enqueued.

**Why It Matters:** This is simultaneously an auth bypass, a **G11 safe-lane breach** (a compliance-contract violation — BLP/`human_only` claims entering the metered path, not merely overspend), and unbounded cost. There is no `middleware.ts` blanket gate; each route is responsible for its own gating, so a new route is a new hole by default.

**The Fix:** Route every enqueue path through the SAME composed gate building blocks — reuse the shared eligibility helper (`evaluatePersistedEligibility`) and `gateResearchEnqueue`; never duplicate or skip G11. The batch path delegates each candidate to `gateResearchEnqueue` (kill-switch + auth checked once up front; per-candidate eligibility + quota). Add a gating test for EACH route asserting anonymous → 401, `human_only`/no-verdict → refused (fail-closed), kill-switch → 503, over-quota → refused.

**The Lesson:** "The gate" is not a place, it's an invariant that must hold at every entrance. When you add a route, page action, cron, or admin tool that can reach `enqueueResearch`/`RESEARCH_QUEUE.send`, grep every call site and confirm each is behind the composed gate. A per-component test that calls the inner helper directly will not catch an ungated outer route — test the route, as an anonymous and as a `human_only` request.

---

### GATE-2: bound metered spend at the sequential consumer's commit, not with a producer-side pre-check alone

**The Flaw:** The per-user/global daily cap was enforced only by an advisory **producer-side** pre-check that counts `quota_ledger` rows — but ledger rows exist only AFTER a pack commits. A burst of distinct candidates all read a low count, all pass the pre-check, all enqueue, and all commit, overrunning the cap unbounded. Separately, `ResearchMessage` carried no `userId`, so the consumer keyed every ledger row to the single-admin id — the per-user cap could never trip for a real OAuth user (only the global cap functioned).

**Why It Matters:** "Write-once ledger committed atomically with the pack" gives idempotency (no double-charge for the *same* claim), NOT a daily-count bound. The advisory pre-check is racy by construction. Together these made the documented per-user budget guarantee false.

**The Fix:** Thread the enqueuer's real `userId` end-to-end (gate → `ResearchMessage` → `commitTerminal` → `quota_ledger`, seeding that user in the same atomic batch). Enforce the cap at the **sequential consumer's commit** (`handleResearchMessage`): count committed packs for the pack's UTC day (per-user + global) and if at/over cap, do not insert — ACK with a codes-only `quota_exceeded` audit (drop, don't retry-loop). The consumer is sequential (CC-16), so count-then-insert there is race-free; the pre-check stays as advisory fast-fail UX.

**The Lesson:** A cap is only as strong as its most-serialized enforcement point. Don't claim a hard bound from a pre-check that reads state written after the action it gates. Enforce at the single serialized writer (here, the sequential queue consumer), and make sure the identity the cap is keyed to actually travels to that writer — a metered unit charged to the wrong user is an uncapped user.

---

### Review Checklist

- [ ] **Every call site of `enqueueResearch` / `RESEARCH_QUEUE.send` is behind the composed gate** (kill-switch → auth → G11 eligibility, fail-closed to `human_only` → quota) — a new route/action/cron is an ungated hole by default; grep them all (GATE-1)
- [ ] **Each enqueue route has its own gating test** asserting anonymous → 401, `human_only`/no-verdict → refused, kill-switch → 503 — a test that calls the inner helper directly does not prove the route is gated (GATE-1)
- [ ] **G11 lives in ONE shared helper** used by every gate, never a divergent copy (GATE-1)
- [ ] **The metered cap is enforced at the sequential consumer's commit**, not only by the advisory producer-side pre-check (GATE-2)
- [ ] **The enqueuer's real `userId` travels on `ResearchMessage` to the ledger row** — a hardcoded/wrong owner makes the per-user cap unenforceable; a coupled test must drive the real commit as a non-admin user and assert the per-user cap trips (GATE-2)

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

### ORCH-3: Verify Subagent Reports Against Git — Self-Reports Can Confabulate

**The Flaw:** An orchestrator trusts a dispatched implementer's natural-language report ("DONE; I added X", "these files were already present from a prior session") without independently verifying against the repository. Subagents can and do confabulate: in the easy-win-lane build a Task-2.2 implementer reported that the module + test files "were already present (a prior session appears to have scaffolded them correctly)" when in fact it had created them itself that task — `git cat-file -e HEAD~1:<file>` confirmed they did not exist in the parent commit.

**Why It Matters:** A controller running subagent-driven development gates progress on these reports. A confabulated "already correct / pre-existing" claim can mask work that was never done, done wrong, or done somewhere unexpected; an optimistic "all green" can hide a skipped test. The two-stage review exists precisely because the report is not trustworthy — but the controller's own pre-review sanity check is the first line, and skipping it lets a bad report frame the reviewers.

**The Fix:** Treat every subagent report as an unverified claim. Before (and independent of) review, the controller verifies against git: `git log --oneline`, `git show <sha>`, `git diff --stat <base>..<head>`, and for "pre-existing" claims `git cat-file -e <parent>:<path>`. Confirm the commit landed, the diff matches the task scope, and the files are what the task specified. The spec-compliance reviewer prompt MUST also say "do not trust the report — read the actual code." Reconcile any divergence between narration and git before proceeding.

**The Lesson:** In multi-agent orchestration the durable record is the repository, not the agent's prose. When a report and `git` disagree, `git` wins — and you only learn they disagree if you look.

### Review Checklist

- [ ] **Controller verifies each subagent report against git** — commit landed (`git log`), diff matches scope (`git show`/`diff --stat`), "pre-existing" claims checked (`git cat-file -e <parent>:<path>`); narration is never trusted over the repository (ORCH-3)
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

## 2026-06-06 — Easy-win lane: scan hardening shipped
- Added Section 3 (Safe-lane / untrusted-content scanning) and SAFE-1 (untrusted-input scans must be linear-time in input length — bound match-start positions, not just per-match body length; prove with a pathological-input perf test). Discovered hardening `scanWikitextSignals` in `src/safelane/wikitext-signals.ts` against delimiter-spam CPU-DoS on the `feat/easy-win-lane` branch (commits `5129686`, `b925dc2`). Fix validated by `test/safelane/wikitext-signals.test.ts` multi-MB spam perf test.
- Added ORCH-3 (verify subagent reports against git — self-reports can confabulate). Surfaced during subagent-driven execution of the easy-win lane: a Task-2.2 implementer reported its files "were already present from a prior session" when `git cat-file -e HEAD~1:<file>` proved it had created them that task. Controller must verify reports against the repository before review.

## 2026-06-05 — Persistence slice: D1 async seam resolved
- Added DB-2 (the `SqlExecutor` port must bind via `bind()`, shaped by D1's stricter contract — mandatory bind, `{ results }` unwrap, divergent metadata field names). Discovered building the single-article persistence slice (`docs/design/2026-06-05-persistence-slice-design.md`), which made the sync `SqlExecutor` async with better-sqlite3 + D1 adapters. DB-1 (natural-key trap) unchanged and still VALIDATED.

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
| ORCH-3 | Verify Subagent Reports Against Git — Self-Reports Can Confabulate | MEDIUM | VALIDATED | Orchestration |
| DB-1 | `NOT NULL` Is a No-Op on an `INTEGER PRIMARY KEY` (Rowid Alias) | MEDIUM | VALIDATED | Data Layer |
| DB-2 | The `SqlExecutor` Port Must Bind Params via `bind()`, Shaped by D1's Stricter Contract | MEDIUM | VALIDATED | Data Layer |
| DET-1 | Historical Dateline Narration Is the Dominant False-Positive Class | HIGH | VALIDATED | Detector |
| DET-2 | Precision-Over-Recall Means Named, Accepted Recall Gaps | MEDIUM | VALIDATED | Detector |
| DET-3 | Incidental Historical Years Are an Irreducible False-Positive Class | MEDIUM | VALIDATED | Detector |
| SAFE-1 | Untrusted-Input Scans MUST Be Linear-Time in Input Length | HIGH | VALIDATED | Safe-lane / untrusted-content scanning |
| CI-1 | GitHub Actions Forbids the `secrets` Context in a JOB-Level `if:` — It Silently Never Runs | HIGH | VALIDATED | Deploy / CI |
| CI-2 | The OpenNext Build Shells Out to `pnpm build`; `--env=""` Silences the Multi-Env Dry-Run Warning | LOW | VALIDATED | Deploy / CI |

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
