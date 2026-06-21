# Ground-Truth Corpus Build (Answers Fetching) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans for the code phases (1–2); the research phases (3–4) are an agent-executed runbook gated by the Phase 2 harness. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the verified current-state ground-truth corpus — held-out "what's the current state?" answers for the stale gold-set claims, each anchored to a verbatim quote byte-present on a committed archived snapshot — starting with the pilot batch (~8–10 claims) end to end.

**Architecture:** Two layers. (1) A **deterministic schema + integrity harness** (TDD, `test/gold/`) that defines the answer record, enforces the disposition→outcome nesting + unverifiable invariants, and gates every record on `evaluateQuote` byte-presence and a snapshot-body hash. (2) An **agent-driven fetch runbook** (real Brave search + `url-to-markdown` + real web — no mocks) that produces records + committed snapshots, gated by the harness, with a two-tier certification and a Sam-reviewed calibration handoff.

**Tech Stack:** TypeScript, Vitest, Node 24. Reuses `evaluateQuote` (`src/research/verbatim-check.ts`), `isCircularSource`/`filterCircularHits` (`src/research/source-exclusion.ts`), the Brave provider (`src/research/brave-search.ts`), and the `url-to-markdown` skill.

**Design spec:** [docs/design/2026-06-21-ground-truth-corpus-design.md](../design/2026-06-21-ground-truth-corpus-design.md) — authoritative; read §2 (two-tier gate), §3 (schema), §6 (integrity test), §7 (build workflow), §9 (pilot) before starting.

## Global Constraints

- **Compliance contract is sacrosanct** ([docs/policy/wikipedia-genai-compliance.md](../policy/wikipedia-genai-compliance.md)). Load-bearing here: **detection stays deterministic/LLM-free** (the corpus is a held-out fixture, not a detector input), the **verbatim gate is non-negotiable** (every quote byte-present via `evaluateQuote` — G8/G15), **neutral queries only** (G9 — no leading phrasing), and **no model-authored prose persists** (the verbatim quote is the artifact; dispositions are labels — G1).
- **The deterministic verbatim gate is the trust core.** A record whose `verbatimQuote` does not pass `evaluateQuote` against its committed snapshot MUST be rejected — there is no "close enough."
- **Real data, real APIs (no mocks).** Phase 3 uses live Brave search + live `url-to-markdown` + the real web. Snapshots are committed so the *tests* stay offline-deterministic forever, but the *fetching* is real.
- **Bias to escalate.** When Tier-1 auto-certify criteria (§2.2) are not unambiguously met, the record goes to the escalation queue for Sam — over-escalation is cheap; silent over-certification corrupts the ground truth.
- **Append-only audit.** The spot-check / calibration log in `answers-README.md` is append-only; never rewrite prior entries.
- **Code points, not UTF-16 units**, for any length check (`[...s].length`).
- Test command: `pnpm test`. Commit footer (every commit):
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014VeYFUyHxVC7xhu8Wf6sFs
  ```

## Living Document Contract

This plan is a living document. Every executing agent MUST update it as
execution progresses, not only at completion.

- **On phase claim:** the executor MUST flip the banner to 🚧 IN PROGRESS
  with a claim timestamp (ISO 8601 UTC) and the active branch name. The
  banner MUST NOT include an expected-completion estimate — agents cannot
  reliably estimate their own wall-clock, and a fabricated duration
  becomes a stale anchor that misleads future readers. Followers
  encountering a 🚧 banner determine liveness by observable signals (PR
  existence, recent branch commits), not by arithmetic on expected times.
  See Step 5's stale-claim reclaim protocol.
- **On phase ship:** the executor MUST update that phase's **Execution
  Status** banner with the shipped commit SHA(s) and date. If a PR is
  open, the PR number and URL MUST appear in the top-of-plan Execution
  Status table.
- **On phase defer:** the executor MUST update the banner with ⏸ status
  AND a prose description of the unblock condition + a link to the
  likely-unblocker artifact (plan page, task, or PR whose own Execution
  Status banner will signal completion). Prose + link is durable across
  paraphrases and scope edits; exact-string coordination between agents
  is not.
- **On PR merge:** the executor MUST record the merge SHA in the banner
  + the top-of-plan Execution Status table.
- **On deviation from the written plan** (scope edits, structural
  refactors, dropped tasks, reordered phases): the executor MUST
  inline-document the deviation in the affected task AND summarize it
  in the top-of-plan Execution Status as a "Deviations" subsection.
  Deviation state MUST NOT live only in PR notes or status reports.
- **On discovery** (pre-existing drift surfaced during execution, new
  bugs found, architectural issues noted): the executor MUST add a
  "Discoveries" subsection at the top of the plan with pointers to the
  files/lines affected. Follow-up dispatches read this subsection to
  avoid duplicate discovery work.

The plan SHOULD reflect reality at the end of every session that touches
it. Anything worth putting in a status report to the user is worth
putting in the plan.

Rationale: `/writing-plans-enhanced` Step 5. Writing at ship time is
cheap; reconstruction by downstream readers is expensive, compounds
across dispatches, and fails silently when state is split across PR
notes and commit messages.

---

## Execution Status

**Overall:** Not started. 0/4 phases shipped.

| Phase | Status | Ship SHA(s) | Notes |
|---|---|---|---|
| 1 — Schema + scaffolding (`answer-record.ts`, READMEs) | ⬜ Not started | — | TDD; pure code |
| 2 — Integrity harness (`answers-integrity.test.ts`) | ⬜ Not started | — | TDD; depends on Phase 1 |
| 3 — Pilot fetch runbook (records + snapshots) | ⬜ Not started | — | agent-driven research; gated by Phase 2; needs live Brave + web |
| 4 — Inter-rater + calibration handoff | ⬜ Not started | — | process; STOPs for Sam |

### Deviations
- _(none yet)_

### Discoveries
- **Design §3/§3.1 says `contentHashSha256` is "copied from the snapshot's url-to-markdown frontmatter."** It is actually in the tool's **`--json` envelope** at `metadata.content_hash_sha256`, and is a hash of the **body markdown excluding the YAML frontmatter** (per `.claude/skills/url-to-markdown/SKILL.md`), *not* a frontmatter field. Phase 1/2 implement and verify against the body-hash definition; Phase 3 cross-checks the recomputation against the tool's reported hash on the first real snapshot.

---

## Phase 1 — Schema + scaffolding

**Execution Status:** ⬜ NOT STARTED

The deterministic foundation. Pure types + validators + storage skeleton; everything downstream slots into this.

### Task 1.1: Answer-record module (types, nesting table, validators, snapshot hashing)

**Files:**
- Create: `test/gold/answer-record.ts`
- Test: `test/gold/answer-record.test.ts`

**Interfaces:**
- Consumes: `node:crypto` `createHash`.
- Produces (all exported):
  - `type Disposition`, `type Outcome`, `type Certification`
  - `const DISPOSITION_OUTCOMES: Record<Disposition, readonly Outcome[]>` (the §3.1 nesting table)
  - `interface EvidenceRef`, `interface AnswerRecord`
  - `function validateAnswerRecord(rec: AnswerRecord): string[]` (structural + invariant errors; `[]` = valid)
  - `function stripFrontmatter(fileText: string): string`
  - `function hashSnapshotBody(fileText: string): string`

BEFORE starting work:
1. Invoke superpowers:test-driven-development
2. Read docs/pitfalls/testing-pitfalls.md
Follow TDD: write failing test → implement → verify green.

- [ ] **Step 1: Write the failing tests**

```typescript
// test/gold/answer-record.test.ts
// ABOUTME: Tests for the ground-truth answer-record schema — nesting invariants, unverifiable rules, body hashing.
// ABOUTME: Pure unit tests; no network, no snapshot files (those are exercised by answers-integrity.test.ts).
import { describe, it, expect } from "vitest";
import {
  DISPOSITION_OUTCOMES, validateAnswerRecord, stripFrontmatter, hashSnapshotBody,
  type AnswerRecord,
} from "./answer-record";
import { createHash } from "node:crypto";

const base = (over: Partial<AnswerRecord> = {}): AnswerRecord => ({
  fixture: "zumwalt-class_destroyer.wikitext",
  sentenceSubstring: "will be ready to test the CPS in 2025",
  expectedYear: 2025,
  disposition: "confirmed_stale",
  outcome: "event_occurred",
  evidence: [{ sourceUrl: "https://navy.mil/x", snapshot: "test/gold/sources/2026-06-21-x.md",
    contentHashSha256: "abc", verbatimQuote: "concluded testing in 2025", supportsStaleness: true }],
  supersededBy: null,
  certification: "agent_auto",
  verifiedAsOf: "2026-06-21",
  ...over,
});

describe("validateAnswerRecord", () => {
  it("accepts a well-formed confirmed_stale record", () => {
    expect(validateAnswerRecord(base())).toEqual([]);
  });

  it("rejects an outcome that does not nest under its disposition", () => {
    const errs = validateAnswerRecord(base({ disposition: "still_current", outcome: "event_occurred" }));
    expect(errs.some((e) => /does not nest/.test(e))).toBe(true);
  });

  it("requires unverifiable records to carry empty evidence and human_confirmed", () => {
    const errs = validateAnswerRecord(base({
      disposition: "unverifiable", outcome: "unverifiable", certification: "agent_auto",
      evidence: [{ sourceUrl: "x", snapshot: "y", contentHashSha256: "z", verbatimQuote: "q", supportsStaleness: false }],
    }));
    expect(errs.some((e) => /unverifiable record must carry evidence: \[\]/.test(e))).toBe(true);
    expect(errs.some((e) => /unverifiable record must be human_confirmed/.test(e))).toBe(true);
  });

  it("requires a non-unverifiable record to carry at least one evidence entry", () => {
    const errs = validateAnswerRecord(base({ evidence: [] }));
    expect(errs.some((e) => /must carry >= 1 evidence/.test(e))).toBe(true);
  });

  it("rejects supersededBy on a non-superseded record", () => {
    const errs = validateAnswerRecord(base({ supersededBy: "New Plan B" }));
    expect(errs.some((e) => /supersededBy is only valid on a superseded record/.test(e))).toBe(true);
  });

  it("accepts supersededBy on a superseded record", () => {
    expect(validateAnswerRecord(base({
      disposition: "superseded", outcome: "superseded", supersededBy: "Constellation-class FFG(X)",
    }))).toEqual([]);
  });

  it("rejects a malformed verifiedAsOf", () => {
    expect(validateAnswerRecord(base({ verifiedAsOf: "June 2026" })).some((e) => /verifiedAsOf/.test(e))).toBe(true);
  });

  it("DISPOSITION_OUTCOMES covers all four dispositions with non-empty outcome lists", () => {
    expect(Object.keys(DISPOSITION_OUTCOMES).sort()).toEqual(
      ["confirmed_stale", "still_current", "superseded", "unverifiable"]);
    for (const outs of Object.values(DISPOSITION_OUTCOMES)) expect(outs.length).toBeGreaterThan(0);
  });
});

describe("stripFrontmatter / hashSnapshotBody", () => {
  it("strips a leading YAML frontmatter block and hashes only the body", () => {
    const body = "The program concluded testing in 2025 after delays.\n";
    const file = `---\ntitle: X\nsource_url: 'https://navy.mil/x'\nword_count: 8\n---\n${body}`;
    expect(stripFrontmatter(file)).toBe(body);
    expect(hashSnapshotBody(file)).toBe(createHash("sha256").update(body, "utf8").digest("hex"));
  });

  it("returns the whole text when there is no frontmatter", () => {
    const file = "no frontmatter here, just body text.";
    expect(stripFrontmatter(file)).toBe(file);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test test/gold/answer-record.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// test/gold/answer-record.ts
// ABOUTME: Schema + validators for the verified current-state ground-truth corpus answer records.
// ABOUTME: Pure — types, the disposition→outcome nesting table, record validation, and snapshot body hashing.
import { createHash } from "node:crypto";

export type Disposition = "confirmed_stale" | "superseded" | "still_current" | "unverifiable";
export type Outcome =
  | "event_occurred" | "slipped_still_pending"
  | "event_cancelled" | "superseded"
  | "still_current"
  | "unverifiable";

/** The design §3.1 nesting table — each coarse disposition's allowed granular outcomes. */
export const DISPOSITION_OUTCOMES: Record<Disposition, readonly Outcome[]> = {
  confirmed_stale: ["event_occurred", "slipped_still_pending"],
  superseded: ["event_cancelled", "superseded"],
  still_current: ["still_current"],
  unverifiable: ["unverifiable"],
};

export type Certification = "agent_auto" | "human_confirmed";

export interface EvidenceRef {
  sourceUrl: string;
  snapshot: string;            // repo-relative path under test/gold/sources/
  contentHashSha256: string;   // body hash from the url-to-markdown --json envelope
  verbatimQuote: string;       // MUST be byte-present on the snapshot body (evaluateQuote)
  supportsStaleness: boolean;
}

export interface AnswerRecord {
  fixture: string;
  sentenceSubstring: string;
  expectedYear: number | null;
  disposition: Disposition;
  outcome: Outcome;
  evidence: EvidenceRef[];
  supersededBy: string | null; // only on superseded records
  certification: Certification;
  verifiedAsOf: string;        // YYYY-MM-DD
}

/** Structural + invariant validation. Does NOT check byte-presence/hash — those need the snapshot files (integrity test). */
export function validateAnswerRecord(rec: AnswerRecord): string[] {
  const errs: string[] = [];
  const allowed = DISPOSITION_OUTCOMES[rec.disposition];
  if (!allowed) errs.push(`unknown disposition: ${rec.disposition}`);
  else if (!allowed.includes(rec.outcome)) errs.push(`outcome ${rec.outcome} does not nest under disposition ${rec.disposition}`);

  if (rec.certification !== "agent_auto" && rec.certification !== "human_confirmed")
    errs.push(`unknown certification: ${rec.certification}`);

  if (rec.disposition === "unverifiable") {
    if (rec.evidence.length !== 0) errs.push("unverifiable record must carry evidence: []");
    if (rec.certification !== "human_confirmed") errs.push("unverifiable record must be human_confirmed");
  } else if (rec.evidence.length === 0) {
    errs.push(`${rec.disposition} record must carry >= 1 evidence entry`);
  }

  if (rec.supersededBy !== null && rec.disposition !== "superseded")
    errs.push("supersededBy is only valid on a superseded record");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(rec.verifiedAsOf)) errs.push(`verifiedAsOf must be YYYY-MM-DD: ${rec.verifiedAsOf}`);
  return errs;
}

/** Strip a leading YAML frontmatter block delimited by the first two `---` lines; return the rest verbatim. */
export function stripFrontmatter(fileText: string): string {
  if (!fileText.startsWith("---")) return fileText;
  const closeIdx = fileText.indexOf("\n---", 3);
  if (closeIdx === -1) return fileText;
  const afterClose = fileText.indexOf("\n", closeIdx + 1);
  return afterClose === -1 ? "" : fileText.slice(afterClose + 1);
}

/** Recompute the url-to-markdown body hash: SHA256 of the markdown body, EXCLUDING the YAML frontmatter block. */
export function hashSnapshotBody(fileText: string): string {
  return createHash("sha256").update(stripFrontmatter(fileText), "utf8").digest("hex");
}
```

- [ ] **Step 4: Run to verify pass; typecheck; lint**

Run: `pnpm test test/gold/answer-record.test.ts && pnpm exec tsc --noEmit && pnpm lint`
Expected: PASS + clean (10 tests).

- [ ] **Step 5: Commit**

```bash
git add test/gold/answer-record.ts test/gold/answer-record.test.ts
git commit -m "feat(gold): answer-record schema + nesting/unverifiable validators

Disposition→outcome nesting table, unverifiable + supersededBy invariants,
and url-to-markdown body-hash recomputation. Pure + unit-tested.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VeYFUyHxVC7xhu8Wf6sFs"
```

BEFORE marking this task complete:
1. Review tests against docs/pitfalls/testing-pitfalls.md (§3 error paths, §6 boundary).
2. Coverage: each invalid branch (bad nesting, unverifiable-with-evidence, unverifiable-not-human, empty-evidence, stray supersededBy, bad date) has a test; both frontmatter/no-frontmatter hash paths covered.
3. `pnpm test test/gold/answer-record.test.ts` green with pristine output.

### Task 1.2: Storage skeleton — empty `answers.json` + READMEs

**Files:**
- Create: `test/gold/answers.json` (exactly `[]`)
- Create: `test/gold/answers-README.md`
- Create: `test/gold/sources/README.md`
- Create: `test/gold/sources/.gitkeep` (so the dir exists before any snapshot lands)

This task is **documentation/scaffolding** (TDD does not apply — no `src/` logic). Keep it minimal and accurate.

- [ ] **Step 1: Create `test/gold/answers.json`** containing exactly:

```json
[]
```

- [ ] **Step 2: Write `test/gold/answers-README.md`** covering: what the corpus is (one paragraph, link the design spec); the record schema (link `answer-record.ts` as the authority — do NOT duplicate the field list); the `(fixture, sentenceSubstring)` key matches `gold-set.json` stale entries; the two-tier certification summary (link design §2.2); and an **append-only "Spot-check & calibration log"** section seeded with a header row and `_(no entries yet)_`. Mirror the prose style of `test/gold/recall-set-README.md`.

- [ ] **Step 3: Write `test/gold/sources/README.md`** covering: snapshots are committed `url-to-markdown` transcriptions (faithful body + frontmatter); naming `<YYYY-MM-DD>-<slug>.md`; the `contentHashSha256` in each record is the tool's `metadata.content_hash_sha256` (body hash) and is re-verified by the integrity test; never hand-edit a snapshot (it breaks both the byte-presence and hash checks). Mirror `docs/policy/sources/README.md` if present.

- [ ] **Step 4: Commit**

```bash
git add test/gold/answers.json test/gold/answers-README.md test/gold/sources/README.md test/gold/sources/.gitkeep
git commit -m "docs(gold): corpus storage skeleton — empty answers.json + READMEs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VeYFUyHxVC7xhu8Wf6sFs"
```

BEFORE marking complete: `answers.json` parses as an empty array (`node -e "JSON.parse(require('fs').readFileSync('test/gold/answers.json'))"`); READMEs link the design + `answer-record.ts` rather than duplicating the schema.

After completing this group (Phase 1):
Review the batch from multiple perspectives. Minimum 3 review rounds. If round 3 still finds issues, keep going until clean.

---

## Phase 2 — Integrity harness

**Execution Status:** ⬜ NOT STARTED

The acceptance gate every real record must pass. Built and tested NOW (against synthetic fixtures), so it is ready before any pilot data lands. It runs vacuously-green on the empty `answers.json` and tightens automatically as Phase 3 adds records.

### Task 2.1: `answers-integrity.test.ts`

**Files:**
- Create: `test/gold/fixtures/sample-snapshot.md` (synthetic committed snapshot: small frontmatter + a body containing a known quote)
- Create: `test/gold/answers-integrity.test.ts`

**Interfaces:**
- Consumes: `validateAnswerRecord`, `hashSnapshotBody`, `type AnswerRecord`, `type EvidenceRef` from `./answer-record` (Task 1.1); `evaluateQuote` from `../../src/research/verbatim-check`; `gold-set.json` for the stale-key set.
- Produces: a test suite with two describes — `"answer-record invariants (synthetic)"` (the TDD'd assertions) and `"corpus integrity (real answers.json)"` (iterates the real file; vacuous until Phase 3).

BEFORE starting work:
1. Invoke superpowers:test-driven-development
2. Read docs/pitfalls/testing-pitfalls.md
Follow TDD: write failing test → implement → verify green.

- [ ] **Step 1: Create the synthetic snapshot fixture** `test/gold/fixtures/sample-snapshot.md`:

```markdown
---
title: Synthetic Navy CPS Test Report
source_url: 'https://example.invalid/cps'
fetched: '2026-06-21T00:00:00Z'
word_count: 11
---
The Navy stated the destroyer concluded testing in 2025 after delays.
```

- [ ] **Step 2: Write the failing test**

```typescript
// test/gold/answers-integrity.test.ts
// ABOUTME: Corpus integrity gate — every answer record's quote is byte-present on its snapshot, the snapshot
// ABOUTME: body hash matches, outcome nests under disposition, and the key maps to a real stale gold-set entry.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { validateAnswerRecord, hashSnapshotBody, stripFrontmatter, type AnswerRecord } from "./answer-record";
import { evaluateQuote } from "../../src/research/verbatim-check";
import type { UntrustedSourceText } from "../../src/research/source-fetch";

// cwd-relative paths — matches the established pattern in test/detector/recall.test.ts (vitest runs from repo root).
const read = (rel: string) => readFileSync(rel, "utf8");
const asSource = (s: string) => s as unknown as UntrustedSourceText;

/** The byte-presence + hash assertions one record/snapshot pair must satisfy. Reused for synthetic + real. */
function assertEvidenceGrounded(rec: AnswerRecord): void {
  expect(validateAnswerRecord(rec)).toEqual([]);
  for (const ev of rec.evidence) {
    const file = read(ev.snapshot);
    // Byte-presence + hash both operate on the BODY (frontmatter excluded): the quote is asserted present in
    // real content, and the MIN/MAX_QUOTE_LEN bounds are enforced implicitly (out-of-range → not "matched").
    expect(evaluateQuote(asSource(stripFrontmatter(file)), ev.verbatimQuote)).toBe("matched");
    expect(hashSnapshotBody(file)).toBe(ev.contentHashSha256);
  }
}

describe("answer-record invariants (synthetic)", () => {
  const snapshotRel = "test/gold/fixtures/sample-snapshot.md";
  const file = read(snapshotRel);
  const goodQuote = "concluded testing in 2025";

  const synthetic = (over: Partial<AnswerRecord> = {}): AnswerRecord => ({
    fixture: "zumwalt-class_destroyer.wikitext",
    sentenceSubstring: "will be ready to test the CPS in 2025",
    expectedYear: 2025,
    disposition: "confirmed_stale",
    outcome: "event_occurred",
    evidence: [{ sourceUrl: "https://example.invalid/cps", snapshot: snapshotRel,
      contentHashSha256: hashSnapshotBody(file), verbatimQuote: goodQuote, supportsStaleness: true }],
    supersededBy: null, certification: "agent_auto", verifiedAsOf: "2026-06-21",
    ...over,
  });

  it("a grounded synthetic record passes byte-presence + hash", () => {
    assertEvidenceGrounded(synthetic());
  });

  it("a tampered quote fails the byte-presence gate", () => {
    const file2 = read(snapshotRel);
    expect(evaluateQuote(asSource(file2), "concluded testing in 2099")).not.toBe("matched");
  });

  it("a wrong recorded hash fails the hash gate", () => {
    const rec = synthetic({ evidence: [{ ...synthetic().evidence[0], contentHashSha256: "deadbeef" }] });
    expect(hashSnapshotBody(read(rec.evidence[0].snapshot))).not.toBe(rec.evidence[0].contentHashSha256);
  });
});

describe("corpus integrity (real answers.json)", () => {
  const records = JSON.parse(read("test/gold/answers.json")) as AnswerRecord[];
  const gold = JSON.parse(read("test/gold/gold-set.json")) as Array<{ fixture: string; sentenceSubstring: string; stale?: boolean }>;
  const staleKeys = new Set(gold.filter((g) => g.stale).map((g) => `${g.fixture} ${g.sentenceSubstring}`));

  it("answers.json is an array", () => {
    expect(Array.isArray(records)).toBe(true);
  });

  it("every record is grounded, nests, and keys to a real stale gold-set entry", () => {
    for (const rec of records) {
      assertEvidenceGrounded(rec);
      expect(staleKeys.has(`${rec.fixture} ${rec.sentenceSubstring}`)).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Run to verify failure, then pass**

Run: `pnpm test test/gold/answers-integrity.test.ts`
Expected: first FAIL (test file references not yet wired / fixture missing), then after the fixture + module exist, PASS. The real-corpus describe passes **vacuously** (empty `answers.json`) — that is correct and intended; do NOT add a fake record to make it "do something."

- [ ] **Step 4: Typecheck, lint, commit**

```bash
pnpm exec tsc --noEmit && pnpm lint
git add test/gold/fixtures/sample-snapshot.md test/gold/answers-integrity.test.ts
git commit -m "test(gold): corpus integrity harness (byte-presence + body-hash + nesting + key)

Synthetic-fixture assertions for the grounding gate; the real-answers.json
describe runs vacuously until the pilot adds records.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VeYFUyHxVC7xhu8Wf6sFs"
```

BEFORE marking this task complete:
1. Review against docs/pitfalls/testing-pitfalls.md — esp. §2 (a vacuous-but-real describe is fine here and explicitly intended; it is NOT a skipped test) and §1 (pristine output).
2. Confirm `evaluateQuote` returns `"matched"` for the synthetic good quote (the fixture body literally contains "concluded testing in 2025").
3. `pnpm test test/gold/` green.

After completing this group (Phase 2):
Review the batch from multiple perspectives. Minimum 3 review rounds. If round 3 still finds issues, keep going until clean.

---

## Phase 3 — Pilot fetch runbook

**Execution Status:** ⬜ NOT STARTED

**This phase is agent-executed research, NOT TDD.** It produces data — `AnswerRecord`s + committed snapshots — whose acceptance gate is the Phase 2 harness (`pnpm test test/gold/` green) plus the §2.2 tier rules. It uses **live** Brave search + **live** `url-to-markdown` + the real web (no mocks; real data, real APIs). Requires an environment where Brave search and outbound web fetches are reachable; if the network policy blocks them, mark this phase ⏸ DEFERRED (unblock condition: run where Brave + outbound web are reachable) and proceed no further.

### Task 3.1: Select the pilot batch (~8–10 mixed claims)

**Files:** none yet (selection recorded in the PR / plan; records land in 3.2).

- [ ] **Step 1:** From the **32 `stale: true` entries** in `test/gold/gold-set.json`, choose **~8–10** that are **deliberately mixed** (design §9) — NOT the easiest. The batch MUST span:
  - **Clean-sourcing claims** likely to auto-certify (Tier 1): a defense/space/government program with a `.gov`/`.mil` or major-agency primary source (e.g. the `zumwalt-class_destroyer.wikitext` CPS-test claim).
  - **Escalation-exercising claims**: at least 2–3 expected to be Tier 2 — contested/uncertain current state, likely-only-trade-press sourcing, or plausibly `unverifiable` (target date passed with no positive source).
  - Scope note (verified): all **32** `stale: true` entries in `gold-set.json` are genuine world-fact claims — none are detector-mechanics false-positive probes (those live in `det2-candidates.json` / `det3-fp-set.json`, which `answers.json` does NOT key against). So the design §9 "skip pure detector-mechanics entries" clause excludes **nothing** here; it remains a safety net only — if you somehow encounter a stale key that asserts no checkable world fact, skip it with a reason recorded in `answers-README.md` rather than inventing an answer.
- [ ] **Step 2:** List the chosen `(fixture, sentenceSubstring)` keys in the PR description and ask Sam to confirm the batch before fetching (this is the one human checkpoint inside Phase 3; the design made the pilot Sam's calibration instrument). Proceed once confirmed.

### Task 3.2: Per-claim fetch → ground → classify → record

For **each** claim in the confirmed batch, follow this procedure (design §7). Work one claim at a time; commit per claim so a failure isolates. **Do NOT parallelize the `answers.json` append** — it is a single shared file; concurrent writers conflict. If you parallelize the *fetching* across subagents (design §7 notes claims are independent), each agent writes its record to a separate scratch file and a single serializing step appends them to `answers.json` one at a time; never have two agents edit `answers.json` concurrently.

- [ ] **a. Neutral query (G9).** Read the fixture context around `sentenceSubstring` (`test/fixtures/<fixture>`); derive a neutral retrieval query — no leading/loaded phrasing, no presupposed answer.
- [ ] **b. Search + circular filter.** Obtain candidate hits via the project's Brave provider and apply `filterCircularHits` (`src/research/source-exclusion.ts`) — Wikipedia/mirrors never qualify. (Reuse the `scripts/search-eval/` harness, or a throwaway script that constructs `BraveSearchProvider` and calls `filterCircularHits`; do NOT reimplement the filter.) The Brave API key must be configured as `brave-search.ts` expects — if it is absent in this environment, that is the Phase-3 ⏸ DEFER condition.
- [ ] **c. Find the resolving fact.** Fetch/read candidates; find a source that states the current-state fact. **Prefer the primary source:** if the best hit is high-reliability trade press (Jane's/RAND/CSIS and peers) that cites an official source, follow the citation through and ground on the official source (design §2.1).
- [ ] **d. Transcribe + commit the snapshot.** Run `url-to-markdown` with `--json --out test/gold/sources/` (via the skill or `scripts/bootstrap.sh <URL> --json --out test/gold/sources/`). Capture `metadata.content_hash_sha256` and `output_path` from the JSON envelope. Rename the file to `<YYYY-MM-DD>-<slug>.md` if needed and **commit it**. If the tool reports a paywall/SPA/extraction failure, treat the source as unusable — pick another or escalate.
- [ ] **e. Verbatim gate (non-negotiable).** Extract the exact span; confirm `evaluateQuote(<snapshot body>, quote) === "matched"`. If it does not match, the candidate is **rejected** — fix the quote to an actual byte-present span or drop the source. The quote MUST be ≥ `MIN_QUOTE_LEN` (8) and ≤ `MAX_QUOTE_LEN` (300) code points.
- [ ] **f. First-snapshot hash cross-check (once, gating).** On the **first** real snapshot only: confirm `hashSnapshotBody(<file>) === metadata.content_hash_sha256` from the tool. If they differ, STOP — reconcile `stripFrontmatter` with `.claude/skills/url-to-markdown/references/` (the body/frontmatter boundary) before continuing; every later record depends on this matching.
- [ ] **g. Classify the tier (§2.2).** Auto-certify (`agent_auto`) ONLY when ALL hold: high-authority source (gov/mil/major-agency/standards/primary-org, or curated high-reliability trade press); self-evident support (one span, or several non-contiguous spans whose co-reference is self-evident in the quoted text — design §2.2); unambiguous disposition. Otherwise `human_confirmed` and add to the escalation queue (Task 3.3). **When in doubt, escalate.**
- [ ] **h. Record both dispositions + provenance.** Append an `AnswerRecord` to `test/gold/answers.json`: coarse `disposition` + granular `outcome` (must nest), the `evidence[]` (each with `sourceUrl`, committed `snapshot` path, `contentHashSha256`, byte-present `verbatimQuote`, `supportsStaleness`), `supersededBy` (only if `superseded`), `certification`, `verifiedAsOf`. `unverifiable` → `evidence: []`, `certification: human_confirmed`.
- [ ] **i. Gate on the harness.** Run `pnpm test test/gold/` — the new record + snapshot MUST pass byte-presence, hash, nesting, and stale-key checks. Then commit (snapshot + answers.json together):

```bash
git add test/gold/answers.json test/gold/sources/<YYYY-MM-DD>-<slug>.md
git commit -m "data(gold): pilot answer for <fixture> — <disposition>/<outcome>

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VeYFUyHxVC7xhu8Wf6sFs"
```

### Task 3.3: Escalation review queue

- [ ] Create `test/gold/escalation-queue.md` — a Sam-facing checklist. For each `human_confirmed` (Tier 2) item: the claim key, the candidate evidence (URL + committed snapshot path + proposed quote), the proposed disposition/outcome, and a one-line reason it escalated (low authority / inference needed / ambiguous / unverifiable / low confidence). This is navigation for Sam's review, not a persisted artifact of the corpus — keep it factual, no model prose about "the fact."
- [ ] Commit the queue.

BEFORE marking Phase 3 complete:
1. `pnpm test test/gold/` green with every pilot record present.
2. Every committed snapshot is a real `url-to-markdown` transcription (not hand-written); every `verbatimQuote` byte-present; every `agent_auto` record genuinely meets ALL three §2.2 criteria (re-read each — if any is borderline, move it to `human_confirmed`).
3. The escalation queue lists every Tier-2 item with its evidence attached.

---

## Phase 4 — Inter-rater + calibration handoff

**Execution Status:** ⬜ NOT STARTED

Process phase. Produces the calibration signal and STOPs for Sam before any scale-up.

### Task 4.1: Independent second-agent (inter-rater) pass

- [ ] Dispatch a **fresh** agent, **instructed not to read `answers.json` or the first pass's records/snapshots before proposing** (true isolation isn't enforceable in one repo — the discipline is the instruction + writing to a separate file), to independently propose answers for the **same** pilot batch keys, following the Task 3.2 procedure but writing to a scratch file `test/gold/inter-rater-pass.json` (NOT `answers.json`).
- [ ] Diff the two passes per claim (disposition/outcome agreement; same source class). Record agreements/divergences in `test/gold/inter-rater-diff.md`.
- [ ] **Any divergence on an `agent_auto` record forces it to escalation** — flip that record's `certification` to `human_confirmed`, add it to the escalation queue with the divergence noted, and re-run `pnpm test test/gold/` (still green — certification change is metadata). Commit.
- [ ] Do NOT delete `inter-rater-pass.json`/`inter-rater-diff.md` — they are the calibration evidence trail.

### Task 4.2: Calibration handoff — STOP for Sam

- [ ] Append to the **append-only** "Spot-check & calibration log" in `test/gold/answers-README.md`: the pilot batch size, the auto/escalate split, the inter-rater agreement rate, and a pointer to the escalation queue + diff. Do not rewrite prior entries.
- [ ] **STOP.** Report to Sam (status: DONE for the pilot) with: the auto/escalate split, the inter-rater agreement, the escalation queue for his review, and the request to spot-check a ~20% sample of `agent_auto` records (design §2.3). The rest of the 32 stale claims are **green-lit only after** Sam's review — do NOT proceed to the full corpus in this phase.

BEFORE marking Phase 4 complete: the calibration log entry is appended (not overwritten); the STOP report is delivered; no scale-up beyond the pilot has begun.

After completing Phases 3–4:
Review from multiple perspectives. Minimum 3 review rounds (compliance: every quote byte-present + neutral queries + no persisted model prose; data: every record passes the harness; process: escalation + inter-rater trails intact). Keep going until clean.

---

## Self-Review (author, fresh eyes)

**Spec coverage** (design → task):
- §2.1 verbatim gate → Task 3.2e + the integrity harness (Task 2.1).
- §2.2 tier classification + multi-span self-evidence → Task 3.2g.
- §2.3 spot-check + inter-rater calibration → Tasks 4.1, 4.2.
- §3 schema (incl. supersededBy, both dispositions) → Task 1.1 types + validators.
- §3.1 nesting table → `DISPOSITION_OUTCOMES` + validator (Task 1.1) + harness (Task 2.1).
- §4 archived snapshots via url-to-markdown → Task 3.2d.
- §5 storage layout → Task 1.2 + 3.2.
- §6 integrity test (byte-presence, hash, nesting) → Task 2.1.
- §7 build workflow → Task 3.2 (a–i, in order).
- §9 scope + pilot-mixed + skip detector-mechanics → Task 3.1.

**Placeholder scan:** none — Phase 1/2 ship complete code; Phase 3/4 are runbooks with concrete commands and explicit acceptance gates (harness green + tier rules + Sam STOP).

**Type consistency:** `AnswerRecord`/`EvidenceRef`/`Disposition`/`Outcome` defined once in `answer-record.ts` (Task 1.1), imported by the harness (Task 2.1) and authored by Phase 3. `hashSnapshotBody`/`validateAnswerRecord`/`stripFrontmatter` signatures consistent between definition and use. `evaluateQuote` returns `"matched"` (verified against `verbatim-check.ts`).

---

## Execution Strategy (recommendation)

- **Phases 1–2 (code):** **subagent-driven development** — two clean TDD tasks with quality gates between them; a fresh subagent per task is ideal and self-contained.
- **Phase 3 (pilot fetch):** **this session or a focused single session with live network** — it is real research requiring Brave + `url-to-markdown` + web, sequential `answers.json` appends, and a Sam confirmation checkpoint (3.1 Step 2). Not a parallel-agent fit *for the answers.json writes*; fetching may fan out but writes serialize. If the environment lacks network/Brave, Phases 1–2 still ship; Phase 3 defers.
- **Phase 4 (inter-rater + handoff):** the inter-rater pass is **one dispatched parallel agent** (independent second opinion); the calibration handoff STOPs for Sam.

Why this matters: per `/writing-plans-enhanced` Step 5, the Living Document Contract keeps this plan synced as phases ship/defer — especially relevant here since Phase 3 may legitimately defer on environment.

---

## Plan Review Cycle Log

Per `/plan-review-cycle` (min 3 rounds; continue until a round is clean).

**Round 1 — 4 substantive findings (all fixed inline):**
1. **Skip-criterion was misleading** — verified all 32 `stale: true` gold-set entries are genuine world-fact claims (detector-mechanics probes live in separate files `answers.json` doesn't key against); rewrote Task 3.1 to say the skip clause excludes nothing here and is a safety net only.
2. **Wrong path convention** — the harness used `__dirname` + `join`; the project reads gold fixtures **cwd-relative** (`test/detector/recall.test.ts`). Switched to cwd-relative `readFileSync`.
3. **Byte-presence ran against the whole file** — now runs against `stripFrontmatter(file)` (the body), matching the hash gate and asserting the quote in real content; also noted the MIN/MAX_QUOTE_LEN bounds are enforced implicitly (out-of-range → not `"matched"`).
4. **`answers.json` parallel-write hazard** — added an explicit boundary: never edit `answers.json` concurrently; fan-out fetching writes to scratch files, a single step serializes the appends.

**Round 2 — 3 findings (all fixed inline):**
1. **Inter-rater "no access" overclaimed** — true isolation isn't enforceable in one repo; reframed as an instruction (don't read `answers.json` first) + separate scratch file.
2. **Missing execution-strategy recommendation** (required by the wrapper) — added the Execution Strategy section.
3. **Brave key dependency implicit** — named it as the Phase-3 defer condition in step (b).

**Round 3 — 0 substantive findings.** Re-read end-to-end across all six dimensions. Verified: synthetic fixture body literally contains the asserted quote ("concluded testing in 2025", ≥ MIN_QUOTE_LEN); `hashSnapshotBody` correctness is independently tested in Task 1.1 (against a hand-computed `createHash`), so the integrity test's reuse isn't circular; the vacuous real-corpus describe is intended (not a skipped test) and documented; `stripFrontmatter` handles the no-frontmatter and well-formed-frontmatter cases the fixtures exercise. Clean — review complete.
