// ABOUTME: surfaceResearchPack — the worksheet read over getSurfaceablePack, splitting CC-20's not_found into
// ABOUTME: real-not-found vs revision_drift so the UI can FLAG drift (never silently show nothing). Verified cards only.
import type { SqlExecutor } from "../db/client";
import type { EvidenceCard } from "./provider";
import type { DroppedProposal } from "./verify-proposal";
import { getSurfaceablePack } from "../db/research-packs";

export type SurfacedPack =
  | { state: "surfaced"; providerName: string; modelVersion: string; queries: string[];
      cards: EvidenceCard[]; dispositions: DroppedProposal[]; evaluatedAt: string; sourceRevisionId: number }
  | { state: "revision_drift"; packRevisionId: number; currentRevisionId: number }
  | { state: "unreadable" }
  | { state: "not_found" };

export async function surfaceResearchPack(
  db: SqlExecutor,
  args: { pageId: number; claimKey: string; currentRevisionId: number },
): Promise<SurfacedPack> {
  const surfaceable = await getSurfaceablePack(db, args.claimKey, args.pageId);
  if (surfaceable.state === "found") {
    const p = surfaceable.pack;
    return {
      state: "surfaced", providerName: p.providerName, modelVersion: p.modelVersion,
      queries: p.queries, cards: p.cards, dispositions: p.dispositions,
      evaluatedAt: p.evaluatedAt, sourceRevisionId: p.sourceRevisionId,
    };
  }
  if (surfaceable.state === "pack_unreadable") return { state: "unreadable" };

  // surfaceable.state === "not_found": could be "never computed" OR "revision drifted" (CC-20).
  // Probe whether a pack exists at ANY revision for this (pageId, claimKey) to distinguish them.
  const rows = await db
    .prepare("SELECT source_revision_id FROM research_packs WHERE claim_key = ? AND page_id = ? ORDER BY source_revision_id DESC LIMIT 1")
    .bind(args.claimKey, args.pageId)
    .all<{ source_revision_id: number }>();
  const existing = rows[0];
  if (existing && existing.source_revision_id !== args.currentRevisionId) {
    return { state: "revision_drift", packRevisionId: existing.source_revision_id, currentRevisionId: args.currentRevisionId };
  }
  return { state: "not_found" };
}
