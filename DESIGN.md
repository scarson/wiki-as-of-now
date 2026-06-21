<!-- SEED: re-run /impeccable document once the UI is built to capture the actual tokens and components. Colors here are NOT placeholders — they were composed from the brand seed and user-approved via side-by-side dark-mode mockups (2026-06-12). Typography pairing and exact radii/spacing are finalized at implementation. -->
---
name: WikiAsOfNow
description: Find Wikipedia articles whose "as of" reality has expired — a dark, archival workbench for human editors.
colors:
  archive-black: "oklch(0.14 0 0)"
  shelf-gray: "oklch(0.18 0 0)"
  hairline-gray: "oklch(0.30 0 0)"
  ink-white: "oklch(0.93 0.005 110)"
  body-gray: "oklch(0.86 0 0)"
  dust-gray: "oklch(0.66 0.01 110)"
  ledger-olive: "oklch(0.42 0.08 110)"
  ledger-olive-bright: "oklch(0.82 0.09 110)"
  ledger-olive-shadow: "oklch(0.26 0.06 110)"
  oxidized-rust: "oklch(0.74 0.13 40)"
  rust-shadow: "oklch(0.28 0.08 40)"
  iron-gall: "oklch(0.74 0.09 255)"
  iron-gall-shadow: "oklch(0.28 0.05 255)"
---

# Design System: WikiAsOfNow

## 1. Overview

**Creative North Star: "The Archivist's Desk Lamp"**

A dark reading room after hours. The surface is near-black and perfectly neutral — the warmth in this system lives entirely in what the lamp illuminates: olive-bound ledgers, rust where facts have oxidized, iron-gall ink where evidence is recorded. The interface is a workbench for a careful person doing exact work: every claim shows its provenance, every action is keyboard-reachable, and nothing decorates itself.

This system explicitly rejects (from PRODUCT.md): the generic SaaS dashboard (metric cards, gradient accents, icon+heading+text card grids); AI-slop defaults (cream/parchment backgrounds, gradient text, uppercase eyebrow kickers, decorative glassmorphism); and hacker-tool austerity (terminal-green brutalism that reads hobbyist). It is a companion to the encyclopedia, not a skin clone of it.

Dark mode is the canonical theme — the primary user works in dark mode for everything, and long triage sessions must not burn eyes. A light theme is derived from the same hues at implementation time and must never become cream or parchment. Motion is responsive, never choreographed: real feedback for real state changes (scan progress, result reveal, research-pack arrival), exponential ease-out curves, and a reduced-motion alternative for every animation.

**Key Characteristics:**
- Near-black neutral surfaces; chromatic warmth only in brand colors, never in the background
- Two accent lanes with strict jobs: rust = staleness, iron-gall blue = evidence
- Serif display over humanist sans body; monospace reserved for identifiers
- Keyboard-first: visible focus, shortcut affordances, triage without a mouse
- Reference feel: Linear's exactness, Stripe docs' typographic clarity, Are.na's calm

## 2. Colors

A restrained dark palette: neutral grays carry the architecture, deep olive carries the brand, and two accents each own one semantic lane.

### Primary
- **Ledger Olive** (oklch(0.42 0.08 110)): the brand color — primary buttons and committed actions, with near-white text (`ink-white`). Brightened to **Ledger Olive Bright** (oklch(0.82 0.09 110)) for badge text and small brand moments on dark; deepened to **Ledger Olive Shadow** (oklch(0.26 0.06 110)) for badge/pill fills. Olive marks what the deterministic system asserts (eligibility badges, verbatim-check ticks).

### Secondary
- **Oxidized Rust** (oklch(0.74 0.13 40), fills oklch(0.28 0.08 40)): staleness, exclusively. The underline on a stale phrase, the `stale · 2019` badge, the age indicator. Rust is the product's core signal — a fact that has oxidized.
- **Iron-Gall Blue** (oklch(0.74 0.09 255), fills oklch(0.28 0.05 255)): evidence and navigation — links, source URLs, focus rings, research-surface markers. Named for the archival ink; also matches the link-blue instincts of people who live inside Wikipedia.

### Neutral
- **Archive Black** (oklch(0.14 0 0)): the body background. Chroma exactly zero — no hidden warmth.
- **Shelf Gray** (oklch(0.18 0 0)): raised surfaces — cards, evidence panels, input wells.
- **Hairline Gray** (oklch(0.30 0 0)): borders and dividers, 1px or 0.5px, never heavier.
- **Ink White** (oklch(0.93 0.005 110)): headings and text on olive fills — a whisper of olive warmth in the white.
- **Body Gray** (oklch(0.86 0 0)): body text. Comfortably above 7:1 on Archive Black.
- **Dust Gray** (oklch(0.66 0.01 110)): secondary text, metadata, timestamps. ≥3.5:1 on Archive Black.

### Named Rules
**The Two Lanes Rule.** Rust appears only on staleness semantics; iron-gall blue appears only on evidence, links, and focus. Neither ever does the other's job. This visually encodes the project's deterministic-honesty principle: what the detector found (rust on olive's turf) is never confusable with what research produced (iron-gall).

**The No-Parchment Rule.** Surfaces are pure neutral at every lightness. Warmth lives in the brand colors and typography, never in the background. A cream, sand, or parchment surface is prohibited in both themes.

**The Reserved Red Rule.** Rust is not an error color. Genuine errors and destructive actions use a true red, kept visually distinct from rust by saturation and lightness, and used rarely enough to stay alarming.

## 3. Typography

**Display Font:** serif — pairing finalized at implementation (candidates: Source Serif 4, Newsreader; must hold weight 500–600 at display sizes and stay scholarly, not romantic)
**Body Font:** humanist sans — pairing finalized at implementation (candidates: Inter, Geist; the project already loads Geist)
**Label/Mono Font:** monospace for identifiers (candidate: Geist Mono, already loaded)

**Character:** A scholarly serif voice for the moments the product speaks (page titles, claim sentences under review), over a crisp, invisible sans for the working UI. The pairing contrasts on the serif/sans axis — never two similar sans faces.

### Hierarchy
- **Display** (serif, 500, clamp ≤ 3rem, 1.1): page titles and the wordmark. This is a tool, not a poster — display moments are few and quiet.
- **Headline** (serif, 500, ~1.5rem, 1.2): article titles, section heads. `text-wrap: balance`.
- **Title** (sans, 500, ~1rem, 1.3): card titles, form labels, button text.
- **Body** (sans, 400, ~0.9375rem, 1.6): UI prose and candidate sentences. Max line length 70ch.
- **Label** (mono, 400, ~0.75rem): revision IDs, claim keys, hashes, timestamps, source domains. Sentence case — no uppercase tracking.

### Named Rules
**The Evidence Mono Rule.** Anything that identifies a fact's provenance — revision ID, claim key, content hash, fetch timestamp, source domain — is set in the mono face. If it could appear in an audit log, it reads like one.

**The Quiet Display Rule.** Serif display never exceeds 3rem and never carries letter-spacing tighter than -0.02em. The product whispers with authority; it does not shout.

## 4. Elevation

Flat, tonal layering — no shadows at rest. Depth is conveyed by stepping lightness (Archive Black → Shelf Gray) and hairline borders. The only permitted shadow-like treatment is a focus ring in iron-gall blue (2px, offset 2px), which is functional, not decorative. If a surface needs more separation, it earns a border, not a glow.

### Named Rules
**The Borders-Not-Shadows Rule.** Separation comes from a 0.5–1px Hairline Gray border or a one-step surface lift. Box shadows, glows, and backdrop blurs are prohibited at rest.

## 5. Components

Approved primitives from the 2026-06-12 dark-mode mockups; refine in the scan-mode re-run once built.

### Buttons
- **Shape:** gently rounded (~7px radius)
- **Primary:** Ledger Olive fill, Ink White text, weight 500
- **Hover / Focus:** one-step lightness lift on hover; iron-gall focus ring; transitions ≤150ms ease-out
- **Ghost:** transparent with Hairline Gray border, Dust Gray text

### Badges / Pills
- **Style:** fully rounded, 11–12px text, shadow-tone fill with bright-tone text from the same hue (e.g. `rust-shadow` fill + rust text for `stale · 2019`; `ledger-olive-shadow` + `ledger-olive-bright` for `easy win`)
- **Rule:** a badge's hue obeys The Two Lanes Rule — its color states which system produced the fact.

### Evidence Cards
- **Corner Style:** ~8px radius
- **Background:** Shelf Gray with Hairline Gray border
- **Content:** verbatim quote in serif italic, source line in mono with iron-gall link; verification tick in olive
- **Rule:** evidence cards display verbatim quotes and real URLs only — never model prose. The design must not provide a slot where model-authored summary text could appear.

### Inputs / Fields
- **Style:** transparent or Shelf Gray well, Hairline Gray border, ~7px radius
- **Focus:** iron-gall border shift + ring; no glow
- **Placeholder:** must meet 4.5:1 (Dust Gray floor)

### Stale Marker (signature component)
The product's signature gesture: the stale phrase in a candidate sentence gets a 2px rust underline and rust text, inline with the surrounding Body Gray sentence. No background highlight, no box — the sentence stays readable as prose; the decay is marked like an archivist's pencil.

## 6. Do's and Don'ts

### Do:
- **Do** keep backgrounds pure neutral (chroma 0) at every elevation step.
- **Do** route every animation through a `prefers-reduced-motion` alternative.
- **Do** keep rust on staleness and iron-gall on evidence — The Two Lanes Rule is load-bearing.
- **Do** set provenance identifiers in mono (The Evidence Mono Rule).
- **Do** make every triage action keyboard-reachable with a visible iron-gall focus state.
- **Do** verify ≥4.5:1 contrast for body and placeholder text in both themes; body on Archive Black targets ≥7:1.

### Don't:
- **Don't** build "generic SaaS dashboard" surfaces — metric cards, hero numbers, icon+heading+text card grids (PRODUCT.md anti-reference, verbatim).
- **Don't** use "AI-slop defaults — cream/parchment body backgrounds, gradient text, uppercase eyebrow kickers above every section, decorative glassmorphism" (PRODUCT.md anti-reference, verbatim).
- **Don't** drift into "hacker-tool austerity — terminal-green brutalism that reads hobbyist rather than trustworthy" (PRODUCT.md anti-reference, verbatim).
- **Don't** use side-stripe borders (`border-left` > 1px as a colored accent), gradient text, or nested cards — ever.
- **Don't** let rust act as an error color or iron-gall act as a brand color.
- **Don't** render model-authored prose anywhere an evidence artifact belongs.
