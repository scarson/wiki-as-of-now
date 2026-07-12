// ABOUTME: Smoke test verifying the core app identity contract.
// ABOUTME: Ensures the app name export resolves correctly at startup.
import { describe, it, expect } from "vitest";
import { appName } from "../src/domain/version";
describe("smoke", () => {
  it("exposes the app name", () => { expect(appName()).toBe("WikiAsOfNow"); });
});
