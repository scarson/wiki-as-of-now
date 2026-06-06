// ABOUTME: Unit tests for canonicalizeUrl — the SSRF host-classification guard shared by
// ABOUTME: the source-fetch guard and per-host fan-out cap. Covers MUST-PASS and MUST-REJECT cases.
import { describe, it, expect } from "vitest";
import { armDeterminismTraps } from "../helpers/determinism";
import { canonicalizeUrl } from "../../src/research/canonicalize-url";

describe("canonicalizeUrl", () => {
  armDeterminismTraps(); // pure + non-fetching: ambient fetch/clock/RNG must throw

  it("is synchronous (returns a value, not a Promise)", () => {
    const r = canonicalizeUrl("https://en.wikipedia.org/wiki/Artemis_program");
    expect(typeof (r as { then?: unknown }).then).toBe("undefined");
  });

  // MUST-PASS (composition guard — a guard that blocks everything is useless):
  it.each([
    "https://en.wikipedia.org/wiki/Artemis_program",
    "https://www.defense.gov/News/Releases/",
    "https://example.co.uk/report?id=5",
  ])("allows legitimate public https URL %s", (u) => {
    expect(canonicalizeUrl(u).ok).toBe(true);
  });

  // MUST-REJECT:
  it.each([
    "http://en.wikipedia.org/",            // non-https
    "data:text/html,hi", "file:///etc/passwd", "ftp://x/",
    "https://user:pass@evil.com/",         // userinfo
    "https://127.0.0.1/", "https://localhost/", "https://0.0.0.0/",
    "https://169.254.169.254/",            // cloud metadata
    "https://2130706433/",                 // decimal 127.0.0.1
    "https://0x7f000001/", "https://0177.0.0.1/", "https://127.1/", // hex/octal/short
    "https://[::1]/", "https://[::]/",
    "https://[::ffff:169.254.169.254]/",   // IPv4-mapped IPv6
    "https://10.0.0.5/", "https://192.168.1.1/", "https://172.16.0.1/",
    "not a url",
  ])("rejects %s", (u) => {
    expect(canonicalizeUrl(u).ok).toBe(false);
  });
});
