<!-- ABOUTME: Session handoff for the WikiAsOfNow office-hours session (2026-06-04). -->
<!-- ABOUTME: Points a fresh agent at the committed artifacts and the next action (execute the Foundation+detector plan). -->

# Handoff — WikiAsOfNow office-hours session (2026-06-04)

## Headline state

- **Repo:** `scarson/wiki-as-of-now`. **Default integration branch:** `dev`.
- **Branch:** `claude/office-hours-design-doc-efFyU` — all work committed and pushed.
- **PR:** #2 → `dev` (https://github.com/scarson/wiki-as-of-now/pull/2), OPEN. Sam intends to merge it himself. Docs/governance only; classified Routine. **The PR grew after it was opened** — it now also contains the CLAUDE.md/AGENTS.md gotcha, the `.gitignore` fix, and the implementation plan + its review. See the seam note below.
- **Worktrees:** none. **Uncommitted state:** none.
- This was a design/planning session (gstack `/office-hours` → `writing-plans-enhanced` → `plan-review-cycle`). No production code was written; the repo is still greenfield (no `package.json`/`src/` yet).

## What shipped this session (artifact pointers, not narrative)

- **`docs/policy/wikipedia-genai-compliance.md` (v1.0)** — the sacrosanct compliance social contract. 16 guardrails (G1–G16). Verbatim-grounded; quotes verified against `docs/policy/sources/`.
- **`docs/policy/sources/`** — faithful transcriptions (via `url-to-markdown`) of every Wikipedia page the contract quotes, plus a README mapping quote→source. The evidence trail.
- **`docs/design/office-hours/wikiasofnow-v1-design.md`** — the reframed v1 design (throughput/flow-protection product; compliance-shaped evidence-card workflow; dependency-ordered build), reconciled with the main spec.
- **`docs/design/future-features.md`** — gamification as v2 + the gamify-quality-not-volume rule.
- **`docs/design/office-hours/SESSION_NOTES.md`** — the full reasoning trail.
- **`docs/design/office-hours/sources/package-json.md`** — verified tee-times stack deps (Arctic/Next/Wrangler/D1).
- **`docs/plans/2026-06-04-wikiasofnow-foundation-detector-plan.md`** — the implementation plan for the two blocking-dependency milestones (Foundation + deterministic detector), TDD, subagent-proofed, 7 review rounds (see its "Plan review record").
- **`CLAUDE.md` / `AGENTS.md`** — added the `url-to-markdown`-over-`WebFetch` grounding gotcha (sibling-synced).
- **`.gitignore`** — Python bytecode caches.

## Next action (ready to dispatch)

Execute `docs/plans/2026-06-04-wikiasofnow-foundation-detector-plan.md` using
`superpowers:subagent-driven-development` (fresh subagent per task + review between).
Start at Phase 1 Task 1.1. The plan is self-contained — it does not need this
session's context.

**Recommended sequence:** merge PR #2 first (so the plan, design, and contract land on
`dev`), then run the execution in a fresh session off `dev`. **If you start before the
merge lands,** branch off `claude/office-hours-design-doc-efFyU` instead of `dev` — `dev`
does not yet contain this session's work until PR #2 merges.

**Execution-readiness prerequisites (check before Task 1.1):** the execution
environment needs **outbound network** for `pnpm`/npm registry, the Cloudflare C3
scaffolder, and (Task 2.7) fetching Wikipedia raw wikitext. If the new session runs in
a sandboxed/restricted-network environment, confirm the network policy allows
`registry.npmjs.org`, `*.cloudflare.com`, and `en.wikipedia.org` before starting, or
Tasks 1.1 and 2.7 will fail. Node 24 is required (`.nvmrc`); the package manager is
pnpm.

## Priority queue

1. **Merge PR #2** into `dev` (Sam).
2. **Wire the compliance contract's operational teeth** (small, ~15 min — see Deferred/seam below). Do this before or alongside execution so the executor agents hit the contract on the normal path.
3. **Execute the plan** — Phase 1 (Foundation) → Phase 2 (detector), subagent-driven.

## Deferred items (each with its unblock condition)

- **Compliance-contract operational teeth — NOT YET WIRED.** The design doc's "Next Steps" calls for (a) a MUST-READ pointer from `CLAUDE.md`/`AGENTS.md` to `docs/policy/wikipedia-genai-compliance.md`, and (b) a cross-reference from the design spec's "Implementation Recommendations for a Coding Agent" (§26) to the contract. **Neither is done.** (The CLAUDE.md edit this session was the *url-to-markdown gotcha*, a different change — do not mistake it for the contract pointer.) Unblock condition: none — pickable now. Likely-doer: the next session, ideally before plan execution so executor subagents are routed to the contract.
- **Research-provider implementation** (the real LLM layer) — a SEPARATE future plan, not this one. Unblock condition: Foundation + detector plan shipped (it provides the `ResearchProvider` interface + audit log the provider needs). It MUST satisfy every contract guardrail (fetched-content-as-untrusted-data, verbatim-quote check, mechanical citations, no machine prose).
- **Later v1 milestones** (per the design doc's build sequence, beyond this plan): transparency surface, auth + anonymous mode + quotas, two-mode queue + seed list, public About page. Unblock condition: this plan's Foundation + detector shipped.
- **Pitfalls docs are still template stubs** (`docs/pitfalls/*.md`). Populate domain entries as the detector/foundation work surfaces real traps (the plan's per-phase review blocks instruct this).

## Seams (where context is silently lost)

- **PR #2 scope drift.** The PR description (written at creation) lists the docs but predates the CLAUDE.md gotcha, the `.gitignore` change, and the implementation plan, which are now also in the PR. A reviewer reading only the description will under-count the diff. Mitigation: the description is being updated this session (see below); the branch is the source of truth.
- **Contract teeth vs. execution.** If the plan executes before the contract's MUST-READ pointer is wired into CLAUDE.md/AGENTS.md, executor subagents may not be routed to the sacrosanct guardrails on their normal path. The plan's tasks reference the contract inline (e.g., the audit-log and provider-interface tasks), which partly mitigates, but wiring the pointer (priority-queue item 2) closes the gap properly.

## Operational guardrails accumulated this session (so a fresh agent doesn't re-discover them)

- **Grounding:** use the `url-to-markdown` skill (runs via `python3.12`, NOT default `python3` which is 3.11 here) for any source you will quote/cite/verify. NEVER `WebFetch` for verbatim content — it summarizes lossily and fabricated a vote tally + altered a quote this session. Now in CLAUDE.md.
- **Ephemeral container:** commit and push after every unit of work; nothing outside the repo survives a restart.
- **The compliance contract is sacrosanct.** Any change that would weaken a guardrail requires explicit human sign-off and a changelog rationale; agents may not relax it unilaterally.
- **Plan execution discipline:** the plan carries a Living Document Contract — update its Execution Status banners as phases claim/ship/defer. TDD is mandatory per task; for timing/concurrency tests, fix flakes with synchronization, never by weakening assertions.

## Continuation prompt (paste-ready for the fresh execution session)

> Execute the implementation plan at `docs/plans/2026-06-04-wikiasofnow-foundation-detector-plan.md` using the `superpowers:subagent-driven-development` skill (fresh subagent per task, two-stage review between tasks). Start at Phase 1, Task 1.1.
>
> Before dispatching any task, read the sacrosanct compliance contract `docs/policy/wikipedia-genai-compliance.md` — its guardrails are inviolable invariants (the detector being LLM-free and the audit log being append-only are both contract requirements). Also read `docs/design/office-hours/wikiasofnow-v1-design.md` for product context and `docs/handoffs/2026-06-04-office-hours-handoff.md` for session state.
>
> Honor the plan's Living Document Contract: update each phase's Execution Status banner as you claim/ship it. Follow TDD strictly (the plan's "TDD discipline" block binds every task). The repo is greenfield — Task 1.1 scaffolds the Next.js-on-Cloudflare-Workers app.
>
> First, a quick prerequisite (priority-queue item 2 in the handoff): wire the compliance contract's operational teeth — add a MUST-READ pointer to `docs/policy/wikipedia-genai-compliance.md` in both `CLAUDE.md` and `AGENTS.md` (keep them sibling-synced), and a cross-reference from the design spec's "Implementation Recommendations for a Coding Agent" section to the contract. Then begin plan execution.
>
> Develop on a fresh feature branch off `dev` (e.g. `feat/foundation`). Commit and push frequently (ephemeral container). For any web source you must quote or verify, use the `url-to-markdown` skill via `python3.12`, never `WebFetch`.

## Adversarial review of this handoff

Six rounds run; revised until a full re-pass found nothing material.

- **Round 1 — naive fresh agent (1 finding):** headline omitted the repo/integration-branch names; added.
- **Round 2 — recency-bias audit (0):** the session arc (office-hours diagnostic → throughput reframe → verbatim grounding) lives in the design doc + session notes + contract changelog, which the handoff points at; not under-documented.
- **Round 3 — seam auditor (1 finding):** added the "branch off the feature branch if PR #2 isn't merged yet" fallback, since `dev` lacks this work pre-merge.
- **Round 4 — operational-guardrails auditor (0):** url-to-markdown/python3.12, ephemeral-commit, sacrosanct-contract, and plan-execution discipline are all captured in the guardrails section and CLAUDE.md.
- **Round 5 — loss-averse auditor (0):** the plan-review pattern learning is durably captured in the plan's "Plan review record"; the gstack learnings store is ephemeral but its content is redundant with that record.
- **Round 6 — execution-readiness auditor (session-specific, 1 finding):** this is a planning→execution handoff into a greenfield build; added the outbound-network prerequisite (npm/Cloudflare/Wikipedia) plus Node 24/pnpm, which Tasks 1.1 and 2.7 silently assume. Chosen because the dominant risk for the next session is "can it even start building," which the canonical rounds don't cover.

Final re-pass (rounds 1–6) after applying the three fixes: zero material findings.
