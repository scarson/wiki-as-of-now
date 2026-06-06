# Research Engine Verify-Pipeline (Slice A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic claim→verified-evidence-cards research pipeline — a (swappable, here faked) provider proposes candidate sources, the tool independently fetches each and runs a deterministic verbatim-quote check, persisting only verified per-claim evidence cards — plus minimal CI to enforce the gates.

**Architecture:** Provider proposes / pipeline verifies; the verify step lives outside the swappable provider so it always runs. Pure deterministic core (normalize → verbatim-check → source-fetch → verify-proposal → researchClaim), persistence keyed `(claim_key, source_revision_id)`, a total/contained queue consumer. No live LLM, no live network in tests.

**Tech Stack:** TypeScript (ES2024, strict), Next.js 16 / OpenNext (Cloudflare Workers + D1), better-sqlite3 (local/test) behind the async `SqlExecutor` port, vitest (Node), `htmlparser2` (HTML→text), `fast-check` (property tests), Node 24 / pnpm 11.5.1.

**Authoritative spec:** [docs/design/2026-06-06-research-engine-design.md](../design/2026-06-06-research-engine-design.md) (six sections, hardened over per-section 3-round adversarial review; §8 reasoning trail, §9 residuals, §10 decisions). **Compliance contract:** [docs/policy/wikipedia-genai-compliance.md](../policy/wikipedia-genai-compliance.md) — G8/G9/G12/G13/G14/G15/G16. Read the spec section named in each phase before starting it.

---

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

**Overall:** 🚧 In progress (claimed 2026-06-06T18:05:00Z). 7/10 phases shipped (0–6); Phase 7 in progress. Branch `claude/research-engine-impl-yG6Os` (off merged `dev` `bd9995c`).

> **Deviation (branch name):** executing on the harness-designated branch
> `claude/research-engine-impl-yG6Os` (reset onto `origin/dev` `bd9995c`), not the
> plan-original `feat/research-engine`. Same base (the PR #16 merge); only the branch
> label differs. PR target remains `dev`.

| Phase | Status | Ship SHA(s) | Notes |
|---|---|---|---|
| 0 — Tooling + test harness (deps, determinism traps, pristine, CI) | ✅ Shipped | `6e30a77`, `49a1395`, `0c5660a` | deps+harness+CI; CI runs on the PR (pull_request event) — feature-branch pushes don't trigger by design |
| 1 — `normalize.ts` + NFC golden fixture | ✅ Shipped | `ed77d51`, `45f9d19`, `96a46c5` | normalize + workerd↔Node golden (14 cases, gen on workerd); fresh review caught identity-only NFC test → strengthened (`96a46c5`) |
| 2 — `canonicalize-url.ts` (SSRF host classification) | ✅ Shipped | `e375155`, `0644f05`, `045b046` | bipolar corpus (32 cases); trailing-dot bypass fixed; refactored to `ipaddr.js` (Sam's call) — −59 LOC hand-rolled math, NAT64 closed; full adversarial battery verified |
| 3 — `verbatim-check.ts` | ✅ Shipped | `7b324263`, `3b79589` | opus review found `\n`-only cross-block gap → normalize hardened to vertical/horizontal split (covers text/plain); forgery closed for LF/VT/FF/CR/NEL/LS/PS |
| 4 — `source-fetch.ts` (SSRF + stream cap + extraction) | ✅ Shipped | `e2d8822`(corpora), `9a63077`, `d21e47e`, `0955b95`, `1f4670c` | opus review caught 2 cross-block-forgery BLOCKERs (`<br>`, then form-widget/replaced tags in INLINE_TAGS) + charset false-drop; all fixed |
| 5 — `provider.ts` reshape + fake providers | ✅ Shipped | `03f1242` | ProposedEvidence/EvidenceCard/ProviderResearch/ProviderUnavailableError; adversarial fakes for Phase 8; research-jobs types-only touch; old ResearchResult gone |
| 6 — `verify-proposal.ts` | ✅ Shipped | `d3ef01f` | fetch+verify seam; card stores RAW quote (asserted via nbsp page); all 10 fetch reasons → typed drops |
| 7 — `research-packs.ts` + migration 0003 | 🚧 In progress | — | Phase-2 migration discipline |
| 6 — `verify-proposal.ts` | ⬜ Not started | — | the standalone compliance seam |
| 7 — `research-packs.ts` + migration 0003 | ⬜ Not started | — | Phase-2 migration discipline |
| 8 — `pipeline.ts` `researchClaim` | ⬜ Not started | — | cap ordering + partition |
| 9 — `research-jobs.ts` rewrite (consumer) | ⬜ Not started | — | total/contained; audit allowlist+sentinel |

### Deviations
- Phase 8 determinism test: corrected spec §6 N4's "shuffled proposal order → order-stable" to **repeatability** (same input → deep-equal output). Shuffle-invariance is wrong because `slice(0, maxProposals)` truncation is order-dependent by design.
- Branch name: executing on harness-designated `claude/research-engine-impl-yG6Os` (reset onto `origin/dev` `bd9995c`), not the plan-original `feat/research-engine` — same base, different label; PR target still `dev`.
- Phase 2 (post-ship, Sam's call): SSRF IP-classification core refactored to use the `ipaddr.js` library instead of hand-rolled CIDR/IPv6 math — shrinks the audited security surface and gives robust IPv6/IPv4-mapped handling. Architecture unchanged (parse-then-classify the hostname string; same DNS-rebinding residual). The 30-case bipolar corpus is the behavior-preserving regression gate. NAT64 `64:ff9b::/96` (`rfc6052`) is now CLOSED for free (ipaddr.js classifies it); IPv4-compatible `::/96` remains a documented residual. Adds the `ipaddr.js` dependency (deviation from the spec's named-deps list, approved by Sam).
- Phase 1.2: added `scripts/wrangler-nfc-worker.json` — a minimal `nodejs_compat` dev config so `wrangler unstable_dev` doesn't fail on the production `wrangler.jsonc`'s `.open-next/assets` reference (absent in dev). Added `allowImportingTsExtensions: true` to `tsconfig.json` so the Node-run `gen-nfc-golden.ts` can use explicit `.ts` import extensions; safe because tsc runs `--noEmit` and the build bundles via Next/esbuild (no tsc emit).

### Discoveries
- Out-of-slice: `test/ingest/easy-win-lane.test.ts:114` audit assertion uses the denylist pattern that §6 of the spec condemns (N3). Upgrade to allowlist+sentinel when convenient; flagged, not fixed here.
- Phase 3 opus review (cross-block-forgery hardening; Sam delegated the call): the verbatim cross-block guard was `\n`-only, but `normalizeForVerbatim` folded VT/FF to a *space* (bridging) and preserved CR/U+2028/U+2029 (also bridging). **Decisive reason it must live in `normalize.ts` not the extractor:** the content-type allowlist includes `text/plain`, for which NO HTML extractor runs — `normalize` is the only boundary layer both content types share. Fix: replace §3's fold-set with a **vertical/horizontal split** — vertical whitespace {LF, VT U+000B, FF U+000C, CR U+000D, NEL U+0085, LS U+2028, PS U+2029} → `\n` (block boundary); horizontal whitespace {tab + Unicode Zs} → one space; zero-width → strip. Closes the bridge both ways; `claim_key` path unaffected (separate identity-NFC, §4); recall cost negligible + in the safe false-drop direction. Requires spec §3 amendment + golden regeneration (added vertical-separator corpus cases) + verbatim boundary tests.
- Phase 2 SSRF residuals (added to spec §9 + documented in `src/research/canonicalize-url.ts`): deprecated IPv4-compatible IPv6 `::/96` (e.g. `[::7f00:1]`) and the NAT64 well-known prefix `64:ff9b::/96` embed an IPv4 address but are NOT enumerated in the host classifier — modern stacks don't route IPv4-compatible addrs to the embedded v4, and NAT64 reachability is gateway-dependent. Same residual bucket as the spec's DNS-rebinding residual.

---

## Per-Task Protocol (MANDATORY — applies to EVERY task)

**BEFORE starting work:**
1. Invoke `superpowers:test-driven-development`.
2. Read `docs/pitfalls/testing-pitfalls.md` (§1 pristine output, §3 error-path coverage, §4 negative-property testing, §5 concurrency/TOCTOU, §8 SQLite↔D1 parity / `freshTestExecutor`, §9 gold-set honesty) and the relevant `docs/pitfalls/implementation-pitfalls.md` entries (DB-1 `WITHOUT ROWID`/NULL, DB-2 `bind()`, SAFE-1 linear-time untrusted scan).
3. Read the spec section named in the phase banner.
4. **Environment:** Node 24 is pinned (`.nvmrc`). After any dependency re-sync (the session-start hook does one; `pnpm install` does one), run `pnpm rebuild better-sqlite3` or every DB-backed test fails with a native-module ABI error.

Follow TDD: write the failing test → run it, confirm it fails for the RIGHT reason → minimal implementation → confirm green → refactor green → commit → **push**.

**BEFORE marking a task complete:**
1. Review the new tests against `docs/pitfalls/testing-pitfalls.md` (error paths? edge cases? negatives? pristine output?).
2. Run the full gate trio and confirm all green + output PRISTINE: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`.
3. Commit with a descriptive message and **push** (the container is ephemeral; unpushed commits are lost). Use `git status` before `git add`; never `git add -A`.

**Assertion rigor (compliance floor — non-negotiable):** this pipeline is the BLP-safety backstop's research consumer. If a test races/flakes, the fix is **deterministic synchronization or deterministic inputs** (injected `now`, stubbed `fetchSource`/`fetchImpl`, fixed fixtures) — NEVER assertion removal or weakening. If an assertion cannot pass deterministically, STOP and raise to the dispatching agent. A weakened test on this path is a compliance regression. Commit subjects touching assertions state what happened to them ("add"/"strengthen"/"preserve" — never obscure a weakening as a "CI/timing fix"). Prefer mechanism assertions (e.g., "the card is dropped with reason X", "no unhandled rejection observed") over symptom assertions where feasible.

**Per-phase review (MANDATORY):** after the last task in a phase, run **≥3 review rounds** (read the code/tests; check spec compliance + the named pitfalls + assertion rigor). If round 3 still finds substantive issues, keep going until clean. The compliance-critical phases (1, 3, 4, 8, 9) SHOULD get one round from a fresh reviewer (opus for 3, 4, 9).

**Do NOT (scope boundaries — spec §9 / non-goals):** add the real Gemini provider (faked here); add the snippet assembler, the worksheet UI, or copy-native-wikitext; add per-user quotas/auth; add the async batch-queue transport beyond the single-message `handleResearchMessage`; add caching/retries beyond what's specified; add pagination or pack compaction; add a deploy pipeline. Do NOT trust a persisted pack to authorize surfacing (re-fetch + re-check is authoritative; surfacing is a later slice). Do NOT add an LLM anywhere in this slice. Do NOT weaken the verbatim check's normalization (the strip set is zero-width-only; map-to-space is explicitly rejected — spec §3 / decision D6).

---

## Phase 0 — Tooling + test harness (deps, determinism traps, pristine enforcement, CI)

**Execution Status:** ✅ SHIPPED 2026-06-06 — `6e30a77` (deps: htmlparser2 + fast-check), `49a1395` (determinism traps + pristine), `0c5660a` (CI). Gate trio green (225 tests, tsc + lint clean). Throwaway trap-smoke test confirmed `armDeterminismTraps` throws on ambient fetch/Date.now/Math.random and restores after (then deleted). CI workflow triggers on `pull_request` + pushes to `dev`/`main`, so it executes when the PR to `dev` opens (no feature-branch-push run by design) — verify green at PR time.

Implements the spec's enforced test controls (§6 N4, suite-wide pristine) + CI (§6.1). Foundational: later phases depend on the test helpers; CI guards every subsequent push. No production `src/` logic here (TDD's failing-test-first applies from Phase 1 on; Phase 0 is config/harness, exempt per CLAUDE.md TDD scope).

### Task 0.1: Add dependencies

**Files:** Modify `package.json`, `pnpm-lock.yaml`.

- [ ] **Step 1:** `pnpm add htmlparser2` (runtime dep — HTML→text extraction, portable Node+Workers per spec D3).
- [ ] **Step 2:** `pnpm add -D fast-check` (dev dep — property-based tests for pure functions, spec §6 / D10).
- [ ] **Step 3:** `pnpm rebuild better-sqlite3` (the install re-synced deps → native ABI mismatch otherwise).
- [ ] **Step 4: Verify** `pnpm test` (existing suite green), `pnpm exec tsc --noEmit`, `pnpm lint` all clean.
- [ ] **Step 5: Commit + push.** `git add package.json pnpm-lock.yaml && git commit -m "chore(deps): add htmlparser2 (HTML→text) + fast-check (property tests)"`

### Task 0.2: Test harness — determinism traps + pristine enforcement

**Files:**
- Create: `test/helpers/determinism.ts`
- Create: `test/setup/pristine.ts`
- Modify: `vitest.config.ts` (add `setupFiles`)

Determinism traps are applied **per-suite** in the pure-function research tests (NOT globally — a global clock trap could break existing `src` code-under-test that legitimately reads the clock when `now` isn't injected). Pristine enforcement is global (a project-wide §1 invariant).

- [ ] **Step 1:** Create `test/helpers/determinism.ts`:

```ts
// ABOUTME: Test helper — arms traps so pure/deterministic code that reaches past its injected
// ABOUTME: seams (ambient fetch/clock/RNG) fails loudly instead of silently eroding determinism.
import { afterEach, beforeEach } from "vitest";

/** Call inside a describe() whose subject MUST be deterministic + network-free. Restores in afterEach. */
export function armDeterminismTraps(): void {
  // We trap fetch / Date.now / Math.random (network + non-determinism sources). We deliberately do NOT trap
  // crypto.subtle — claim_key hashing uses SHA-256, deterministic given input and legitimate. We also do NOT
  // trap crypto.randomUUID: it's read-only on some runtimes (reassigning throws) and the pure functions don't
  // use it (if a pure function ever needs randomness, catch that design smell in review, not via a trap).
  const saved: Record<string, unknown> = {};
  beforeEach(() => {
    saved.fetch = globalThis.fetch;
    saved.now = Date.now;
    saved.random = Math.random;
    globalThis.fetch = (() => { throw new Error("ambient fetch in a deterministic test — inject the dependency"); }) as typeof fetch;
    Date.now = () => { throw new Error("ambient Date.now in a deterministic test — inject `now`"); };
    Math.random = () => { throw new Error("ambient Math.random in a deterministic test"); };
  });
  afterEach(() => {
    globalThis.fetch = saved.fetch as typeof fetch;
    Date.now = saved.now as typeof Date.now;
    Math.random = saved.random as typeof Math.random;
  });
}
```

- [ ] **Step 2:** Create `test/setup/pristine.ts` — fail any test that logs an unexpected `console.error`/`console.warn` (testing-pitfalls §1), with an opt-in allowlist for error-path tests:

```ts
// ABOUTME: Global vitest setup — enforces pristine test output (no stray console.error/warn).
// ABOUTME: Error-path tests opt out per-case via allowConsole(); see testing-pitfalls §1.
import { afterEach, beforeEach, vi } from "vitest";

let allowed = false;
/** Call at the top of a test that legitimately logs (asserting on the captured output). */
export function allowConsole(): void { allowed = true; }

let errSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  allowed = false;
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  const calls = errSpy.mock.calls.length + warnSpy.mock.calls.length;
  errSpy.mockRestore();
  warnSpy.mockRestore();
  if (!allowed && calls > 0) throw new Error(`Non-pristine test output: ${calls} console.error/warn call(s). Capture+assert the error, or allowConsole().`);
});
```

- [ ] **Step 3:** Wire `setupFiles: ["./test/setup/pristine.ts"]` into `vitest.config.ts`'s `test` block.
- [ ] **Step 4: Run** `pnpm test`. Expected: all existing tests still green. If any existing test now fails on pristine, that is a REAL §1 violation — fix it (capture+assert the log) or add `allowConsole()` to that test with a comment why. Do NOT disable the setup.
- [ ] **Step 5:** `pnpm exec tsc --noEmit` + `pnpm lint` clean.
- [ ] **Step 6: Commit + push.** `git commit -m "test(harness): determinism traps + suite-wide pristine-output enforcement"`

### Task 0.3: CI workflow

**Files:** Create `.github/workflows/ci.yml`.

Implements spec §6.1. Minimal: install + rebuild native + the gate trio on PRs and pushes. (The NFC parity test runs inside `pnpm test` once Phase 1 lands; CI needs no workerd runtime.)

- [ ] **Step 1:** Create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [dev, main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: ".nvmrc"
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm rebuild better-sqlite3
      - run: pnpm exec tsc --noEmit
      - run: pnpm lint
      - run: pnpm test
```

- [ ] **Step 2: Verify** the YAML is well-formed (`pnpm exec tsc --noEmit` + `pnpm lint` unaffected; the workflow runs on push once pushed).
- [ ] **Step 3: Commit + push.** `git commit -m "ci: run trio (tsc + lint + test) on PRs and pushes"` Then confirm the workflow appears and goes green on the branch push (check via the GitHub MCP `actions_list`/`pull_request_read get_check_runs`).

**After Phase 0:** ≥3 review rounds — the traps actually throw on ambient access (write a throwaway test that calls `fetch` under `armDeterminismTraps` and confirm it fails, then delete it); pristine setup doesn't break existing tests; CI is green.

---

## Phase 1 — `normalize.ts` + NFC golden fixture

**Execution Status:** ✅ SHIPPED 2026-06-06 — `ed77d51` (normalize), `45f9d19` (workerd↔Node NFC golden: 14-case corpus, gen on workerd via `unstable_dev`, parity test green). Orchestrator verified: strip set = exactly the 6 zero-width chars (escapes), fold set includes U+0020 + full Zs + NEL/VT/FF/tab (escapes, `\n` preserved), order NFC→strip→fold→collapse-`\n`→trim, idempotent; golden has 10/14 input≠output (NFC composition + strip + fold genuinely exercised), corpus data escape-only. Review rounds: spec-compliance (orchestrator) → provenance/integrity (orchestrator) → fresh reviewer → remediation. Fresh reviewer caught a BLOCKER (the unit NFC case used a precomposed `é`, testing identity not composition) + missing non-ASCII fold coverage + literal invisibles + missing ABOUTME; all remediated in `96a46c5` (real `é`→`é` composition, VT/FF/NEL + Zs fold cases, NFC-not-NFKC guard, escape-only string literals). Production `normalize.ts` was correct throughout. ≥3 rounds, last round clean.

Implements spec §3 (shared normalization) + §6 N1 (workerd NFC golden fixture). The shared contract imported by the extractor (Phase 4) and the verbatim check (Phase 3) — drive it into existence by its OWN test first; it is internal logic, never faked.

### Task 1.1: `normalizeForVerbatim` — the shared normalization

**Files:**
- Create: `src/research/normalize.ts`
- Test: `test/research/normalize.test.ts`

- [ ] **Step 1: Write failing tests.** Cover the fixed order (NFC → strip zero-width → fold visible-whitespace-but-preserve-`\n` → trim), case/punctuation preserved, and the load-bearing classification (strip set = zero-width only; visible spaces fold to a single space). Use `fast-check` for the idempotence property.

```ts
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { normalizeForVerbatim } from "../../src/research/normalize";

describe("normalizeForVerbatim", () => {
  it("folds runs of visible Unicode whitespace to a single space but preserves \\n", () => {
    expect(normalizeForVerbatim("a\u00A0\u00A0\t b")).toBe("a b");      // nbsp + tab + spaces → one space
    expect(normalizeForVerbatim("a\u2003\u2009b")).toBe("a b");          // em-space + thin-space → one space
    expect(normalizeForVerbatim("line1\nline2")).toBe("line1\nline2");  // \n preserved (block boundary)
  });
  it("strips zero-width / soft-hyphen (reader-visible-equivalent), never inserting a space", () => {
    expect(normalizeForVerbatim("inter\u00ADnational")).toBe("international"); // soft hyphen (renders zero-width mid-line)
    expect(normalizeForVerbatim("a\u200Bb\u200Cc\u200Dd\u2060e\uFEFF")).toBe("abcde"); // ZWSP/ZWNJ/ZWJ/WJ/ZWNBSP
  });
  it("applies NFC, preserves case and punctuation (no meaning erasure)", () => {
    expect(normalizeForVerbatim("e\u0301")).toBe("\u00E9");           // e + combining acute → é (NFC composes)
    expect(normalizeForVerbatim("Not Awarded.")).toBe("Not Awarded."); // case + punctuation kept
  });
  it("trims leading/trailing whitespace", () => {
    expect(normalizeForVerbatim("  hi  ")).toBe("hi");
  });
  it("is idempotent (property)", () => {
    fc.assert(fc.property(fc.string(), (s) => {
      expect(normalizeForVerbatim(normalizeForVerbatim(s))).toBe(normalizeForVerbatim(s));
    }));
  });
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run test/research/normalize.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `src/research/normalize.ts`. Fixed order per spec §3; case-sensitive; no punctuation stripping; strip set is zero-width-only (audited — zero combining marks); fold set is the Unicode visible-whitespace set (`Zs` + NEL/VT/FF) minus `\n`. Use string ops only (no catastrophic regex on untrusted input — SAFE-1).

```ts
// ABOUTME: Shared verbatim-normalization contract — imported by the HTML extractor AND the verbatim check
// ABOUTME: so they can never diverge. NFC → strip zero-width → fold visible whitespace (preserve \n) → trim.
const ZERO_WIDTH = /[\u00AD\u200B\u200C\u200D\u2060\uFEFF]/g; // soft-hyphen + zero-width family (render zero-width)
// Visible whitespace folding to ONE ASCII space (Unicode Zs + NEL U+0085 + VT/FF + tab), EXCLUDING \n (block boundary).
// Use \uXXXX escapes ONLY — never paste literal invisible characters (they mis-transcribe; this bit the plan author):
const FOLDABLE_WS = /[\t\u0020\u0085\u000B\u000C\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]+/g;

export function normalizeForVerbatim(raw: string): string {
  let s = raw.normalize("NFC");
  s = s.replace(ZERO_WIDTH, "");      // strip (reader-visible-equivalent); never map to space (spec D6)
  s = s.replace(FOLDABLE_WS, " ");    // fold visible-whitespace runs to one ASCII space; \n untouched
  s = s.replace(/ *\n */g, "\n");     // collapse spaces adjacent to \n so segment edges normalize consistently
  let s = raw.normalize("NFC");
  s = s.replace(ZERO_WIDTH, "");      // strip (reader-visible-equivalent); never map to space (spec D6)
  s = s.replace(FOLDABLE_WS, " ");    // fold visible whitespace runs to one space; \n untouched
  // Collapse spaces adjacent to \n so segment edges normalize consistently:
  s = s.replace(/ *\n */g, "\n");
  return s.trim();
}
```

> **NOTE (no-regex-on-untrusted nuance):** these regexes are linear (character-class alternations with `+`, no nested quantifiers / backreferences → no catastrophic backtracking). The SAFE-1 prohibition is on *superlinear* match-start behavior; a per-character class scan is linear. Phase 3's `evaluateQuote` adds a behavioral ReDoS test over the composed pipeline.

- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit + push.** `git commit -m "feat(research): shared verbatim normalization (NFC + zero-width strip + whitespace fold, \\n-preserving)"`

### Task 1.2: NFC golden fixture (workerd parity) + `gen:nfc-golden`

**Files:**
- Create: `scripts/gen-nfc-golden.ts`
- Create: `test/fixtures/nfc-golden-workerd.json` (generated)
- Create: `test/research/nfc-parity.test.ts`
- Modify: `package.json` (add `gen:nfc-golden` script)

- [ ] **Step 1:** Create `scripts/gen-nfc-golden.ts` — a Node script that boots a one-shot Worker on `workerd` via wrangler's `unstable_dev`, runs the corpus through the REAL `normalizeForVerbatim` *inside the Worker*, and writes `{input, output}[]` to the fixture. Concrete shape:

```ts
// Run: pnpm gen:nfc-golden  (regenerate when normalize.ts or NFC_CORPUS changes)
import { unstable_dev } from "wrangler";
import { writeFileSync } from "node:fs";
import { NFC_CORPUS } from "../test/fixtures/nfc-corpus"; // string[] — shared with the parity test
// A tiny worker module that imports normalizeForVerbatim and returns normalized inputs:
const worker = await unstable_dev("scripts/nfc-worker.ts", { experimental: { disableExperimentalWarning: true } });
const out = [] as { input: string; output: string }[];
for (const input of NFC_CORPUS) {
  const res = await worker.fetch("http://x/", { method: "POST", body: input });
  out.push({ input, output: await res.text() });
}
await worker.stop();
writeFileSync("test/fixtures/nfc-golden-workerd.json", JSON.stringify(out, null, 2));
```

Also create `scripts/nfc-worker.ts` (a default-export `fetch` handler that returns `normalizeForVerbatim(await request.text())`) and `test/fixtures/nfc-corpus.ts` (`export const NFC_CORPUS: string[]` — ≥12 cases, `\uXXXX`-escaped, covering the categories below). The Node parity test imports the SAME `NFC_CORPUS` so input drift can't desync the two sides. Corpus MUST include: composed/decomposed accent pairs, recent-Unicode additions, the full strip set, fold-set members, combining-mark sequences, and astral-plane (emoji/CJK-ext-B) code points. (If `wrangler unstable_dev` proves impractical in the dev container, fall back to a committed corpus generated by `pnpm exec wrangler dev`-served endpoint; document the exact command used in the script header. STOP and raise if neither workerd path runs — do NOT generate the "golden" on Node, which would defeat the parity check.)
- [ ] **Step 2:** Add `"gen:nfc-golden": "wrangler ... scripts/gen-nfc-golden.ts"` to `package.json` scripts (exact invocation per Step 1). Run it; commit the fixture.
- [ ] **Step 3: Write the parity test** `test/research/nfc-parity.test.ts`: load the committed workerd golden, assert Node `normalizeForVerbatim(input) === golden.output` for every case. Label it in a comment as the workerd-vs-Node parity gate (the Node-only normalize tests are self-consistency, not parity).

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { normalizeForVerbatim } from "../../src/research/normalize";

// workerd-vs-Node NFC PARITY gate (spec §6 N1): the fixture is generated on workerd via `pnpm gen:nfc-golden`.
// Split-brain normalization would silently corrupt claim_key (a PK component). Regenerate the fixture when
// the corpus or normalize.ts changes.
import { NFC_CORPUS } from "../fixtures/nfc-corpus"; // the SAME corpus gen:nfc-golden ran on workerd
const golden: { input: string; output: string }[] = JSON.parse(readFileSync("test/fixtures/nfc-golden-workerd.json", "utf8"));

describe("NFC normalization is workerd↔Node parity-stable", () => {
  it("matches the committed workerd golden for every corpus case", () => {
    expect(golden.length).toBeGreaterThanOrEqual(12); // composition guard: corpus must be non-trivial
    expect(golden.map((g) => g.input)).toEqual([...NFC_CORPUS]); // coverage: a stale golden (missing new cases) fails loudly
    for (const { input, output } of golden) {
      expect(normalizeForVerbatim(input)).toBe(output);
    }
  });
});
```

- [ ] **Step 4: Run** → PASS. **Commit + push.** `git commit -m "test(research): workerd↔Node NFC parity golden fixture + gen:nfc-golden script"`

**After Phase 1:** ≥3 review rounds — idempotence holds; strip-vs-fold classification is exhaustive and correct (each strip char renders zero-width; each fold char is visible whitespace); the golden was genuinely generated on workerd (verify the script's runtime); `\n` preserved through folding.

---

## Phase 2 — `canonicalize-url.ts` (SSRF host classification)

**Execution Status:** ✅ SHIPPED 2026-06-06 — `e375155` (impl + bipolar tests, 24 cases), `0644f05` (security fix). Review rounds: provenance (orchestrator) → adversarial bypass probe (orchestrator, found trailing-dot) → fresh security reviewer (confirmed trailing-dot BLOCKER, audited CIDR math correct, surfaced a *false* single-group `::ffff:N` finding) → consolidated fix + re-verify. **Trailing-dot FQDN bypass of `BLOCKED_HOSTNAMES` (e.g. `metadata.google.internal.`) closed** by stripping a single trailing dot before classification. **False finding rejected by mechanism inspection:** `::ffff:1` is NOT IPv4-mapped (`ffff` in group 6, not the mapped group 5); true mapped low addresses normalize to `::ffff:0:N` (two groups) and are already caught — verified empirically, test `[::ffff:0:1]→reject` locks it in. Public IPv4/IPv6 added to MUST-PASS (bipolar discipline in the IP branches). 30 unit cases, gate trio green. Named residuals (IPv4-compatible `::/96`, NAT64 `64:ff9b::/96`) documented in-module + spec §9. **Post-ship refactor (`045b046`, Sam's call):** IP classification now via `ipaddr.js` (`^2.4.0`) — deleted all hand-rolled CIDR/IPv6 math (−59 LOC); `.range()` checks against the spec's enumerated block sets; NAT64 (`rfc6052`) CLOSED (now rejected), IPv4-compatible `::/96` remains the sole residual. Orchestrator re-ran the full 39-case adversarial battery (30 reject + 9 pass) — all correct; 264 suite green.

Implements spec §2 (SSRF guard, parse-then-canonicalize) — the pure, synchronous, **non-fetching** unit shared by the source-fetch guard and the pipeline's per-host cap.

### Task 2.1: `canonicalizeUrl` — parse, classify, CIDR-test

**Files:**
- Create: `src/research/canonicalize-url.ts`
- Test: `test/research/canonicalize-url.test.ts`

- [ ] **Step 1: Write failing tests** — BIPOLAR (spec §6 N7): legitimate public https URLs MUST pass; the full IP-encoding bypass set + userinfo + non-https MUST be rejected. Arm determinism traps (it must not fetch). Inputs derived spec-first from §2's threat list.

```ts
import { describe, it, expect } from "vitest";
import { armDeterminismTraps } from "../helpers/determinism";
import { canonicalizeUrl } from "../../src/research/canonicalize-url";

describe("canonicalizeUrl", () => {
  armDeterminismTraps(); // pure + non-fetching: ambient fetch/clock/RNG must throw

  it("is synchronous (returns a value, not a Promise)", () => {
    const r = canonicalizeUrl("https://en.wikipedia.org/wiki/Artemis_program");
    expect(typeof (r as { then?: unknown }).then).toBe("undefined");
  });

  // MUST-PASS (composition guard — a guard that blocks everything is useless):
  it.each([
    "https://en.wikipedia.org/wiki/Artemis_program",
    "https://www.defense.gov/News/Releases/",
    "https://example.co.uk/report?id=5",
  ])("allows legitimate public https URL %s", (u) => {
    expect(canonicalizeUrl(u).ok).toBe(true);
  });

  // MUST-REJECT:
  it.each([
    "http://en.wikipedia.org/",            // non-https
    "data:text/html,hi", "file:///etc/passwd", "ftp://x/",
    "https://user:pass@evil.com/",         // userinfo
    "https://127.0.0.1/", "https://localhost/", "https://0.0.0.0/",
    "https://169.254.169.254/",            // cloud metadata
    "https://2130706433/",                 // decimal 127.0.0.1
    "https://0x7f000001/", "https://0177.0.0.1/", "https://127.1/", // hex/octal/short
    "https://[::1]/", "https://[::]/",
    "https://[::ffff:169.254.169.254]/",   // IPv4-mapped IPv6
    "https://10.0.0.5/", "https://192.168.1.1/", "https://172.16.0.1/",
    "not a url",
  ])("rejects %s", (u) => {
    expect(canonicalizeUrl(u).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run** → FAIL (module missing).
- [ ] **Step 3: Implement** `src/research/canonicalize-url.ts` per spec §2: `new URL()` (catch parse errors → `{ok:false}`); reject non-`https`; reject non-empty `username`/`password`; take `hostname`; classify IPv4-literal (incl. decimal/octal/hex/short forms — normalize to a 32-bit int and CIDR-test the blocked ranges), IPv6-literal (incl. `::ffff:` IPv4-mapped → test the embedded v4; `::1`, `::`, `fc00::/7`, `fe80::/10`), or DNS name (reject the metadata-hostname denylist: `localhost`, `metadata.google.internal`, etc.); else `{ ok:true, url, host: url.hostname.toLowerCase() }`. Return shape exactly `{ ok: true; url: URL; host: string } | { ok: false }`.

> **Pure + non-fetching contract:** no `await`, no `fetch`, no DNS. The function MUST be synchronous. The determinism-trap test proves it.

- [ ] **Step 4: Run** → PASS. **Step 5: Commit + push.** `git commit -m "feat(research): canonicalizeUrl — parse-then-canonicalize SSRF host classification (shared by fetch guard + cap)"`

**After Phase 2:** ≥3 review rounds — every IP encoding in §2 is covered; the bipolar guard has real MUST-PASS public URLs; `example.co.uk` (multi-label TLD) passes (host-level v1; eTLD+1 deferred per spec §5); the function is synchronous.

---

## Phase 3 — `verbatim-check.ts` (highest-stakes; boil the lake)

**Execution Status:** ✅ SHIPPED 2026-06-06 — `7b324263` (evaluateQuote + UntrustedSourceText brand stub + 8 tests), `3b79589` (cross-block-forgery hardening). Review rounds: provenance (orchestrator) → adversarial false-accept probe (orchestrator: NFKC-not-folded, case/negation/zero-width/astral all correct) → **opus** (found the `\n`-only cross-block guard could be bridged by VT/FF folding to space + CR/LS/PS preserved) → adversarial option assessment (orchestrator: the decisive reason the fix belongs in `normalize.ts` not the extractor is that `text/plain` has no extractor — normalize is the only shared boundary layer) → hardening implemented + verified (forgery closed for all 7 vertical separators; golden regenerated on workerd, 16 cases, Node≡workerd; 274 suite green). MIN/MAX_QUOTE_LEN carry the mandated tuning comments. ≥3 rounds incl. opus, last state clean.

Implements spec §3 (`evaluateQuote`). The deterministic fabrication backstop (G8/G15). Uses the REAL `normalizeForVerbatim`. `MIN_QUOTE_LEN`/`MAX_QUOTE_LEN` MUST carry the explanatory comments mandated in spec §3.

### Task 3.1: `evaluateQuote`

**Files:**
- Create: `src/research/verbatim-check.ts`
- Test: `test/research/verbatim-check.test.ts`

- [ ] **Step 1: Write failing tests** — the lake (spec §3 + §6 N6 bipolar/weak-assertion bans). `matched` cases MUST require normalization to do work (composed-vs-decomposed / case / whitespace); paired cross-block negative; all four reason codes present; code-point length unit; ReDoS behavioral bound.

```ts
import { describe, it, expect } from "vitest";
import { evaluateQuote, MIN_QUOTE_LEN, MAX_QUOTE_LEN } from "../../src/research/verbatim-check";
import type { UntrustedSourceText } from "../../src/research/source-fetch";

const page = (s: string) => s as unknown as UntrustedSourceText; // Phase 4 exports the brand; cast in tests

describe("evaluateQuote", () => {
  it("matches a quote present only after NFC/whitespace normalization (normalization does work)", () => {
    expect(evaluateQuote(page("The contract was\u00A0awarded in 2024."), "The contract was awarded in 2024.")).toBe("matched"); // nbsp in page vs ASCII space in quote
    expect(evaluateQuote(page("re\u0301sume\u0301 published"), "r\u00E9sum\u00E9 published")).toBe("matched"); // decomposed page vs composed quote (NFC)
  });
  it("does NOT match across a block boundary (cross-block forgery prevention)", () => {
    expect(evaluateQuote(page("Paragraph one ends.\nParagraph two starts."), "ends. Paragraph two")).toBe("quote_not_found");
  });
  it("does NOT match a negation flip (no punctuation/case stripping)", () => {
    expect(evaluateQuote(page("The contract was not awarded."), "The contract was awarded.")).toBe("quote_not_found");
  });
  it("rejects empty/whitespace/too-short/too-long with the right code (code-point lengths)", () => {
    expect(evaluateQuote(page("anything"), "")).toBe("quote_not_found");
    expect(evaluateQuote(page("anything"), "   ")).toBe("quote_not_found");
    expect(evaluateQuote(page("a b"), "a")).toBe("quote_too_short");
    const long = "x".repeat(MAX_QUOTE_LEN + 1);
    expect(evaluateQuote(page(long), long)).toBe("quote_too_long");
  });
  it("matches a real pointer-sized quote", () => {
    expect(evaluateQuote(page("Lorem ipsum. NASA confirmed the launch on 3 May 2024 at the site."), "NASA confirmed the launch on 3 May 2024")).toBe("matched");
  });
  it("is linear-time on pathological input (no ReDoS) and handles empty page", () => {
    const spam = page("{".repeat(1_000_000));
    const start = performance.now();
    expect(evaluateQuote(spam, "a confirmed factual quote here")).toBe("quote_not_found");
    expect(performance.now() - start).toBeLessThan(1000);
    expect(evaluateQuote(page(""), "a confirmed factual quote here")).toBe("quote_not_found");
  });
});
```

- [ ] **Step 2: Run** → FAIL (module missing; also `UntrustedSourceText` not yet exported — for now, define the brand in `verbatim-check.ts` and re-export from source-fetch in Phase 4, OR import a placeholder type; resolve the import direction so tsc passes — the brand SHOULD live in `source-fetch.ts` per spec §1, so in THIS task create `src/research/source-fetch.ts` containing ONLY the brand, and flesh out the fetch logic in Phase 4:

```ts
// ABOUTME: Hardened fetch of an arbitrary (untrusted) source URL → branded UntrustedSourceText. (Fetch logic: Phase 4.)
// ABOUTME: The brand encodes G15 at the type level — page text may flow ONLY to the verbatim check, never to a model.
declare const __brand: unique symbol;
export type UntrustedSourceText = string & { readonly [__brand]: "UntrustedSourceText" };
```

(Phase 4 fleshes out `fetchSourceText` + the typed result in this same file — same agent-chain, sequential, no conflict.)
- [ ] **Step 3: Implement** `src/research/verbatim-check.ts` per spec §3: normalize the quote; reject empty/whitespace → `quote_not_found`; `[...q].length < MIN_QUOTE_LEN` → `quote_too_short`; `> MAX_QUOTE_LEN` → `quote_too_long`; if normalized quote contains `\n` → `quote_not_found`; else normalize the page and return `matched` iff `normPage.includes(normQuote)`. Page-size cap before normalizing. **Include the mandated explanatory comments on the constants:**

```ts
// ABOUTME: Deterministic verbatim-quote check — the G8/G15 fabrication backstop. Pure, linear, no regex on untrusted text.
// ABOUTME: Confirms BYTE-PRESENCE in the page's normalized text, NOT rendered visibility (human-open gate, G5, is that backstop).
import { normalizeForVerbatim } from "./normalize";
import type { UntrustedSourceText } from "./source-fetch";

/**
 * Blunt anti-triviality floor — NOT a security property. The deterministic check + the human-open
 * verification gate are the real backstops. Raising this FALSE-DROPS legitimate short factual quotes —
 * notably date anchors like "3 May 2024" (10 code points), the exact stale-claim anchors this product
 * surfaces; lowering it admits near-trivial common-phrase matches. Tuned LOW deliberately. Code points,
 * not UTF-16 units. (Future tuner: this is a coverage-vs-noise knob bounded by the human gate, not a
 * correctness threshold.)
 */
export const MIN_QUOTE_LEN = 8;
/**
 * G16 pointer-not-prose bound: a quote longer than a pointer is a copyright / "basically draft text"
 * smell. Re-validated at the research-packs read path (defense in depth). Code points.
 */
export const MAX_QUOTE_LEN = 300;
const MAX_PAGE_CHARS = 4_000_000; // hard bound before normalization (linear-time guarantee on untrusted text)

export type QuoteResult = "matched" | "quote_too_short" | "quote_too_long" | "quote_not_found";

export function evaluateQuote(pageText: UntrustedSourceText, quote: string): QuoteResult {
  const q = normalizeForVerbatim(quote);
  if (q.length === 0) return "quote_not_found";
  const qLen = [...q].length;
  if (qLen < MIN_QUOTE_LEN) return "quote_too_short";
  if (qLen > MAX_QUOTE_LEN) return "quote_too_long";
  if (q.includes("\n")) return "quote_not_found"; // spans a block boundary → never matches a single segment
  const raw = pageText as unknown as string;
  const page = normalizeForVerbatim(raw.length > MAX_PAGE_CHARS ? raw.slice(0, MAX_PAGE_CHARS) : raw);
  return page.includes(q) ? "matched" : "quote_not_found";
}
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit + push.** `git commit -m "feat(research): deterministic verbatim-quote check (byte-presence, linear, code-point bounds)"`

**After Phase 3 (opus reviewer recommended):** ≥3 review rounds — no false-accept path (negation, cross-block, short/long, empty); `matched` cases genuinely exercise normalization; linear-time bound holds; the constant comments convey the tuning implications; the byte-presence-not-visibility scope is honored (matches the §3 / G8-clarification framing).

---

## Phase 4 — `source-fetch.ts` (SSRF + streaming cap + extraction)

**Execution Status:** ✅ SHIPPED 2026-06-06 — `e2d8822` (blind-adversary corpora: 53 SSRF [11 pass/42 reject] + 28 extraction, all spec-derived; SSRF corpus cross-validated 53/53 against shipped `canonicalizeUrl`), `9a63077` (fetchSourceText impl + 128 tests — RESCUED uncommitted after a container restart killed the implementer; orchestrator fixed 2 test-file gate issues it died before resolving), `d21e47e` (`<br>` block-separator fix), `0955b95` (form-widget + replaced-element separator fix, opus B1), `1f4670c` (charset meta-only honor, opus C1). Review rounds: rescue+provenance+gate-fixes → orchestrator found `<br>` cross-block-forgery BLOCKER → **opus** found B1 (form-widget/replaced tags `<button>/<select>/<option>/<optgroup>/<textarea>/<output>/<label>/<img>/<input>/<object>/<map>` in INLINE_TAGS = same forgery class) + C1 (header-silent meta charset false-drop) and verified the rest clean (no attribute/comment leak, hidden-text nesting correct, streaming cap + abort hygiene zero unhandled rejections, reason-codes correct) → remediation. INLINE_TAGS now restricted to genuine text-level phrasing; isolating regression tests added (blind corpus had no form-widget coverage). 418 suite green. NIT N1 (blocked_scheme/blocked_host reason approximate for userinfo) accepted — no security impact. Named residual: DNS-rebinding/TOCTOU (in-module).

Implements spec §2. **Blind-adversary corpora** (SSRF + HTML-extraction) per spec §6: before implementing, dispatch a subagent that has NOT seen `source-fetch.ts` to generate adversarial inputs from the spec §2 threat list (see Task 4.0). The injected `fetchImpl` MUST emit real multi-chunk `ReadableStream`s (incl. a compression bomb) so the streaming cap + abort run (§6 N6).

### Task 4.0: Generate the blind-adversary corpora

- [ ] **Step 1:** Dispatch a fresh subagent (no sight of the implementation) with spec §2's threat enumeration only, asking it to produce: (a) an SSRF URL corpus (bipolar — MUST-pass public URLs + MUST-reject bypasses beyond Phase 2's set, e.g. uncommon encodings, redirect-to-blocked); (b) an HTML-extraction corpus (bipolar — visible text that MUST be extracted verbatim + hidden/comment/attribute/entity cases that MUST be excluded, incl. cross-block-via-inline-spans). Save to `test/fixtures/research/ssrf-corpus.json` and `test/fixtures/research/extraction-corpus.json` with `{ input, expected, threat }` per case (expected derived from the SPEC, not any implementation).
- [ ] **Step 2: Commit** the corpora. `git commit -m "test(research): blind-adversary SSRF + HTML-extraction corpora (spec-derived)"`

### Task 4.1: `fetchSourceText` + `UntrustedSourceText` brand + HTML→text extraction

**Files:**
- Modify: `src/research/source-fetch.ts` (flesh out the brand stub from Phase 3)
- Test: `test/research/source-fetch.test.ts`

- [ ] **Step 1: Write failing tests** using a stream-shaped fake `fetchImpl` (real `ReadableStream`, multi-chunk) + the blind-adversary corpora. Arm determinism traps; assert no unhandled rejection on the abort path (lane scenario-8 pattern + `allowConsole()` where an error is logged). Cover every typed failure reason (spec §2.10), the decompressed-byte cap (compression-bomb case), `redirect:"error"` rejecting 3xx, content-type allowlist, charset fatal-on-conflict, and extraction (text-nodes only, block separators, hidden-text excluded + visible extracted). Full case list derived from spec §2 + the corpora.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `src/research/source-fetch.ts` per spec §2: `UntrustedSourceText` branded type; `fetchSourceText(url, { fetchImpl, userAgent, now })`; `canonicalizeUrl` guard; `https`-only; `redirect:"error"`; `Accept-Encoding: identity`; real `AbortController` (timeout + size-cap both `abort()`); decompressed-byte cap from the stream reader; content-type allowlist; charset header-wins + fatal-on-conflict `TextDecoder`; `htmlparser2` extraction (text-nodes only, no attributes/comments, `\n` between block elements incl. `<br>/<li>/<td>/<th>/<hr>`, unknown→separator, defense-in-depth hidden-text strip); typed `SourceFetchResult`. The injected `fetchImpl` shape: `(url, { headers, signal }) => Promise<{ status: number; headers: Headers; body: ReadableStream<Uint8Array> }>`.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit + push.** `git commit -m "feat(research): hardened source-fetch (SSRF guard, streaming decompressed cap, redirect:error, htmlparser2 text extraction)"`

**After Phase 4 (opus reviewer recommended):** ≥3 review rounds — bipolar corpora both polarities asserted (public URLs pass; hidden text excluded AND visible extracted); the stream fake is multi-chunk and the cap fires mid-stream on the bomb; abort leaves no pending fetch / no unhandled rejection; extraction emits no attribute/comment text; the DNS-rebinding residual is documented in the module ABOUTME.

---

## Phase 5 — `provider.ts` reshape + fake providers

**Execution Status:** ✅ SHIPPED 2026-06-06 — `03f1242`. New contract per spec §1: `ResearchInput` (+`surroundingText?`/`sourceRevisionId`), `ProposedEvidence` (unverified), `EvidenceCard` (verified), `ProviderResearch` (`{providerName, modelVersion, proposals, queries}`), `ProviderUnavailableError`; stub returns empty proposals/queries + `modelVersion "fake-provider/0"`. `test/research/fake-providers.ts` provides the adversarial fakes Phase 8 needs (flood/sameHost/subdomainFanout/malformedUrl/unavailable, deterministic). `research-jobs.ts` touched types-only (logic unchanged; full rewrite is Phase 9); old `ResearchResult` fully removed (grep-clean). 426 suite green. Review: orchestrator provenance + spec-§1 compliance + criteria (split matches spec, fakes emit the Phase-8 shapes, surroundingText optional, no stale refs) — low-stakes type reshape, not opus-tier.

Implements spec §1 (the provider/verify split). **Interface change to committed, tested code** — update `stub-provider.ts` and any callers/tests so tsc + the suite stay green.

### Task 5.1: Reshape the provider contract + fakes

**Files:**
- Modify: `src/research/provider.ts`, `src/research/stub-provider.ts`
- Test: `test/research/provider.test.ts` (update), `test/research/fake-providers.ts` (new test helper)

- [ ] **Step 1: Write/adjust failing tests.** Assert the new shapes: `ProposedEvidence { url, proposedQuote, advisorySupport }`; `EvidenceCard { url, verbatimQuote, advisorySupport }`; `ResearchInput { claimText, sectionHeading, year, surroundingText?, sourceRevisionId }`; `ResearchProvider.research(input) → { providerName, modelVersion, proposals, queries }`; `ProviderUnavailableError`. Create `test/research/fake-providers.ts` with **adversarial-capable** fakes (canned proposals; an unavailable fake that throws `ProviderUnavailableError`; a fake that can emit 10k proposals / duplicate-canonical-host / subdomain-fan-out / malformed URLs — for Phase 8's cap tests; a fake reporting `modelVersion: "fake-provider/0"`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the reshape in `provider.ts` (refine the existing types per spec §1) + update `stub-provider.ts` to the new contract (returns empty proposals + queries, `modelVersion: "fake-provider/0"`). Update every caller/test the rename touches so tsc + suite are green (search for `ResearchResult`/`candidates`/old `EvidenceCard`). **Do NOT** restructure provider logic, rename unrelated symbols, or change `research-jobs.ts` here (that is Phase 9) — this task is the type reshape + the fakes only.
- [ ] **Step 4: Run** the full suite → PASS. **Step 5: Commit + push.** `git commit -m "feat(research): split provider contract — ProposedEvidence (unverified) vs EvidenceCard (verified); ProviderUnavailableError"`

**After Phase 5:** ≥3 review rounds — the split matches spec §1; the fake providers can emit the adversarial shapes Phase 8 needs; no stale references to the old contract remain (grep); `surroundingText` is optional.

---

## Phase 6 — `verify-proposal.ts` (the standalone compliance seam)

**Execution Status:** ✅ SHIPPED 2026-06-06 — `d3ef01f`. `verifyProposal(proposal, { fetchSource })` → fetch fails → `DroppedProposal { url, reason }`; fetched → real `evaluateQuote` → `matched` → `EvidenceCard` with the **RAW** proposed quote (asserted: page uses U+00A0 where the quote uses ASCII space; card stores the raw ASCII form, `not.toContain` nbsp — the §3 determinism rule), else `DroppedProposal { url, reason: quote_* }`. `DroppedProposal` defined here (Phase 8 imports it). 14 tests incl. `it.each` over all 10 fetch-failure reasons; determinism traps armed; 440 suite green. Review: orchestrator provenance + spec-§5 compliance + criteria (raw-quote storage, every reason→drop, isolated from pipeline) — small seam, not opus-tier.

Implements spec §5 (`verifyProposal`). The guardrail that must be testable in isolation: stub `fetchSource` + the REAL `evaluateQuote`.

### Task 6.1: `verifyProposal`

**Files:**
- Create: `src/research/verify-proposal.ts`
- Test: `test/research/verify-proposal.test.ts`

- [ ] **Step 1: Write failing tests** (arm determinism traps; stub `fetchSource` returning canned `UntrustedSourceText` or typed failures; **real** `evaluateQuote`):
  - page lacks the quote → `DroppedProposal { url, reason: "quote_not_found" }` (the standalone guardrail test).
  - page contains the quote → `EvidenceCard { url, verbatimQuote: <raw proposed quote>, advisorySupport }`.
  - `fetchSource` failure (each reason) → `DroppedProposal { url, reason: <that reason> }`.
  - quote too short/long → `DroppedProposal` with that reason.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `src/research/verify-proposal.ts` per spec §5: `verifyProposal(proposal, { fetchSource })` → on fetch failure return the dropped reason; else `evaluateQuote(text, proposal.proposedQuote)` → `matched` → card with the RAW proposed quote; else dropped with the quote reason. Define `DroppedProposal { url: string; reason: string }` in `verify-proposal.ts` (Phase 8's pipeline imports it from here).
- [ ] **Step 4: Run** → PASS. **Step 5: Commit + push.** `git commit -m "feat(research): verifyProposal — fetch + verbatim check → EvidenceCard | DroppedProposal"`

**After Phase 6:** ≥3 review rounds — the card stores the RAW quote (per spec §3 determinism rule); every fetch/quote reason maps to a drop; the seam is testable without the pipeline.

---

## Phase 7 — `research-packs.ts` + migration 0003

**Execution Status:** ⬜ NOT STARTED

Implements spec §4. Phase-2 migration discipline (byte-identical `CREATE TABLE` in `migrations/0003` and `schema.sql`; schema-equivalence test; ordered `freshTestDb`). DB-1 (`WITHOUT ROWID` NULL-rejection), DB-2 (`bind()`).

### Task 7.1: Migration + schema + equivalence test

**Files:**
- Create: `migrations/0003_research_packs.sql`
- Modify: `src/db/schema.sql`
- Test: `test/db/migration.test.ts` (extend)

- [ ] **Step 1: Write failing tests** — the `research_packs` table exists with the expected columns + composite PK; schema-equivalence (migrations-in-order ≡ `schema.sql`, byte-identical DDL).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `migrations/0003_research_packs.sql` exactly per spec §4 (the full `CREATE TABLE research_packs (…) WITHOUT ROWID;` block); append the **byte-identical** block to `src/db/schema.sql`. (The ordered `freshTestDb` already applies all `migrations/*.sql` in sorted order — no change needed.)
- [ ] **Step 4: Run** → PASS. **Step 5: Commit + push.** `git commit -m "feat(db): research_packs table + migration 0003 + schema-equivalence"`

### Task 7.2: `research-packs.ts` DB module

**Files:**
- Create: `src/db/research-packs.ts`
- Test: `test/db/research-packs.test.ts`

- [ ] **Step 1: Write failing tests** (`freshTestExecutor`, `bind()` every param, `await` every call — DB-2; never raw `new Database()` — §8): `computeClaimKey` determinism (same inputs → same hex; byte-length-prefixed canonical form; NFC on string fields); `insertPackIfAbsent` writes a terminal pack; re-insert of the same `(claim_key, source_revision_id)` is a **no-op** (NOT an overwrite — assert the original row preserved); NULL key component rejects (DB-1, `WITHOUT ROWID`); FK to `articles` fires; `getPack` round-trips; **defensive read** — a corrupt `cards_json` yields a typed `pack_unreadable` state (does NOT throw — `allowConsole()` if it logs); read-time validation rejects out-of-range quote length; `deletePack` removes exactly the targeted row; the surfacing helper returns a pack only when `source_revision_id == articles.revision_id`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `src/db/research-packs.ts` per spec §4: `computeClaimKey(pageId, sectionHeading, sentenceText, year)` (SHA-256 hex over the byte-length-prefixed, NFC-normalized canonical form); `insertPackIfAbsent` (`INSERT … ON CONFLICT(claim_key, source_revision_id) DO NOTHING` — write-once, **not** upsert; comment why it diverges from the verdict upsert); `getPack` (defensive per-column `JSON.parse` → `pack_unreadable` typed state; read-time shape/cap validation); `deletePack`; the revision-match surfacing query. ABOUTME notes the table is **mutable cache/history** (audit log is the append-only one).
- [ ] **Step 4: Run** → PASS. **Step 5: Commit + push.** `git commit -m "feat(db): research_packs persistence — claim_key, write-once insert, defensive read, prune, revision-match surfacing"`

**After Phase 7:** ≥3 review rounds — write-once (not upsert) proven by the re-insert-no-op test; DB-1 NULL-rejection tested; defensive read never throws; the byte-identical DDL passes the equivalence test; `bind()` everywhere.

---

## Phase 8 — `pipeline.ts` `researchClaim` (cap ordering + partition)

**Execution Status:** ⬜ NOT STARTED

Implements spec §5 — the pure, total orchestrator. The cap **order** is a security boundary (§5 / D9). Tests assert orchestration invariants, NOT stub rigging (§6 N6/N7).

### Task 8.1: `researchClaim`

**Files:**
- Create: `src/research/pipeline.ts`
- Test: `test/research/pipeline.test.ts`

- [ ] **Step 1: Write failing tests** (arm determinism traps; fakes from `test/research/fake-providers.ts`; stub `fetchSource`):
  - **cap ordering / fan-out (use the adversarial fakes):** a fake emitting >`maxProposals` proposals → `truncated == maxProposals`, `overCapCount == raw − maxProposals`, and a `fetchCalls` counter proves **exactly `maxProposals`** fetches (not raw). **`perHostCap`: put >cap proposals ON THE SAME canonical host** (not distinct hosts) and assert the over-host ones are dropped `capped`. Malformed URLs inside the truncated set → counted `malformed_url` dispositions (never fetched), not skipped.
  - **partition invariant (in EVERY outcome test):** `cards.length + dispositions.length === truncated.length`.
  - **status derivation:** `ProviderUnavailableError` → `provider_unavailable` (no cards/dispositions); zero proposals → `no_proposals`; else `proposals_present`.
  - **discriminated union:** impossible states (`proposals_present` with empty arrays) are unrepresentable / asserted against.
  - **G9 sanity bound:** a query echoing the full claim sentence is rejected; query count/length capped.
  - **determinism property:** `researchClaim` called twice with the **same** input + injected `now` + the same stubbed `fetchSource` → deep-equal output (including `claim_key`-free card ordering). Do NOT assert shuffle-invariance: truncation (`slice(0, maxProposals)`) is order-dependent by design, so a shuffled input legitimately yields a different surviving set. (Deviation from spec §6 N4, whose "shuffled → order-stable" phrasing conflicts with order-dependent truncation; repeatability is the correct property — recorded in the Deviations subsection.)
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `src/research/pipeline.ts` per spec §5: the cap ordering (`slice(0, maxProposals)` FIRST → `canonicalizeUrl` each → per-host count on canonical host → `verifyProposal`), `overCapCount`, the discriminated-union `ResearchOutcome` on `status` (DEFINE `ResearchOutcome` here in `pipeline.ts`; Phase 9's consumer imports it from here), importing `DroppedProposal`/`EvidenceCard` from `verify-proposal.ts`/`provider.ts`; the asserted partition; the cheap G9 query bound. Pure and **total** — never throws on provider/fetch output (`ProviderUnavailableError` caught → status). Deps `{ provider, fetchSource, now, maxProposals, perHostCap }` with the spec's named defaults.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit + push.** `git commit -m "feat(research): researchClaim — cap-ordering security boundary, asserted partition, discriminated-union outcome"`

**MUST-NOT-WEAKEN reminder:** the cap-ordering tests and the partition invariant are load-bearing (G14/G15). If they flake, fix with deterministic fakes — never loosen. STOP + escalate if they can't pass deterministically.

**After Phase 8 (opus reviewer recommended):** ≥3 review rounds — the cap test puts >cap on the SAME host (not distinct); `fetchCalls` proves the truncation; partition holds in every branch; `researchClaim` never throws on adversarial provider output; repeatable (same input → deep-equal output).

---

## Phase 9 — `research-jobs.ts` rewrite (the total/contained consumer)

**Execution Status:** ⬜ NOT STARTED

Implements spec §5 (`handleResearchMessage`). **Rewrite** of the existing module. Audit is codes-only with the **allowlist + sentinel** assertion (§6 N3) — NOT a denylist. Persist terminal-only; `provider_unavailable` audit-only + retry-signal.

### Task 9.1: `handleResearchMessage`

**Files:**
- Modify (rewrite): `src/queue/research-jobs.ts`
- Test: `test/queue/research-jobs.test.ts` (rewrite)

- [ ] **Step 1: Write failing tests** (`freshTestExecutor` + a fake provider + stub `fetchSource` + the real `research-packs` store + the real `audit-log`; mind testing-pitfalls §5 TOCTOU for the redelivery cases — sequence simulated deliveries deterministically, never with timing):
  - **terminal (`proposals_present`/`no_proposals`):** pack persisted; exactly one audit row.
  - **AUDIT ALLOWLIST + SENTINEL (the compliance assertion):** parse the audit payload; assert its keys ⊆ `{claimKey, providerName, modelVersion, cardCount, dispositionTally, overCapCount, status}` and every value is a number / known-enum string / id (never free text). Seed the claim/quote/URL with `SENTINEL_LEAK_<rand>` and assert `JSON.stringify(payload)` does NOT contain the sentinel.
  - **`provider_unavailable`:** audit-only — assert **nothing** in `research_packs`, the handler signals **retry** (throws / returns a retry signal), and a redelivery would re-attempt (no persisted terminal blocking it).
  - **containment:** an unexpected throw from a dep → `research.failed` audit (codes-only) and contained per-message (does not escape to poison a batch); a malformed message → ack + `research.failed` (don't retry permanently-bad input).
  - **`has()` sequential-skip on the FULL PK:** `has(claimKey, sourceRevisionId)` true → skip; **different `source_revision_id` for the same `claimKey` → NOT skipped** (a new revision must re-research).
  - **concurrent double-write:** two `insertPackIfAbsent` of the same PK → the second is a no-op (pack not corrupted). Per §5/§6 N6, a duplicate `research.completed` audit row is acceptable (don't assert exactly-one across concurrent redelivery; assert the pack is singular).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the rewrite per spec §5. Also update the `enqueueResearch` PRODUCER to build the new message: compute `claimKey = computeClaimKey(pageId, sectionHeading, sentenceText, year)` (from `src/db/research-packs`) and send `{ claimKey, pageId, sourceRevisionId, input }` (drop the old `{ candidateId, claim }` shape; update `ResearchMessage` + the `enqueueResearch` signature + every caller/test). Consumer signature: `handleResearchMessage(msg, deps)` with `deps = { researchClaim, packStore, audit, now }` — `researchClaim: (input) => Promise<ResearchOutcome>` is the Phase-8 pipeline **pre-bound** with `{ provider, fetchSource, now, maxProposals, perHostCap }` (so the consumer test injects a stub `researchClaim` directly, no provider/fetch needed); `now: Date` (a value, matching the project convention — cf. `EasyWinLaneOptions.now?: Date`) stamps the pack `evaluated_at` via `now.toISOString()`. Flow: `ResearchMessage { claimKey, pageId, sourceRevisionId, input }`; best-effort `packStore.has` (full PK) → skip; `researchClaim`; terminal → assemble pack (identity + outcome) → `insertPackIfAbsent` → audit codes-only with the per-reason tally → ack; `provider_unavailable` → audit-only → retry-signal; malformed message → `research.failed` audit + ack; DB/unexpected → retry-signal. Define the typed `ResearchAuditPayload`.

```
BEFORE marking this task complete:
If any concurrency/redelivery test races or flakes, the fix is deterministic
sequencing of the simulated deliveries (await one insert before the next) or
deterministic fakes — NOT assertion removal. If the partition/persist/audit
assertions can't pass reliably, STOP and raise. Do not ship a weaker test.
```

- [ ] **Step 4: Run** the full suite → PASS. **Step 5: Commit + push.** `git commit -m "feat(queue): research-jobs consumer — total/contained, persist-terminal-only, codes-only audit (allowlist+sentinel tested)"`

**After Phase 9 (opus reviewer recommended):** ≥3 review rounds — the audit assertion is an allowlist + sentinel (NOT a denylist); `provider_unavailable` does not persist and does not block retry; containment branches covered; `has()` keys on the full PK; no quotes/queries/URLs in any audit payload.

---

## Final integration

- [ ] Full suite + `tsc` + `lint` green + pristine; CI green on the branch.
- [ ] `pnpm gen:nfc-golden` re-run if `normalize.ts` or the NFC corpus changed since Phase 1; fixture committed.
- [ ] Rebase onto latest `origin/dev` if it moved; resolve any conflict in `provider.ts` / `research-jobs.ts` / `schema.sql` / `test/helpers/db.ts` by re-running the gate trio.
- [ ] Open a PR to `dev`. `## Merge classification`: **Review — compliance** (this is the BLP-safety backstop's research consumer; the verbatim check + audit codes-only + SSRF guard are load-bearing). Link the spec + this plan + the compliance-contract G8 clarification. Do NOT self-merge.

---

## Self-Review (author checklist — completed at write time)

**Spec coverage:** §1 architecture → phases 1–9 module map; §2 source-fetch → Phase 4 (+ Phase 2 canonicalize); §3 normalize+verbatim → Phases 1 + 3; §4 persistence → Phase 7; §5 orchestration → Phases 6 (verifyProposal) + 8 (researchClaim) + 9 (consumer); §6 testing → woven into every phase + Phase 0 (harness) + §6.1 CI → Phase 0; §6 N1 golden → Phase 1; N3 allowlist+sentinel → Phase 9; N4 traps → Phase 0; N7 bipolar → Phases 2/3/4; blind-adversary → Phase 4; fast-check → Phases 1/3; §7 compliance → honored per phase; §9 residuals → "Do NOT" + deferred. No uncovered spec section.

**Placeholder scan:** high-stakes units (normalize, canonicalize, verbatim) carry full test+impl code; source-fetch / research-packs / pipeline / consumer carry full test specs + key code + a spec-section reference for the exhaustive design (the spec is committed and linked). The `gen:nfc-golden` exact invocation is left to the executor with a STOP-if-no-workerd guard (the dev-container wrangler path can't be pinned at write time) — this is a deliberate, bounded instruction, not a TBD.

**Type consistency:** `ProposedEvidence`/`EvidenceCard`/`ResearchInput`/`ResearchProvider`/`ProviderUnavailableError` (Phase 5) used consistently in Phases 6/8/9; `UntrustedSourceText` brand introduced in Phase 3 (stub) and fleshed out in Phase 4; `QuoteResult`/`MIN_QUOTE_LEN`/`MAX_QUOTE_LEN` (Phase 3) used in Phase 6; `computeClaimKey`/`insertPackIfAbsent`/`getPack`/`deletePack` (Phase 7) used in Phase 9; `ResearchOutcome`/`DroppedProposal` (Phases 5/6/8) consistent.

**Ordering:** 0 (harness) → 1 (normalize) → 2 (canonicalize) → 3 (verbatim, needs 1) → 4 (source-fetch, needs 1+2) → 5 (provider) → 6 (verify-proposal, needs 3+4) → 7 (packs, independent) → 8 (pipeline, needs 5+6+2) → 9 (consumer, needs 7+8). No two parallel tasks edit the same file (`source-fetch.ts` brand stub in Phase 3 is fleshed out in Phase 4 — sequential, same agent-chain).
