# Wikipedia Links + Article Context (PR-C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Wikipedia references clickable across the app — article titles and section headings become deep links — and give the worksheet a human-readable, linked article title instead of only an opaque page id.

**Architecture:** A pure, unit-tested `src/wikipedia/article-url.ts` builds current-article + section-anchor URLs; the easy-win lane, article page, and worksheet consume it. The worksheet also gains the article `title` via one extra column in an existing query in `loadWorksheetView`.

**Tech Stack:** Next.js 16.2.6, TypeScript, vitest (Node pool). Independent of PR-A/PR-B; branch off `dev`.

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
cheap; reconstruction by downstream readers is expensive.

## Global Constraints

From [2026-07-13-wikipedia-links-and-article-context-design.md](../design/2026-07-13-wikipedia-links-and-article-context-design.md).

- **Link the CURRENT article only** — `https://en.wikipedia.org/wiki/<title>` and `…#<section>`. NEVER a revision-pinned URL (`?oldid=…`). Section-anchor drift degrades gracefully to top-of-article (Sam's decision: "having to scroll a little is fine; stale article link is not").
- **One shared helper** — do not inline URL construction in three places; the anchor encoding lives once, tested once.
- All generated links: `target="_blank" rel="noopener noreferrer"`, existing iron-gall link styling.
- **Merge:** **Routine** (presentation + a one-column read; no auth, no destructive op, no schema change). `/codex` review, then Claude merges on green CI.

---

## Execution Status

**Overall:** ✅ All phases implemented 2026-07-18 on branch `feat/wikipedia-links` (off `origin/dev` 57f3666). Full verification green (vitest 956 + 30 workers, tsc, eslint, build). PR to `dev` tracked below.

| Phase | Status | Ship SHA(s) | Notes |
|---|---|---|---|
| 1 — URL helper | ✅ Shipped 2026-07-18 | 13d6275 | pure, TDD |
| 2 — Worksheet linked title | ✅ Shipped 2026-07-18 | 00ae20f | loader +title column |
| 3 — Link queue + article page | ✅ Shipped 2026-07-18 | f91bddc | presentation + onKeyDown guard |

---

## Phase 1 — Shared Wikipedia URL helper

**Execution Status:** ✅ SHIPPED 2026-07-18 — 13d6275 (red run observed, then green; tsc clean)

**Files:** Create `src/wikipedia/article-url.ts` + `test/wikipedia/article-url.test.ts`.

**Interfaces (Produces):**
- `wikipediaArticleUrl(title: string): string`
- `wikipediaSectionUrl(title: string, sectionHeading: string): string`

**BEFORE starting:** invoke `/superpowers:test-driven-development`.

- [x] **Step 1: Write the failing test** (`test/wikipedia/article-url.test.ts`):
```ts
// ABOUTME: Unit tests for the Wikipedia URL helpers — current-article + section-anchor construction, encoding, edge cases.
import { describe, it, expect } from "vitest";
import { wikipediaArticleUrl, wikipediaSectionUrl } from "../../src/wikipedia/article-url";

describe("wikipediaArticleUrl", () => {
  it("builds a current-article URL with spaces as underscores", () => {
    expect(wikipediaArticleUrl("California High-Speed Rail")).toBe("https://en.wikipedia.org/wiki/California_High-Speed_Rail");
  });
  it("leaves a single-word title intact", () => {
    expect(wikipediaArticleUrl("Artemis")).toBe("https://en.wikipedia.org/wiki/Artemis");
  });
  it("percent-encodes characters that would break the URL but keeps _ - .", () => {
    expect(wikipediaArticleUrl("Foo & Bar")).toBe("https://en.wikipedia.org/wiki/Foo_%26_Bar");
  });
  it("keeps an ASCII apostrophe literal (encodeURIComponent does not encode it)", () => {
    expect(wikipediaArticleUrl("People's Republic")).toBe("https://en.wikipedia.org/wiki/People's_Republic");
  });
});

describe("wikipediaSectionUrl", () => {
  it("appends a section anchor with spaces as underscores", () => {
    expect(wikipediaSectionUrl("California High-Speed Rail", "Past cost estimates"))
      .toBe("https://en.wikipedia.org/wiki/California_High-Speed_Rail#Past_cost_estimates");
  });
  it("returns the bare article URL when the section is empty", () => {
    expect(wikipediaSectionUrl("Artemis", "")).toBe("https://en.wikipedia.org/wiki/Artemis");
  });
});
```
- [x] **Step 2: Run — expect FAIL.** `node_modules/.bin/vitest run test/wikipedia/article-url.test.ts`
- [x] **Step 3: Implement** (`src/wikipedia/article-url.ts`):
```ts
// ABOUTME: Pure builders for links to the CURRENT English Wikipedia article + section anchor (never a revision-pinned URL).
// ABOUTME: Section-anchor drift (heading renamed since detection) degrades to top-of-article — acceptable per design.
const BASE = "https://en.wikipedia.org/wiki/";

/** MediaWiki-style token: spaces → underscores, then percent-encode. encodeURIComponent keeps _ - . intact. */
function toToken(text: string): string {
  return encodeURIComponent(text.trim().replace(/ /g, "_"));
}

export function wikipediaArticleUrl(title: string): string {
  return BASE + toToken(title);
}

export function wikipediaSectionUrl(title: string, sectionHeading: string): string {
  const url = wikipediaArticleUrl(title);
  return sectionHeading.trim() ? `${url}#${toToken(sectionHeading)}` : url;
}
```
- [x] **Step 4: Run — expect PASS.** Then `npx tsc --noEmit`.
- [x] **Step 5: Commit.**
```bash
git add src/wikipedia/article-url.ts test/wikipedia/article-url.test.ts
git commit -m "feat(wikipedia): article + section URL helpers"
```

---

## Phase 2 — Worksheet: linked article title

**Execution Status:** ✅ SHIPPED 2026-07-18 — 00ae20f (populated-title loader test red→green; worksheet tests 48 pass)

**Files:**
- Modify: `src/worksheet/load-worksheet-view.ts` (add `title` to the existing `articles` query + the returned claim)
- Modify: `src/worksheet/view-types.ts` (`ArticleClaimView.title`)
- Modify: `src/app/worksheet/[candidateId]/page.tsx` (render the linked title header + linked section)
- Modify: `test/worksheet/*` (extend the loader test for `title`)

**Interfaces:** `ArticleClaimView` gains `title: string | null` (null when no `articles` row exists — preserve the existing fallback).

- [x] **Step 1: Extend the loader (TDD).** In `src/worksheet/load-worksheet-view.ts`, change the articles query from `SELECT revision_id` to `SELECT revision_id, title` (typed row `{ revision_id: number; title: string }`), and add `title: articleRows.length > 0 ? articleRows[0].title : null` to the returned `claim`. Add/adjust a loader test asserting `view.claim.title` is **populated** when the `articles` row exists (find the existing loader test under `test/worksheet/`; mirror its D1 seeding — it already seeds an `articles` row because `stale_candidates.page_id` FK-references `articles`). **Do NOT test the `null` path** — a candidate with no article row is unseedable under the real FK (a `/codex` finding); the `null` in the ternary is kept only as defensive symmetry with the existing `revision_id` fallback, not a reachable state in tests. Run it red → implement → green.
- [x] **Step 2: Add the type field.** In `src/worksheet/view-types.ts`, add `title: string | null;` to `ArticleClaimView` (place it next to `pageId`). `npx tsc --noEmit` will flag the loader return until Step 1's field is present — keep them consistent.
- [x] **Step 3: Render the header.** In `src/app/worksheet/[candidateId]/page.tsx`, import the helpers and replace the `page … revision … § …` line + the generic "Research worksheet" h1 with a real header. Link the title and section **only when `title` is non-null** (a section link needs the title; without it, fall back to today's plain line):
```tsx
import { wikipediaArticleUrl, wikipediaSectionUrl } from "@/wikipedia/article-url";
// ...
{view.claim.title ? (
  <>
    <h1 className="font-serif text-2xl leading-snug text-ink-white" style={{ textWrap: "balance" }}>
      <a href={wikipediaArticleUrl(view.claim.title)} target="_blank" rel="noopener noreferrer" className="text-iron-gall underline-offset-2 hover:underline">
        {view.claim.title}
      </a>
    </h1>
    <p className="mt-2 font-mono text-xs text-dust-gray">
      page {view.claim.pageId} · revision {view.claim.sourceRevisionId} ·{" "}
      <a href={wikipediaSectionUrl(view.claim.title, view.claim.sectionHeading)} target="_blank" rel="noopener noreferrer" className="text-iron-gall underline-offset-2 hover:underline">
        § {view.claim.sectionHeading}
      </a>
    </p>
  </>
) : (
  <>
    <p className="font-mono text-xs text-dust-gray">
      page {view.claim.pageId} · revision {view.claim.sourceRevisionId} · § {view.claim.sectionHeading}
    </p>
    <h1 className="mt-3 font-serif text-2xl leading-snug text-ink-white" style={{ textWrap: "balance" }}>Research worksheet</h1>
  </>
)}
```
(Keep the existing `blockquote`/claim rendering below unchanged.)
- [x] **Step 4: Verify.** `node_modules/.bin/vitest run test/worksheet`, `npx tsc --noEmit`, `npx eslint src/worksheet/load-worksheet-view.ts src/worksheet/view-types.ts "src/app/worksheet/[candidateId]/page.tsx"`.
- [x] **Step 5: Commit.**
```bash
git add src/worksheet/load-worksheet-view.ts src/worksheet/view-types.ts "src/app/worksheet/[candidateId]/page.tsx" test/worksheet
git commit -m "feat(worksheet): show linked article title and section

loadWorksheetView selects the article title (already queried that table);
worksheet header links the title + section to the current Wikipedia
article. Falls back to the page-id line when no article row exists."
```

---

## Phase 3 — Link titles + sections in the easy-win lane and article page

**Execution Status:** ✅ SHIPPED 2026-07-18 — f91bddc (tsc + eslint clean; browser QA deferred to the dev preview deploy post-merge)

**Files:**
- Modify: `src/app/queue/page.tsx` (each `item.title` → article link; each candidate `§ sectionHeading` → section link)
- Modify: `src/app/articles/[id]/page.tsx` (`article.title` → article link; each candidate `§ sectionHeading` → section link)

**Testing note:** presentation only; `tsc`+`eslint`+browser QA (matches convention). The helper is unit-tested (Phase 1).

- [x] **Step 1: Easy-win lane.** In `src/app/queue/page.tsx`, import the helpers. Where each article group renders its `item.title`, wrap it in `<a href={wikipediaArticleUrl(item.title)} target="_blank" rel="noopener noreferrer" …>`. Where each candidate renders `§ {c.sectionHeading}` (the rounded chip), make it a link `<a href={wikipediaSectionUrl(item.title, c.sectionHeading)} …>§ {c.sectionHeading}</a>` (the section belongs to the item's article). Keep existing styling; add the link classes.
- [x] **Step 2: Article page.** In `src/app/articles/[id]/page.tsx`, wrap the `<h1>{article.title}</h1>` content in an article link, and turn each candidate's `§ {c.sectionHeading}` chip into a `wikipediaSectionUrl(article.title, c.sectionHeading)` link.
- [x] **Step 2b: Guard the queue keyboard handler (a `/codex` finding).** `queue/page.tsx`'s `onKeyDown` handles bubbled `Enter`/`Space` with `preventDefault()` + toggle, so pressing Enter on a new in-row Wikipedia link would toggle the candidate instead of following the link. At the very top of `onKeyDown`, ignore events from interactive elements:
```tsx
if ((e.target as HTMLElement).closest("a, button, input, select, textarea")) return;
```
(before the existing `if (flatCandidates.length === 0) return;`). Verify by keyboard: Enter on a title/section link opens it; Enter on a row still toggles.
- [x] **Step 3: Verify.** `npx tsc --noEmit`, `npx eslint src/app/queue/page.tsx "src/app/articles/[id]/page.tsx"`. Browser QA (any deploy): a lane title links to the right `/wiki/<title>`, a section chip lands on (or near) the right section, links open in a new tab.
- [x] **Step 4: Commit.**
```bash
git add src/app/queue/page.tsx "src/app/articles/[id]/page.tsx"
git commit -m "feat(web): link article titles and sections in easy-win lane and article page"
```

---

## Finalization

- [x] Full verification: `node_modules/.bin/vitest run` + `-c vitest.workers.config.mts`, `tsc`+`eslint` clean, `npm run build` OK.
- [ ] Open PR (base `dev`), `## Merge classification: Routine`. `/codex` review, then merge `--merge --delete-branch` on green CI.
- [ ] Ships to prod at the next dev→main release.

## Notes for the executor
- The one non-obvious bit: the worksheet loader ALREADY queries `articles` (for `revision_id`) — this is a one-column add, not a new query.
- Out of scope (design §2): the transparency page's missing article-context/back-link — a separate follow-up, not this PR.
- Section-anchor drift is expected and acceptable; do not try to "fix" it by pinning to a revision (that's the explicitly-rejected option).
