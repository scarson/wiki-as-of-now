// ABOUTME: Global vitest setup — enforces pristine test output (no stray console.error/warn).
// ABOUTME: Error-path tests opt out per-case via allowConsole(); see testing-pitfalls §1.
import { afterEach, beforeEach, vi } from "vitest";

let allowed = false;
/** Call at the top of a test that legitimately logs (asserting on the captured output). */
export function allowConsole(): void { allowed = true; }

let errSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  allowed = false;
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  const calls = errSpy.mock.calls.length + warnSpy.mock.calls.length;
  errSpy.mockRestore();
  warnSpy.mockRestore();
  if (!allowed && calls > 0) throw new Error(`Non-pristine test output: ${calls} console.error/warn call(s). Capture+assert the error, or allowConsole().`);
});
