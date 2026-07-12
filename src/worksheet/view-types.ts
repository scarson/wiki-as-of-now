// ABOUTME: Shared worksheet view types — the render-model shapes the .tsx components and API routes consume.
// ABOUTME: Extracts the inline-view-type pattern into one module; carries ONLY verbatim/deterministic fields (no model prose slot).

/** The five honesty/degradation kinds the worksheet renders (design-doc §8 / spec §18.5). */
export type WorksheetHonestyKind =
  | "supported"
  | "possible_update_weak_support"
  | "likely_stale_no_strong_source"
  | "provider_unavailable"
  | "article_changed_since_detection";

export interface WorksheetHonestyState {
  kind: WorksheetHonestyKind;
  /** True when the article's current revision differs from the pack's source revision (CC-20). */
  revisionDrift: boolean;
}

/** Evidence-card render model — verbatim fields ONLY; structurally incapable of carrying model prose (G1). */
export interface EvidenceCardView {
  url: string;
  verbatimQuote: string;
  advisorySupport: boolean;
  /** Deterministic source text before the quote in its paragraph; null at paragraph start (design 2026-06-21). */
  contextBefore: string | null;
  /** Deterministic source text after the quote in its paragraph; null at paragraph end (design 2026-06-21). */
  contextAfter: string | null;
}

/** The claim under review, as the article/worksheet views render it. */
export interface ArticleClaimView {
  candidateId: number;
  pageId: number;
  sectionHeading: string;
  sentenceText: string;
  year: number;
  marker: string;
  explanation: string;
  sourceRevisionId: number;
}

/** The assembled worksheet view — claim + honesty state + verbatim cards + disclosure inputs. */
export interface WorksheetView {
  claim: ArticleClaimView;
  honesty: WorksheetHonestyState;
  cards: EvidenceCardView[];
  /** Full model id for the G12 disclosure; null if no surfaced pack. */
  modelVersion: string | null;
  /** Disposable-navigation queries — shown only in the show-your-work view (G9), never as evidence. */
  queries: string[];
  claimKey: string;
}

/** Per-source UI state the client tracks for the G5 gate. */
export interface SourceGateState {
  url: string;
  /** True once the G5 confirm has committed; gates the snippet/disclosure unlock. */
  opened: boolean;
}

/** Deterministic source metadata the mechanical <ref> is built from (G2). NO field for the human sentence or model quote. */
export interface RefAssemblyInput {
  url: string;
  title: string;
  publisher?: string;
  /** Page-asserted; the human confirms it against the source (G2). */
  publishedDate?: string;
  accessedDate: string;
}

/** The two-part mechanical edit-summary disclosure (G12). */
export interface DisclosureSummary {
  /** From the human's structured selections (section, ref count). */
  changeDescription: string;
  /** Mechanical; names the AI model+version (G12). */
  disclosure: string;
  /** Paste-ready; human-editable before pasting. */
  combined: string;
}
