// ABOUTME: In-memory per-IP fixed-window throttle for the anonymous capture endpoint.
// ABOUTME: State lives only in isolate memory — nothing identifier-derived is ever persisted (privacy-policy promise).

export interface CaptureThrottleConfig {
  limit: number;
  windowSeconds: number;
}

export const DEFAULT_CAPTURE_THROTTLE_LIMIT = 10;
export const DEFAULT_CAPTURE_THROTTLE_WINDOW_SECONDS = 60;

/**
 * Upper bound on concurrently tracked keys. When live-key pressure exceeds it,
 * the oldest-tracked key is evicted (fails open per-key) — a bounded throttle
 * must never grow without limit or start refusing everyone.
 */
export const MAX_TRACKED_KEYS = 2000;

export type ThrottleDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export interface CaptureThrottle {
  check(key: string, nowMs: number): ThrottleDecision;
}

interface WindowState {
  windowStartMs: number;
  count: number;
}

/**
 * Fixed-window counter per key, held in a size-bounded insertion-ordered Map.
 * Scope is one Worker isolate: a modest brake on request loops from a single
 * source, not a durable cross-colo rate limiter (that would require persisting
 * an IP-derived identifier, which the privacy policy rules out for anonymous
 * actions).
 */
export function createCaptureThrottle(config: CaptureThrottleConfig): CaptureThrottle {
  const windowMs = config.windowSeconds * 1000;
  const windows = new Map<string, WindowState>();

  function prune(nowMs: number): void {
    for (const [key, state] of windows) {
      if (nowMs >= state.windowStartMs + windowMs) windows.delete(key);
    }
    while (windows.size >= MAX_TRACKED_KEYS) {
      const oldest = windows.keys().next().value;
      if (oldest === undefined) break;
      windows.delete(oldest);
    }
  }

  function check(key: string, nowMs: number): ThrottleDecision {
    const state = windows.get(key);
    if (state === undefined || nowMs >= state.windowStartMs + windowMs) {
      if (state === undefined && windows.size >= MAX_TRACKED_KEYS) prune(nowMs);
      windows.delete(key);
      windows.set(key, { windowStartMs: nowMs, count: 1 });
      return { allowed: true };
    }
    if (state.count < config.limit) {
      state.count++;
      return { allowed: true };
    }
    const retryAfterSeconds = Math.ceil((state.windowStartMs + windowMs - nowMs) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  return { check };
}

interface CaptureThrottleEnv {
  CAPTURE_THROTTLE_LIMIT?: string;
  CAPTURE_THROTTLE_WINDOW_SECONDS?: string;
}

function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`capture throttle: ${name} must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return n;
}

export function loadCaptureThrottleConfig(env: CaptureThrottleEnv): CaptureThrottleConfig {
  return {
    limit: parsePositiveInt(env.CAPTURE_THROTTLE_LIMIT, DEFAULT_CAPTURE_THROTTLE_LIMIT, "CAPTURE_THROTTLE_LIMIT"),
    windowSeconds: parsePositiveInt(
      env.CAPTURE_THROTTLE_WINDOW_SECONDS,
      DEFAULT_CAPTURE_THROTTLE_WINDOW_SECONDS,
      "CAPTURE_THROTTLE_WINDOW_SECONDS"
    ),
  };
}
