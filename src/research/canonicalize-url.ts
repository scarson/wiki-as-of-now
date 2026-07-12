// ABOUTME: Parse-then-canonicalize SSRF host-classification guard — shared by the source-fetch guard
// ABOUTME: and per-host fan-out cap so both count the same canonical host. Pure, synchronous, non-fetching.

// Named residuals (accepted; consistent with the spec's DNS-rebinding residual): deprecated
// IPv4-compatible IPv6 (::/96, e.g. [::7f00:1]) — ipaddr.js classifies these as "unicast" and does not
// map them to their embedded IPv4, so they pass. Modern stacks do not route IPv4-compatible addresses
// to the embedded v4, and NAT64 (64:ff9b::/96) is now CLOSED (ipaddr.js classifies it as "rfc6052").
// A DNS name that resolves to a blocked IP is likewise out of scope (string-level guard, no resolve-then-pin).

import ipaddr from "ipaddr.js";

/** DNS hostnames that must always be rejected. */
const BLOCKED_HOSTNAMES = new Set<string>([
  "localhost",
  "metadata.google.internal",
  "metadata.internal",
  "computemetadata.v1",
  "169.254.169.254", // belt-and-suspenders (parsed as IPv4 by URL parser, but guard DNS too)
]);

// IPv4 range names (ipaddr.js) treated as non-public → reject. Mirrors the spec's enumerated set:
// 127/8 loopback, 10/8+172.16/12+192.168/16 private, 169.254/16 linkLocal (incl. 169.254.169.254 metadata),
// 0/8 unspecified, 255.255.255.255 broadcast.
const BLOCKED_V4_RANGES: ReadonlySet<string> = new Set(["unspecified", "broadcast", "loopback", "private", "linkLocal"]);

// IPv6 range names → reject: ::1 loopback, :: unspecified, fe80::/10 linkLocal, fc00::/7 uniqueLocal,
// and NAT64 64:ff9b::/96 (rfc6052) — now closed because ipaddr.js classifies it.
// ipv4Mapped (::ffff:0:0/96) is handled specially below by testing the embedded IPv4.
// NOTE: "reserved" (e.g. 2001:db8::/32 documentation prefix) is intentionally NOT blocked — it is
// publicly routable documentation space that MUST-PASS per the test corpus.
const BLOCKED_V6_RANGES: ReadonlySet<string> = new Set(["loopback", "unspecified", "linkLocal", "uniqueLocal", "rfc6052"]);

function isBlockedIp(addr: ReturnType<typeof ipaddr.parse>): boolean {
  if (addr.kind() === "ipv4") return BLOCKED_V4_RANGES.has(addr.range());
  const r = addr.range();
  if (r === "ipv4Mapped") {
    // Extract the embedded IPv4 and test it against the v4 block set.
    const v4 = (addr as ipaddr.IPv6).toIPv4Address();
    return BLOCKED_V4_RANGES.has(v4.range());
  }
  return BLOCKED_V6_RANGES.has(r);
}

export type CanonicalizeResult =
  | { ok: true; url: URL; host: string }
  | { ok: false };

/**
 * Parse a raw URL string, validate scheme + userinfo, and classify the host for SSRF safety.
 * Returns ok:true with the parsed URL and lowercase canonical host on success;
 * ok:false on parse failure, forbidden scheme, userinfo, or blocked host.
 */
export function canonicalizeUrl(raw: string): CanonicalizeResult {
  // Step 1 — parse; any malformed URL is immediately rejected.
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false };
  }

  // Step 2 — scheme must be https only.
  if (url.protocol !== "https:") return { ok: false };

  // Step 3 — userinfo is an injection signal.
  if (url.username !== "" || url.password !== "") return { ok: false };

  // Step 4 — host classification.
  const parsedHost = url.hostname; // already lowercased + normalized by the WHATWG parser
  // Strip a single trailing dot (FQDN root): "localhost." must classify as "localhost",
  // else the trailing-dot form bypasses the exact-match hostname denylist. (IPv4 literals
  // already have any trailing dot stripped by the parser; IPv6 hostnames are bracketed.)
  const hostname = parsedHost.length > 1 && parsedHost.endsWith(".") ? parsedHost.slice(0, -1) : parsedHost;

  // IPv6 literal arrives bracketed in .hostname; strip the brackets for ipaddr.
  const ipLiteral = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  if (ipaddr.isValid(ipLiteral)) {
    if (isBlockedIp(ipaddr.parse(ipLiteral))) return { ok: false };
    return { ok: true, url, host: hostname };
  }

  // Not an IP literal → DNS name: apply the hostname denylist.
  if (BLOCKED_HOSTNAMES.has(hostname)) return { ok: false };

  // Step 5 — all checks passed.
  return { ok: true, url, host: hostname };
}
