// ABOUTME: Maps each WorksheetHonestyKind to its human-readable banner string (the four spec degradation states + supported).
// ABOUTME: Every kind has a non-empty banner so no honesty/degradation state ever renders blank (show-your-work guardrail G6).
import type { WorksheetHonestyKind } from "./view-types";

const BANNER_TEXT: Record<WorksheetHonestyKind, string> = {
  supported: "a current source appears to support an update",
  possible_update_weak_support: "possible update, weak support",
  likely_stale_no_strong_source: "likely stale, no strong current source",
  provider_unavailable: "provider unavailable",
  article_changed_since_detection: "article changed since detection",
};

export function honestyBannerText(kind: WorksheetHonestyKind): string {
  return BANNER_TEXT[kind];
}
