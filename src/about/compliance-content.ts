// ABOUTME: About/compliance page content — human-authored constants sourced from the compliance contract (G1).
// ABOUTME: No LLM, no fetch, no provider import; links the canonical contract + open-source repo as the source of truth.

export interface GuardrailEntry {
  name: string; // the contract's own name for the guardrail (never a bare id)
  id: string; // secondary stable anchor (G1..G16)
  summary: string; // one-line orientation, human-authored
}

export interface AboutContent {
  intro: string;
  willDo: string[];
  willNeverDo: string[];
  guardrails: GuardrailEntry[];
  complianceContractPath: string;
  repoUrl: string;
  abuseReportUrl: string;
}

// Derived from `git remote get-url origin` (https://github.com/scarson/wiki-as-of-now.git).
const REPO_URL = "https://github.com/scarson/wiki-as-of-now";
const ABUSE_REPORT_URL = `${REPO_URL}/issues`;

export function aboutContent(): AboutContent {
  return {
    intro:
      "WikiAsOfNow is a research assistant for Wikipedia editors. It finds claims whose " +
      "“as of” reality may have expired and helps a human editor find and verify real sources. " +
      "AI here is a grounded assistant to a human — never an author of article content, and never a source.",
    willDo: [
      "Detect potentially stale claims with a deterministic, LLM-free detector.",
      "Use AI only to suggest neutral search queries and point at passages that may resolve the question.",
      "Confirm every supporting quote appears verbatim on the real, fetched source page.",
      "Show its work: the queries, the selected evidence, and the candidates it dropped.",
      "Build citations mechanically from the real source's metadata.",
      "Require the human to open and read each source before it can be cited.",
      "Generate a mechanical, human-editable disclosure naming the AI model and version.",
    ],
    // Transcribed EXACTLY from the contract's "5. What the tool will never do" section.
    willNeverDo: [
      "Generate or rewrite article prose for pasting.",
      "Produce or suggest a citation that the human has not verified against the real source.",
      "Assert what \"happened\" as fact from model knowledge.",
      "Combine multiple sources into a single claim or sentence.",
      "Author the disclosure text with a model (the disclosure is mechanical).",
      "Treat the content of a fetched web page as instructions to follow.",
      "Present a model-extracted snippet as text to copy into an article.",
      "Auto-submit edits to Wikipedia.",
      "Present its ranking as a decision the human can skip verifying.",
    ],
    // Guardrail NAMES transcribed from the contract's "guardrails at a glance" index;
    // the canonical text lives in the contract (linked below) — these are orientation, not a deep-copy.
    guardrails: [
      { id: "G1", name: "the no-machine-written-text guardrail", summary: "The human writes every sentence that lands in Wikipedia." },
      { id: "G2", name: "no machine-derived citations", summary: "Citations are built mechanically from real source metadata." },
      { id: "G3", name: "anchor every claim to a real URL", summary: "Each surfaced claim points at one real, resolving source page." },
      { id: "G4", name: "no cross-source synthesis by the machine", summary: "One claim, one source; only the human combines facts." },
      { id: "G5", name: "human verification is a gated act of opening the source", summary: "Nothing is cited until the human opens and reads the source." },
      { id: "G6", name: "the tool shows its work", summary: "Selected and non-selected results are both shown for audit." },
      { id: "G7", name: "prefer official sources and never hide the candidate set", summary: "The full retrieved candidate set stays visible." },
      { id: "G8", name: "support-check with a verbatim-quote check", summary: "A deterministic check confirms the quote is really on the page." },
      { id: "G9", name: "the LLM's role is boxed to three jobs", summary: "Query, triage, point at a passage — nothing else." },
      { id: "G10", name: "detection is deterministic", summary: "Stale-claim detection uses no LLM at all." },
      { id: "G11", name: "stay in the safe lane", summary: "Living-persons articles are excluded from the easy-win queue by default." },
      { id: "G12", name: "disclosure is mechanical", summary: "A template names the AI model and version from the activity log." },
      { id: "G13", name: "the audit log is foundational", summary: "An append-only activity log makes the guarantees real, not asserted." },
      { id: "G14", name: "responsible automated access", summary: "A good API citizen to Wikimedia services." },
      { id: "G15", name: "fetched content is untrusted data", summary: "Web page content is data to the model, never instructions." },
      { id: "G16", name: "no copying of source prose", summary: "The human writes original text; snippets are pointers, not drafts." },
    ],
    complianceContractPath: "docs/policy/wikipedia-genai-compliance.md",
    repoUrl: REPO_URL,
    abuseReportUrl: ABUSE_REPORT_URL,
  };
}
