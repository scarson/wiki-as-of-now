// ABOUTME: Builds the two-part mechanical edit-summary disclosure (G12) — a deterministic template fill.
// ABOUTME: Disclosure part names the AI model+version from the log; never model-authored prose.
import type { DisclosureSummary } from "./view-types";

export interface DisclosureInput {
  /** Full model id read from the pack/audit log; null → honest "unspecified" (never a fabricated model name). */
  modelVersion: string | null;
  /** The HUMAN-CONFIRMED section name, not raw wikitext (no '==', templates, or markup). */
  sectionHeading: string;
  refCount: number;
}

export function buildDisclosureSummary(input: DisclosureInput): DisclosureSummary {
  const model = input.modelVersion ?? "unspecified model";
  const refs = `${input.refCount} reference${input.refCount === 1 ? "" : "s"}`;
  const changeDescription = `Updated ${input.sectionHeading}; added ${refs}.`;
  const disclosure = `AI-assisted: retrieval and relevance-triage (model ${model}) surfaced candidate sources, which I opened and verified.`;
  return { changeDescription, disclosure, combined: `${changeDescription} ${disclosure}` };
}
