// ABOUTME: Human-readable label for each safe-lane reason code the eligibility gate can emit (spec §2 table).
// ABOUTME: The dispute_template: startsWith guard precedes the switch; an unknown code falls back to its raw form (never blank).
export function reasonLabel(code: string): string {
  if (code.startsWith("dispute_template:")) {
    return `dispute/maintenance tag: ${code.slice("dispute_template:".length)}`;
  }
  switch (code) {
    case "blp_category":
      return "biography of a living person";
    case "non_mainspace":
      return "not a main-namespace article";
    case "recently_edited":
      return "edited very recently";
    case "metadata_unavailable":
      return "metadata could not be confirmed";
    case "blp_wikitext":
      return "living-person category in source";
    default:
      return code;
  }
}
