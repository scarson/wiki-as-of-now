<!-- ABOUTME: Living backlog of deferred (post-v1) features and design principles for WikiAsOfNow. -->
<!-- ABOUTME: Captures ideas worth building toward and what to stub in v1 so we don't lose the option. -->

# WikiAsOfNow — Future Features & Design Principles (post-v1)

Living document. Ideas here are deliberately *deferred* from v1 but recorded so
they aren't lost, and so v1 can leave the right seams (data, schema, UI hooks) to
make them cheap to add later. Each entry says what to **stub in v1** vs. **build
later**.

Cross-references:
- Design spec: `docs/design/WikiAsOfNow_design_spec.md`
- Compliance social contract (sacrosanct): `docs/policy/wikipedia-genai-compliance.md`
- Office-hours session that produced this: `docs/design/office-hours/`

---

## 1. Engagement: gamification, stats, and "make the tedious fun"

**Status:** v2 feature set **and** a v1 design principle.
**Origin:** Sam, office-hours session 2026-06-04.

### The idea
This work is tedious, mechanical editing. To get people (Sam included) to come
back and keep making a dent, the product should make the loop **fun and
rewarding**, not just efficient. Surface progress and impact; celebrate completed
work; give reasons to return.

### Two layers

**(a) Design principle — applies to v1 already.** Even before any "game," the v1
UX should make the editing loop feel satisfying and visible:
- clear completion feedback when a candidate is cleared ("8 stale claims resolved
  in this session"),
- visible progress through a batch queue,
- impact made tangible — e.g., "the articles you fixed have been viewed N times
  since" (the Wikimedia Pageviews data we already pull for prioritization does
  double duty here as an impact stat).

**(b) Feature set — v2.** A fuller engagement layer:
- a personal stats dashboard (edits made, sources verified, articles freshened,
  reader-reach via pageviews, time saved vs. manual),
- streaks / cadence nudges ("you've done a weekend batch 3 weeks running"),
- achievements tied to *meaningful* milestones,
- optionally, opt-in community/topic leaderboards or WikiProject cleanup-drive
  framing (ties to the "others use it" channel — WikiProjects run drives).

### The constraint that makes or breaks this (read before designing it)
Gamification on a Wikipedia tool is **dangerous if it rewards the wrong thing.**
The community's documented fear about AI editing is a flood of low-quality,
high-volume edits ("editcountitis" is already a recognized anti-pattern). An
engagement layer that rewards **raw edit count or speed** would actively push the
exact behavior our social contract (`docs/policy/wikipedia-genai-compliance.md`)
exists to prevent, and would be self-defeating: reverted edits are negative
progress.

**Therefore the design rule:** gamify **quality and verification, never volume or
speed.**
- Reward *verified, well-sourced, accepted* edits — count an edit only once it has
  survived (e.g., not reverted within a window).
- Surface *care* metrics (sources actually opened and verified, support-check
  pass rate), not just "edits today."
- Never reward fastest-time-per-edit or a running edit counter as the headline.
- Impact framing (reader reach, articles brought current) over output framing
  (how many you cranked out).

This keeps the engagement layer inside the *spirit* of the contract, not just the
letter.

### What to stub in v1 (so v2 is cheap)
- **Event log / data collection:** persist per-action events from day one —
  candidate cleared, source opened, source verified, edit composed, edit marked
  as submitted, later revert-status (if cheaply checkable). Without this history,
  v2 stats start from zero.
- **Schema seams:** the design spec's `job_runs` / user tables should leave room
  for per-user activity and outcome tracking (verified counts, reach). Additive
  columns/tables, not a redesign.
- **Pageview capture:** when we pull pageviews for prioritization, store them so
  "reach since your edit" is computable later.
- **UI hook:** a stats surface stub (even a single "today" summary card) so the
  place to grow the dashboard exists.

Do **not** build the dashboard, streaks, or achievements in v1. Just leave the
data and the seam.

---

## (add future entries below)
