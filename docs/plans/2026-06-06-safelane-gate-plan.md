# Safe-lane Gate (G11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic, LLM-free, fail-closed safe-lane eligibility gate that excludes biographies of living persons (BLP) — and other non-eligible articles — from the easy-win lane, wired into the single-article lookup path.

**Architecture:** A pure `evaluateEligibility(meta, now, gateVersion)` gate over an `ArticleMetadata` snapshot fetched in ONE atomic Action-API call (`revisions|categories|info` + a bounded `clcategories` BLP probe). Floor = BLP-category probe + mainspace + freshness fail-closed + fail-closed-on-indeterminate; advisory one-way wikitext signals (literal BLP category, dispute templates). Verdict is computed on the fly, returned in `LookupResult`, shown in the UI, and audit-logged (codes only) — **not persisted** in v1.

**Tech Stack:** TypeScript (ES2024, strict), Next.js 16 / OpenNext (Cloudflare Workers + D1), better-sqlite3 (local/test) behind the async `SqlExecutor` port, vitest, wtf_wikipedia (parsing only), Node 24 / pnpm 11.5.1.

**Authoritative spec:** `docs/design/2026-06-06-safelane-gate-design.md`. **Review trail:** `docs/plans/safelane-design-review/round-{1..5}-*.md`. Read the spec before any task.

**Terminology (for fresh task-by-task readers):** **BLP** = *biographies of living persons* — Wikipedia's policy class for articles whose subject is a living person (WP:BLP). The gate's hard, fail-closed floor is keeping a BLP article out of the automated "easy-win" lane by default. **easy-win lane** = the (future) queue of low-risk, high-confidence temporal fixes a human editor can act on quickly; the gate decides `easy_win` vs `human_only`.

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

**Overall:** 1/5 phases shipped.

| Phase | Status | Ship SHA(s) | Notes |
|---|---|---|---|
| 1 — Foundation (types, denylists, wikitext scan) | ✅ Shipped | `8bede5a`,`b838890`,`2506e25` | 12 tests; suite 168 green |
| 2 — The gate (evaluateEligibility) | ⬜ Not started | — | — |
| 3 — Ingest atomic metadata call + frozen envelopes | ⬜ Not started | — | — |
| 4 — Wiring (orchestrator, API, UI) | ⬜ Not started | — | — |
| 5 — Gold-set integration test + composition guard | ⬜ Not started | — | — |

---

## Per-Task Protocol (MANDATORY — applies to EVERY task below)

Each task is dispatched to a fresh agent. The dispatcher MUST include this protocol with every task; each task body also references it.

**BEFORE starting work:**
1. Invoke `superpowers:test-driven-development`.
2. Read `docs/pitfalls/testing-pitfalls.md` (esp. §1 pristine output, §8 SQLite↔D1 parity, §9 gold-set honesty) and the relevant entries of `docs/pitfalls/implementation-pitfalls.md` (DB-1, DB-2).
3. Read the spec sections this task implements.
Follow TDD: write the failing test → run it and confirm it fails for the expected reason → write the minimal implementation → run and confirm green → refactor green → commit → **push**.

**BEFORE marking a task complete:**
1. Review the new tests against `docs/pitfalls/testing-pitfalls.md` (error paths? edge cases? negatives present? pristine output?).
2. Run the full gate trio and confirm all green and output pristine: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`.
3. Commit with a descriptive message and **push** (container is ephemeral; unpushed commits are lost).

**Assertion rigor:** if a test ever races/flakes, the fix is deterministic synchronization (inject `now`/`asOfYear`, freeze fixtures), NEVER weakening or deleting an assertion. The safe-lane gate is a fail-closed compliance floor — a weakened test on a fail-OPEN path is a compliance regression. STOP and escalate rather than ship a weaker test. Commit subjects touching assertions state what happened to them ("add"/"strengthen"/"preserve").

**Determinism (G10):** the gate, scan, and canonicalizer MUST be pure — no **clock reads** (`Date.now()`, no-argument `new Date()`), no `fetch`, no `random` inside `src/safelane/*`. "Now" is an injected parameter. **`new Date(isoString)` to PARSE an injected timestamp is allowed** (it is a deterministic parse of a passed-in value, not a clock read) — the freshness check uses exactly this. The probe + revision timestamp are captured upstream in the ingest. Tests pass frozen inputs.

**Do NOT:** add an LLM anywhere; modify the detector or gold detector sets; build the easy-win queue, auth, research, or persistence of the verdict (out of v1 scope per spec §1); fetch talk pages; add infobox-name matching to the wikitext scan (spec §4 — intentionally excluded).

---

## Phase 1 — Foundation (types, denylists, wikitext scan)

**Execution Status:** ✅ SHIPPED on 2026-06-06 (branch `claude/safelane-gate-g11`) — Task 1.1 `8bede5a` (types), 1.2 `b838890` (denylists + canonicalizer), 1.3 `2506e25` (wikitext scan). 12 new tests; full suite 168 green, tsc + lint clean.

Three small, independent, pure modules. Tasks 1.1/1.2/1.3 touch different files and MAY run in parallel, but 1.3 depends on 1.2's exports (`BLP_CATEGORIES`, `DISPUTE_TEMPLATES`, canonicalizers), so sequence 1.2 before 1.3.

### Task 1.1: Domain types for the gate contract

**Files:**
- Modify: `src/domain/types.ts` (append the two interfaces below; do NOT alter existing types)
- Test: none. Do NOT add runtime tests for pure interfaces and do NOT modify `test/domain/types.test.ts`. These types are validated by `tsc` and exercised by their consumers in Tasks 2.1/3.1/4.1.

Follow the **Per-Task Protocol** (its TDD step is satisfied here by `tsc` — there is no runtime behavior to red/green). Implements spec §2 (contract).

- [ ] **Step 1: Add the types** to `src/domain/types.ts`:

```ts
/** Authoritative single-snapshot metadata the safe-lane gate consumes. All fields derive
 *  from one resolved page of one Action-API response (no two-snapshot skew). */
export interface ArticleMetadata {
  resolvedPageId: number;
  resolvedTitle: string;
  revisionId: number;
  revisionTimestamp: string;            // ISO 8601, from the same response
  namespace: number;                    // 0 = mainspace
  blpProbe: "present" | "absent" | "unknown"; // clcategories BLP-set result; "unknown" = indeterminate response
  wikitext: string;                     // same-snapshot revision content (for the advisory scan)
  fetchedAt: string;                    // ISO 8601, captured at response-parse time
}

/** Eligibility verdict + machine reason codes (never free text). */
export interface EligibilityDecision {
  eligibility: "easy_win" | "human_only";
  reasons: string[];                    // canonical-ordered codes
}
```

- [ ] **Step 2:** `pnpm exec tsc --noEmit` → clean (types compile). There is no runtime to test here; consumers in later tasks exercise them. Do NOT invent a runtime test for pure interfaces.
- [ ] **Step 3: Commit + push.** `git commit -m "feat(domain): ArticleMetadata + EligibilityDecision types for the safe-lane gate"`

### Task 1.2: Denylists + canonicalizer

**Files:**
- Create: `src/safelane/denylists.ts`
- Test: `test/safelane/denylists.test.ts`

Follow the **Per-Task Protocol**. Implements spec §3.

- [ ] **Step 1: Write the failing test** `test/safelane/denylists.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  BLP_CATEGORIES,
  DISPUTE_TEMPLATES,
  canonicalizeCategoryTitle,
  canonicalizeTemplateName,
} from "../../src/safelane/denylists";

describe("canonicalizeCategoryTitle", () => {
  it("strips the Category: prefix, folds underscores, uppercases first letter only, trims, NFC", () => {
    expect(canonicalizeCategoryTitle("Category:Living people")).toBe("Living people");
    expect(canonicalizeCategoryTitle("category:living_people")).toBe("Living people");
    expect(canonicalizeCategoryTitle("  Living people  ")).toBe("Living people");
    // rest-of-title case is significant (MediaWiki rule): only the first letter is uppercased
    expect(canonicalizeCategoryTitle("living People")).toBe("Living People");
  });
  it("NFC-normalizes decomposed characters", () => {
    const decomposed = "Café people"; // e + combining acute
    expect(canonicalizeCategoryTitle(decomposed)).toBe("Café people".normalize("NFC"));
  });
});

describe("canonicalizeTemplateName", () => {
  it("strips Template: prefix, folds whitespace/underscores, first-letter upper", () => {
    expect(canonicalizeTemplateName("Template:POV")).toBe("POV");
    expect(canonicalizeTemplateName("template:pov")).toBe("POV".charAt(0) + "ov"); // "Pov"
  });
});

describe("denylist constants", () => {
  it("BLP set is canonical, non-empty, and within the clcategories 50-value ceiling", () => {
    expect(BLP_CATEGORIES.length).toBeGreaterThan(0);
    expect(BLP_CATEGORIES.length).toBeLessThanOrEqual(50); // R4-4 request ceiling
    for (const c of BLP_CATEGORIES) expect(canonicalizeCategoryTitle(c)).toBe(c); // already canonical
    expect(BLP_CATEGORIES).toContain("Living people");
  });
  it("dispute templates are canonical and non-empty", () => {
    expect(DISPUTE_TEMPLATES.length).toBeGreaterThan(0);
    for (const t of DISPUTE_TEMPLATES) expect(canonicalizeTemplateName(t)).toBe(t);
  });
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run test/safelane/denylists.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `src/safelane/denylists.ts`:

```ts
// ABOUTME: Safe-lane denylists (BLP categories, dispute templates) + MediaWiki title canonicalizers.
// ABOUTME: Constants are stored canonical; canonicalizers normalize API/wikitext tokens for exact matching.

/** Uppercase only the first character (MediaWiki first-letter rule; rest is case-sensitive). */
function upperFirst(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function canonicalize(raw: string, prefix: RegExp): string {
  const noPrefix = raw.replace(prefix, "");
  const folded = noPrefix.replace(/_/g, " ").replace(/\s+/g, " ").trim().normalize("NFC");
  return upperFirst(folded);
}

/** Canonicalize a category title to the form `clcategories` matches and our constants use. */
export function canonicalizeCategoryTitle(raw: string): string {
  return canonicalize(raw, /^\s*category:/i);
}

/** Canonicalize a template name (no namespace prefix) for wikitext matching. */
export function canonicalizeTemplateName(raw: string): string {
  return canonicalize(raw, /^\s*template:/i);
}

/** WP:BLPCAT machine signal — the hard-floor categories. Re-verify against live en.wikipedia on the
 *  compliance doc's review cadence; a rename here silently fail-OPENs (covered by the per-category gold cases). */
export const BLP_CATEGORIES: readonly string[] = [
  "Living people",
  "Possibly living people",
  "Year of birth missing (living people)",
  "Recent deaths",
];

/** Conservative dispute/maintenance templates (advisory). Extensible. */
export const DISPUTE_TEMPLATES: readonly string[] = [
  "POV",
  "Disputed",
  "Disputed inline",
  "Contradict",
  "Current",
  "BLP",
  "BLP sources",
];
```

- [ ] **Step 4: Run** the test → PASS. (If a constant fails the "already canonical" assertion, fix the *constant's* casing — that is the N1 guard working.)
- [ ] **Step 5: Commit + push.** `git commit -m "feat(safelane): BLP + dispute denylists and MediaWiki title canonicalizers"`

> **Pitfall note (N1/R4-3):** the constants ARE the floor. The "already canonical" assertions catch a typo'd constant in CI. Do not relax them.

### Task 1.3: Deterministic wikitext signal scan

**Files:**
- Create: `src/safelane/wikitext-signals.ts`
- Test: `test/safelane/wikitext-signals.test.ts`

Follow the **Per-Task Protocol**. Implements spec §4. Depends on Task 1.2.

- [ ] **Step 1: Write the failing test** `test/safelane/wikitext-signals.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { scanWikitextSignals } from "../../src/safelane/wikitext-signals";

describe("scanWikitextSignals", () => {
  it("flags a literal BLP category", () => {
    expect(scanWikitextSignals("Foo.\n[[Category:Living people]]")).toContain("blp_wikitext");
  });
  it("flags dispute templates with whitespace/underscore/case tolerance", () => {
    expect(scanWikitextSignals("{{ POV }}\n{{disputed_inline}}")).toEqual(
      expect.arrayContaining(["dispute_template:POV", "dispute_template:Disputed inline"])
    );
  });
  it("ignores signals inside HTML comments and <nowiki>", () => {
    expect(scanWikitextSignals("<!-- [[Category:Living people]] -->")).toEqual([]);
    expect(scanWikitextSignals("<nowiki>{{POV}}</nowiki>")).toEqual([]);
  });
  it("does NOT do infobox-name matching (intentionally excluded — spec §4)", () => {
    expect(scanWikitextSignals("{{Infobox person|name=X}}")).toEqual([]);
  });
  it("returns [] for clean non-bio wikitext", () => {
    expect(scanWikitextSignals("The rover will launch in 2017. [[Category:Spacecraft]]")).toEqual([]);
  });
  it("emits dispute codes in sorted order and deduplicated", () => {
    expect(scanWikitextSignals("{{POV}} {{POV}} {{Current}}")).toEqual([
      "dispute_template:Current",
      "dispute_template:POV",
    ]);
  });
  it("is robust to malformed/unclosed markup on untrusted input (no catastrophic backtracking)", () => {
    // bounded length classes keep this linear; must return promptly with no match
    expect(scanWikitextSignals("{{" + "a".repeat(100000))).toEqual([]);
    expect(scanWikitextSignals("[[Category:" + "b".repeat(100000))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** → FAIL (module missing).
- [ ] **Step 3: Implement** `src/safelane/wikitext-signals.ts`:

```ts
// ABOUTME: Deterministic advisory scan of revision wikitext for safe-lane signals (BLP literal, dispute templates).
// ABOUTME: Strips comments/nowiki first so they cannot hide a live signal; no infobox-name matching (spec §4).
import { BLP_CATEGORIES, DISPUTE_TEMPLATES, canonicalizeCategoryTitle, canonicalizeTemplateName } from "./denylists";

const BLP_SET = new Set(BLP_CATEGORIES.map(canonicalizeCategoryTitle));
const DISPUTE_SET = new Set(DISPUTE_TEMPLATES.map(canonicalizeTemplateName));

function strip(wikitext: string): string {
  return wikitext
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<nowiki>[\s\S]*?<\/nowiki>/gi, " ");
}

/** Returns advisory reason codes found in the (stripped) wikitext, sorted + deduped. */
export function scanWikitextSignals(wikitext: string): string[] {
  const text = strip(wikitext);
  const codes = new Set<string>();

  // (a) literal BLP-set category links: [[Category:<title>]]. Length-capped + newline-excluded
  // so untrusted wikitext (G15) can't trigger quadratic scanning on a long unclosed run.
  for (const m of text.matchAll(/\[\[\s*category:([^\]|\n]{1,255})(?:\|[^\]\n]*)?\]\]/gi)) {
    if (BLP_SET.has(canonicalizeCategoryTitle("Category:" + m[1]))) codes.add("blp_wikitext");
  }
  // (b) dispute templates: {{<name>...}}. Same bounding — template names are short and single-line.
  for (const m of text.matchAll(/\{\{\s*([^}|\n]{1,100}?)\s*(?:\||\}\})/g)) {
    const name = canonicalizeTemplateName(m[1]);
    if (DISPUTE_SET.has(name)) codes.add(`dispute_template:${name}`);
  }

  return [...codes].sort();
}
```

- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit + push.** `git commit -m "feat(safelane): deterministic advisory wikitext signal scan (BLP literal + dispute templates)"`

**After completing Phase 1:** Review the batch from multiple perspectives (correctness of canonicalization vs the live-API shapes in the spec's evidence; regex linearity/backtracking; comment-stripping order). Minimum 3 review rounds; if round 3 still finds issues, keep going until clean.

---

## Phase 2 — The gate (`evaluateEligibility`)

**Execution Status:** ⬜ NOT STARTED

### Task 2.1: The pure eligibility gate

**Files:**
- Create: `src/safelane/eligibility.ts`
- Test: `test/safelane/eligibility.test.ts`

Follow the **Per-Task Protocol**. Implements spec §2 (checks 1–6, canonical reason order, freshness). Depends on Tasks 1.1–1.3.

- [ ] **Step 1: Write the failing test** `test/safelane/eligibility.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { evaluateEligibility, GATE_VERSION, FRESHNESS_WINDOW_MS } from "../../src/safelane/eligibility";
import type { ArticleMetadata } from "../../src/domain/types";

const NOW = new Date("2026-06-06T00:00:00.000Z");
const OLD = "2026-06-01T00:00:00.000Z"; // 5 days old — outside freshness window

function meta(over: Partial<ArticleMetadata> = {}): ArticleMetadata {
  return {
    resolvedPageId: 1, resolvedTitle: "X", revisionId: 10, revisionTimestamp: OLD,
    namespace: 0, blpProbe: "absent", wikitext: "A clean sentence. [[Category:Spacecraft]]",
    fetchedAt: NOW.toISOString(), ...over,
  };
}
const ev = (m: ArticleMetadata) => evaluateEligibility(m, NOW, GATE_VERSION);

describe("evaluateEligibility", () => {
  it("easy_win when every check passes", () => {
    expect(ev(meta())).toEqual({ eligibility: "easy_win", reasons: [] });
  });
  it("blp_category when the probe is present (the hard floor)", () => {
    expect(ev(meta({ blpProbe: "present" }))).toEqual({ eligibility: "human_only", reasons: ["blp_category"] });
  });
  it("metadata_unavailable when the probe is unknown (fail-closed)", () => {
    expect(ev(meta({ blpProbe: "unknown" }))).toEqual({ eligibility: "human_only", reasons: ["metadata_unavailable"] });
  });
  it("non_mainspace for namespace != 0", () => {
    expect(ev(meta({ namespace: 1 }))).toEqual({ eligibility: "human_only", reasons: ["non_mainspace"] });
  });
  it("recently_edited when the revision is within the freshness window", () => {
    const fresh = new Date(NOW.getTime() - FRESHNESS_WINDOW_MS + 1000).toISOString();
    expect(ev(meta({ revisionTimestamp: fresh }))).toEqual({ eligibility: "human_only", reasons: ["recently_edited"] });
  });
  it("blp_wikitext (advisory) when wikitext has a literal BLP category", () => {
    expect(ev(meta({ wikitext: "[[Category:Living people]]" }))).toEqual({ eligibility: "human_only", reasons: ["blp_wikitext"] });
  });
  it("dispute_template advisory codes", () => {
    expect(ev(meta({ wikitext: "{{POV}}" }))).toEqual({ eligibility: "human_only", reasons: ["dispute_template:POV"] });
  });
  it("emits reasons in canonical order when multiple fire", () => {
    const m = meta({ namespace: 2, blpProbe: "present", wikitext: "{{POV}} [[Category:Living people]]",
                     revisionTimestamp: new Date(NOW.getTime() - 1000).toISOString() });
    expect(ev(m).reasons).toEqual(["non_mainspace", "blp_category", "recently_edited", "blp_wikitext", "dispute_template:POV"]);
  });
});
```

- [ ] **Step 2: Run** → FAIL (module missing).
- [ ] **Step 3: Implement** `src/safelane/eligibility.ts`:

```ts
// ABOUTME: Pure, total, clock-free safe-lane gate — maps article metadata to easy_win/human_only + reason codes.
// ABOUTME: Fail-closed floor (BLP probe, namespace, freshness, indeterminate) + one-way advisory wikitext signals.
import type { ArticleMetadata, EligibilityDecision } from "../domain/types";
import { scanWikitextSignals } from "./wikitext-signals";

export const GATE_VERSION = "1.0.0";
export const FRESHNESS_WINDOW_MS = 15 * 60 * 1000; // 15 minutes — category-lag backstop (spec §7)

const FLOOR_ORDER = ["metadata_unavailable", "non_mainspace", "blp_category", "recently_edited"] as const;

/** Deterministic eligibility verdict. `now` is injected (clock-free gate); gateVersion is recorded by callers. */
export function evaluateEligibility(meta: ArticleMetadata, now: Date, _gateVersion: string): EligibilityDecision {
  const floor = new Set<string>();
  if (meta.blpProbe === "unknown") floor.add("metadata_unavailable");
  if (meta.namespace !== 0) floor.add("non_mainspace");
  if (meta.blpProbe === "present") floor.add("blp_category");
  if (now.getTime() - new Date(meta.revisionTimestamp).getTime() < FRESHNESS_WINDOW_MS) floor.add("recently_edited");

  const advisory = scanWikitextSignals(meta.wikitext); // sorted, deduped advisory codes
  // Canonical order: floor codes in FLOOR_ORDER, then blp_wikitext, then sorted dispute_template:*
  const ordered: string[] = FLOOR_ORDER.filter(c => floor.has(c));
  if (advisory.includes("blp_wikitext")) ordered.push("blp_wikitext");
  ordered.push(...advisory.filter(c => c.startsWith("dispute_template:")).sort());

  return { eligibility: ordered.length === 0 ? "easy_win" : "human_only", reasons: ordered };
}
```

- [ ] **Step 4: Run** → PASS. (Note: `_gateVersion` is unused by the pure verdict but part of the signature so callers thread it into the audit; keep the param.)
- [ ] **Step 5: Commit + push.** `git commit -m "feat(safelane): pure fail-closed eligibility gate with canonical reason ordering"`

**After completing Phase 2:** 3+ review rounds — check the freshness boundary (strictly `<` window), the canonical order vs the spec table, and that NO advisory signal can ever flip a `human_only` back to `easy_win` (one-way).

---

## Phase 3 — Ingest atomic metadata call + frozen gold envelopes

**Execution Status:** ⬜ NOT STARTED

### Task 3.1: Extend `fetchArticle` to one atomic metadata call

**Files:**
- Modify: `src/ingest/wikimedia.ts` (extend the query + the `FetchedArticle` shape + mapping)
- Test: `test/ingest/wikimedia.test.ts` (extend; keep existing cases green)

Follow the **Per-Task Protocol**. Implements spec §5. Depends on Task 1.2 (BLP_CATEGORIES + canonicalizer).

**Context for a fresh reader:** `test/ingest/wikimedia.test.ts` already has a `stubFetch(body, opts?) => { fetchFn, calls }` helper (records each request's `url` + `headers`, returns the canned `body` from `res.json()`) and an `okBody()` helper for the OLD content-only shape. **`okMetaBody` below is a NEW helper** for the combined shape; add it alongside `okBody`. Reuse the existing `stubFetch`.

- [ ] **Step 1: Write the failing tests** (add to `test/ingest/wikimedia.test.ts`):

```ts
// new okBody adds ns, timestamp, and clcategories-filtered categories:
const okMetaBody = (over: Record<string, unknown> = {}) => ({
  query: { pages: [{
    pageid: 30034, ns: 0, title: "Tim Berners-Lee",
    revisions: [{ revid: 999, parentid: 1, timestamp: "2020-01-01T00:00:00Z",
                  slots: { main: { content: "Lead. [[Category:Living people]]" } } }],
    categories: [{ ns: 14, title: "Category:Living people" }], // clcategories match present
    ...over,
  }] },
});

it("requests the combined metadata call with a canonical clcategories BLP probe", async () => {
  const { fetchFn, calls } = stubFetch(okMetaBody());
  await fetchArticle("Tim Berners-Lee", { fetchFn });
  const p = new URL(calls[0].url).searchParams;
  expect(p.get("prop")).toBe("revisions|categories|info");
  expect(p.get("rvprop")).toBe("content|ids|timestamp");
  expect(p.get("clcategories")).toContain("Category:Living people");
});

it("maps namespace, revisionTimestamp, blpProbe=present, and a fetchedAt", async () => {
  const { fetchFn } = stubFetch(okMetaBody());
  const a = await fetchArticle("Tim Berners-Lee", { fetchFn });
  expect(a.namespace).toBe(0);
  expect(a.revisionTimestamp).toBe("2020-01-01T00:00:00Z");
  expect(a.blpProbe).toBe("present");
  expect(typeof a.fetchedAt).toBe("string");
});

it("blpProbe=absent when the page has no clcategories matches", async () => {
  const { fetchFn } = stubFetch(okMetaBody({ categories: undefined }));
  expect((await fetchArticle("X", { fetchFn })).blpProbe).toBe("absent");
});

it("blpProbe=unknown when the response carries a clcategories warning (indeterminate)", async () => {
  const body = { ...okMetaBody({ categories: undefined }), warnings: { categories: { "*": "too many values" } } };
  const { fetchFn } = stubFetch(body);
  expect((await fetchArticle("X", { fetchFn })).blpProbe).toBe("unknown");
});
```

**⚠ Update — not "keep green" — two EXISTING assertions in `wikimedia.test.ts`.** The persistence-slice test "requests the Action API with the documented params" currently asserts `p.get("prop")` === `"revisions"` and `p.get("rvprop")` === `"content|ids"`. The combined call changes both, so **edit those two assertions** to `expect(p.get("prop")).toBe("revisions|categories|info")` and `expect(p.get("rvprop")).toBe("content|ids|timestamp")`. All other existing assertions/cases stay; `FetchedArticle` is a superset so the rest pass unchanged. (This is an additive-mapping change to a serialization-ish contract — DB-2 mindset: shape the mapping by the stricter consumer.)

- [ ] **Step 2: Run** → FAIL (new fields/params absent; the two edited assertions now fail until implemented).
- [ ] **Step 3: Implement** the extension in `src/ingest/wikimedia.ts`:
  - Extend `FetchedArticle` with `namespace: number; revisionTimestamp: string; blpProbe: "present"|"absent"|"unknown"; fetchedAt: string;`.
  - In `buildUrl`, set `prop=revisions|categories|info`, `rvprop=content|ids|timestamp`, and `clcategories=<BLP_CATEGORIES mapped through canonicalizeCategoryTitle, each prefixed "Category:", joined with "|">`. Import `BLP_CATEGORIES`, `canonicalizeCategoryTitle` from `../safelane/denylists`.
  - **Extract two reusable, exported helpers** (single parsing path — DRY; Task 4.1 and Task 5.1 both import them, no parallel copies):
    - `mapResponseToMetadata(body: MwResponse, fetchedAt: string): FetchedArticle` — does ALL the response→fields parsing and returns the full `FetchedArticle` (incl. `fetchedAt`). `fetchArticle` runs its error guards on the response, then returns `mapResponseToMetadata(body, fetchedAt)`.
    - `toArticleMetadata(f: FetchedArticle): ArticleMetadata` — the trivial rename bridge (`pageId`→`resolvedPageId`, `title`→`resolvedTitle`; carry `revisionId`, `revisionTimestamp`, `namespace`, `blpProbe`, `wikitext`, `fetchedAt`). This is the ONLY place the rename lives.
  - Capture `const fetchedAt = new Date().toISOString();` at response-parse time (this `new Date()` is in the INGEST, allowed — the determinism rule applies only to `src/safelane/*`).
  - Parse `ns` (`page.ns`), `revisionTimestamp` (`revision.timestamp`).
  - `blpProbe`: `"unknown"` if `body.warnings?.categories` exists OR the `categories` field is present-but-malformed (not an array of `{title}`); else `"present"` if `Array.isArray(page.categories) && page.categories.length > 0`, else `"absent"`.
  - Keep all existing typed errors (`ArticleNotFoundError`, `WikimediaUnavailableError`, `WikimediaResponseError`) and the missing-content guards. Update the `MwPage`/`MwResponse` interfaces with `ns?`, `timestamp?`, `categories?`, top-level `warnings?`.

- [ ] **Step 4: Run** the full `wikimedia.test.ts` → PASS (old, edited, and new).
- [ ] **Step 5: Commit + push.** `git commit -m "feat(ingest): atomic combined metadata fetch (categories|info + clcategories BLP probe, timestamp, ns)"`

> **Pitfall note (R4-1):** all metadata MUST come from the SAME response's `pages[0]`. Do NOT add a second fetch for categories. The `clcategories` BLP set is small (≤50), so it never paginates.

### Task 3.2: Capture + commit frozen gold API envelopes

**Files:**
- Create: `test/gold/eligibility-set.json` (committed frozen envelopes + expected verdicts)
- (Throwaway, deleted before commit): a `capture_*.ts` script run via `npx tsx`

Follow the **Per-Task Protocol** (the "test" here is the gold data the Phase-5 test consumes; this task produces the data + a README note). Implements spec §8. Network is used ONCE at authoring time, then frozen.

- [ ] **Step 1:** Write a throwaway `npx tsx` script that issues the SAME combined request `fetchArticle` builds, against live en.wikipedia (descriptive UA, maxlag), for: a hidden-`Living people` BLP (e.g. `Tim Berners-Lee`); a clearly-living person in a different BLP category if available; a non-BLP from the existing corpus (`Artemis program`); a non-mainspace title (e.g. `Wikipedia:Sandbox` or a `Category:` page). Save **the full response body** (`{ query: { pages: [...] }, warnings?: ... }`) for each — NOT just `pages[0]` — because `mapResponseToMetadata` consumes the whole body.
- [ ] **Step 2:** Assemble `test/gold/eligibility-set.json` as `{ goldNow: "<ISO>", entries: [{ name, rawResponse, expected: { eligibility, reasons } }] }`. Use a SINGLE top-level `goldNow` (pick a value ≥15 min AFTER every captured envelope's revision timestamp — e.g. one day after capture — so none of the real captures trip freshness). Add **synthetic** entries (hand-authored envelopes, no network) for: an indeterminate-membership `unknown` case (a response with a **valid** `pages[0]` — pageid, title, ns:0, a revision with `timestamp` + `slots.main.content` — PLUS a top-level `warnings.categories`, so the mapper reads content fine but sets `blpProbe:"unknown"`); and a **recently-edited** case (an envelope whose `revisions[0].timestamp` is within 15 min BEFORE `goldNow`, so freshness fires). Each entry's `expected` is computed by hand from spec §2 and will be re-derived by the test against `goldNow`.
- [ ] **Step 3:** Add a short provenance note to `test/gold/README.md` (or create it) describing capture date, the request shape, and that envelopes are frozen (never re-fetched in tests).
- [ ] **Step 4:** Delete the throwaway script; `git status` clean except the gold JSON + README.
- [ ] **Step 5: Commit + push.** `git commit -m "test(safelane): frozen gold API envelopes for the eligibility gate"`

> **Pitfall note (testing-pitfalls §9 / R2-10):** store RAW response envelopes, not pre-cleaned fields. The Phase-5 test maps them through the real ingest mapper so the probe/normalization paths are exercised, and the composition guard asserts shape coverage.

**After completing Phase 3:** 3+ review rounds — confirm the request shape in Task 3.1 exactly matches what Task 3.2 captured, and that the `unknown`/recently-edited synthetic envelopes are realistic.

---

## Phase 4 — Wiring (orchestrator, API, UI)

**Execution Status:** ⬜ NOT STARTED

### Task 4.1: Compute + return + audit eligibility in `lookupAndPersist`

**Files:**
- Modify: `src/ingest/lookup.ts` (build `ArticleMetadata`, call gate, extend `LookupResult`, audit event)
- Test: `test/ingest/lookup.test.ts` (extend; update the existing fixture fetch to the combined shape)

Follow the **Per-Task Protocol**. Implements spec §6. Depends on Phases 2 + 3.

**⚠ Two EXISTING-test updates required (not "keep green"):**
1. The existing `fixtureFetch` must return the combined envelope — add `ns: 0`, `revisions[0].timestamp: "2020-01-01T00:00:00Z"` (a FIXED OLD date so freshness never fires), and NO `categories` (→ `blpProbe: "absent"`).
2. The existing test **"writes exactly one identifiers-only audit row"** asserts `rows` has length 1. This task adds a SECOND audit event (`article.eligibility`), so that assertion now fails. **Change it** to assert exactly one `article.lookup` row (`rows.filter(r => r.eventType === "article.lookup")` has length 1) rather than total length 1.
3. Every existing lookup test that calls `lookupAndPersist` MUST pass a fixed `now` (e.g. `now: new Date("2026-06-06T00:00:00Z")`) so the freshness check is deterministic — do NOT rely on the real wall-clock (testing-pitfalls §7).

**Fixture cleanliness (verified):** the `artemis_program.wikitext` fixture contains NONE of the denylisted dispute templates and NO literal BLP category, so the `easy_win` test's `reasons === []` holds. If you swap the fixture, re-verify with `grep -iE "\{\{ *(POV|Disputed|Contradict|Current|BLP)" <fixture>` and `grep -iE "\[\[ *category: *living people" <fixture>` — or the assertion legitimately changes.

- [ ] **Step 1: Write failing tests** (add to `test/ingest/lookup.test.ts`), after applying the existing-test updates above:

```ts
it("returns easy_win for a non-BLP article and logs an article.eligibility audit row", async () => {
  const exec = freshTestExecutor();
  const result = await lookupAndPersist(exec, "Artemis program", { fetchFn: fixtureFetch, asOfYear: AS_OF, now: new Date("2026-06-06T00:00:00Z") });
  expect(result.eligibility).toBe("easy_win");
  expect(result.reasons).toEqual([]);
  const rows = await makeAuditLog(exec).read();
  const elig = rows.find(r => r.eventType === "article.eligibility");
  expect(elig).toBeTruthy();
  expect(elig!.payload).toMatchObject({ pageId: PAGE_ID, eligibility: "easy_win", gateVersion: expect.any(String) });
  // identifiers/codes only — no title/content
  expect(JSON.stringify(elig!.payload)).not.toMatch(/Artemis|will|expected/);
});

it("returns human_only(blp_category) for a BLP envelope", async () => {
  const blpFetch: FetchLike = async () => ({ ok: true, status: 200, json: async () => ({
    query: { pages: [{ pageid: 30034, ns: 0, title: "Tim Berners-Lee",
      revisions: [{ revid: 999, parentid: 1, timestamp: "2020-01-01T00:00:00Z",
        slots: { main: { content: "Lead. [[Category:Living people]]" } } }],
      categories: [{ ns: 14, title: "Category:Living people" }] }] } }) });
  const exec = freshTestExecutor();
  const result = await lookupAndPersist(exec, "Tim Berners-Lee", { fetchFn: blpFetch, asOfYear: AS_OF, now: new Date("2026-06-06T00:00:00Z") });
  expect(result.eligibility).toBe("human_only");
  expect(result.reasons).toContain("blp_category");
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** in `src/ingest/lookup.ts`:
  - Add `now?: Date` to `LookupOptions` (default `new Date()` — app-layer clock, allowed; the gate stays clock-free). Import `toArticleMetadata` from `./wikimedia`, `evaluateEligibility`, `GATE_VERSION` from `../safelane/eligibility`.
  - After `fetchArticle` returns `fetched: FetchedArticle`, build `const meta = toArticleMetadata(fetched);` (do NOT hand-rename inline — use the helper).
  - `const decision = evaluateEligibility(meta, options.now ?? new Date(), GATE_VERSION);`
  - Extend `LookupResult` with `eligibility: EligibilityDecision["eligibility"]` and `reasons: string[]`.
  - Audit (identifiers/codes only — R2-6/R4-7), reading fields from `fetched`/`decision`:
    `await makeAuditLog(db).append({ actor: "system", eventType: "article.eligibility", payload: { pageId: fetched.pageId, revisionId: fetched.revisionId, namespace: fetched.namespace, blpProbe: fetched.blpProbe, recentlyEdited: decision.reasons.includes("recently_edited"), reasons: decision.reasons, fetchedAt: fetched.fetchedAt, gateVersion: GATE_VERSION, probeFired: fetched.blpProbe === "present", wikitextFired: decision.reasons.some(r => r === "blp_wikitext" || r.startsWith("dispute_template:")) } });`
  - Return `{ ...existing fields, eligibility: decision.eligibility, reasons: decision.reasons }`.
  - Keep the existing `article.lookup` audit event; this ADDS a second `article.eligibility` event (hence the existing "exactly one row" test update above).

- [ ] **Step 4: Run** the full `lookup.test.ts` → PASS (update the existing fixture fetch shape as noted).
- [ ] **Step 5: Commit + push.** `git commit -m "feat(ingest): compute + return + audit safe-lane eligibility in the lookup path"`

### Task 4.2: Surface eligibility in the API response + UI banner

**Files:**
- Modify: `src/app/api/articles/lookup/route.ts` (verify it passes `eligibility`/`reasons` through — it serializes the whole `LookupResult`, so likely no change beyond a type check)
- Modify: `src/app/page.tsx` (add the eligibility banner + reasons)
- Test: none new (route + UI are excluded from coverage; logic is covered in 4.1). Verify via `tsc` + `lint` + a manual render check.

Follow the **Per-Task Protocol** (TDD N/A for the UI shell; rely on tsc/lint + the 4.1 logic tests).

- [ ] **Step 1:** Extend the `LookupResult` client interface in `page.tsx` with `eligibility: "easy_win" | "human_only"` and `reasons: string[]`.
- [ ] **Step 2:** Render a banner above the candidate list: green "Eligible for the easy-win lane" when `easy_win`; amber "Human-only — excluded" + the human-readable reasons when `human_only`. Map ALL six reason codes the gate can emit (spec §2 table — do NOT invent new codes) to short labels: `blp_category` → "biography of a living person", `non_mainspace` → "not a main-namespace article", `recently_edited` → "edited very recently", `metadata_unavailable` → "metadata could not be confirmed", `blp_wikitext` → "living-person category in source", `dispute_template:<x>` → "dispute/maintenance tag: <x>". For an unrecognized code, fall back to showing the raw code (so a future added code never renders blank).
- [ ] **Step 3:** `pnpm exec tsc --noEmit` + `pnpm lint` → clean. Confirm `route.ts` already returns the full result (no logic change needed; if it reshapes the payload, add the fields).
- [ ] **Step 4: Commit + push.** `git commit -m "feat(ui): show safe-lane eligibility verdict + reasons on the lookup page"`

**After completing Phase 4:** 3+ review rounds — verify the audit payload is strictly identifiers/codes (no PII), the `LookupResult` shape is consistent end-to-end, and the UI reason labels cover every reason code the gate can emit.

---

## Phase 5 — Gold-set integration test + composition guard

**Execution Status:** ⬜ NOT STARTED

### Task 5.1: Eligibility gold-set test over frozen envelopes

**Files:**
- Create: `test/safelane/eligibility-gold.test.ts`
- Uses: `test/gold/eligibility-set.json` (Task 3.2) + the real ingest mapper (Task 3.1) + the gate (Task 2.1)

Follow the **Per-Task Protocol**. Implements spec §8. **Depends on Phases 2 + 3 only** (the gate from 2.1, the `mapResponseToMetadata`/`toArticleMetadata` helpers from 3.1, and the gold envelopes from 3.2); it does NOT depend on Phase 4 (lookup/UI) and MAY run concurrently with Phase 4.

- [ ] **Step 1: Write the test** `test/safelane/eligibility-gold.test.ts`:
  - Load `test/gold/eligibility-set.json`; parse its `goldNow`. For each entry: `const meta = toArticleMetadata(mapResponseToMetadata(entry.rawResponse, "2026-06-06T00:00:00Z"))` (BOTH helpers exported from `wikimedia.ts` in Task 3.1 — import them; do NOT re-implement the parsing or the rename), then call `evaluateEligibility(meta, new Date(goldNow), GATE_VERSION)` and assert it deep-equals `entry.expected`.
  - **Composition guard:** assert the set contains ≥1 of each shape: `blpProbe:"present"`, definitive `"absent"`, `"unknown"`, `namespace !== 0`, and a recently-edited case; AND ≥3 `human_only` AND ≥3 `easy_win` expected verdicts. Fail loudly if any shape is missing (R2-10).
  - Add an in-test NOTE: this gate measures the labeled gold set (a regression gate), not production precision; known residual fail-OPENs are documented in spec §9 and the compliance change log.
- [ ] **Step 2: Run** → it should pass against the committed envelopes (the gate + mapper already exist from Tasks 2.1/3.1). If an `expected` was mis-derived by hand, re-derive it from spec §2 — do NOT change the gate to fit a wrong label without re-checking the spec (testing-pitfalls §9: never game the gate).
- [ ] **Step 3:** Verify the composition guard actually bites: temporarily delete one shape (e.g. the `unknown` entry) and confirm the guard FAILS, then restore it. (Do not commit the deletion.)
- [ ] **Step 4:** Full gate trio green + pristine.
- [ ] **Step 5: Commit + push.** `git commit -m "test(safelane): gold-set integration test + shape-coverage composition guard"`

**After completing Phase 5:** 3+ review rounds — confirm the gold envelopes are raw (not pre-cleaned), the composition guard actually fails when a shape is removed (probe it), and the residual fail-OPENs from spec §9 are represented or explicitly noted as out-of-suite.

---

## Final integration

- [ ] After Phase 5: run the FULL suite + `tsc` + `lint` once more; confirm pristine.
- [ ] Rebase the branch onto the latest `origin/dev` (PR #11 persistence + PR #12 hook are already merged there); resolve any conflict in `lookup.ts`/`wikimedia.ts`/`page.tsx` by re-running the gate trio.
- [ ] Open a PR to `dev` with a `## Merge classification` of **Review — architecture/compliance** (touches the G11 compliance floor, a new external-API metadata fetch, and the public lookup contract). Link the design spec + the 5-round review trail + the compliance change-log entry.
- [ ] Do NOT self-merge — this is a compliance-floor change for Sam's review.

---

## Self-Review (author checklist — completed at write time)

**Spec coverage:** §2 gate → Task 2.1; §3 denylists/canonicalizer → Task 1.2; §4 wikitext scan → Task 1.3; §5 ingest atomic call → Task 3.1; §6 wiring/audit/no-persist → Task 4.1/4.2; §7 freshness → Task 2.1 (check #4) + 1.2 constant; §8 gold set → Task 3.2 + 5.1; §9 residuals → documented (compliance change log already updated; surfaced in the 5.1 NOTE); §10 compliance mapping → honored across tasks; §11 module layout → matches the Files lists. No uncovered section.

**Placeholder scan:** no TBD/TODO; every code step shows code; commands are concrete.

**Type consistency:** `ArticleMetadata`/`EligibilityDecision` (1.1) used identically in 2.1, 4.1, 5.1; `FetchedArticle` superset (3.1) consumed by 4.1; `evaluateEligibility(meta, now, gateVersion)` signature consistent; `GATE_VERSION`/`FRESHNESS_WINDOW_MS` defined once in 2.1 and imported.

**Cross-task conflicts:** `lookup.ts` touched only in 4.1; `wikimedia.ts` only in 3.1 (its exported `mapResponseToMetadata`/`toArticleMetadata` are consumed — not edited — by 4.1 and 5.1); `page.tsx` only in 4.2; `domain/types.ts` only in 1.1. No two parallel tasks edit the same file.

**Type seam:** `FetchedArticle` (ingest output, `pageId`/`title`) → `ArticleMetadata` (gate input, `resolvedPageId`/`resolvedTitle`) via the single `toArticleMetadata` helper (3.1), used by both 4.1 and 5.1. `mapResponseToMetadata` is the single body→`FetchedArticle` parser, used by `fetchArticle` (4.x path) and the gold test (5.1).
