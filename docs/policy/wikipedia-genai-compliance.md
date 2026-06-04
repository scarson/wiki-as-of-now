<!-- ABOUTME: Anchor doc defining how WikiAsOfNow operates within Wikipedia's generative-AI rules. -->
<!-- ABOUTME: MUST-READ for every human and agent contributor; basis for the public About-page compliance section. -->

# WikiAsOfNow and Wikipedia's Generative-AI Rules

## How this project operates within the letter — and the spirit — of the rules

**Status:** Draft v0.1 — **social contract with the Wikipedia community. Sacrosanct.**
**Audience:** Every contributor, human or agent. Read this before touching any
detection, research, LLM, or citation code.
**Last policy review:** 2026-06-04
**Maintenance:** Wikipedia's AI rules are evolving quickly (the core guideline is
weeks old as of this writing). Re-verify the quotations below verbatim against the
live pages, and re-check for new policy, before any public launch and on a recurring
cadence thereafter.

> **This document is the project's social contract with the Wikipedia community, and
> it is sacrosanct.** Its guardrails are not preferences to be balanced against
> velocity, cleverness, or convenience. No feature, optimization, deadline, or
> "it would be so much easier if" ever justifies crossing a guardrail in §4 or doing
> anything on the §5 list. If a proposed change would weaken this contract, it does
> not ship — it gets escalated to a human maintainer and debated in the open. The
> bar for changing this document is deliberately higher than for any code in the
> repository.

---

## 0. Why this document exists

1. **It is the anchor for every contributor and every coding agent.** The project's
   single most important constraint is not technical — it is that an AI-assisted
   Wikipedia tool must stay clearly inside Wikipedia's rules. This document is the
   canonical statement of where that line is and how our architecture respects it.
   Treat the guardrails in §4 like the architectural invariants in the design spec
   (`docs/design/WikiAsOfNow_design_spec.md` §26): do not cross them without an
   explicit, documented decision.
2. **It is the basis for the public "About" page.** We are building in public. A
   clear, honest account of how we respect Wikipedia's AI rules — written in full
   knowledge of them — is both the ethical baseline and the trust foundation for the
   project.
3. **It records the core bet:** AI here is a *grounded research assistant to a human
   editor*, never an author of article content and never a source. Everything below
   follows from that bet.

> **Provenance note (honesty).** The quotations in §1 were captured on 2026-06-04 via
> automated fetches that pass page text through a summarization layer. They are
> faithful in substance and each is attributed to its source page, but exact wording
> MUST be re-verified verbatim against the live pages before any public use. Doing
> otherwise would contradict the conscientiousness this document is about.

---

## 1. The rules as they stand (captured 2026-06-04)

### 1.1 The core guideline — generating or rewriting article content

Wikipedia adopted a guideline via an RfC that closed **2026-03-20 (44 in favor, 2
opposed)**:

> "The use of LLMs to generate or rewrite article content is prohibited."

Two narrow carve-outs exist:

- **Basic copyediting** of the editor's *own* writing, after human review, *provided
  the LLM introduces no content of its own* (e.g., spelling, punctuation,
  capitalization). The guideline cautions that "LLMs can go beyond what is asked of
  them and can change the meaning."
- **LLM-assisted translation** from another-language Wikipedia, following the
  dedicated translation guidance, with full human verification.

Source: [Wikipedia:Writing articles with large language models](https://en.wikipedia.org/wiki/Wikipedia:Writing_articles_with_large_language_models)
(and its [RfC](https://en.wikipedia.org/wiki/Wikipedia:Writing_articles_with_large_language_models/RfC)).

### 1.2 Using LLMs to research topics or find sources

The editor-facing guidance points to an essay whose position is blunt:

> "You should never use LLMs to research topics or find sources."

Source: [Wikipedia:LLMs are bad search engines](https://en.wikipedia.org/wiki/Wikipedia:LLMs_are_bad_search_engines),
referenced from [Wikipedia:Artificial intelligence](https://en.wikipedia.org/wiki/Wikipedia:Artificial_intelligence).

The essay's stated concerns (its *intent*, analyzed in §2) go beyond hallucination:
auditability, improper synthesis, incompleteness, and editor skill atrophy.

### 1.3 Machine-learning output as a source

> "Content produced by LLMs ... is generally unreliable."

LLM output may not be cited, and LLMs are known to fabricate citations that look
legitimate but lead nowhere.

Source: [Wikipedia:Reliable sources](https://en.wikipedia.org/wiki/Wikipedia:Reliable_sources)
(§ on sources produced by machine learning).

### 1.4 Disclosure

> "LLM use disclosure is highly recommended."

Disclosure of AI assistance is strongly encouraged, though not strictly mandated in
edit summaries.

Source: [Wikipedia:LLM use disclosure](https://en.wikipedia.org/wiki/Wikipedia:LLM_use_disclosure)
(referenced from [Wikipedia:Artificial intelligence](https://en.wikipedia.org/wiki/Wikipedia:Artificial_intelligence)).

### 1.5 Enforcement framing

The guidance notes that sanctions require evidence that edits violate **core content
policies**, not merely that AI was involved: "When evaluating possible LLM use, it is
best to consider the full pattern of the editor's recent edits and whether the edits
comply with core content policies." The practical implication for us is in §3.

---

## 2. The intent behind the rules

Reading only the letter ("never use LLMs to find sources") would forbid almost any
software that touches the web. That is not the harm the community is defending
against. The essay and guideline reveal the actual concerns:

1. **Auditability / opacity.** "LLMs will not be able to tell you why it took a
   certain path and why it highlighted a source." You cannot inspect *why* a model
   preferred one source over another.
2. **Improper synthesis.** LLMs "combine data into new formulations and conclusions
   not stated by the original sources." This is the same harm as core content policy
   on synthesis and original research — a machine fusing facts into a novel claim.
3. **Hallucination.** "LLMs will frequently make up sources, arguments, and
   conclusions out of thin air," including fabricated-but-plausible citations.
4. **Incompleteness.** Models miss "unknown unknowns" and do "the bare minimum."
5. **Skill atrophy.** Over-reliance erodes editors' own research ability.

Notably, **the essay does not address retrieval-augmented / grounded systems at
all.** Its target is the *methodology* of treating an LLM as your researcher, not the
existence of software that retrieves real web pages. That gap is the lane this
project operates in — responsibly, with the guardrails below.

---

## 3. Our position: letter and spirit

The distinction that actually governs compliance is **not** "grounded LLM vs. search
API" (mechanically those are nearly identical — both retrieve real web results). The
governing distinction is:

- **LLM as an oracle of facts** — you ask "what happened to program X?" and it
  answers from its weights and supplies citations it generated. This is the
  prohibited, unreliable thing. **We never do this.**
- **LLM as a relevance classifier over real, retrieved documents** — real search
  returns real URLs that resolve; the model reads those real pages and triages "does
  this one appear to answer the question?"; the human opens the winner and verifies.
  The model never originates a fact or a citation. **This is all we do.**

Synthesis stays human. Prose stays human. Citations are built mechanically from the
real metadata of sources the human approved. Verification is human and mandatory.

Under this design, **every edit a contributor makes stands on its own content-policy
merits** — a real, reliable source that genuinely supports the exact claim, properly
cited, with the AI assistance disclosed. That is the robust defense the enforcement
framing (§1.5) points to: the edit is good regardless of how the source was found.

We acknowledge a residual *social* reality: the letter is harsh, and some editors
react to "AI-assisted" reflexively. We address that with radical transparency
(§6), not by hiding the workflow.

---

## 4. Enumerated guardrails (project invariants)

These are hard rules. They have the same status as the architectural invariants in
the design spec. Each is tagged with the concern from §2 it answers.

- **G1 — No machine-written article text, ever.** The tool never emits prose intended
  for an article. The human writes every sentence that lands in Wikipedia.
  *(prohibition; improper synthesis)*
- **G2 — No machine-derived citations, ever.** Every citation is generated
  mechanically from the real metadata of a source URL the human approved and opened
  (title, publisher, date), never from model output.
  *(hallucinated citations; WP:RS)*
- **G3 — Every surfaced claim anchors to one real, resolving URL,** shown alongside
  the supporting quote/snippet from that page. No free-floating assertions.
  *(hallucination; auditability)*
- **G4 — No cross-source synthesis by the machine.** One claim ↔ one source. Combining
  multiple facts into a sentence is done only by the human.
  *(improper synthesis; WP:SYNTH / no original research)*
- **G5 — Human verification is mandatory and gated.** The human must open and verify
  each source before it can be cited. The tool surfaces; it never decides. Cards not
  human-verified are clearly marked and cannot produce a finished citation.
  *(verification; auditability)*
- **G6 — The tool shows its work.** For every high-signal flag, it displays *why* (the
  matching snippet) and also shows the non-selected results, so the human can audit
  the ranking rather than trust it.
  *(opacity; biased source selection)*
- **G7 — Prefer primary/official sources; never hide the candidate set.** Sources are
  labeled by type; the full retrieved set is visible.
  *(biased source selection)*
- **G8 — Support-checking before "resolves."** Before a card is presented as
  appearing to resolve the question, the tool verifies the claim is actually
  supported by text on the fetched page and flags weak support (refchecker-style
  claim↔source checking).
  *(hallucination; text-source integrity)*
- **G9 — The LLM's role is boxed to three jobs:** (a) normalize the hanging question
  into search queries, (b) relevance-triage real retrieved documents, (c) extract one
  candidate fact per source with its supporting quote. Anything beyond these three is
  out of bounds.
  *(defines the box)*
- **G10 — Detection is deterministic and explainable.** Stale-claim detection uses no
  LLM (per design spec §9, §26). The model is only in the optional research-assist
  layer.
  *(auditability)*
- **G11 — Stay in the safe lane.** The tool targets high-volume, low-complexity
  temporal fixes with strong official sourcing. It does not surface contentious,
  interpretive, or biography-of-living-persons-sensitive material as "easy wins";
  such cases are flagged for human-only handling.
  *(incompleteness / unknown-unknowns; BLP risk)*
- **G12 — Disclosure by default.** AI assistance is disclosed in edit summaries and
  explained on the public About page; the method is open-source and inspectable.
  *(disclosure norm; good faith)*

---

## 5. What the tool will never do

- Generate or rewrite article prose for pasting.
- Produce or suggest a citation that the human has not verified against the real
  source.
- Assert what "happened" as fact from model knowledge.
- Combine multiple sources into a single claim or sentence.
- Auto-submit edits to Wikipedia.
- Present its ranking as a decision the human can skip verifying.

---

## 6. Disclosure and transparency practice

- **Edit summaries** carry a short, honest disclosure that AI assistance was used to
  surface and triage candidate sources, which the editor then verified.
- **The About page** explains this workflow in plain language and links to this
  document, so any reader (or scrutinizing editor) can see exactly how AI is and is
  not used.
- **The repository is open source,** so the guardrails above are inspectable, not
  merely asserted.

---

## 7. Good-faith statement

This project is built by people who edit Wikipedia and care about it. We read the
rules, including the ones that appear to point against AI tooling, and we designed
the system specifically so that AI acts as a grounded assistant to a human editor —
never an author and never a source — with enumerated guardrails that keep it out of
prohibited territory. Where the letter and the spirit could diverge, we chose the
interpretation that most protects Wikipedia's content standards, and we made the
whole approach transparent and inspectable so the community can hold us to it.

We treat this as a **social contract with the Wikipedia community**: a public,
standing commitment about how we will and will not use AI on the encyclopedia. We
hold it sacrosanct, we expect to be held to it, and we would rather ship less than
break it.

---

## 8. Change log

- **2026-06-04** — v0.1 drafted during the office-hours design session. Captured the
  March 2026 LLM guideline, the bad-search-engines essay, WP:RS machine-learning
  guidance, and disclosure norm; established the oracle-vs-classifier distinction and
  the G1–G12 guardrails. Quotations pending verbatim re-verification.
