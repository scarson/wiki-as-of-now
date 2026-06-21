<!-- ABOUTME: Companion to answers.json — what the verified current-state ground-truth corpus is, how its records key to the gold set, and the append-only spot-check/calibration log. -->
<!-- ABOUTME: The record schema authority is test/gold/answer-record.ts; this file orients, it does not duplicate the field list. -->

# Verified current-state ground-truth corpus

`answers.json` is the held-out "what's the current state?" answer corpus for the
stale gold-set claims: for each genuinely-stale claim, the verified current-state
disposition, anchored to a verbatim quote that is byte-present on a committed
archived snapshot. It is a held-out fixture the search/verify evals are measured
against — **not** a detector input (the detector stays deterministic and LLM-free
per [docs/policy/wikipedia-genai-compliance.md](../../docs/policy/wikipedia-genai-compliance.md)).
Authoritative design: [docs/design/2026-06-21-ground-truth-corpus-design.md](../../docs/design/2026-06-21-ground-truth-corpus-design.md)
(read §2 two-tier gate, §3 schema, §6 integrity test, §9 pilot).

## Record schema

The record shape (`AnswerRecord`, `EvidenceRef`, the `Disposition`→`Outcome`
nesting table, and the validators) is defined and documented in
[`answer-record.ts`](./answer-record.ts) — that module is the single source of
truth for the schema. Do not duplicate the field list here; read the types.

## Key into the gold set

Each record's `(fixture, sentenceSubstring)` pair matches a `stale: true` entry
in [`gold-set.json`](./gold-set.json). The integrity harness
([`answers-integrity.test.ts`](./answers-integrity.test.ts)) enforces that every
record keys to a real stale gold-set entry, so a typo'd or non-stale key fails
the suite.

## Certification tiers

Each record carries `certification` (`agent_auto` | `human_confirmed`). `agent_auto`
is reserved for the unambiguous, high-authority, self-evidently-supported case;
everything else escalates to Sam as `human_confirmed`. The exact tier-1 criteria
(all must hold) and the escalation rule are in design
[§2.2](../../docs/design/2026-06-21-ground-truth-corpus-design.md) — when in doubt,
escalate.

## Spot-check & calibration log (append-only)

This log is **append-only** — never rewrite or delete a prior entry. Each entry
records a calibration or spot-check event: the pilot batch size, the
auto/escalate split, the inter-rater agreement rate, and pointers to the
escalation queue + diff.

| Date | Event | Notes |
|------|-------|-------|
| 2026-06-21 | Pilot batch fetched (Phase 3) | Batch size 9 (see [pilot-batch-rationale.md](pilot-batch-rationale.md)). Auto/escalate split: **1 `agent_auto`** (zumwalt-class_destroyer, grounded on USNI News) / **8 `human_confirmed`** (see [escalation-queue.md](escalation-queue.md)). Heavy escalation is expected and intended (bias-to-escalate; no human in the loop at fetch time). Outcomes: 6 `slipped_still_pending`, 2 `event_occurred`, 0 `unverifiable`. Inter-rater pass: not yet run (Phase 4). First-snapshot hash cross-check (`hashSnapshotBody` === tool `metadata.content_hash_sha256`): **PASS** (zumwalt snapshot, `8698afec…`). |
