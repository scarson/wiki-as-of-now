<!-- ABOUTME: Session handoff (2026-06-05) — detector recall + precision work wrapped; pivot to system-building next. -->
<!-- ABOUTME: Durable proof-of-work + continuation pointer for the next agent. Plans/methodology are the authoritative state; this points at them. -->

# Session handoff — 2026-06-05 (detector work complete → pivot to system-building)

## Headline state

- **Branch:** `claude/wikiasofnow-detector-phase2-ZP1uQ`, tip `c0d75a3`, pushed. **1 ahead of `origin/dev`** (the handoff artifacts), 0 behind. A PR for `c0d75a3` + this handoff doc is the last action of the session.
- **`dev` tip:** `f8077bb` (PR #9 merged). **All detector work this session is merged to `dev`.**
- No subagents running, no worktrees live, no uncommitted work.
- **The deterministic detector is mature and DONE** (precision ~0.97 gold, reachable recall 1.0) and at **diminishing returns** — three consecutive residual candidates measured ~0 prize. The next work is the **broader system**, not the detector.

## What shipped this session (all merged to `dev`)

| PR | What | Outcome |
|---|---|---|
| **#6** | Detector recall — measure + safe lexicon wins | First recall measurement; reachable recall 0.636→**1.0**, absolute 0.583→**0.917**, precision held 0.97. Built `test/gold/recall-set.json` + `test/detector/recall.test.ts` (0.90 reachable-recall floor). Fixed a precision-gold mislabel (fehmarn cross-sentence resolution). |
| **#7** | Marker-governs-year **cut 1** — DET-3 incidental-year FPs closed | New `src/detector/governs.ts` year-eligibility filter (5 discriminators); 23/23 curated DET-3 FPs dropped, **precision held 0.9697, recall 1.0**. Fixed a second gold mislabel (panzerhaubitze "2028 not 2000"). |
| **#8** | DET-2 measurement spike → **NO-GO on cut 2** | 47 dateline-suppressed candidates → only 2 genuine / 41 narration; deterministic guard precision 0.125. Cut 2 not worth building. `test/gold/det2-candidates.json` + methodology §9. |
| **#9** | Both follow-up detector candidates → **NO-GO** | named-entity over-KEEP (0 corpus FPs) + inline-year-absent/relative-date (0 deterministically-resolvable). Methodology §6 records: detector roadmap substantially exhausted. |

Authoritative living docs (all merged, accurate):
- `docs/design/detector-precision-methodology.md` — §3/§4 (DET-3 closed), §6 (roadmap status: exhausted), §7 (recall), **§9 (DET-2 NO-GO)**.
- `docs/design/2026-06-05-marker-governs-year-design.md` (cut 1 spec, shipped) + `docs/plans/2026-06-05-marker-governs-year-plan.md` (shipped banners + Discoveries).
- `docs/design/2026-06-05-det2-measurement-spike-design.md` + `docs/plans/2026-06-05-det2-measurement-spike-plan.md` (NO-GO).
- `docs/design/2026-06-05-recall-labeling-rubric.md` + `docs/plans/2026-06-05-wikiasofnow-recall-plan.md`.
- Review trails: `docs/plans/recall-review/`, `docs/plans/governs-review/`, `docs/plans/det2-review/`.

## In-flight / pending

- Only this handoff + the two starting prompts (`c0d75a3` + this doc), pending their PR to `dev`. Nothing else.

## Ready-to-dispatch (the next work — pick one or run both)

Two **self-contained, copy-paste-ready starting prompts** for a fresh agent live in `docs/handoff/`:

1. **`2026-06-05-next-persistence-slice.md`** — *recommended next.* The single-article persistence + read vertical slice (spec §26.2 step 2/4): article lookup → fetch → detect → **persist to D1** → API routes → minimal UI. Makes the mature detector demoable end-to-end; gives the foundational audit log (G13) its first real producers. No LLM, no auth. **Forces one architectural decision up front: the D1 sync/async seam** (see Guardrails).
2. **`2026-06-05-next-safe-lane-gate.md`** — the safe-lane fail-closed BLP gate (G11): deterministic, LLM-free, fixture-testable. Currently **nothing exists** in code. A hard compliance floor that MUST land before any research/"easy win" path. Good parallel/second front (LLM-free, like the detector).

Each prompt carries: the build-state survey, ordered must-reads, scoped first slice + do-NOTs, key decisions, the full workflow chain, and the operational gotchas below.

## Not yet started (scoped by the survey, beyond the two above)

Per the 2026-06-05 build-state survey (in both starting prompts): the **research/Gemini provider** (interface + stub exist, no real provider — G9; depends on safe-lane + auth + queue binding), **auth & quotas** (deps installed, zero code), **mechanical disclosure** (G12), the **research-job queue** (logic exists, no Cloudflare Queue binding), and the **web UI** (still create-next-app boilerplate). All deeper than the two ready-to-dispatch items.

## Deferred / closed (do NOT re-investigate without new inputs)

- **DET-2 dateline recall recovery — CLOSED (measured NO-GO, PR #8 / methodology §9).** Don't rebuild it. The LLM-reviewer idea for it is *also* closed by the tiny prize (an LLM in detection would need a sacrosanct-contract amendment; not justified for ~2 claims/136 fixtures).
- **named-entity over-KEEP + inline-year-absent residuals — CLOSED (NO-GO, PR #9).** 0 measurable prize each. Re-open only if the fixture corpus is substantially expanded.
- **Mid-sentence date-then-verb residual** — thin tail, accepted (methodology §3).
- The one cheap detector measurement still worth doing pre-launch: **unbiased true-precision sampling** (methodology §6 item 2). Optional.

## Operational guardrails accumulated this session (so the next agent doesn't re-discover)

- **PUSH after every commit.** The container is ephemeral and re-clones on resume — **unpushed commits are LOST** (a spec commit vanished on a mid-session resume; had to recreate from context).
- The git **stop-hook flags GitHub's own PR-merge commits** (authored `noreply@github.com`) as "Unverified." **Cosmetic** — not your commit; never rewrite merged history to satisfy it.
- **`npx tsx`** for throwaway scripts (NOT bare `node` — extensionless ESM imports). Delete throwaways before committing; verify `git status`.
- After a container resume, if DB tests fail to load the native module: **`pnpm rebuild better-sqlite3`** (ABI mismatch). Node 24 (`.nvmrc`), pnpm@11.5.1.
- **The D1 sync/async seam is unresolved** (`src/db/client.ts` ~lines 19-25): the DB layer models better-sqlite3's *synchronous* contract; D1 on Workers is *async*. This MUST be settled before building persistence on top — it's the first architectural decision of the persistence slice.
- **Research interface vs spec divergence** (not acted on): `src/research/provider.ts` quietly sided with the compliance G9 framing (verbatim-quote, no model prose) over spec §16.3's older schema. Reconcile explicitly when the Gemini work starts.
- **Measure-first paid off three times** this session (DET-2 + 2 residuals all killed before any production code). Default to a cheap measurement spike before building any precision/recall-risky detector change.
- **Workflow that worked:** `brainstorming` → spec (`docs/design/`) → `writing-plans-enhanced` → `plan-review-cycle` → `subagent-driven-development` (TDD + spec/quality reviews per task) → PR to `dev` with `## Merge classification`. Note: the `superpowers:` brainstorming/writing-plans skills are NOT installed — run those steps to their methodology manually; `plan-review-cycle` and `subagent-driven-development` are installed and ran for real.

## Priority queue

1. **Single-article persistence + read vertical slice** (`docs/handoff/2026-06-05-next-persistence-slice.md`) — unblocks all user-facing work; makes the detector real. Settle the D1 async seam first.
2. **Safe-lane G11 gate** (`docs/handoff/2026-06-05-next-safe-lane-gate.md`) — hard compliance floor; deterministic; can run in parallel with #1. **Must precede any research/easy-win path.**
3. **Research/Gemini provider (G9)** — only after #1 (persisted candidates) + #2 (safe-lane) + auth/quotas exist; it's an "expensive action" gated by auth and must respect the safe lane.

## Continuation prompt (paste-ready)

> You're continuing WikiAsOfNow. The deterministic detector is mature and merged; the next work is system-building. **Read `docs/handoff/2026-06-05-session-handoff.md` for state, then pick a starting prompt: `docs/handoff/2026-06-05-next-persistence-slice.md` (recommended — makes the detector demoable end-to-end) or `docs/handoff/2026-06-05-next-safe-lane-gate.md` (the fail-closed BLP gate, G11).** Each is self-contained. Start by reading `CLAUDE.md` + `docs/policy/wikipedia-genai-compliance.md`. Realign your branch to `origin/dev` first. Push after every commit.

---

## Adversarial review log (handoff skill, ≥6 rounds)

- **Round 1 — naive fresh agent:** added explicit file paths + the dev tip SHA + the "realign to origin/dev" step in the continuation prompt; spelled out each PR's outcome rather than just numbers. No undefined jargon left (G-numbers expanded on first use in the prompts; methodology §-refs named).
- **Round 2 — recency-bias audit:** ensured the *earlier* session work (recall PR #6, the two gold mislabel fixes) is captured, not just the recent survey/prompts. Added the gold-mislabel fixes (fehmarn, panzerhaubitze) as they're load-bearing precision facts a future agent could trip over.
- **Round 3 — seam auditor:** the key seam is **detector (frozen, mature) → greenfield system work**. Documented: the detector's output currently evaporates (no persistence) = the bottleneck; the D1 sync/async seam; the research-interface-vs-spec divergence; the safe-lane (G11) being a hard prerequisite for the research path. Also: `c0d75a3` ahead-of-dev pending PR (the merge seam for this very handoff).
- **Round 4 — operational guardrails auditor:** the guardrails section persists push-after-commit, the cosmetic stop-hook, `npx tsx`, `better-sqlite3` rebuild, the D1 seam, and the manual-skill caveat — all of which lived only in the transcript before this doc.
- **Round 5 — loss-averse auditor:** captured the "closed, don't re-investigate" items (DET-2 + 2 residuals + the LLM-reviewer-for-DET-2) so a future agent doesn't redo the spikes; captured the optional true-precision-sampling and the research-interface reconciliation as named follow-ups rather than lost asides.
- **Round 6 — mature-to-greenfield pivot auditor (session-specific):** this session pivoted from tuning a *mature, frozen* subsystem to *greenfield* system-building — a different failure mode than the detector work faced. Checked that the handoff makes unmistakably clear (a) what is DONE/frozen (the detector — don't touch it, consume its output) vs (b) what is a blank slate (persistence write path, API, UI, safe-lane, research), and (c) the greenfield landmines the detector work never hit: the D1 async seam, the spec-vs-compliance research-schema tension, and G11 being entirely absent. All three are surfaced in both the guardrails section and the starting prompts. Finding applied: added the explicit "research depends on safe-lane + auth" ordering to the priority queue so the next agent doesn't start the Gemini provider prematurely.

Final pass through rounds 1-6 produced no further material findings.
