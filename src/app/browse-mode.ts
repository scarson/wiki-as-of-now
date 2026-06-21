// ABOUTME: Pure UI helpers for the anonymous-vs-authenticated browse posture — labels + the research-affordance gate.
// ABOUTME: Advisory only: the authoritative access control is the server enqueue gate (gate.ts → 401 for anonymous).
export type BrowseAuthState = "anonymous" | "authenticated";

/** Human-readable label for the auth-state indicator. Sentence-case (no uppercase eyebrow kicker — DESIGN.md). */
export function browseModeLabel(state: BrowseAuthState): string {
  return state === "anonymous" ? "Browsing as a guest" : "Signed in";
}

/** Whether the "research this claim" affordance is offered. Anonymous is browse-only (compliance: low-risk
 *  browsing/demo only). NOT the access control — the server rejects an anonymous enqueue regardless. */
export function canRequestResearch(state: BrowseAuthState): boolean {
  return state === "authenticated";
}
