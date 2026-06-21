# Evidence-Card Context Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render each verified `verbatimQuote` inside its source paragraph, with the quote emphasized, so a reviewer is not misled by a quote severed from its qualifiers.

**Architecture:** A pure, deterministic slice helper extracts the flanking source text (normalized space, paragraph-bounded, word-snapped, nullable at edges) at verify time; the two slices ride on `EvidenceCard` → pack `cards_json` → `EvidenceCardView` → the card component, which renders `before` + **quote** + `after`. No change to the G5 gate, the mechanical citation, or page retention.

**Tech Stack:** TypeScript, Cloudflare Workers + D1, Next.js (RSC), Vitest. Source under `src/`, tests mirror under `test/`.

**Design spec:** [docs/design/2026-06-21-evidence-context-display-design.md](../design/2026-06-21-evidence-context-display-design.md) — authoritative; read it before starting.

## Global Constraints

- **Compliance contract is sacrosanct** ([docs/policy/wikipedia-genai-compliance.md](../policy/wikipedia-genai-compliance.md)). Load-bearing here: **G1** (no model-authored prose — context is deterministic *source* text only), **G5** (human-open gate unchanged), **G16** (no copy affordance on the card; bounded window), **G2** (mechanical citation untouched).
- **No regex on untrusted source text** beyond the existing `normalizeForVerbatim` contract. The slice helper uses string/array operations only.
- **Code points, not UTF-16 units**, for every length bound (`[...s].length`), matching `verbatim-check.ts`.
- **Determinism:** no `Date.now()`/`Math.random()` in the helper; tests arm `armDeterminismTraps()`.
- **No backward-compat shims** without Sam's approval. D1 is unprovisioned (placeholder ids) — no persisted packs exist, so no migration and no legacy-row handling is owed.
- **Runtime:** Node 24 (`.nvmrc`). Test command: `pnpm test` (vitest).
- **Commit footer** (every commit):
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

**Overall:** In progress. 0/5 phases shipped. Branch `claude/evidence-context-display`.

| Phase | Status | Ship SHA(s) | Notes |
|---|---|---|---|
| 1 — Slice helper (`quote-context.ts`) | ✅ SHIPPED | (see branch) | the deterministic core |
| 2 — Capture + schema (`provider.ts`, `verify-proposal.ts`) | ✅ SHIPPED | (see branch) | depends on Phase 1 |
| 3 — View projection (`view-types.ts`, `evidence-card.ts`) | ✅ SHIPPED | (see branch) | depends on Phase 2 |
| 4 — Read-path validation (`research-packs.ts`) | ✅ SHIPPED | (see branch) | depends on Phase 1 (cap) + 2 (fields) |
| 5 — Render (`EvidenceCard.tsx`) | 🚧 IN PROGRESS | — | depends on Phase 3 |

### Deviations
- **Phase 5 renders the full stored window with no client-side "show more" toggle** (server component, no new client code). The design's §3.5 sketched a client line-clamp + expand; the design's own §A.3 flags this as uncertain and cheap to flip. With `CONTEXT_SIDE_CAP = 240`/side the stored window is already modest, so v1 shows it in full and the terminal "more" is the open source. Flagged for Sam; trivially revisited if real paragraphs read too long.

### Discoveries
- **Task 2 literal worklist had two members beyond the `tsc`-flagged set, both runtime round-trip assertions on the now-5-field card shape (the plan's "second worklist").** (1) `test/transparency/surface-pack.test.ts` — the local `cards` DTO (~line 9) AND the G1 closed-shape assertion (`expect(cardKeys).toEqual([...])`, ~line 93) both needed the two context fields; the closed-shape assertion now lists `contextAfter`/`contextBefore` (deterministic source slices, not prose — they belong in the closed set, so the G1 intent is preserved). (2) `test/worksheet/evidence-card.test.ts` (~line 16/32) and `test/worksheet/load-worksheet-view.test.ts` (~line 43) assert `Object.keys(view).sort()` on the *view*; those stay at the 3-key set through Phase 2 (view unchanged until Phase 3) and are updated in Phase 3 when `toEvidenceCardView` starts projecting the fields.

---

## Phase 1 — Slice helper (`quote-context.ts`)

**Execution Status:** ✅ SHIPPED — 2026-06-21, commit recorded in top-of-plan table. 12/12 helper tests green; tsc + lint clean.

The deterministic lake — boil it. A pure function with exhaustive edge-case tests; everything downstream just plumbs its output.

### Task 1: `sliceQuoteContext` + `CONTEXT_SIDE_CAP`

**Files:**
- Create: `src/research/quote-context.ts`
- Modify: `src/research/verbatim-check.ts` (export the existing `MAX_PAGE_CHARS` constant, line ~20 — change `const MAX_PAGE_CHARS` to `export const MAX_PAGE_CHARS`; nothing else)
- Test: `test/research/quote-context.test.ts`

**Interfaces:**
- Consumes: `normalizeForVerbatim` from `src/research/normalize.ts`; `UntrustedSourceText` from `src/research/source-fetch.ts`; `MAX_PAGE_CHARS` from `src/research/verbatim-check.ts`.
- Produces:
  - `export const CONTEXT_SIDE_CAP = 240` (code points/side)
  - `export interface QuoteContext { contextBefore: string | null; contextAfter: string | null }`
  - `export function sliceQuoteContext(pageText: UntrustedSourceText, quote: string): QuoteContext`

**SAFE-1 (implementation pitfall, `docs/pitfalls/implementation-pitfalls.md`):** this helper scans **untrusted source text**, so it MUST be provably linear in input length. It uses only `indexOf`/`lastIndexOf`/`slice`/spread (all O(n)) and the existing linear `normalizeForVerbatim` — no regex, no per-start scanning. It also applies the **same `MAX_PAGE_CHARS` cap `evaluateQuote` uses** before normalizing (defense in depth + parity). Linearity is proven by the pathological-input perf test in Step 1, not by inspection.

**First-occurrence semantics (documented, not a bug):** when a quote appears more than once on the page, the helper uses the **first** occurrence (`indexOf`) — the same first-match basis `evaluateQuote`'s `includes` uses. Deterministic; a test pins it.

BEFORE starting work:
1. Invoke superpowers:test-driven-development
2. Read docs/pitfalls/testing-pitfalls.md
Follow TDD: write failing test → implement → verify green.

- [ ] **Step 1: Write the failing tests**

```typescript
// test/research/quote-context.test.ts
// ABOUTME: Tests for sliceQuoteContext — the deterministic surrounding-context slicer for evidence cards.
// ABOUTME: Boils the edge-case lake: mid/edge/whole-block, cap+word-snap, code-point counting, block-boundary isolation.
import { describe, it, expect } from "vitest";
import { armDeterminismTraps } from "../helpers/determinism";
import { sliceQuoteContext, CONTEXT_SIDE_CAP } from "../../src/research/quote-context";
import { normalizeForVerbatim } from "../../src/research/normalize";
import type { UntrustedSourceText } from "../../src/research/source-fetch";

const src = (s: string): UntrustedSourceText => s as unknown as UntrustedSourceText;

describe("sliceQuoteContext", () => {
  armDeterminismTraps();

  it("returns the flanking text for a quote mid-paragraph", () => {
    const quote = "concluded testing in 2025";
    const page = src("The program " + quote + " after a long delay.");
    const r = sliceQuoteContext(page, quote);
    expect(r.contextBefore).toBe("The program ");
    expect(r.contextAfter).toBe(" after a long delay.");
  });

  it("returns null before when the quote starts the paragraph", () => {
    const quote = "Program X concluded testing";
    const page = src(quote + " in 2025.");
    const r = sliceQuoteContext(page, quote);
    expect(r.contextBefore).toBeNull();
    expect(r.contextAfter).toBe(" in 2025.");
  });

  it("returns null after when the quote ends the paragraph", () => {
    const quote = "awarded the production contract";
    const page = src("The DoD " + quote);
    const r = sliceQuoteContext(page, quote);
    expect(r.contextBefore).toBe("The DoD ");
    expect(r.contextAfter).toBeNull();
  });

  it("returns null on both sides when the quote is the whole paragraph", () => {
    const quote = "The whole paragraph is the quote.";
    const r = sliceQuoteContext(src(quote), quote);
    expect(r.contextBefore).toBeNull();
    expect(r.contextAfter).toBeNull();
  });

  it("never crosses a paragraph boundary (\\n)", () => {
    const quote = "the resolving fact here";
    // Prior + next paragraphs must NOT leak into the window.
    const page = src("PRIOR PARAGRAPH.\nThe lede states " + quote + " plainly.\nNEXT PARAGRAPH.");
    const r = sliceQuoteContext(page, quote);
    expect(r.contextBefore).toBe("The lede states ");
    expect(r.contextAfter).toBe(" plainly.");
    expect(r.contextBefore).not.toContain("PRIOR");
    expect(r.contextAfter).not.toContain("NEXT");
  });

  it("caps each side at CONTEXT_SIDE_CAP code points and snaps to a word boundary", () => {
    const quote = "the central claim";
    const before = "x ".repeat(400);          // 800 chars, far over the cap, space-separated tokens
    const after = " y".repeat(400);
    const page = src(before + quote + after);
    const r = sliceQuoteContext(page, quote);
    // Bounded
    expect([...(r.contextBefore ?? "")].length).toBeLessThanOrEqual(CONTEXT_SIDE_CAP);
    expect([...(r.contextAfter ?? "")].length).toBeLessThanOrEqual(CONTEXT_SIDE_CAP);
    // Word-snapped: no partial leading/trailing token (these tokens are single chars, so boundaries are clean)
    expect(r.contextBefore?.startsWith("x")).toBe(true);
    expect(r.contextAfter?.endsWith("y")).toBe(true);
  });

  it("counts the cap in code points, not UTF-16 units", () => {
    const quote = "anchor fact";
    // Astral emoji are 2 UTF-16 units / 1 code point each. cap+50 of them must be truncated to <= cap.
    const before = "😀 ".repeat(CONTEXT_SIDE_CAP + 50);
    const page = src(before + quote + " tail.");
    const r = sliceQuoteContext(page, quote);
    expect([...(r.contextBefore ?? "")].length).toBeLessThanOrEqual(CONTEXT_SIDE_CAP);
  });

  it("returns the reconstructable window: normalize(before+quote+after) is a substring of normalize(page)", () => {
    const quote = "concluded testing in 2025";
    const page = src("The program " + quote + " after a long delay.");
    const r = sliceQuoteContext(page, quote);
    const window = normalizeForVerbatim((r.contextBefore ?? "") + quote + (r.contextAfter ?? ""));
    expect(normalizeForVerbatim(page as unknown as string).includes(window)).toBe(true);
  });

  it("returns both null defensively when the quote is absent (caller only calls after a match)", () => {
    const r = sliceQuoteContext(src("page without it"), "totally absent quote");
    expect(r).toEqual({ contextBefore: null, contextAfter: null });
  });

  it("returns both null for an empty quote (the q.length === 0 guard)", () => {
    const r = sliceQuoteContext(src("some page text"), "");
    expect(r).toEqual({ contextBefore: null, contextAfter: null });
  });

  it("uses the FIRST occurrence when the quote repeats (matches evaluateQuote's includes basis)", () => {
    const quote = "delivered the unit";
    const page = src("Early: the vendor " + quote + " late. Later: they " + quote + " again.");
    const r = sliceQuoteContext(page, quote);
    expect(r.contextBefore).toBe("Early: the vendor ");
    expect(r.contextAfter).toBe(" late. Later: they delivered the unit again."); // tail of the FIRST match's block
  });

  it("SAFE-1: slices a multi-MB page within a tight time bound (linear, no superlinear scan)", () => {
    const quote = "the central resolving fact of the claim";
    // ~4 MB of filler, quote planted near the middle; pure-token spam stresses the boundary scan.
    const filler = "spam ".repeat(400_000); // ~2 MB
    const page = src(filler + quote + filler);
    const start = performance.now();
    const r = sliceQuoteContext(page, quote);
    const elapsedMs = performance.now() - start;
    expect([...(r.contextBefore ?? "")].length).toBeLessThanOrEqual(CONTEXT_SIDE_CAP);
    expect([...(r.contextAfter ?? "")].length).toBeLessThanOrEqual(CONTEXT_SIDE_CAP);
    expect(elapsedMs).toBeLessThan(1000); // generous; a superlinear scan would blow past this
  });
  // Note: armDeterminismTraps() traps fetch/Date.now/Math.random only — NOT performance.now — so this
  // timing assertion is safe. Do NOT remove the perf test thinking the trap will break it.
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test test/research/quote-context.test.ts`
Expected: FAIL — `sliceQuoteContext` is not defined / module not found.

- [ ] **Step 3a: Export `MAX_PAGE_CHARS` from `verbatim-check.ts`**

In `src/research/verbatim-check.ts`, change `const MAX_PAGE_CHARS = 4_000_000;` to `export const MAX_PAGE_CHARS = 4_000_000;`. No other change; the existing comment stays.

- [ ] **Step 3b: Write the minimal implementation**

```typescript
// src/research/quote-context.ts
// ABOUTME: Deterministic surrounding-context slicer for a verified quote — flanking source slices within
// ABOUTME: the quote's normalized paragraph, bounded + word-snapped, for evidence-card disambiguation display.
import { normalizeForVerbatim } from "./normalize";
import { MAX_PAGE_CHARS } from "./verbatim-check";
import type { UntrustedSourceText } from "./source-fetch";

/**
 * Max code points of context per side. Tunable; NOT a correctness threshold — the window stays a
 * contiguous in-paragraph span at any cap. Kept near the MAX_QUOTE_LEN pointer bound so the stored-source
 * and copy surface stay modest (G16).
 */
export const CONTEXT_SIDE_CAP = 240;

export interface QuoteContext {
  /** Normalized source text immediately before the quote within its paragraph; null at paragraph start. */
  contextBefore: string | null;
  /** Normalized source text immediately after the quote within its paragraph; null at paragraph end. */
  contextAfter: string | null;
}

/**
 * Slice the normalized source text flanking the quote's occurrence — bounded to CONTEXT_SIDE_CAP code
 * points per side, snapped to a whitespace boundary, never crossing the paragraph boundary (\n). Operates
 * in normalized space (the representation evaluateQuote matched against), so the paragraph boundary is
 * exactly \n and the reconstructed window is a contiguous substring of the normalized page. Returns null
 * for an absent side (quote at a paragraph edge) and for a not-found quote (defensive — the caller only
 * invokes this after a confirmed match).
 */
export function sliceQuoteContext(pageText: UntrustedSourceText, quote: string): QuoteContext {
  // SAFE-1: cap before normalizing (parity with evaluateQuote) — keeps the scan linear and bounded
  // on untrusted text. All operations below are O(n): indexOf/lastIndexOf/slice/spread, no regex.
  const raw = pageText as unknown as string;
  const page = normalizeForVerbatim(raw.length > MAX_PAGE_CHARS ? raw.slice(0, MAX_PAGE_CHARS) : raw);
  const q = normalizeForVerbatim(quote);
  if (q.length === 0) return { contextBefore: null, contextAfter: null };

  const qStart = page.indexOf(q); // first occurrence — same basis as evaluateQuote's includes
  if (qStart === -1) return { contextBefore: null, contextAfter: null };
  const qEnd = qStart + q.length;

  const blockStart = page.lastIndexOf("\n", qStart - 1) + 1;   // 0 when there is no preceding \n
  const nextNl = page.indexOf("\n", qEnd);
  const blockEnd = nextNl === -1 ? page.length : nextNl;

  const before = capTrailing(page.slice(blockStart, qStart));
  const after = capLeading(page.slice(qEnd, blockEnd));

  return {
    contextBefore: before.length === 0 ? null : before,
    contextAfter: after.length === 0 ? null : after,
  };
}

/** Keep at most CONTEXT_SIDE_CAP *trailing* code points; if truncated, drop the leading partial word. */
function capTrailing(s: string): string {
  const cps = [...s];
  if (cps.length <= CONTEXT_SIDE_CAP) return s;
  const kept = cps.slice(cps.length - CONTEXT_SIDE_CAP);
  const sp = kept.indexOf(" ");
  if (sp === -1) return "";              // single oversized token: no clean word boundary
  return kept.slice(sp + 1).join("");    // start just after the first whole space
}

/** Keep at most CONTEXT_SIDE_CAP *leading* code points; if truncated, drop the trailing partial word. */
function capLeading(s: string): string {
  const cps = [...s];
  if (cps.length <= CONTEXT_SIDE_CAP) return s;
  const kept = cps.slice(0, CONTEXT_SIDE_CAP);
  const sp = kept.lastIndexOf(" ");
  if (sp === -1) return "";              // single oversized token
  return kept.slice(0, sp).join("");     // end just before the last whole space
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test test/research/quote-context.test.ts`
Expected: PASS (all 12 tests).

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/research/quote-context.ts src/research/verbatim-check.ts test/research/quote-context.test.ts
git commit -m "feat(research): deterministic quote-context slicer

Bounded, word-snapped flanking source slices within the quote's normalized
paragraph; nullable at paragraph edges; first-occurrence basis; MAX_PAGE_CHARS
cap parity (SAFE-1). Pure + fully edge-tested.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VeYFUyHxVC7xhu8Wf6sFs"
```

BEFORE marking this task complete:
1. Review tests against docs/pitfalls/testing-pitfalls.md (esp. §4 negative property / unicode + §1 pristine output).
2. Verify coverage: mid-paragraph, both edges, whole-block, cap+snap, code-point counting, block isolation, reconstructable-window invariant, not-found, empty-quote, first-occurrence, SAFE-1 perf bound. All present (12 tests).
3. Run `pnpm test test/research/quote-context.test.ts` and confirm green with pristine output.

---

## Phase 2 — Capture + schema (`provider.ts`, `verify-proposal.ts`)

**Execution Status:** ✅ SHIPPED — 2026-06-21. Full suite 918/918 green; tsc + lint clean. EvidenceCard required-field churn fixed across 8 test files (15 tsc literals + 1 runtime closed-shape assertion).

Add the two fields to the durable `EvidenceCard` and populate them at the one place the page is in hand.

### Task 2: Populate context in `verifyProposal`

**Files:**
- Modify: `src/research/provider.ts` (the `EvidenceCard` interface, ~line 32)
- Modify: `src/research/verify-proposal.ts` (the `"matched"` branch, ~line 24)
- Modify: `test/research/verify-proposal.test.ts`

**Interfaces:**
- Consumes: `sliceQuoteContext`, `QuoteContext` from `src/research/quote-context.ts` (Task 1).
- Produces: `EvidenceCard` now additionally carries `contextBefore: string | null` and `contextAfter: string | null`. `verifyProposal` is the ONLY production constructor of `EvidenceCard` (verified by grep: only `verbatimQuote:` literal that builds a card), so this is the only capture site.

BEFORE starting work:
1. Invoke superpowers:test-driven-development
2. Read docs/pitfalls/testing-pitfalls.md
Follow TDD: write failing test → implement → verify green.

- [ ] **Step 1: Write the failing test** (append to `test/research/verify-proposal.test.ts`)

```typescript
  // Context capture: a matched proposal carries the flanking source slices (design 2026-06-21 §3.2).
  it("populates contextBefore/contextAfter from the page on a match", async () => {
    const quote = "NASA confirmed the launch on 3 May 2024";
    const page = "Earlier reports were cautious. " + quote + " in a press briefing.";
    const fetch = async (_url: string) => ok(page);
    const result = await verifyProposal(proposal({ proposedQuote: quote }), { fetchSource: fetch });
    expect(isDrop(result)).toBe(false);
    expect(result).toMatchObject({
      contextBefore: "Earlier reports were cautious. ",
      contextAfter: " in a press briefing.",
    });
  });

  it("yields a null side when the matched quote sits at a paragraph edge", async () => {
    const quote = "NASA confirmed the launch on 3 May 2024";
    const fetch = async (_url: string) => ok(quote + " afterwards.");
    const result = await verifyProposal(proposal({ proposedQuote: quote }), { fetchSource: fetch });
    expect(result).toMatchObject({ contextBefore: null, contextAfter: " afterwards." });
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test test/research/verify-proposal.test.ts`
Expected: FAIL — `contextBefore`/`contextAfter` are `undefined` (not yet populated); and `tsc` would flag the missing interface fields.

- [ ] **Step 3: Add the fields to the `EvidenceCard` interface**

In `src/research/provider.ts`, inside `export interface EvidenceCard { … }`, after `advisorySupport`:

```typescript
  /** Deterministic source text immediately before the quote in its paragraph; null at paragraph start. NOT model prose. */
  contextBefore: string | null;
  /** Deterministic source text immediately after the quote in its paragraph; null at paragraph end. NOT model prose. */
  contextAfter: string | null;
```

- [ ] **Step 4: Populate them in `verifyProposal`**

In `src/research/verify-proposal.ts`, add the import and rewrite the `"matched"` branch:

```typescript
import { sliceQuoteContext } from "./quote-context";
```

```typescript
  if (result === "matched") {
    // Store the RAW proposed quote (design §3 determinism rule); context is sliced deterministically
    // from the same fetched page (design 2026-06-21 §3.2) — source text, never model prose.
    const { contextBefore, contextAfter } = sliceQuoteContext(fetched.text, proposal.proposedQuote);
    return {
      url: proposal.url,
      verbatimQuote: proposal.proposedQuote,
      advisorySupport: proposal.advisorySupport,
      contextBefore,
      contextAfter,
    };
  }
```

- [ ] **Step 5: Propagate the now-required fields to every `EvidenceCard` literal in the test suite**

Making the two fields **required** breaks every existing `EvidenceCard` literal at `tsc` time, and the exact-match round-trip assertions at runtime. This MUST be fixed in THIS task/commit or the suite stays red. **`tsc` is the worklist; the full suite is the second worklist.** Run `pnpm exec tsc --noEmit` and add `contextBefore: null, contextAfter: null` to each literal it flags. The known set (18 literals across 10 files; verify with `grep -rn 'verbatimQuote:' test/`):

- `test/worksheet/evidence-card.test.ts`, `test/worksheet/honesty-state.test.ts`, `test/worksheet/load-worksheet-view.test.ts`
- `test/research/surface-pack.test.ts` (note: line ~36 `expect(r.cards).toEqual([...])` — add the fields to the **expected** object too, both `null`)
- `test/queue/research-jobs.test.ts` (several literals)
- `test/transparency/surface-pack.test.ts` (line ~9 defines a LOCAL `cards: {...}[]` DTO — only add fields if `tsc` flags it; do not touch its local type unless required)
- `test/db/research-packs.test.ts` (the `makePack`/`VALID_CARD` helper card at line ~55, plus `overCapCard`/`underCapCard` at ~402/~430)
- `test/workers/research-pack-read.test.ts` (line ~23 input AND line ~38 `toEqual` expected — both get the fields)

Rule for the value: use `null, null` for any card whose surrounding context is irrelevant to what the test asserts. Do NOT invent context strings. For exact-match (`toEqual`) assertions, the input card and the expected object MUST carry identical context values (both `null`).

Files that import the `EvidenceCard` **type** but construct no literal (e.g. `test/research/pipeline.test.ts`, `test/research/verify-proposal.test.ts` — these assert pipeline/verify *results* via partial `toMatchObject`) need no literal edit; if `tsc` is silent on them, leave them. Trust `tsc`, not this list, for the exact set.

- [ ] **Step 6: Run the full suite + typecheck to verify green**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: clean + all green. `tsc` confirms `verifyProposal` is the only `src/` constructor (per grep, no other exists); the suite confirms the round-trip expects were updated. Note: `verifyProposal` normalizes the page twice now (once in `evaluateQuote`, once in `sliceQuoteContext`) — accepted, both linear and `MAX_PAGE_CHARS`-bounded; do not refactor `evaluateQuote`'s signature to dedupe (out of scope).

- [ ] **Step 7: Lint + commit**

```bash
pnpm lint
git add src/research/provider.ts src/research/verify-proposal.ts test/
git commit -m "feat(research): capture quote context on verified evidence cards

EvidenceCard gains contextBefore/contextAfter (string | null); verifyProposal
populates them via sliceQuoteContext from the same fetched page. Source text,
not model prose — the G1 no-prose-slot invariant is preserved.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VeYFUyHxVC7xhu8Wf6sFs"
```

BEFORE marking this task complete:
1. Review tests against docs/pitfalls/testing-pitfalls.md
2. Confirm the **entire** suite (`pnpm test`) and `pnpm exec tsc --noEmit` are green — not just `test/research/`. The required-field change is suite-wide.
3. Confirm no `EvidenceCard` literal anywhere in `src/` or `test/` is left without the two new fields (re-run `pnpm exec tsc --noEmit`; zero errors).
4. Confirm you ran `git status` before `git add test/` (don't stage stray files).

---

## Phase 3 — View projection (`view-types.ts`, `evidence-card.ts`)

**Execution Status:** ✅ SHIPPED — 2026-06-21. Full suite 920/920 green; tsc + lint clean. `toEvidenceCardView` projects the two sides explicitly; `load-worksheet-view` closed-shape assertion updated to the 5-key set (the Phase-2-noted follow-through).

### Task 3: Project context into the view model

**Files:**
- Modify: `src/worksheet/view-types.ts` (`EvidenceCardView`, ~line 20)
- Modify: `src/worksheet/evidence-card.ts` (`toEvidenceCardView`)
- Modify: `test/worksheet/evidence-card.test.ts`

**Interfaces:**
- Consumes: the `EvidenceCard` shape from Task 2.
- Produces: `EvidenceCardView` additionally carries `contextBefore: string | null` and `contextAfter: string | null`; `toEvidenceCardView` projects them **explicitly** (never `{ ...card }`).

> **Same-file sequencing:** Task 2 Step 5 already added `contextBefore: null, contextAfter: null` to the existing card literal in `test/worksheet/evidence-card.test.ts` (~line 9) to keep `tsc` green. This task ADDS new `it` blocks to that same file — append them; do not revert Task 2's literal edit.

BEFORE starting work:
1. Invoke superpowers:test-driven-development
2. Read docs/pitfalls/testing-pitfalls.md
Follow TDD: write failing test → implement → verify green.

- [ ] **Step 1: Write the failing test** (add to `test/worksheet/evidence-card.test.ts`)

```typescript
  it("projects contextBefore/contextAfter and nothing else", () => {
    const view = toEvidenceCardView({
      url: "https://navy.mil/x",
      verbatimQuote: "concluded testing in 2025",
      advisorySupport: true,
      contextBefore: "The program ",
      contextAfter: " after delays.",
    });
    expect(view).toEqual({
      url: "https://navy.mil/x",
      verbatimQuote: "concluded testing in 2025",
      advisorySupport: true,
      contextBefore: "The program ",
      contextAfter: " after delays.",
    });
  });

  it("carries null context sides through unchanged", () => {
    const view = toEvidenceCardView({
      url: "https://navy.mil/x",
      verbatimQuote: "Program X concluded testing",
      advisorySupport: false,
      contextBefore: null,
      contextAfter: " in 2025.",
    });
    expect(view.contextBefore).toBeNull();
    expect(view.contextAfter).toBe(" in 2025.");
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test test/worksheet/evidence-card.test.ts`
Expected: FAIL — `toMatchObject`/`toEqual` mismatch (fields absent) and/or `tsc` flags the unknown literal fields.

- [ ] **Step 3: Add the fields to `EvidenceCardView`**

In `src/worksheet/view-types.ts`, inside `EvidenceCardView`, after `advisorySupport: boolean;`:

```typescript
  /** Deterministic source text before the quote in its paragraph; null at paragraph start (design 2026-06-21). */
  contextBefore: string | null;
  /** Deterministic source text after the quote in its paragraph; null at paragraph end (design 2026-06-21). */
  contextAfter: string | null;
```

- [ ] **Step 4: Project them explicitly in `toEvidenceCardView`**

In `src/worksheet/evidence-card.ts`, extend the explicit projection:

```typescript
  return {
    url: card.url,
    verbatimQuote: card.verbatimQuote,
    advisorySupport: card.advisorySupport,
    contextBefore: card.contextBefore,
    contextAfter: card.contextAfter,
  };
```

- [ ] **Step 5: Run worksheet suite to verify green (incl. `load-worksheet-view`)**

Run: `pnpm test test/worksheet/`
Expected: PASS. If `test/worksheet/load-worksheet-view.test.ts` asserts an exact card shape, update those expected objects to include the two fields (use the real values produced upstream, or `null`).

- [ ] **Step 6: Typecheck, lint, commit**

```bash
pnpm exec tsc --noEmit && pnpm lint
git add src/worksheet/view-types.ts src/worksheet/evidence-card.ts test/worksheet/evidence-card.test.ts
git commit -m "feat(worksheet): project quote context into the evidence-card view

EvidenceCardView gains contextBefore/contextAfter; toEvidenceCardView projects
them explicitly (no spread), preserving the no-extra-field-leak property.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VeYFUyHxVC7xhu8Wf6sFs"
```

BEFORE marking this task complete:
1. Review tests against docs/pitfalls/testing-pitfalls.md
2. Confirm `pnpm test test/worksheet/` + `pnpm exec tsc --noEmit` green.
3. Confirm the projection is explicit (no `{ ...card }`).

---

## Phase 4 — Read-path validation (`research-packs.ts`)

**Execution Status:** ✅ SHIPPED — 2026-06-21. `parseRow` rejects an over-cap context side in the same per-card loop as the verbatimQuote check. Node suite + `test:workers` (27 tests, credential-free pool boot) green; tsc + lint clean.

### Task 4: Re-validate the context cap at the pack read path (defense in depth)

**Files:**
- Modify: `src/db/research-packs.ts` (`parseRow`, the existing per-card validation loop)
- Modify: `test/db/research-packs.test.ts`

**Interfaces:**
- Consumes: `CONTEXT_SIDE_CAP` from `src/research/quote-context.ts` (Task 1); the `EvidenceCard` fields from Task 2.
- Produces: `parseRow` (private; exercised via the public `getPack`) returns `null` → `getPack` surfaces `state: "pack_unreadable"` when a present context side is not a string or exceeds `CONTEXT_SIDE_CAP` code points — mirroring the existing over-long-`verbatimQuote` rejection. A `null` side is valid; an absent (`undefined`) side is tolerated (no persisted rows predate this code; pure defense in depth, not legacy handling).

> **`parseRow` is NOT exported.** The existing read-validation tests (`describe("getPack — read-time verbatim quote length validation")`, ~line 394) go through the public `getPack` API: they build a pack with `makePack(...)`, **directly `INSERT`** the row (bypassing the module's write-time validation), then assert `getPack(...).state === "pack_unreadable"`. Mirror that exact pattern — do NOT import or call `parseRow`.

BEFORE starting work:
1. Invoke superpowers:test-driven-development
2. Read docs/pitfalls/testing-pitfalls.md
Follow TDD: write failing test → implement → verify green.

- [ ] **Step 1: Write the failing tests** (add a new `it` to the existing `describe("getPack — read-time verbatim quote length validation")` block in `test/db/research-packs.test.ts`, reusing its `makePack`/`article`/`freshTestExecutor` helpers and the `console.error` spy)

```typescript
  it("returns pack_unreadable when a card's contextBefore exceeds CONTEXT_SIDE_CAP code points", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));

    const overCap = "x".repeat(CONTEXT_SIDE_CAP + 1);
    const overCapCard: EvidenceCard = {
      url: "https://example.com", verbatimQuote: "The fleet reached full strength by 2017.",
      advisorySupport: false, contextBefore: overCap, contextAfter: null,
    };
    const pack = makePack({ claimKey: "over-cap-context-key", cards: [overCapCard], status: "proposals_present" });

    await exec
      .prepare(
        "INSERT INTO research_packs (claim_key, source_revision_id, page_id, section_heading, sentence_text, year, provider_name, model_version, status, queries_json, cards_json, dispositions_json, evaluated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        pack.claimKey, pack.sourceRevisionId, pack.pageId, pack.sectionHeading,
        pack.sentenceText, pack.year, pack.providerName, pack.modelVersion,
        pack.status, JSON.stringify(pack.queries), JSON.stringify(pack.cards),
        JSON.stringify(pack.dispositions), pack.evaluatedAt
      )
      .run();

    const result = await getPack(exec, pack.claimKey, pack.sourceRevisionId);
    expect(result.state).toBe("pack_unreadable");
    spy.mockRestore();
  });

  it("reads back a card with null context and an in-cap contextAfter", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, article(1));

    const card: EvidenceCard = {
      url: "https://example.com", verbatimQuote: "The fleet reached full strength by 2017.",
      advisorySupport: true, contextBefore: null, contextAfter: " after a refit.",
    };
    const pack = makePack({ claimKey: "ok-context-key", cards: [card], status: "proposals_present" });
    await insertPackIfAbsent(exec, pack);

    const result = await getPack(exec, "ok-context-key", 100);
    expect(result.state).toBe("found");
    if (result.state === "found") {
      expect(result.pack.cards[0].contextBefore).toBeNull();
      expect(result.pack.cards[0].contextAfter).toBe(" after a refit.");
    }
  });
```

> Import `CONTEXT_SIDE_CAP` from `../../src/research/quote-context` at the top of the test file. `EvidenceCard`, `getPack`, `insertPackIfAbsent`, `makePack`, `article`, `freshTestExecutor`, `upsertArticle` are already imported/defined in this file (Task 2 added the context fields to its existing card literals). The `source_revision_id` used by `makePack` defaults to `100` in this file — match it in `getPack`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test test/db/research-packs.test.ts`
Expected: FAIL — the over-cap row currently surfaces `found`, not `pack_unreadable`.

- [ ] **Step 3: Extend the per-card validation loop in `parseRow`**

In `src/db/research-packs.ts`: add the import

```typescript
import { MIN_QUOTE_LEN, MAX_QUOTE_LEN } from "../research/verbatim-check";
import { CONTEXT_SIDE_CAP } from "../research/quote-context";
```

and inside the existing `for (const card of cards as EvidenceCard[]) { … }` loop, after the existing `verbatimQuote` range check, add:

```typescript
    // Read-time cap re-validation for context sides (defense in depth; mirrors the verbatimQuote check).
    for (const side of [card.contextBefore, card.contextAfter]) {
      if (side === null || side === undefined) continue;
      if (typeof side !== "string" || [...side].length > CONTEXT_SIDE_CAP) return null;
    }
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test test/db/research-packs.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the workers read test too (the other read path), typecheck, lint**

Run: `pnpm test test/db/research-packs.test.ts test/workers/research-pack-read.test.ts && pnpm exec tsc --noEmit && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/db/research-packs.ts test/db/research-packs.test.ts
git commit -m "feat(db): read-path cap re-validation for evidence-card context

parseRow rejects a row whose contextBefore/contextAfter exceeds CONTEXT_SIDE_CAP,
mirroring the existing over-long-verbatimQuote defense. Null sides are valid.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VeYFUyHxVC7xhu8Wf6sFs"
```

BEFORE marking this task complete:
1. Review tests against docs/pitfalls/testing-pitfalls.md
2. Confirm both read-path suites are green.
3. Confirm the new check sits in the SAME loop as the `verbatimQuote` check (no duplicate iteration).

---

## Phase 5 — Render (`EvidenceCard.tsx`)

**Execution Status:** ⬜ NOT STARTED

### Task 5: Render `before` + emphasized quote + `after`

**Files:**
- Modify: `src/app/worksheet/components/EvidenceCard.tsx`

**Interfaces:**
- Consumes: `EvidenceCardView.contextBefore` / `.contextAfter` (Task 3).
- Produces: no exported API change — presentational only.

**TDD exception (honest scope note):** the repo has **zero** `.tsx`/component test harness (verified: `find test -iname '*.tsx'` → 0). Per CLAUDE.md the component is production code, but there is no component-test runner to write a failing test against, and this task is logic-free presentational glue (truthiness checks + spans). Verification is therefore `tsc` + `lint` + a visual check via the `browse` skill. Do NOT stand up a new RTL/jsdom harness for this one component — that is out of scope; flag it to Sam if you believe a harness is warranted.

- [ ] **Step 1: Edit the blockquote to render context around the emphasized quote**

Replace the existing `<blockquote>…</blockquote>` in `EvidenceCard.tsx` with:

```tsx
      <blockquote className="font-serif text-[0.95rem] leading-relaxed text-body-gray">
        {card.contextBefore && (
          <span className="not-italic text-dust-gray">{card.contextBefore}</span>
        )}
        <strong className="font-medium italic text-body-gray">“{card.verbatimQuote}”</strong>
        {card.contextAfter && (
          <span className="not-italic text-dust-gray">{card.contextAfter}</span>
        )}
      </blockquote>
```

Notes for the implementer:
- The verified quote stays italic + the focal weight/colour; the flanking context is de-emphasized (`text-dust-gray`, upright). This is the G16 visual posture.
- Keep it a **server component** — no `"use client"`, no `useState`. The full stored window renders (see the plan's Deviations note); there is no "show more" toggle in v1.
- No `dangerouslySetInnerHTML`; `before`/`after` are plain strings in `<span>`s — the "cannot surface model-authored prose" property is preserved.
- Leave the URL + advisory-support row exactly as-is.

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: clean.

- [ ] **Step 3: Visual verification**

Use the `browse` skill (or the project's `qa`/`impeccable` flow) to render a worksheet with at least one evidence card and confirm: context reads in lighter grey, the quoted span is visually dominant, a paragraph-edge quote (null side) renders with no leading/trailing stray space, and there is no copy button on the card. If a running app isn't available in this environment, state that explicitly and leave the visual check for Sam rather than claiming it passed.

- [ ] **Step 4: Commit**

```bash
git add src/app/worksheet/components/EvidenceCard.tsx
git commit -m "feat(worksheet): render quote in its source context on the evidence card

Flanking source text renders de-emphasized around the emphasized verbatim quote
(disambiguation); server component, no copy affordance (G16). Full stored window,
no client show-more toggle in v1 (see plan Deviations).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VeYFUyHxVC7xhu8Wf6sFs"
```

BEFORE marking this task complete:
1. `pnpm exec tsc --noEmit && pnpm lint` green.
2. Visual check done (or its absence explicitly reported).
3. Confirm no `"use client"` / copy button was added.

---

## After completing all phases

Review the batch from multiple perspectives. Minimum 3 review rounds:
1. **Compliance round:** re-read the design's §5 mapping. Is context provably source-only (G1)? Gate untouched (G5)? No card copy affordance + bounded window (G16)? Citation path untouched (G2)?
2. **Edge round:** paragraph-start, paragraph-end, whole-block, over-cap truncation, multi-byte code points, block-boundary isolation — each has a passing test.
3. **Integration round:** the two fields flow capture → pack JSON → read-validate → view → render with no field dropped; `pnpm test` (full) and `pnpm exec tsc --noEmit` and `pnpm lint` all green.
If round 3 still finds issues, keep going until clean.

Then run `pnpm test` (entire suite) once more and confirm pristine output before opening/refreshing the PR.

---

## Self-Review (author, fresh eyes)

**Spec coverage** (design → task):
- §3.1 structural before/[quote]/after → Tasks 2/3/5 (fields + render).
- §3.2 capture at verifyProposal → Task 2.
- §3.3 normalized slice, block bound, word snap, nullable edges, `CONTEXT_SIDE_CAP` → Task 1.
- §3.4 storage + read-path validation → fields serialize via existing `cards_json` (no migration); Task 4 read cap check.
- §3.5 render + G16 copy posture → Task 5 (de-emphasis, no copy affordance).
- §3.6 multi-span → falls out of per-card fields (no dedicated task; noted).
- §6 tests → Tasks 1 (slice edge cases + reconstructable-window invariant + SAFE-1 perf + first-occurrence + empty-quote), 3 (projection), 4 (read cap via `getPack`).
- §7 out-of-scope (multi-block expansion, gate/citation changes, render-time refetch) → honored; Phase 5 Deviations notes the show-more drop.

**Placeholder scan:** none — every code step shows complete code; the Task 4 test mirrors the existing `getPack` validation block verbatim in shape.

**Type consistency:** `contextBefore`/`contextAfter: string | null` identical across `EvidenceCard` (Task 2), `EvidenceCardView` (Task 3), the projection (Task 3), and the read check (Task 4); `CONTEXT_SIDE_CAP` defined in Task 1, imported by Task 4 (source) and the Task 4 test; `MAX_PAGE_CHARS` exported in Task 1, imported by the helper. `sliceQuoteContext(pageText, quote)` signature consistent between Task 1 (def) and Task 2 (call).

---

## Plan Review Cycle Log

Per `/plan-review-cycle` (min 3 rounds; continue until a round is clean).

**Round 1 — 5 substantive findings (all fixed inline):**
1. **Task 4 used a private `parseRow` export** that does not exist — rewrote the test to go through the public `getPack` API with the direct-`INSERT` bypass pattern, asserting `pack_unreadable` (mirrors the existing read-validation block at ~line 394).
2. **Task 2 cross-file break omitted** — making the fields required breaks 18 `EvidenceCard` literals across 10 test files (incl. exact `toEqual` round-trips). Added Step 5 enumerating them with `tsc`/suite as the worklist.
3. **SAFE-1 not addressed** — the slice helper scans untrusted text. Added the linear-time note, `MAX_PAGE_CHARS` cap parity (export + reuse), and a pathological-input perf test.
4. **Multi-occurrence quote behavior undefined** — pinned to first-occurrence (matches `evaluateQuote`'s `includes`) with a doc note and a test.
5. **Empty-quote guard untested** — added a test for the `q.length === 0` path.

**Round 2 — 3 findings (all fixed inline):**
1. **Task 2 enumeration overreached** — `pipeline.test.ts` / `verify-proposal.test.ts` import the `EvidenceCard` *type* but build no literal (they assert results via partial `toMatchObject`); removed them from the literal-fix list and reaffirmed `tsc` as the authoritative worklist.
2. **`performance.now()` vs determinism traps** — confirmed `armDeterminismTraps` traps only `fetch`/`Date.now`/`Math.random`, so the SAFE-1 perf test is safe; added an inline note so an executor doesn't delete it expecting a trap.
3. **Task 3 / Task 2 same-file edit (`evidence-card.test.ts`)** — added an explicit sequencing note so Task 3 appends rather than reverting Task 2's literal edit.

**Round 3 — 0 substantive findings.** Re-read end-to-end across all six dimensions (ambiguity, context gaps, interpretation latitude, cross-task deps, testing pitfalls, implementation pitfalls). Verified: helper test expectations match the implementation byte-for-byte (mid-paragraph, edges, cap+snap, first-occurrence, emoji code-point); `makePack` default `sourceRevisionId: 100` matches the Task 4 `getPack` calls; `insertPackIfAbsent`/`article`/`upsertArticle`/`freshTestExecutor` all already imported in the Task 4 test file; Tailwind tokens (`text-dust-gray`, `text-body-gray`) exist in the current component. Clean — review complete.
