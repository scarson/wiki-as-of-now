<!-- ABOUTME: Design spec for making Wikipedia references clickable across the app — article titles and section headings become deep links, and the worksheet gains a human-readable article header instead of only an opaque page id. -->
<!-- ABOUTME: Read alongside src/app/queue/page.tsx, src/app/articles/[id]/page.tsx, src/app/worksheet/[candidateId]/page.tsx and src/worksheet/load-worksheet-view.ts (the one-column loader change). -->

# Wikipedia links + article context — design

**Status:** approved design (brainstorm complete), implementation plan to follow.
**Author:** Claude + Sam, 2026-07-13.
**Depends on:** nothing; independent of the auth-state and privacy PRs. Can land in any
order (it's the lowest-risk of the three — presentation + one data-loader column).

## 1. Why this exists

Across every surface that names a Wikipedia article or section, the name is dead text —
so a user who wants to read or edit the underlying article has to open a new tab and
search for it by hand. Worse, the **worksheet doesn't name the article at all**: it
shows only an opaque numeric page id (`page 65554259`), so you can't tell which article
you're researching without decoding it. This closes both gaps: name the article in
human-readable text, and make every Wikipedia reference a real link.

## 2. Audit — where Wikipedia references are unlinked today

| Surface | File | Today | Fix |
|---|---|---|---|
| Easy-win lane | `src/app/queue/page.tsx` | title & `§ section` plain | title → article; section → section anchor |
| Article page | `src/app/articles/[id]/page.tsx` | `article.title` shown, not linked; `§ section` plain | title → article; section anchors |
| Worksheet | `src/app/worksheet/[candidateId]/page.tsx` | **no title** (page id only); `§ section` plain | add linked title header; section anchor |

**Out of scope (optional follow-up):** the transparency page
(`/articles/[id]/transparency`) already links its source URLs; it lacks an article
title + back-link, but that's a navigation nicety, not an unlinked-reference bug.

## 3. The design

### 3.1 Shared URL helper (one place, unit-tested)

A pure module `src/wikipedia/article-url.ts` (mirrors the `browse-mode.ts` pattern —
pure, testable, imported by every consumer so the encoding lives once):

- `wikipediaArticleUrl(title: string): string`
  → `https://en.wikipedia.org/wiki/<title, spaces→underscores, encoded>`
  e.g. `"California High-Speed Rail"` → `.../wiki/California_High-Speed_Rail`
- `wikipediaSectionUrl(title: string, sectionHeading: string): string`
  → article URL + `#<anchor>` where the anchor is the heading with spaces→underscores,
  encoded; empty/absent heading returns the bare article URL.
  e.g. `("…","Walrus-class submarines")` → `…#Walrus-class_submarines`

Encoding: `encodeURIComponent(text.replace(/ /g, "_"))` — `_`, `-`, `.` are left literal
by `encodeURIComponent`, matching modern MediaWiki HTML5 anchor form for the common
case. Exact-match for edge-case headings (punctuation-heavy) is not guaranteed; see §3.3.

### 3.2 Link target — current article only (Sam's decision)

All links point at the **current** Wikipedia article (`/wiki/<title>`), never a
revision-pinned URL (`?oldid=…`). A read-only historical revision is the wrong
destination for someone who wants to read or edit the live article. Section links use
the current article + `#anchor`.

### 3.3 Section-anchor drift — accepted, graceful

The section heading is stored at detection time; if Wikipedia later renamed that
section, the `#anchor` won't resolve and the browser lands at the top of the current
article (a little scrolling) — never a broken link or error. This is the accepted
trade for always pointing at the live article (§3.2). The worksheet already surfaces
revision drift via its honesty banner, so the possibility is already visible to the user.

### 3.4 Worksheet article header — the one data change

`loadWorksheetView` already queries the `articles` table for `revision_id`
([load-worksheet-view.ts:37](../../src/worksheet/load-worksheet-view.ts)); it just
selects the wrong columns. The change:

1. `SELECT revision_id, title FROM articles WHERE page_id = ?` (add one column; keep the
   existing fallback when no article row exists — `title` then null).
2. Add `title: string | null` to `ArticleClaimView`
   ([view-types.ts:30](../../src/worksheet/view-types.ts)).
3. Render a real header on the worksheet: the article **title** as a link
   (`wikipediaArticleUrl`), with `page · revision · §section` demoted to subordinate
   mono metadata and the `§section` linked (`wikipediaSectionUrl`). If `title` is null
   (article row absent), fall back to today's page-id line — no crash.

### 3.5 Presentation

Every generated link opens in a new tab (`target="_blank" rel="noopener noreferrer"`)
and uses the existing iron-gall link styling, so Wikipedia links read consistently with
the app's other outbound links (e.g. the transparency source links).

## 4. Testing strategy (TDD)

- **`wikipediaArticleUrl` / `wikipediaSectionUrl`:** table-driven unit tests — plain
  title, spaces, hyphens, an apostrophe, empty/absent section returns the bare article
  URL, section anchor formed correctly. These are the load-bearing units.
- **`loadWorksheetView`:** returns `title` when the article row exists; `title: null`
  when it doesn't (fallback path).
- **Worksheet/article/queue render:** the title renders as an `<a>` to the expected
  Wikipedia URL; the section renders as an anchored link; worksheet with a null title
  falls back without error.

## 5. Implementation sequencing (isolated, CI-passing commits)

1. `feat(wikipedia): article + section URL helpers` — pure module + tests.
2. `feat(worksheet): show linked article title and section` — loader column + header.
3. `feat(web): link article titles and sections in easy-win lane and article page`.

One PR. **Routine** classification (presentation + a one-column read; no auth, no
destructive op, no schema change) — Claude merges on green CI after the `/codex` review.

## Appendix — reasoning

**Current article vs. analyzed revision (Sam chose current).** Pinning to the detected
revision would make section anchors always resolve, but it sends the user to a read-only
history page — useless for actually reading or editing. A slightly-imprecise anchor on
the live article beats a precise anchor on a dead revision. The drift case degrades to
"scroll a little," which the worksheet's honesty banner already contextualizes.

**Shared helper vs. inline URL building.** Three surfaces need the same construction;
inlining it three times would scatter the anchor-encoding quirk. One tested module keeps
the encoding correct-in-one-place and fixable-in-one-place.
