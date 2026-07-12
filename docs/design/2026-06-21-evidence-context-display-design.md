<!-- ABOUTME: Design spec for surrounding-context display on evidence cards — the verified quote rendered inside its source paragraph, bolded, to guard the reviewer against out-of-context misreads. -->
<!-- ABOUTME: Read alongside src/research/verify-proposal.ts (capture point), src/worksheet/view-types.ts + src/app/worksheet/components/EvidenceCard.tsx (render), and docs/policy/wikipedia-genai-compliance.md (G1/G5/G16). -->

# Evidence-card context display — design

**Status:** approved design (brainstorm complete), implementation plan to follow.
**Author:** Claude + Sam, 2026-06-21.
**Depends on:** nothing new; extends the existing verify → pack → worksheet path
(`src/research/verify-proposal.ts`, `src/db/research-packs.ts`,
`src/worksheet/view-types.ts`, `src/app/worksheet/components/EvidenceCard.tsx`).

## 1. Why this exists

The evidence card surfaces a single deterministically-verified `verbatimQuote` as a
pointer the human must open the source to confirm
([docs/policy/wikipedia-genai-compliance.md](../policy/wikipedia-genai-compliance.md),
G5). A bare quote, severed from its surrounding sentence, can **invert in meaning**:
*"…will conclude testing in 2025"* reads as resolving a stale claim, but the source
clause *"…will **not** conclude testing in 2025 unless funding is restored"* says the
opposite. Negations, conditionals, tense, and dates that belong to an adjacent clause
are exactly the qualifiers a tight pointer drops.

The primary job of surrounding context is therefore **disambiguation** — protecting
the correctness of the reviewer's support judgment against an out-of-context misread.
Faster triage (grasping the quote and deciding whether to open the source) is a real
but secondary benefit that falls out of the same change.

## 2. Current flow and what changes

The worksheet already renders the quote **before** the G5 gate: `EvidenceCard`
(`src/app/worksheet/components/EvidenceCard.tsx`) shows the quote up front, and
`SourceOpenGate` gates only the **citation builder** (`SnippetAssembler` +
`DisclosureSummary`), not the quote display
(`src/app/worksheet/components/WorksheetClient.tsx`). So context shows alongside the
quote up front, aiding the open/skip decision; it never substitutes for opening
(G5 still gates the citation).

What changes: the card renders the verified quote **inside its source paragraph**,
with the quote emphasized. Nothing about the G5 gate, the mechanical citation, or the
"human writes the sentence" path moves.

## 3. The design

### 3.1 Structural emphasis — `before` + **quote** + `after`

Rather than store a context blob plus a fragile highlight offset, store the window as
two source slices flanking the existing verified anchor:

```
contextBefore  +  [ verbatimQuote ]  +  contextAfter
```

The rendered excerpt is the concatenation; the quote is emphasized **by
construction** — it is literally the middle term, so there is no offset arithmetic
and no highlight that can drift. This preserves the invariant the view types already
assert (*"structurally incapable of carrying model prose (G1)"*): `before`/`after`
are typed source slices, and an integrity check (§6) asserts the whole window is
byte-present on the source, so non-source text cannot be smuggled in — it would fail
byte-presence, the same backstop that gates the quote.

### 3.2 Capture point — at verify time, where the page is in hand

The page is **not** retained for render (`surfaceResearchPack` reads a stored pack;
the source was live-fetched at research time). So context is sliced at the one moment
the page is available: inside `verifyProposal` (`src/research/verify-proposal.ts`),
immediately after `evaluateQuote` returns `"matched"`, from the same `fetched.text`.
The slices are persisted in the pack alongside the quote.

### 3.3 Slicing — normalized space, block-bounded, nullable edges

`normalizeForVerbatim` (`src/research/normalize.ts`) collapses whitespace and strips
zero-width characters but **does not case-fold or alter letters/punctuation**, so
normalized text is faithful and readable. Context is sliced from the **normalized
page** — the same representation `evaluateQuote` matches against — which makes the
integrity invariant hold in normalized space and makes the paragraph boundary
unambiguous:

1. Normalize the page once; locate the normalized quote (`indexOf`).
2. The **containing block** is the span between the surrounding `\n` boundaries
   (`lastIndexOf("\n")` / `indexOf("\n")`, or string start/end). A quote can never
   contain `\n` (`evaluateQuote` rejects it), so it always lies within one block.
3. `contextBefore` = up to `CONTEXT_SIDE_CAP` code points of that block to the left of
   the quote; `contextAfter` = up to the cap to the right. Both are **snapped to a
   whitespace boundary** so a word is never cut mid-token, and neither crosses the
   block boundary.

**Edge cases (nullable by design).** When the quote starts the paragraph,
`contextBefore` is `null`; when it ends the paragraph, `contextAfter` is `null`; a
quote that is the whole block yields both `null`. `null` renders as nothing and is
skipped by every check — the quote-length bounds run on `verbatimQuote` alone, and the
window integrity check (§6) operates on `(before ?? "") + quote + (after ?? "")`,
which stays a valid contiguous span when a side is absent. No check special-cases the
edge; absence is just the empty string.

**Bound (`CONTEXT_SIDE_CAP`, tunable).** A modest per-side cap (default **240 code
points**) keeps both the stored-source footprint and the copy surface small, honoring
the spirit of the `MAX_QUOTE_LEN = 300` pointer bound. The default-visible excerpt is
tighter still (~120 cp/side via a client line-clamp); **"show more" expands to the
full stored window** — that is the answer to "situationally show more," with no extra
fetch. Beyond the stored window the only "more" is the source itself, which under G5
the reviewer is opening anyway.

### 3.4 Storage and read-path validation

`EvidenceCard` (`src/research/provider.ts`) and `EvidenceCardView`
(`src/worksheet/view-types.ts`) each gain `contextBefore: string | null` and
`contextAfter: string | null`; `toEvidenceCardView` projects them explicitly (never
`{ ...card }`). They serialize into the existing `cards_json` pack column — no
migration. The read path (`parseRow` in `src/db/research-packs.ts`), which already
re-validates the G16 quote-length cap defensively, additionally re-validates that each
present side is within `CONTEXT_SIDE_CAP` (code points), rejecting a corrupted row the
same way it rejects an out-of-range quote.

### 3.5 Rendering and the G16 copy posture

The card renders `{contextBefore}` + an emphasized `{verbatimQuote}` +
`{contextAfter}` in one blockquote, with the flanking context **visually
de-emphasized** (lighter weight/colour) so the verified pointer stays the focal
point. No `dangerouslySetInnerHTML`; emphasis is a real element wrapping a plain
string, so the "cannot surface model-authored prose" property is unchanged.

On G16 (*"the interface should discourage pasting the extracted snippet into article
text"*), the posture is **friction in the default action, not in selection**: the
card adds **no copy affordance** for the quote or context (it has none today), so the
only one-click copy on the worksheet remains `SnippetAssembler`'s **human sentence +
mechanical citation** — never source prose. Context stays normally selectable
(accessibility, screen readers), de-emphasized, under the assembler's existing
*"write the sentence in your own words … do not paste the source quote"* hint. We do
**not** use `user-select: none`: it is trivially bypassed, harms accessibility, and
adds no real enforcement.

### 3.6 Multi-span (non-contiguous evidence)

This composes with the ground-truth corpus design's non-contiguous-evidence rule
([2026-06-21-ground-truth-corpus-design.md](2026-06-21-ground-truth-corpus-design.md)
§2.2): when the subject anchor and the resolving fact live in different paragraphs,
each verified span is its own card with its own `before`/`[quote]`/`after` window, so
a split renders as two independently-bolded excerpts. No special case — the per-card
shape already carries it.

## 4. Schema changes (concrete)

| Location | Change |
|---|---|
| `src/research/provider.ts` `EvidenceCard` | add `contextBefore: string \| null`, `contextAfter: string \| null` (documented as deterministic source slices, not prose slots) |
| `src/research/verify-proposal.ts` | on `"matched"`, slice the window from `fetched.text` (§3.3) and populate the two fields |
| `src/worksheet/view-types.ts` `EvidenceCardView` | mirror the two fields |
| `src/worksheet/evidence-card.ts` `toEvidenceCardView` | project the two fields explicitly |
| `src/db/research-packs.ts` `parseRow` | read-path cap re-validation for each present side |
| `src/app/worksheet/components/EvidenceCard.tsx` | render `before` + emphasized quote + `after`; de-emphasis; line-clamp + "show more" |
| `src/research/verbatim-check.ts` (or a sibling) | export `CONTEXT_SIDE_CAP` + the deterministic slice helper, unit-tested |

## 5. Compliance mapping

- **G1 (no machine prose).** Context is source text sliced deterministically, never a
  model paraphrase; the byte-presence integrity check enforces it. The render path
  has no prose slot and no HTML injection.
- **G5 (human-open gate).** Unchanged — the gate still sits before the citation
  builder; context aids but never replaces opening the source.
- **G16 (no copying source prose).** Bounded window (`CONTEXT_SIDE_CAP`), no copy
  affordance on the card, copy routed through the human's own sentence, de-emphasis +
  the existing anti-paste hint.
- **G2 (mechanical citation).** Untouched — the citation is still built only from
  source metadata.

## 6. Testing and integrity

- **Slice helper unit tests (deterministic, the lake to boil):** quote mid-paragraph;
  quote at block start (`before === null`); quote at block end (`after === null`);
  quote is the whole block (both `null`); cap truncation with word-boundary snapping;
  multi-byte / combining-mark code-point counting at the cap; a block-boundary `\n`
  adjacent to the quote (no leakage across it); CRLF / vertical-separator normalization
  around the quote.
- **Window integrity test:** for each produced card, `(before ?? "") + verbatimQuote +
  (after ?? "")` is byte-present (via `evaluateQuote`) as one contiguous span on the
  normalized source fixture — the §3.1 invariant, asserted.
- **Read-path validation test:** a row whose `contextBefore`/`contextAfter` exceeds the
  cap is rejected by `parseRow`, mirroring the existing over-long-quote rejection.
- **Projection test:** `toEvidenceCardView` carries exactly the documented fields and
  nothing else (no `{ ...card }` leak).

## 7. Scope

- **In:** the slice helper + cap, the two schema fields end to end (capture → store →
  read-validate → view → render), the render/emphasis/"show more" UI, the tests above.
- **Out:** multi-block expansion backed by extra stored prose (the terminal "more" is
  the open source); any change to the G5 gate, the mechanical citation, or the
  show-your-work view; re-fetching pages at render time.

---

## Appendix A — reasoning trail

### A.1 Decisions and rationale

- **Disambiguation-first, not triage-first.** The load-bearing reason for context is
  that a quote ripped from its qualifiers can mean the opposite of the passage; speed
  is a welcome side effect. This is what forces context to follow paragraph structure
  (so a meaning-changing trailing clause is never severed) rather than a blind window.

- **Structural `before`/`[quote]`/`after` over blob + highlight offset.** Makes the
  verified quote the literal middle term, so emphasis cannot drift and the
  "no-prose-slot" invariant is preserved by byte-presence over the whole window. A
  stored offset would be a second source of truth that can disagree with the text.

- **Slice in normalized space.** `normalizeForVerbatim` doesn't case-fold or touch
  letters, so normalized text is readable, *and* it is the representation the match
  already lives in — so the block boundary is exactly `\n` and the integrity invariant
  is trivially true. Slicing raw text would force fragile normalized→raw offset
  mapping for no readability gain.

- **Capture at `verifyProposal`.** The only point the page is in hand; the pack is the
  durable artifact and the page is not retained. Storing the slices (source text, not
  model prose) does not violate G1; the bound keeps the footprint near the existing
  pointer size.

- **Nullable edges.** Start/end-of-paragraph quotes make a side genuinely absent;
  `null` (rendering nothing, skipped by checks via `?? ""`) is cleaner than an empty
  string sentinel and matches Sam's "fine if either is null as long as it doesn't mess
  up the checks."

- **G16 posture = friction in the default action.** Picked over both pure visual
  de-emphasis (too weak) and `user-select: none` (friction theatre — bypassable,
  accessibility-hostile). It also aligns with the existing `SnippetAssembler`, whose
  only copy button already emits human-sentence + mechanical ref, never the quote.

### A.2 Considered and ruled out

- **Fixed character window.** Can sever the trailing qualifier that inverts meaning —
  the exact failure context is meant to prevent.
- **Sentence-window slicing.** Needs sentence segmentation of *untrusted* text
  (abbreviations, decimals); cuts against the project's "no regex on untrusted text"
  posture for no gain over paragraph boundaries.
- **Render-time re-slice.** Impossible — the page isn't retained past research time.
- **`user-select: none` on context.** Friction theatre; rejected with Sam.
- **A model-written one-line gist instead of source context.** Violates G1; the whole
  point is faithful source text, not a paraphrase.

### A.3 Still uncertain

- **`CONTEXT_SIDE_CAP` value (default 240 cp).** A storage/copy-surface vs.
  disambiguation-headroom knob; may want tuning once real cards are seen. It is a
  tunable, not a correctness threshold (the integrity check holds at any cap).
- **Default-visible clamp vs. always-show-full.** Whether the "show more" line-clamp
  earns its complexity, or a modest cap should just render in full. Cheap to flip after
  seeing real paragraph lengths.

### A.4 What I'd add with more time

- A read-path **dev-only assertion** that re-checks window byte-presence against a
  retained fixture in tests (production can't, since the page isn't stored) — already
  covered by the §6 integrity test against fixtures, so this is only an extra belt for
  the corpus e2e path.
