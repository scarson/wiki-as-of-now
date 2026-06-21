// ABOUTME: Browse-mode UI helpers — anonymous is browse-only and cannot request research; authenticated can.
// ABOUTME: These are advisory signposting; the server gate (gate.ts → 401 for anonymous) is the real enforcement.
import { describe, it, expect } from "vitest";
import { browseModeLabel, canRequestResearch } from "../../src/app/browse-mode";

describe("browse mode UI helpers", () => {
  it("anonymous visitors are labeled browse-only and cannot request research", () => {
    expect(browseModeLabel("anonymous")).toMatch(/browsing/i);
    expect(canRequestResearch("anonymous")).toBe(false);
  });

  it("authenticated users can request research", () => {
    expect(canRequestResearch("authenticated")).toBe(true);
    expect(browseModeLabel("authenticated")).toMatch(/signed in/i);
  });
});
