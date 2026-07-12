// ABOUTME: ResearchPackRead → TransparencyView transformer for the show-your-work view (G6/G7).
// ABOUTME: Pure + defensive: handles found/pack_unreadable/not_found, surfaces the full candidate set, never synthesizes prose.
import type { ResearchPackRead } from "../db/research-packs";
import type { EvidenceCard } from "../research/provider";
import { labelForReason, type DispositionLane } from "./reason-labels";

export interface DroppedView {
  url: string;
  reason: string;
  reasonLabel: string;
  lane: DispositionLane;
}

export type TransparencyView =
  | {
      kind: "pack";
      modelVersion: string;
      providerName: string;
      status: "no_proposals" | "proposals_present";
      selected: EvidenceCard[];
      dropped: DroppedView[];
      queries: string[];
      evaluatedAt: string;
    }
  | { kind: "not_found" }
  | { kind: "unreadable" };

export function toTransparencyView(read: ResearchPackRead): TransparencyView {
  if (read.state === "pack_unreadable") return { kind: "unreadable" };
  if (read.state === "not_found") return { kind: "not_found" };

  const pack = read.pack;
  return {
    kind: "pack",
    modelVersion: pack.modelVersion,
    providerName: pack.providerName,
    status: pack.status,
    selected: pack.cards, // verified verbatim quotes + real URLs only
    dropped: pack.dispositions.map((d) => {
      const { label, lane } = labelForReason(d.reason);
      return { url: d.url, reason: d.reason, reasonLabel: label, lane };
    }),
    queries: pack.queries, // disposable navigation (G9), shown to the human, never persisted into an edit
    evaluatedAt: pack.evaluatedAt,
  };
}
