<!-- ABOUTME: Decision log for the autonomous overnight session of 2026-06-21 — what was decided, why, with adversarial review, for Sam's morning review. -->
<!-- ABOUTME: Living record; appended as the night progresses. Not a spec — a trail of autonomous decisions and their rationale. -->

# Overnight autonomous session — decision log (2026-06-21)

**Context.** Sam went to bed and granted autonomy: make decisions, but consider multiple perspectives, run adversarial review, and document decisions here for later review. Proactively do reasonable follow-ups rather than asking (asking blocks; a dropped commit is zero-cost). This file is that persistent artifact.

## Standing mandate & self-imposed bounds

What I will do autonomously tonight:
- Fix the requested design-doc nit.
- Let the two execution agents (corpus build Phases 1–2; evidence-context display) finish; adversarially review each PR.
- Make merge decisions per the cost-asymmetry principle below, documenting each.
- If feasible, execute the corpus **pilot** (Phase 3) end-to-end and the inter-rater pass (Phase 4 Task 4.1), then present the result for Sam's calibration — this matches the design's own flow (build pilot → Sam reviews result + calibration).

Bounds I will NOT cross without Sam:
- I will **not** weaken any compliance guardrail or the design/spec invariants.
- ~~I will not scale the corpus beyond the pilot~~ — **SUPERSEDED by Sam's instruction (see D5): scale to the full corpus after I assess the pilot.** The assessment is the gate — I scale only if the pilot's quality holds; a systematic flaw means tighten-and-re-run, not scale the flaw.
- The ground-truth answers are **proposals for Sam's review**, not a final verdict; every `agent_auto` record stays auditable and any genuine uncertainty escalates (bias-to-escalate).

### Merge-decision principle (cost asymmetry)

Merging into `dev` is outward/hard-to-reverse; leaving a vetted PR ready is ~zero-cost to Sam (a one-minute morning action). So:
- **Additive, low-blast-radius, non-production changes** (e.g. new isolated test infrastructure, docs) → merge autonomously after adversarial review + green required CI.
- **Production-runtime or compliance-core changes** (evidence/citation path, serialization contract, detection, audit log) → adversarially review, mark **ready** with my review summary, but **leave the merge for Sam**. The project's own git-strategy reserves these "Review — domain" changes for human merge; Sam's autonomy grant speeds progress but doesn't, in my judgment, waive the compliance-domain review that exists precisely for these areas. Cost of waiting: ~zero; cost of a subtly-wrong merge into the compliance core: high.

## Environment facts (probed 2026-06-21)

- Outbound web: **reachable** (HTTP 200 to example.com in ~0.1s).
- `BRAVE_API_KEY`: **present**. `TAVILY_API_KEY`: **present**.
- ⇒ The corpus pilot's live-fetch dependency is satisfiable tonight (the plan's Phase-3 ⏸ defer condition does NOT apply). Pilot is gated only on the schema/harness (corpus agent Phases 1–2) being available.

## Decisions

### D1 — Design-doc hash nit (the requested fix)
**Decision:** Correct `docs/design/2026-06-21-ground-truth-corpus-design.md` lines 145 & 187 — `contentHashSha256` is NOT a frontmatter field; it is the `url-to-markdown` `--json` envelope's `metadata.content_hash_sha256`, a SHA-256 of the **body** markdown (excluding YAML frontmatter), per `.claude/skills/url-to-markdown/SKILL.md`.
**Routing:** Folded into the corpus-build agent's PR (via SendMessage) to consolidate corpus-doc changes and avoid a third one-line PR. Adversarial check: verified the corrected phrasing against the skill's documented contract; matches the build plan's `hashSnapshotBody` (body-only) implementation and its `Discoveries` note. Risk: ~zero (docs-only).

### D2 — Corpus build PR #23 (`claude/corpus-build-schema`) — reviewed clean; NOT merged tonight
**Agent result:** Phases 1–2 done; `pnpm test` 919 pass / tsc / lint clean locally; Phases 3–4 deferred; draft PR #23, base `dev`.
**My adversarial review (independent, read the actual diff):**
- `answer-record.ts` — faithful to the plan; `validateAnswerRecord` enforces every invariant (nesting, unverifiable→empty-evidence+`human_confirmed`, stray `supersededBy`, `verifiedAsOf` shape); `stripFrontmatter`/`hashSnapshotBody` correct. No defects.
- `answers-integrity.test.ts` — byte-presence runs on the **body** (`stripFrontmatter`), hash matches, nesting + gold-set stale-key checks present; real-`answers.json` describe vacuous-green (intended). Synthetic positive + byte-presence-negative cover the gate.
- **Minor nit (non-blocking):** the `"a wrong recorded hash fails the hash gate"` test only asserts `hashSnapshotBody(file) !== "deadbeef"` (trivially true) rather than asserting the grounding assertion throws on a wrong hash. Weak, not wrong. Logged for a later strengthening pass; not worth touching the agent's branch tonight.
**Decision — do NOT merge tonight, despite the clean review.** Two reasons: (1) the **required `test` CI check has not run yet** (`get_status`: pending, 0 statuses) and the agent explicitly did NOT run `pnpm test:workers` (which CI does) — merging on local-only verification would violate the green-required-CI gate; webhooks don't deliver CI success and `send_later` is unavailable, so I can't cheaply confirm it overnight. (2) Conservative call on an outward action. **Instead:** stack the pilot (D3) on this branch so the corpus track keeps moving; the pilot's CI run exercises schema + data together. Sam merges #23 in the morning once CI is green (a ~1-min action). Net: no progress lost, no unconfirmed merge.

**OUTCOME (shortly after):** Sam (actor `scarson`) marked #23 ready and **merged it himself** — the schema is now on `dev`. This validates the conservative call: the Review classification reserved that merge for a human, and the human took it. Session auto-unsubscribed from #23. The pilot branched off the (now-merged) schema, so its PR against `dev` shows only the pilot's additions.

### D3 — Pilot (Phase 3) — PROCEEDING autonomously, stacked on the corpus branch
**Rationale:** network + Brave/Tavily keys are present (probed), the schema/harness exists (D2), and the pilot is the obvious next step in the corpus track Sam has been driving. The plan's in-Phase "Sam confirms the batch" checkpoint is waived per Sam's explicit autonomy grant (he reviews the result instead). Risk is bounded: the integrity harness makes fabrication impossible (every quote byte-present), and **bias-to-escalate** means anything uncertain becomes `human_confirmed` for Sam's review — so worst case is an over-escalated draft, which is exactly the design's calibration flow.
**Execution:** dispatched a background agent on `claude/corpus-pilot` (off `claude/corpus-build-schema`) to: select a deliberately-mixed ~8–10 claim batch (documented), run the per-claim neutral-query→Brave+circular-filter→fetch→`url-to-markdown`→verbatim-gate→tier-classify→record runbook, build the escalation queue, append the calibration-log entry, fold in the D1 design-doc nit, and open a draft PR for Sam's calibration. Inter-rater pass (Phase 4 Task 4.1) held as a follow-up to dispatch after the first pass lands.
**(Results — batch, per-claim dispositions, auto/escalate split — to be appended when the pilot agent reports.)**

### D4 — Context-display PR #25 (`claude/evidence-context-display`) — reviewed clean; LEFT FOR SAM
**Agent result:** all 5 phases; `pnpm test` 922 pass + `pnpm test:workers` 27 pass; tsc/lint clean; required-field churn (15 `EvidenceCard` literals + 2 round-trip assertions across 8 files) kept the suite green; 3-round review clean; Phase-5 visual check deferred (D1 unprovisioned — agent did NOT claim it passed). Draft PR #25, base `dev`.
**My adversarial review (read the actual production diff, 8 `src/` files / 107 insertions):**
- `quote-context.ts` — byte-identical to the plan's reviewed implementation (SAFE-1 cap + `MAX_PAGE_CHARS` reuse, first-occurrence, nullable edges, word-snap). Correct.
- `EvidenceCard.tsx` — `{contextBefore span}` + `<strong italic>quote</strong>` + `{contextAfter span}`, context de-emphasized (`text-dust-gray not-italic`); **no copy button, no `"use client"`, no `dangerouslySetInnerHTML`** (grep-verified). G16 posture correct.
- `provider.ts`/`verify-proposal.ts` — fields `string | null` documented "NOT model prose"; sliced from the same `fetched.text` on match. Correct.
- **G5 gate files (`SourceOpenGate`/`WorksheetClient`/`source-gate.ts`) untouched** — confirmed.
**Note for Sam (handled, not a defect):** context now also appears in the transparency/show-your-work view (it forwards the full `EvidenceCard[]`). It's deterministic source text (G1-clean); the agent correctly tightened the G1 closed-shape test to exactly the 5 source fields. Worth a glance only because it widens where context renders.
**Decision — LEAVE FOR SAM (no auto-merge).** Compliance-core: modifies the production evidence/citation path + the `EvidenceCard` serialization contract + G16-sensitive rendering → the git-strategy's Review-domain trigger reserves this for human merge, and the cost asymmetry favors waiting. Review verdict: **clean, faithful to the approved plan, ready for your merge** once you've eyeballed the render. Required `test` CI was `in_progress` at last check (local verification green; webhooks don't deliver CI success, so confirm green before merging).

### D5 — Full-corpus mandate (Sam's instruction)
**Instruction:** "After the pilot set of answer verifications runs, assess, then do the rest so we have the full corpus evaluated." → scale beyond the pilot to **all 32 `stale: true` gold-set claims**, gated on my assessment of the pilot.
**Plan:**
1. **Assess the pilot** (adversarial, multi-perspective; documented here): are the answers genuinely grounded (re-check a sample's byte-presence + that the quote actually resolves the claim, not just matches)? Is the `agent_auto` tier sound (spot-check the auto-certified ones against the §2.2 criteria — authority, self-evident support, unambiguous disposition)? Any systematic failure mode (e.g. circular sources slipping through, over-confident auto-certs, queries that aren't neutral)? Is the per-claim cost/reliability good enough to parallelize the rest?
2. **Gate:** scale only if the pilot quality holds. If the assessment finds a systematic flaw, **tighten the gate / fix the process and re-run** the affected items before scaling — do not propagate a flaw across 24 more claims (this IS the design §2.3 calibration loop, with me doing the first-pass calibration since Sam delegated it).
3. **Do the rest** (~22–24 remaining stale claims): choose execution strategy based on what the pilot showed (likely fan-out across a few agents writing scratch records, then a single serialized merge into `answers.json` — never concurrent `answers.json` edits, per the build plan's parallel-write boundary). Each record passes the integrity harness; escalations accumulate in the queue.
4. **Present the full corpus** for Sam: the complete `answers.json`, the full escalation queue, the auto/escalate split, and my assessment notes. Sam's spot-check remains the final calibration.
**Still bias-to-escalate at scale** — uncertain → `human_confirmed`; the harness still makes fabrication impossible.

### D6 — Pilot assessment + gate decision (the calibration Sam delegated)
**Method:** I did not just trust the harness (it only proves byte-presence). I read all 9 records and judged the relevance the harness *can't*: does each quote genuinely *resolve* its claim, is the disposition right, is the one auto-cert justified.
**Findings:**
- **8 `human_confirmed` — appropriately escalated.** Several ground on an *adjacent* milestone or a snapshot-date-relative year (m109 production-vs-133-buy; PrSM delivery-vs-IOC; HIV trial-exists-vs-concludes-by-date; Gordie Howe "this spring"); escalation correctly flags these for Sam. No fabrication, no circular sources, sources reasonable.
- **The 1 `agent_auto` (zumwalt) was the weak link — FIXED.** Claim is about *testing* CPS in 2025; the agent quoted *fielding* slipping FY2025→FY2026 and auto-certified on that inference. The snapshot's own lede has the exact resolving fact (testing now 2027/2028). Re-grounded to that span and reclassified `agent_auto` → `human_confirmed` (commit `fe77a03` on `claude/corpus-pilot`); connecting fielding-delay to test-readiness is an inference that fails the §2.2 self-evident bar.
**Systematic themes (inform scaling):** (a) prefer in-span resolving facts over adjacent milestones; (b) year sometimes relies on the snapshot date, not an in-span year — weaker, must be flagged; (c) transcription failures (army.mil 403, JS-SPAs at BAE/ClinicalTrials/navy.mil, paywalls) force non-primary grounding — recorded as escalation reasons; (d) verbatim gotchas: curly apostrophe U+2019, no newline spanning, **markdown emphasis asterisks are literal bytes** (the re-grounded zumwalt quote contains `*Zumwalt*`).
**Known corpus-quality wrinkle (flagged, not blocking):** `url-to-markdown` emphasis markers leak into any quote crossing an emphasized term. Cosmetic — quotes stay byte-present + resolving. Future improvement to weigh with Sam: strip `*`/`**` emphasis in `normalizeForVerbatim`, or prefer spans avoiding emphasis. Logged so it isn't rediscovered.
**GATE DECISION: PASS — scale to the full corpus, with 3 calibration adjustments:** (1) **disable auto-certification** for the unattended run (all `human_confirmed`; the one pilot auto-cert was wrong and no human validates tonight — Sam promotes clear ones during review, §2.3); (2) **prefer in-span resolving facts** (the zumwalt lesson); (3) **verbatim-gotcha awareness**. All three passed to the scaling agents.
**Scaling execution:** dispatched 3 background agents off `claude/corpus-pilot` for the remaining **23** claims — `corpus-rest-a` (8), `-b` (8), `-c` (7) — each `human_confirmed`-only, adding to its own branch's `answers.json` + `escalation-queue.md` and running the harness green. I then **union-merge** the three branches' records by `(fixture, sentenceSubstring)` key (preferring the corrected pilot-9 on `corpus-pilot`) + collect snapshots, run the full harness on all 32, reconcile the escalation queue + calibration log, and update PR #26 to the full corpus for Sam's spot-check.

### Session state snapshot (as of this entry)
- On `dev`: #22 (designs+plans), #23 (corpus schema, merged by Sam).
- Open for Sam: **#25** (context-display, reviewed clean — merge when ready), **#26** (corpus pilot, zumwalt-corrected — will grow to full corpus), **#24** (this log).
- **Done:** both execution agents (#25 context-display, #26 pilot); pilot assessed (D6); zumwalt re-grounded.
- **Running:** 3 scaling agents (`corpus-rest-a/b/c`) → 23 remaining claims. Next: union-merge → full 32-record corpus on #26; then optionally the inter-rater pass (Phase 4) if time allows, else flagged for Sam.
