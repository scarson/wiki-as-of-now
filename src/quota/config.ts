// ABOUTME: Quota config — per-user + global daily pack-insert caps, loaded from env with safe defaults + validation.
// ABOUTME: Caps are positive integers; invalid env values fail at load, not at first use (testing-pitfalls §6).
export interface QuotaConfig {
  perUserDailyCap: number;
  globalDailyCap: number;
}

export const DEFAULT_PER_USER_DAILY_CAP = 10;
export const DEFAULT_GLOBAL_DAILY_CAP = 50;

interface QuotaEnv {
  QUOTA_PER_USER_DAILY?: string;
  QUOTA_GLOBAL_DAILY?: string;
}

function parseCap(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`quota: ${name} must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return n;
}

export function loadQuotaConfig(env: QuotaEnv): QuotaConfig {
  return {
    perUserDailyCap: parseCap(env.QUOTA_PER_USER_DAILY, DEFAULT_PER_USER_DAILY_CAP, "QUOTA_PER_USER_DAILY"),
    globalDailyCap: parseCap(env.QUOTA_GLOBAL_DAILY, DEFAULT_GLOBAL_DAILY_CAP, "QUOTA_GLOBAL_DAILY"),
  };
}
