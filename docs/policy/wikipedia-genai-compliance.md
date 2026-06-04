<!-- ABOUTME: Anchor doc defining how WikiAsOfNow operates within Wikipedia's generative-AI rules. -->
<!-- ABOUTME: MUST-READ for every human and agent contributor; basis for the public About-page compliance section. -->

# WikiAsOfNow and Wikipedia's Generative-AI Rules

## How this project operates within the letter — and the spirit — of the rules

**Status:** Draft v0.2 — **social contract with the Wikipedia community. Sacrosanct.**
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
> "it would be so much easier if" ever justifies crossing one of the enumerated
> guardrails below, or doing anything on the "What the tool will never do" list. If a
> proposed change would weaken this contract, it does not ship — it gets escalated to
> a human maintainer and debated in the open. The bar for changing this document is
> deliberately higher than for any code in the repository.

> **How to reference this document (so references don't rot).** Refer to a guardrail
> by its **name**, not a bare number — write "the no-cross-source-synthesis
> guardrail," not "G4." The short IDs (G1, G2, …) exist only as stable anchors; a
> reference that carries only the number is opaque the moment it leaves this page
> (in code, a commit, a PR comment) and breaks silently if anchors ever change. Same
> rule for sections: name them ("the disclosure-practice section"), don't cite a bare
> number. This mirrors the self-identifying-reference rule in `CLAUDE.md`.

---

## 0. Why this document exists

1. **It is the anchor for every contributor and every coding agent.** The project's
   single most important constraint is not technical — it is that an AI-assisted
   Wikipedia tool must stay clearly inside Wikipedia's rules. This document is the
   canonical statement of where that line is and how our architecture respects it.
   Treat the guardrails below like the architectural invariants in the design spec
   (the "Implementation Recommendations for a Coding Agent" section of
   `docs/design/WikiAsOfNow_design_spec.md`): do not cross them without an explicit,
   documented decision.
2. **It is the basis for the public "About" page.** We are building in public. A
   clear, honest account of how we respect Wikipedia's AI rules — written in full
   knowledge of them — is both the ethical baseline and the trust foundation for the
   project.
3. **It records the core bet:** AI here is a *grounded research assistant to a human
   editor*, never an author of article content and never a source. Everything below
   follows from that bet.

> **Provenance note (honesty).** The quotations in the "rules as they stand" section
> below were captured on 2026-06-04 via automated fetches that pass page text through
> a summarization layer. They are faithful in substance and each is attributed to its
> source page, but exact wording MUST be re-verified verbatim against the live pages
> before any public use. Doing otherwise would contradict the conscientiousness this
> document is about.

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

The essay's stated concerns — analyzed below in the "intent behind the rules"
section — go beyond hallucination: auditability, improper synthesis, incompleteness,
and editor skill atrophy.

### 1.3 Machine-learning output as a source

> "Content produced by LLMs ... is generally unreliable."

LLM output may not be cited, and LLMs are known to fabricate citations that look
legitimate but lead nowhere.

Source: [Wikipedia:Reliable sources](https://en.wikipedia.org/wiki/Wikipedia:Reliable_sources)
(in the section on sources produced by machine learning).

### 1.4 Disclosure

> "LLM use disclosure is highly recommended."

Disclosure of AI assistance is strongly encouraged, though not strictly mandated in
edit summaries. How we operationalize this — generating the disclosure *mechanically
from our own activity log* rather than with a model — is described in the
"disclosure and transparency practice" section below.

Source: [Wikipedia:LLM use disclosure](https://en.wikipedia.org/wiki/Wikipedia:LLM_use_disclosure)
(referenced from [Wikipedia:Artificial intelligence](https://en.wikipedia.org/wiki/Wikipedia:Artificial_intelligence)).

### 1.5 Enforcement framing

The guidance notes that sanctions require evidence that edits violate **core content
policies**, not merely that AI was involved: "When evaluating possible LLM use, it is
best to consider the full pattern of the editor's recent edits and whether the edits
comply with core content policies." The practical implication for us is in the "our
position" section below.

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
framing above points to (sanctions hinge on core-content-policy violations, not AI
involvement): the edit is good regardless of how the source was found.

We acknowledge a residual *social* reality: the letter is harsh, and some editors
react to "AI-assisted" reflexively. We address that with radical transparency (see
the disclosure-practice section below), not by hiding the workflow.

---

## 4. Enumerated guardrails (project invariants)

These are hard rules with the same status as the architectural invariants in the
design spec. Each is tagged with the concern (from the intent section above) it
answers. Reference them by name, not bare number.

- **No machine-written article text, ever (G1).** The tool never emits prose intended
  for an article. The human writes every sentence that lands in Wikipedia.
  *(prohibition; improper synthesis)*
- **No machine-derived citations, ever (G2).** Every citation is generated
  mechanically from the real metadata of a source URL the human approved and opened
  (title, publisher, date), never from model output.
  *(hallucinated citations; reliable-sources rule)*
- **Every surfaced claim anchors to one real, resolving URL (G3),** shown alongside
  the supporting quote/snippet from that page. No free-floating assertions.
  *(hallucination; auditability)*
- **No cross-source synthesis by the machine (G4).** One claim ↔ one source.
  Combining multiple facts into a sentence is done only by the human.
  *(improper synthesis; synthesis / no-original-research rules)*
- **Human verification is mandatory and gated (G5).** The human must open and verify
  each source before it can be cited. The tool surfaces; it never decides. Cards not
  human-verified are clearly marked and cannot produce a finished citation.
  *(verification; auditability)*
- **The tool shows its work (G6).** For every high-signal flag, it displays *why* (the
  matching snippet) and also shows the non-selected results, so the human can audit
  the ranking rather than trust it.
  *(opacity; biased source selection)*
- **Prefer primary/official sources; never hide the candidate set (G7).** Sources are
  labeled by type; the full retrieved set is visible.
  *(biased source selection)*
- **Support-checking before "resolves" (G8).** Before a card is presented as
  appearing to resolve the question, the tool verifies the claim is actually
  supported by text on the fetched page and flags weak support (refchecker-style
  claim↔source checking).
  *(hallucination; text-source integrity)*
- **The LLM's role is boxed to three jobs (G9):** (a) normalize the hanging question
  into search queries, (b) relevance-triage real retrieved documents, (c) extract one
  candidate fact per source with its supporting quote. Anything beyond these three is
  out of bounds.
  *(defines the box)*
- **Detection is deterministic and explainable (G10).** Stale-claim detection uses no
  LLM (see the "Stale-Claim Detection Model" section of the design spec and its
  coding-agent invariants). The model is only in the optional research-assist layer.
  *(auditability)*
- **Stay in the safe lane (G11).** The tool targets high-volume, low-complexity
  temporal fixes with strong official sourcing. It does not surface contentious,
  interpretive, or biography-of-living-persons-sensitive material as "easy wins";
  such cases are flagged for human-only handling.
  *(incompleteness / unknown-unknowns; living-persons risk)*
- **Disclosure is mechanical and on by default (G12).** The tool produces a
  ready-to-paste edit summary whose AI-assistance disclosure is generated
  mechanically from the activity log (a deterministic template filled with logged
  facts), never authored by a model. The human pastes it when they submit. See the
  disclosure-practice section for why this does not conflict with the
  no-machine-written-text guardrail.
  *(disclosure norm; good faith)*
- **The audit log is foundational and self-recording (G13).** A tamper-evident
  activity/audit log is a first-class system built from day one, not a later add-on.
  It is the single source of truth that makes disclosures (G12), verification gating
  (G5), and "show your work" (G6) real rather than asserted. The act of generating a
  disclosure is itself logged. If the log is not robust, the contract is not real.
  *(auditability; good faith)*

---

## 5. What the tool will never do

- Generate or rewrite article prose for pasting.
- Produce or suggest a citation that the human has not verified against the real
  source.
- Assert what "happened" as fact from model knowledge.
- Combine multiple sources into a single claim or sentence.
- Author the disclosure text with a model (the disclosure is mechanical; see below).
- Auto-submit edits to Wikipedia.
- Present its ranking as a decision the human can skip verifying.

---

## 6. Disclosure and transparency practice

**The enforcement boundary, stated honestly.** Submitting an edit — including typing
the edit summary — happens on Wikipedia, by the human. Our tool does not (and per the
no-auto-submit guardrail, must not) submit edits or reach into Wikipedia's edit box.
So the tool **cannot enforce** that a disclosure is present. What it can do is make
the compliant path the path of least resistance:

- **The tool generates the complete edit summary, disclosure included, ready to
  copy.** The human pastes it on submit. Because the disclosure is right there in the
  text they already need, the easy action is also the compliant one.
- **The disclosure is mechanical, not authored.** Its wording is a deterministic
  template instantiated from facts in the activity log — for example, that AI-assisted
  retrieval and relevance-triage were used to surface candidate sources, which the
  editor then opened and verified. No model writes or phrases it. This keeps it
  zero-hallucination and squarely outside the no-machine-written-text guardrail: it
  is form-filling from a factual log (the same category as the mechanical citation
  skeletons), and it is meta-information attached to the edit, never article content.
  We deliberately do **not** use an LLM to phrase the disclosure; doing so would make
  it machine-authored meta-text and reintroduce the very risk we are avoiding.
- **Generating a disclosure is itself logged,** so the transparency trail is complete:
  the log records both the assisted activity and the disclosure produced from it.
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

- **2026-06-04 (v0.2)** — Removed opaque section-symbol references in favor of
  plain-English, self-identifying references (carrying titles) per the `CLAUDE.md`
  cross-reference rule; added a "how to reference this document" note. Reworked
  disclosure handling: the tool generates the edit summary's disclosure mechanically
  from the activity log (never model-authored) and logs that generation; clarified
  the enforcement boundary (the tool cannot police Wikipedia's edit box, only make
  the compliant path the default). Elevated the audit/activity log to a foundational
  guardrail (G13) and added the mechanical-disclosure guardrail framing (G12).
- **2026-06-04 (v0.1)** — Drafted during the office-hours design session. Captured the
  March 2026 LLM guideline, the bad-search-engines essay, the reliable-sources
  machine-learning guidance, and the disclosure norm; established the
  oracle-vs-classifier distinction and the initial guardrails. Quotations pending
  verbatim re-verification.
