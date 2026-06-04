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
- Q1 (status quo / self-demand): ASKED — see below, awaiting answer.
