# Office Hours Session — WikiAsOfNow

Running gstack /office-hours against `docs/design/WikiAsOfNow_design_spec.md`.

This file is a live scratchpad, committed frequently so work survives container restarts.
The polished output is a separate design doc in this directory once the session converges.

## Status: IN PROGRESS

## Phase 1 — Context
- Repo: scarson/wiki-as-of-now
- Branch: claude/office-hours-design-doc-efFyU
- Existing spec: docs/design/WikiAsOfNow_design_spec.md (Draft v1.0, ~1546 lines)
- Read in full. Architecture-heavy (CF Workers + D1 + Gemini grounding), demand-light.

## Observation going in
The spec answers HOW exhaustively (sync model, detector heuristics, schema, cost
controls, phases). It barely answers WHO specifically needs this and WHAT EVIDENCE
of demand exists. Office hours should push hardest there.

## Mode decision
**Builder / scratch-your-own-itch**, with build-in-public portfolio lens.
Sam: infrequent/casual editor today, wants to contribute more; out-of-date
articles are a personal pet peeve. "Thrilled if others used it." Also wants a
live public portfolio project in the build-in-public spirit.

Implication: demand test = "will Sam actually use it to make real edits,"
not market TAM. Push hard on scope/shipping and on whether the detector is
actually good enough to be useful to him.

## Q&A log
- Q (mode/goal): Builder / scratch-own-itch + portfolio. Answered above.
- Q ("what is a WikiProject"): answered — volunteer topic working groups;
  talk-page banners are a free high-quality topic label; also the realistic
  "others use it" channel (cleanup drives).
- Q1 (status quo / self-demand): ANSWERED — strong, specific, real behavior.

### Q1 answer (verbatim-ish) + analysis
Two real instances:
1. **Sea-Based X-Band Radar (SBX-1)** — stale at "departed Pearl Harbor 26 Sep
   2019." Sam spent **~30 min** researching current history/whereabouts from a
   good-enough source, **went to make the edit**, but corporate VPN IP was
   blocked from editing. Didn't reapply from home. (Explicitly: "we don't need
   to solve that" — VPN/edit-submission is OUT OF SCOPE.)
2. **Military equipment/program articles** with past-due future tense ("Pentagon
   is expected to award a contract in 2017"). Mental model: "~5-10 min to get an
   official source for each, but often MULTIPLE per article, I don't want to
   break my reading/research flow for 30-45 min, and there are SO MANY it feels
   overwhelming." → built the pipeline idea because manual won't "make a dent."
3. Idea: Wikipedia pageviews (hourly/daily) as an impact/prioritization signal.

### KEY REFRAME (load-bearing)
The spec's stated thesis (§2.1: "the hard part is often not noticing staleness,
but discovering what happened next") is only HALF right for Sam. His evidence:
- detection: trivial for him (it's a pet peeve, he spots them instantly)
- per-item research: tractable (30 min for a hard one, 5-10 min for procurement)
- **binding constraint = THROUGHPUT / flow-protection across MANY items.**
  Volume × context-switch cost × overwhelm = he makes ZERO edits.

Design implications:
- Wedge is **article-at-a-time batch triage** (do every stale claim in one
  article in one sitting) — maps to SBX-1 + "multiple per article." This is
  spec Workflow C / Phase 1, which should be elevated ABOVE topic-browse
  (Workflow A) as the primary loop.
- Highest leverage = drive per-item human cost from 5-10 min down to ~1 min of
  verification. That argues for getting CLOSE TO A DRAFT EDIT (cited), which is
  in tension with spec non-goal "no replacement prose." Worth challenging in
  Phase 3 — for a human-verified personal tool the line may be drawn wrong.
- Pageviews API (Wikimedia REST, free) = cheap prioritization signal. Capture.

### Founder/builder signals observed
- Real problem + specific behavior (30 min research, attempted edit) ✓
- Domain expertise (military procurement/defense) ✓
- Self-corrected scope (VPN out of scope) ✓ — taste/agency

- Q2 (precision + output): ANSWERED.
  - v1 scope = future-tense-with-explicit-past-year. Accepted the narrow,
    high-precision wedge. ✓
  - Wants drafted replacement sentence + formatted citation. Target **<5 min
    edit cycle per edit** (background research can take longer). **Async OK**:
    drop URL → background research → return later to review + edit.
  - Asked me to verify Wikipedia's current generative-AI-content policy. Done —
    see below. "Resolve" = answer the hanging question (what procurement decision
    DoD made) + surface follow-ups. Example target output:
    "In 2017, DoD selected Raytheon (RTX) for a $100M LRIP contract, and in 2025
    announced a new competitive tender for full-volume production of Mk 2 units."

### WIKIPEDIA AI-CONTENT POLICY FINDINGS (June 2026) — LOAD-BEARING
Sources:
- WP:Writing articles with large language models (guideline; RfC closed
  2026-03-20, 44-2 in favor)
  https://en.wikipedia.org/wiki/Wikipedia:Writing_articles_with_large_language_models
- WP:Artificial intelligence (editor-facing essay/guidance)
  https://en.wikipedia.org/wiki/Wikipedia:Artificial_intelligence
- WP:Reliable sources § machine-learning sources
  https://en.wikipedia.org/wiki/Wikipedia:Reliable_sources

What it says:
1. **"the use of LLMs to generate or rewrite article content is prohibited"** —
   except (a) basic copyedits of the editor's OWN writing where the LLM
   introduces no content of its own, and (b) LLM-assisted translation.
2. **"you should never use LLMs to research topics or find sources"**
   (WP:LLMs are bad search engines).
3. **"Content produced by LLMs ... is generally unreliable"** (WP:RS) — LLM
   output and LLM-surfaced/hallucinated citations cannot be cited.
4. **Disclosure "highly recommended"** (WP:LLM use disclosure), not mandated.
5. GAP: policies do NOT explicitly address the case where an AI tool *surfaces
   candidate sources* that the human then independently opens, reads, verifies,
   and cites from the real source. That gap is the design's safe-harbor lane —
   and also its risk.

### DESIGN CONSEQUENCES (the reframe)
- "Draft the replacement sentence to paste" as originally imagined is squarely
  in the PROHIBITED zone, even with human verification. The spec's "no prose"
  non-goal (§3.2) was MORE right than Sam remembered; policy now hardens it.
- The Gemini-grounded-research layer runs against #2/#3 if its output is treated
  as fact/citation. It is defensible ONLY as PRIVATE research scaffolding:
  LLM normalizes the hanging question + surfaces candidate URLs; **Sam opens,
  reads, verifies the real source himself** before citing. LLM text is never
  pasted; citations come from REAL fetched page metadata, not the LLM.
- Safe, high-value automation that survives policy:
  * detection (deterministic, no LLM) — fine
  * "hanging question" normalization — fine (private)
  * candidate-source discovery — prefer DETERMINISTIC/structured retrieval
    (news APIs, defense.gov daily contracts, SAM.gov, USAspending, GAO) over
    LLM grounding for Sam's domain; both higher quality AND clearly clean
  * citation skeleton: fetch the URL Sam approves, emit {{cite web/news/
    press release}} from REAL metadata = mechanical formatting, not generation
  * pre-filled edit summary WITH AI-assist disclosure
- The human keeps: writing the actual sentence, and verifying each source.
  This drops the SLOW parts (find question, find candidate sources, format cite)
  to near-zero while keeping prose authorship + verification human → still hits
  the <5-min target via the async flow.
- PORTFOLIO ANGLE: "AI tool that respects Wikipedia's 2026 AI policy" is a
  stronger, more credible build-in-public story than "AI writes my edits."
  Constraint improves the project.

### OPEN DECISION FOR SAM (Phase 3 premise)
Where to draw the LLM's role given his risk tolerance + editor reputation:
spectrum from "LLM grounding does the research, I verify" (riskier vs norms) to
"deterministic retrieval finds official sources, LLM only normalizes the
question + privately summarizes what I'm about to read" (cleaner). Asked next.
