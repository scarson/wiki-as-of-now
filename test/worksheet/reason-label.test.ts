// ABOUTME: Tests reasonLabel — the human-readable label for each safe-lane reason code (spec §2 table).
// ABOUTME: Verifies the dispute_template: startsWith guard precedes the switch and unknown codes fall back to raw form.
import { describe, it, expect } from "vitest";
import { reasonLabel } from "../../src/worksheet/reason-label";

describe("reasonLabel", () => {
  it("maps the dispute_template: prefix (guard runs before the switch)", () => {
    expect(reasonLabel("dispute_template:Update")).toBe("dispute/maintenance tag: Update");
  });

  it("maps each known floor/advisory reason code", () => {
    expect(reasonLabel("blp_category")).toBe("biography of a living person");
    expect(reasonLabel("non_mainspace")).toBe("not a main-namespace article");
    expect(reasonLabel("recently_edited")).toBe("edited very recently");
    expect(reasonLabel("metadata_unavailable")).toBe("metadata could not be confirmed");
    expect(reasonLabel("blp_wikitext")).toBe("living-person category in source");
  });

  it("falls back to the raw code for an unrecognized reason (never blank)", () => {
    expect(reasonLabel("some_future_code")).toBe("some_future_code");
  });
});
