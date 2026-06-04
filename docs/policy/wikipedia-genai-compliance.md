<!-- ABOUTME: Anchor doc defining how WikiAsOfNow operates within Wikipedia's generative-AI rules. -->
<!-- ABOUTME: MUST-READ for every human and agent contributor; basis for the public About-page compliance section. -->

# WikiAsOfNow and Wikipedia's Generative-AI Rules

## How this project operates within the letter — and the spirit — of the rules

**Status:** Draft v0.6 — **a sacrosanct social contract with the Wikipedia community.**
"Draft" refers to wording and pending verbatim-quote verification, *not* to the
bindingness of the commitments: the guardrails are binding now.
**Audience:** Every contributor, human or agent. Read this before touching any
detection, research, LLM, or citation code.
**Last policy review:** 2026-06-04
**Maintenance:** Wikipedia's AI rules are evolving quickly (the core guideline is
weeks old as of this writing). Re-verify the captured wording below verbatim against
the live pages, and re-check for new policy, before any public launch and on a
recurring cadence thereafter.

> **This contract is sacrosanct.** Its guardrails are not preferences to be balanced
> against velocity, cleverness, or convenience. No feature, optimization, deadline, or
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

> **The guardrails at a glance** (names only — the authoritative text is in the
> enumerated-guardrails section): no machine-written article text · no machine-derived
> citations · anchor every claim to a real URL · no cross-source synthesis by the
> machine · human verification is a gated act of opening the source · the tool shows
> its work · prefer official sources and never hide the candidate set · support-check
> with a verbatim-quote check · the LLM's role is boxed to three jobs · detection is
> deterministic · stay in the safe lane · disclosure is mechanical · the audit log is
> foundational · responsible automated access · fetched content is untrusted data ·
> no copying of source prose.

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

> **Provenance note (honesty) — READ BEFORE QUOTING.** The wording shown for the
> Wikipedia rules below is **captured paraphrase, NOT certified verbatim** — it was
> retrieved on 2026-06-04 through a summarization layer. Specific figures (e.g., the
> RfC vote tally) are likewise reported-pending-verification. Each item is attributed
> to its source page. Exact wording and figures MUST be verified verbatim against the
> live pages before any public use. Quoting Wikipedia inexactly in a document about
> being conscientious would contradict its whole purpose — so we present paraphrase as
> paraphrase, not inside quotation marks.

> **Scope of this contract.** It covers two commitments to the Wikipedia community:
> (1) how we use AI in relation to article content (the bulk of this document), and
> (2) responsible automated *access* to Wikimedia services (see the responsible-access
> guardrail). A separate section covers what changes when others use a hosted instance.

---

## 1. The rules as they stand (captured 2026-06-04, paraphrased pending verbatim check)

### 1.1 The core guideline — generating or rewriting article content

Wikipedia adopted a guideline via an RfC that closed on 2026-03-20 (reported as 44 in
favor, 2 opposed — pending verbatim verification). In substance: **using LLMs to
generate or rewrite article content is prohibited.**

Two narrow carve-outs exist:

- **Basic copyediting** of the editor's *own* writing, after human review, provided
  the LLM introduces no content of its own (e.g., spelling, punctuation,
  capitalization). The guideline cautions that LLMs can exceed what is asked and change
  the meaning.
- **LLM-assisted translation** from another-language Wikipedia, following the
  dedicated translation guidance, with full human verification.

Source: [Wikipedia:Writing articles with large language models](https://en.wikipedia.org/wiki/Wikipedia:Writing_articles_with_large_language_models)
(and its [RfC](https://en.wikipedia.org/wiki/Wikipedia:Writing_articles_with_large_language_models/RfC)).

### 1.2 Using LLMs to research topics or find sources

The editor-facing guidance points to an essay whose position is blunt: in substance,
**editors should never use LLMs to research topics or find sources.**

Source: [Wikipedia:LLMs are bad search engines](https://en.wikipedia.org/wiki/Wikipedia:LLMs_are_bad_search_engines),
referenced from [Wikipedia:Artificial intelligence](https://en.wikipedia.org/wiki/Wikipedia:Artificial_intelligence).

The essay's stated concerns — analyzed below in the "intent behind the rules"
section — go beyond hallucination: auditability, improper synthesis, incompleteness,
and editor skill atrophy. **We take this rule as applying to us** (see "our position").

### 1.3 Machine-learning output as a source

In substance: **content produced by LLMs is generally unreliable.** LLM output may not
be cited, and LLMs are known to fabricate citations that look legitimate but lead
nowhere.

Source: [Wikipedia:Reliable sources](https://en.wikipedia.org/wiki/Wikipedia:Reliable_sources)
(in the section on sources produced by machine learning).

### 1.4 Disclosure

In substance: **disclosure of LLM use is strongly recommended.** How we operationalize
this — generating the disclosure mechanically from our own activity log rather than
with a model — is described in the disclosure-practice section below.

Source: [Wikipedia:LLM use disclosure](https://en.wikipedia.org/wiki/Wikipedia:LLM_use_disclosure)
(referenced from [Wikipedia:Artificial intelligence](https://en.wikipedia.org/wiki/Wikipedia:Artificial_intelligence)).

### 1.5 Enforcement framing

In substance: sanctions require evidence that edits violate **core content policies**,
not merely that AI was involved; reviewers weigh the full pattern of an editor's edits
and whether they comply with core content policies. The practical implication for us
is in the "our position" section below.

---

## 2. The intent behind the rules

Reading only the letter ("never use LLMs to find sources") would forbid almost any
software that touches the web. But the deeper question is *what harm* the community is
defending against. The essay and guideline reveal five concerns:

1. **Auditability / opacity.** You cannot inspect *why* a model preferred one source
   over another.
2. **Improper synthesis.** LLMs combine data into new formulations and conclusions not
   stated by the original sources — the same harm as the synthesis / no-original-research
   content policies.
3. **Hallucination.** LLMs invent sources, arguments, and conclusions, including
   fabricated-but-plausible citations.
4. **Incompleteness.** Models miss "unknown unknowns" and do the bare minimum.
5. **Skill atrophy.** Over-reliance erodes editors' own research ability.

**We do not claim an exemption.** An LLM relevance-triage step is itself a form of
LLM-assisted source-finding, so the essay's concerns apply to us. We claim
*mitigation*, not exemption — and where a concern is only partly answerable, we say so.
Each concern maps to a specific guardrail below:

- **Auditability** → the show-your-work guardrail (rankings and non-selected results
  shown), the bounded-LLM-role guardrail (queries shown, editable, logged), the
  input-integrity guardrail, and the foundational audit log.
- **Improper synthesis** → the no-cross-source-synthesis guardrail and the
  no-machine-written-text guardrail (the human writes every claim, from one source).
- **Hallucination** → the anchor-to-a-real-URL guardrail, the support-checking
  guardrail (with a deterministic verbatim-quote check), and the mechanical-citation
  guardrail (citations from deterministic metadata, never model output).
- **Incompleteness** → the show-the-full-candidate-set guardrail, the safe-lane
  guardrail, and the mandatory human-verification gate (the human still does the real
  reading and judgment).
- **Skill atrophy** → *partially* mitigated and partially an accepted residual risk.
  The core research skills stay with the human: they open and read the source and write
  the prose; the tool never pre-fills article text. And the honest counterfactual is
  not "the editor does this research by hand and builds skill" — it is "the editor,
  overwhelmed by volume, does none of these fixes at all." The tool enables careful
  editing that otherwise would not happen, rather than replacing a skill-building habit.
  We accept that some atrophy risk remains and name it rather than pretend it away.

---

## 3. Our position: letter and spirit

The classifier-vs-oracle distinction is *why* our use is lower-risk — not a claim that
it falls outside the rules:

- **LLM as an oracle of facts** — you ask "what happened to program X?" and it answers
  from its weights and supplies citations it generated. This is the prohibited,
  unreliable thing. **We never do this.**
- **LLM as a relevance classifier over real, retrieved documents** — real search
  returns real URLs that resolve; the model reads those real pages and triages "does
  this one appear to answer the question?"; the human opens the winner and verifies.
  The model never originates a fact or a citation. **This is the only LLM role we
  permit**, and even so we treat it as source-finding assistance subject to the
  concerns above.

Synthesis stays human. Prose stays human. Citations are built mechanically from the
real metadata of sources the human approved. Verification is human and mandatory.

The design *goal* is that **every edit can stand on its own content-policy merits** — a
real, reliable source that genuinely supports the exact claim, properly cited, with the
AI assistance disclosed. This is a guarantee only insofar as the human-verification
gate holds, which is exactly why we treat that gate as non-negotiable.

**The central tension we must keep naming.** This product's value is throughput —
clearing many small temporal fixes without breaking the editor's flow. That very goal
creates pressure to rush, and rushing erodes the human-verification gate the whole
contract depends on. If verification degrades into rubber-stamping, every guardrail
becomes theater. We hold this tension deliberately: verification is a hard gate, not a
skippable step; the friction on "open and confirm the source" is intentional and must
not be optimized away; and any engagement or stats features reward *verified, accepted*
edits, never raw speed or volume (see `docs/design/future-features.md`). A tool that
makes bad editing faster is worse than no tool.

We also acknowledge a residual *social* reality: the letter is harsh, and some editors
react to "AI-assisted" reflexively. We address that with radical transparency (see the
disclosure-practice section below), not by hiding the workflow.

---

## 4. Enumerated guardrails (project invariants)

These are hard rules with the same status as the architectural invariants in the
design spec. Each is tagged with the concern it answers. Reference them by name, not
bare number.

- **No machine-written article text, ever (G1).** The tool never emits prose intended
  for an article. The human writes every sentence that lands in Wikipedia.
  *(prohibition; improper synthesis; skill atrophy)*
- **No machine-derived citations, ever (G2).** Every citation is generated mechanically
  from the source's real metadata obtained by a deterministic parser (HTTP headers,
  embedded structured metadata, the page's own citation fields) — never from model
  output. When deterministic metadata is missing or unreliable, the human supplies or
  corrects it; the model never fills the gap. Page-asserted publication dates can be
  wrong, which matters acutely for a staleness tool, so the date is surfaced for the
  human to confirm against the source.
  *(hallucinated citations; reliable-sources rule)*
- **Every surfaced claim anchors to one real, resolving URL (G3),** shown alongside the
  supporting quote/snippet from that page. No free-floating assertions.
  *(hallucination; auditability)*
- **No cross-source synthesis by the machine (G4).** One claim ↔ one source. Combining
  multiple facts into a sentence is done only by the human.
  *(improper synthesis; synthesis / no-original-research rules)*
- **Human verification is a mandatory, gated act of opening the source (G5).** "Verified"
  means the human opened the actual source page — not that they approved a card from the
  worksheet. A card cannot produce a finished citation until the source has been opened,
  and that open is logged. The tool decides what to *surface* and how to *rank* it
  (transparently — see the show-your-work guardrail); it never decides what gets cited.
  That decision is the human's, and it is gated.
  *(verification; auditability; automation bias)*
- **The tool shows its work (G6).** For every high-signal flag, it displays *why* (the
  matching snippet) and also shows the non-selected results, so the human can audit the
  ranking rather than trust it.
  *(opacity; biased source selection)*
- **Prefer primary/official sources; never hide the candidate set (G7).** Sources are
  labeled by type; the full retrieved set is visible.
  *(biased source selection; incompleteness)*
- **Support-checking before "resolves," with a verbatim-quote check (G8).** Before a
  card is presented as appearing to resolve the question, the tool performs automated
  claim-to-source support checking, and a **deterministic, non-LLM string check
  confirms the displayed supporting quote actually appears verbatim in the fetched page
  text.** Weak or unverifiable support is flagged. (Tools such as RefChecker illustrate
  the support-checking technique; the requirement is the check, not any implementation.)
  *(hallucination; text-source integrity; prompt injection)*
- **The LLM's role is boxed to three jobs (G9):** (a) normalize the hanging question
  into *neutral* search queries, (b) relevance-triage real retrieved documents, (c)
  point the human at the passage that appears to resolve the question. For job (c) the
  real artifact is the **verbatim quote** (confirmed by the verbatim-quote check); any
  model phrasing of "the candidate fact" is a disposable navigation label that must
  never flow into the edit, the citation, or the change-description. The quote is a
  pointer the human must open the source to confirm, never a substitute for reading.
  Queries must be neutral retrieval terms, not assertions that presuppose the answer;
  they are shown to the human, editable, and logged. Anything beyond these three jobs
  is out of bounds.
  *(defines the box; auditability; leading-question bias; authorship channel)*
- **Detection is deterministic and explainable (G10).** Stale-claim detection uses no
  LLM (see the "Stale-Claim Detection Model" section of the design spec). The model is
  only in the optional research-assist layer.
  *(auditability)*
- **Stay in the safe lane (G11).** The tool targets high-volume, low-complexity temporal
  fixes with strong official sourcing. Because the deterministic detector cannot itself
  judge "contentious," the safe lane is enforced by concrete, conservative mechanisms —
  topic/category and template denylists, living-persons-namespace heuristics, and
  excluding flagged or disputed articles — and these are imperfect. Anything outside the
  conservative allowlist, and any potentially contentious or negative claim *about* a
  living person, is not offered as an "easy win" but flagged for human-only handling.
  Merely naming an official in a routine procurement fact is fine; the bar is
  contentious or sensitive *claims*, not the presence of a name.
  *(incompleteness / unknown-unknowns; living-persons policy)*
- **Disclosure is mechanical and on by default (G12).** The tool produces a
  ready-to-paste edit summary whose AI-assistance disclosure is generated mechanically
  from the activity log (a deterministic template filled with logged facts), never
  authored by a model. The human pastes it when they submit. See the disclosure-practice
  section for why this does not conflict with the no-machine-written-text guardrail.
  *(disclosure norm; good faith)*
- **The audit log is foundational and self-recording (G13).** An append-only, durable
  activity/audit log is a first-class system built from day one, not a later add-on. It
  is the single source of truth that makes the mechanical disclosure, the
  human-verification gate, and "show your work" real rather than asserted. The act of
  generating a disclosure is itself logged. If the log is not robust, the contract is
  not real. (Stronger tamper-evidence — e.g., hash-chaining — is a possible future
  hardening, not claimed today.)
  *(auditability; good faith)*
- **Responsible automated access to Wikimedia (G14).** When the tool reads from
  Wikimedia services (article text, revisions, pageviews), it is a good API citizen: a
  descriptive User-Agent per Wikimedia policy, respect for rate limits and maxlag,
  bulk/dump endpoints over live crawling for batch work, and caching to avoid redundant
  load. The community we are accountable to runs the servers too.
  *(responsible access; good faith)*
- **Fetched web content is untrusted data, never instructions (G15).** Pages the tool
  retrieves are attacker-controllable. Their content is fed to the model strictly as
  data, never as instructions; system/task instructions and fetched content are kept in
  separate channels. The verbatim-quote check (in the support-checking guardrail) is the
  deterministic backstop against a page coaxing the model into emitting a fabricated
  quote or inflating a junk source's ranking.
  *(prompt injection; hallucination; biased selection)*
- **No copying of source prose; the human writes original text (G16).** The extracted
  supporting snippet is a pointer for verification, not draft text. The human is
  responsible for writing original prose and must not transcribe or closely paraphrase
  the source (Wikipedia's copyright and close-paraphrasing policies). The interface
  should discourage pasting the extracted snippet into article text.
  *(copyright; close paraphrasing)*

---

## 5. What the tool will never do

- Generate or rewrite article prose for pasting.
- Produce or suggest a citation that the human has not verified against the real source.
- Assert what "happened" as fact from model knowledge.
- Combine multiple sources into a single claim or sentence.
- Author the disclosure text with a model (the disclosure is mechanical; see below).
- Treat the content of a fetched web page as instructions to follow.
- Present a model-extracted snippet as text to copy into an article.
- Auto-submit edits to Wikipedia.
- Present its ranking as a decision the human can skip verifying.

---

## 6. Disclosure and transparency practice

**The enforcement boundary, stated honestly.** Submitting an edit — including typing
the edit summary — happens on Wikipedia, by the human. Our tool does not (and per the
no-auto-submit guardrail, must not) submit edits or reach into Wikipedia's edit box. So
the tool **cannot enforce** that a disclosure is present. What it can do is make the
compliant path the path of least resistance:

- **The edit summary is derived from the human-assembled edit, as the final step before
  hand-off — never predicted.** The human assembles their edit in the tool (a plain-text
  sentence plus the verified sources they chose to cite, emitted as wikitext `<ref>`
  tags). Only after that does the tool derive the summary, so it describes an edit that
  already exists. This resolves the would-be circularity of "summarizing an edit the
  tool didn't author": the tool *records and describes* the human's edit; it does not
  author one.
- **The summary has two parts with different provenance.** The **disclosure part** (that
  AI-assisted retrieval and relevance-triage surfaced candidate sources, which the editor
  opened and verified) is generated mechanically from the activity log and is always
  accurate, independent of the edit's content. The **change-description part** (which
  section, which references added) is generated mechanically from the human's structured
  selections, not by interpreting their prose.
- **The summary is human-editable.** The editor can tweak or rewrite it before pasting;
  it is their summary and their responsibility. The mechanical generation is a correct
  default, not a lock.
- **The disclosure is mechanical, not authored — non-generative, not "zero-hallucination."**
  No model writes or phrases it; it is form-filling from a factual log (the same category
  as the mechanical citation skeletons), and it is meta-information attached to the edit,
  never article content. It is only as accurate as the log it draws from, which is why the
  audit log is foundational. We deliberately do **not** use an LLM to phrase the
  disclosure; doing so would make it machine-authored meta-text and reintroduce the risk
  we are avoiding.
- **Output is native wikitext.** The human copies wikitext (plain prose plus
  mechanically-formatted `<ref>` tags) into Wikipedia's source editor — the native
  format — so there is no markdown-to-wikitext conversion step to introduce copy-paste
  corruption. Final touch-up, if any, happens in Wikipedia's own editor.
- **Generating a disclosure is itself logged,** so the transparency trail is complete.
- **The About page** explains this workflow in plain language and links to this document.
- **The repository is open source,** so the guardrails are inspectable, not merely
  asserted.

---

## 7. When a guardrail fails

A prevention-only contract is the kind that embarrasses you when prevention fails. We
plan for failure explicitly.

- **The detector is wrong (false "stale" flag).** Cost is bounded: a false flag only
  spends the editor's attention; the human makes no edit if nothing is actually stale.
  We track the false-positive rate and tune the detector conservatively (precision over
  recall) so the queue stays trustworthy.
- **The support-check passes a bad card.** The gated human-verification act of opening
  the real source is the backstop, and the deterministic verbatim-quote check guards
  against fabricated snippets. These reduce but do not eliminate the risk, which is why
  the verification gate must never be softened for throughput.
- **A guardrail is breached in production** (e.g., a bug lets machine-authored text reach
  the edit path). Commitment: log it; treat it as a stop-the-line incident; if any live
  Wikipedia edit was affected, disclose the breach publicly and work to identify and
  retract the affected edits; and fix the guardrail before resuming.
- **Reporting path.** The community can flag a suspected violation via the project's
  public issue tracker (and any contact listed on the About page). We respond to such
  reports as higher priority than feature work.

---

## 8. Single-user today, and what changes for a hosted/public instance

The tool is built first as a single editor's personal assistant. A public,
anonymous-accessible instance also exists for demonstration and portfolio purposes, and
that changes the risk picture — so we state the boundaries:

- **We cannot vouch for third-party users' diligence.** "Every edit stands on its own
  merits" is a commitment we make for ourselves; for arbitrary users, the guardrails
  still shape the workflow but verification is each editor's own responsibility on
  Wikipedia. The About page makes this explicit.
- **Structural blast-radius limit.** Because the tool never submits edits (the
  no-auto-submit guardrail) and the human must paste each one into Wikipedia by hand, the
  tool cannot *automate* submission or become a hands-off mass-edit firehose. (It does
  not make abuse impossible — a determined user could still assemble many edits and paste
  them quickly — which is why per-user quotas and the kill-switch below also apply.)
- **Shared-access accountability.** Expensive research and edit-assembly are gated behind
  authentication and per-user quotas; anonymous mode is scoped to low-risk browsing and
  demonstration. A shared User-Agent means one abuser could tarnish the tool's standing
  with Wikimedia, so per-user rate budgets, abuse controls, and an admin kill-switch for
  the research layer are in scope (see the design spec's authentication and cost
  sections).
- **Revisit before broadening.** This contract is revisited before access is widened
  beyond demonstration, not after.

---

## 9. Good-faith statement

This project is built by a Wikipedia editor, for their own editing, with AI coding
agents operating under the guardrails above. We read the rules, including the ones that
appear to point against AI tooling, and we designed the system specifically so that AI
acts as a grounded assistant to a human editor — never an author and never a source —
with enumerated guardrails that keep it out of prohibited territory. Where the letter
and the spirit could diverge, we chose the interpretation that most protects
Wikipedia's content standards, and we made the whole approach transparent and
inspectable so the community can hold us to it.

We treat this as a **social contract with the Wikipedia community**: a public, standing
commitment about how we will and will not use AI on the encyclopedia. We expect to be
held to it, and we would rather ship less than break it.

---

## 10. Change log

- **2026-06-04 (v0.6)** — Adversarial review round 3 (self). Removed a stray
  zero-width character from the safe-lane guardrail. Closed the residual authorship
  channel in the bounded-LLM-role guardrail (the verbatim, checked quote is the only
  artifact; any model phrasing of "the fact" is a disposable navigation label that
  never enters the edit, citation, or change-description). Added the human-supplies-
  metadata fallback to the mechanical-citation guardrail for sources lacking clean
  structured metadata. Added a names-only "guardrails at a glance" index for
  scannability without duplicating authoritative text.
- **2026-06-04 (v0.5)** — Adversarial review round 2 (independent Opus reviewer).
  Dropped the "the essay doesn't apply to us" framing as motivated reasoning; now
  concede the source-finding concerns apply and map each concern to a guardrail.
  Added skill-atrophy handling (partial mitigation + named residual risk, with the
  counterfactual). Added a guardrail treating fetched content as untrusted data /
  prompt-injection defense (G15) and a deterministic verbatim-quote check inside the
  support-checking guardrail. Added a copyright / close-paraphrasing guardrail (G16).
  Strengthened the human-verification gate to mean "opened the source" and clarified the
  tool decides what to surface/rank, not what to cite. Required neutral, shown/editable/
  logged queries. Specified deterministic citation-metadata provenance and the
  page-asserted-date caveat. Replaced the "zero-hallucination" overclaim with
  "non-generative." Softened "every edit stands on its own merits" to gate-conditional.
  Added a "when a guardrail fails" incident-response section and a single-user-vs-hosted
  scope section. Reframed the captured rules as explicit paraphrase (no quotation marks)
  pending verbatim verification. Reduced "sacrosanct" repetition and clarified that
  "draft" refers to wording/verification, not bindingness.
- **2026-06-04 (v0.4)** — Adversarial review round 1 (self). Marked captured wording as
  paraphrase-pending-verbatim. Softened the audit-log "tamper-evident" overclaim.
  Replaced brand-named "refchecker-style" with the technique. Narrowed the
  living-persons guardrail to contentious/sensitive claims. Added the throughput-vs-
  verification tension. Added the responsible-automated-access guardrail (G14) and a
  scope note. Corrected the authorship claim.
- **2026-06-04 (v0.3)** — Resolved the edit-summary circularity (summary derived from
  the human-assembled edit; two-provenance split; human-editable). Specified
  native-wikitext output.
- **2026-06-04 (v0.2)** — Removed opaque section-symbol references; added the
  how-to-reference note. Reworked disclosure to be mechanical from the activity log and
  clarified the enforcement boundary. Elevated the audit log to a foundational guardrail.
- **2026-06-04 (v0.1)** — Drafted during the office-hours design session. Captured the
  March 2026 LLM guideline, the bad-search-engines essay, the reliable-sources
  machine-learning guidance, and the disclosure norm; established the oracle-vs-classifier
  distinction and the initial guardrails.
