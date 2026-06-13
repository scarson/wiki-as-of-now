// ABOUTME: Derives the worksheet honesty/degradation state — the single home for the four-state mapping (design-doc §8 / spec §18.5).
// ABOUTME: deriveHonestyState maps a ResearchPackRead; honestyFromSurfaced maps Phase 2's SurfacedPack (what the worksheet view consumes, D-2).
import type { ResearchPackRead } from "../db/research-packs";
import type { SurfacedPack } from "../research/surface-pack";
import type { WorksheetHonestyState } from "./view-types";

export function deriveHonestyState(
  read: ResearchPackRead,
  sourceRevisionId: number,
  currentRevisionId: number,
): WorksheetHonestyState {
  const revisionDrift = currentRevisionId !== sourceRevisionId;

  if (read.state === "not_found") {
    return { kind: revisionDrift ? "article_changed_since_detection" : "provider_unavailable", revisionDrift };
  }
  if (read.state === "pack_unreadable") {
    return { kind: "provider_unavailable", revisionDrift };
  }
  const pack = read.pack;
  if (pack.cards.length === 0) {
    return { kind: "likely_stale_no_strong_source", revisionDrift };
  }
  const anySupported = pack.cards.some((c) => c.advisorySupport === true);
  return {
    kind: anySupported ? "supported" : "possible_update_weak_support",
    revisionDrift,
  };
}

/**
 * Maps Phase 2's SurfacedPack (the type the worksheet view assembly consumes — boundary D-2) to the same
 * five honesty kinds. Phase 2's surfaceResearchPack already split not_found from revision_drift and re-validated
 * the revision, so this is a pure 1:1 state map and does NOT re-derive drift. This is what loadWorksheetView calls.
 */
export function honestyFromSurfaced(surfaced: SurfacedPack): WorksheetHonestyState {
  switch (surfaced.state) {
    case "surfaced": {
      if (surfaced.cards.length === 0) return { kind: "likely_stale_no_strong_source", revisionDrift: false };
      const anySupported = surfaced.cards.some((c) => c.advisorySupport === true);
      return { kind: anySupported ? "supported" : "possible_update_weak_support", revisionDrift: false };
    }
    case "revision_drift":
      return { kind: "article_changed_since_detection", revisionDrift: true };
    case "unreadable":
    case "not_found":
      return { kind: "provider_unavailable", revisionDrift: false };
  }
}
