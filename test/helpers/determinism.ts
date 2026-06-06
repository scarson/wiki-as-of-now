// ABOUTME: Test helper — arms traps so pure/deterministic code that reaches past its injected
// ABOUTME: seams (ambient fetch/clock/RNG) fails loudly instead of silently eroding determinism.
import { afterEach, beforeEach } from "vitest";

/** Call inside a describe() whose subject MUST be deterministic + network-free. Restores in afterEach. */
export function armDeterminismTraps(): void {
  // We trap fetch / Date.now / Math.random (network + non-determinism sources). We deliberately do NOT trap
  // crypto.subtle — claim_key hashing uses SHA-256, deterministic given input and legitimate. We also do NOT
  // trap crypto.randomUUID: it's read-only on some runtimes (reassigning throws) and the pure functions don't
  // use it (if a pure function ever needs randomness, catch that design smell in review, not via a trap).
  const saved: Record<string, unknown> = {};
  beforeEach(() => {
    saved.fetch = globalThis.fetch;
    saved.now = Date.now;
    saved.random = Math.random;
    globalThis.fetch = (() => { throw new Error("ambient fetch in a deterministic test — inject the dependency"); }) as typeof fetch;
    Date.now = () => { throw new Error("ambient Date.now in a deterministic test — inject `now`"); };
    Math.random = () => { throw new Error("ambient Math.random in a deterministic test"); };
  });
  afterEach(() => {
    globalThis.fetch = saved.fetch as typeof fetch;
    Date.now = saved.now as typeof Date.now;
    Math.random = saved.random as typeof Math.random;
  });
}
