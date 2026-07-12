// ABOUTME: Research kill-switch flag parsing — both flag states + empty/garbage values (testing-pitfalls §6).
// ABOUTME: Default is ENABLED (research on); only an explicit truthy value disables.
import { describe, it, expect } from "vitest";
import { isResearchKillSwitchOn, ResearchDisabledError } from "../../src/research/kill-switch";

describe("research kill-switch", () => {
  it("research is ENABLED by default (flag absent)", () => {
    expect(isResearchKillSwitchOn({})).toBe(false);
    expect(isResearchKillSwitchOn({ RESEARCH_KILL_SWITCH: "" })).toBe(false);
  });

  it("an explicit truthy value DISABLES research (kill-switch on)", () => {
    expect(isResearchKillSwitchOn({ RESEARCH_KILL_SWITCH: "1" })).toBe(true);
    expect(isResearchKillSwitchOn({ RESEARCH_KILL_SWITCH: "true" })).toBe(true);
    expect(isResearchKillSwitchOn({ RESEARCH_KILL_SWITCH: "on" })).toBe(true);
    expect(isResearchKillSwitchOn({ RESEARCH_KILL_SWITCH: "yes" })).toBe(true);
  });

  it("is case-insensitive and tolerant of surrounding whitespace", () => {
    expect(isResearchKillSwitchOn({ RESEARCH_KILL_SWITCH: "  TRUE  " })).toBe(true);
    expect(isResearchKillSwitchOn({ RESEARCH_KILL_SWITCH: "On" })).toBe(true);
  });

  it("a falsy-looking value keeps research enabled", () => {
    expect(isResearchKillSwitchOn({ RESEARCH_KILL_SWITCH: "0" })).toBe(false);
    expect(isResearchKillSwitchOn({ RESEARCH_KILL_SWITCH: "false" })).toBe(false);
    expect(isResearchKillSwitchOn({ RESEARCH_KILL_SWITCH: "off" })).toBe(false);
  });

  it("a garbage value keeps research enabled (does not accidentally disable)", () => {
    expect(isResearchKillSwitchOn({ RESEARCH_KILL_SWITCH: "banana" })).toBe(false);
  });

  it("ResearchDisabledError carries a stable name for handler mapping", () => {
    const e = new ResearchDisabledError();
    expect(e.name).toBe("ResearchDisabledError");
  });
});
