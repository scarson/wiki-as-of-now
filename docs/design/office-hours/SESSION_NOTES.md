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

- Q2 (precision bar + output format): ASKED next.
