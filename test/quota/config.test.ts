// ABOUTME: Quota-config loading — defaults when env absent, load-time rejection of invalid caps (testing-pitfalls §6).
// ABOUTME: Validation fires at load, not at first use, so a bad QUOTA_* value surfaces immediately.
import { describe, it, expect } from "vitest";
import {
  loadQuotaConfig,
  DEFAULT_PER_USER_DAILY_CAP,
  DEFAULT_GLOBAL_DAILY_CAP,
} from "../../src/quota/config";

describe("loadQuotaConfig", () => {
  it("uses defaults when the env vars are absent", () => {
    expect(loadQuotaConfig({})).toEqual({
      perUserDailyCap: DEFAULT_PER_USER_DAILY_CAP,
      globalDailyCap: DEFAULT_GLOBAL_DAILY_CAP,
    });
  });

  it("uses defaults when the env vars are empty strings", () => {
    expect(loadQuotaConfig({ QUOTA_PER_USER_DAILY: "", QUOTA_GLOBAL_DAILY: "" })).toEqual({
      perUserDailyCap: DEFAULT_PER_USER_DAILY_CAP,
      globalDailyCap: DEFAULT_GLOBAL_DAILY_CAP,
    });
  });

  it("parses valid positive-integer overrides", () => {
    expect(loadQuotaConfig({ QUOTA_PER_USER_DAILY: "3", QUOTA_GLOBAL_DAILY: "100" })).toEqual({
      perUserDailyCap: 3,
      globalDailyCap: 100,
    });
  });

  it("rejects a non-integer cap at load", () => {
    expect(() => loadQuotaConfig({ QUOTA_PER_USER_DAILY: "1.5" })).toThrow(/positive integer/i);
  });

  it("rejects a zero or negative cap at load", () => {
    expect(() => loadQuotaConfig({ QUOTA_GLOBAL_DAILY: "0" })).toThrow(/positive integer/i);
    expect(() => loadQuotaConfig({ QUOTA_PER_USER_DAILY: "-4" })).toThrow(/positive integer/i);
  });

  it("rejects a non-numeric cap at load", () => {
    expect(() => loadQuotaConfig({ QUOTA_GLOBAL_DAILY: "lots" })).toThrow(/positive integer/i);
  });
});
