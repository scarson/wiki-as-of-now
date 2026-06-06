// ABOUTME: Parse-then-canonicalize SSRF host-classification guard — shared by the source-fetch guard
// ABOUTME: and per-host fan-out cap so both count the same canonical host. Pure, synchronous, non-fetching.

// Dotted-decimal IPv4 pattern — matches ONLY the normalized form produced by the WHATWG URL parser.
// The parser normalizes all decimal/hex/octal/short forms to dotted-decimal before we ever see .hostname.
// Character-class only — linear time, no catastrophic backtracking (SAFE-1).
const IPV4_DOTTED = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

// IPv6 literal bracket pattern — the WHATWG parser always wraps IPv6 in brackets in .hostname.
// This extracts the inner address for classification.
const IPV6_BRACKETED = /^\[(.+)\]$/;

// IPv4-mapped IPv6 in hex-group form: ::ffff:hhhh:hhhh (normalized form from WHATWG).
// Also handles mixed notation ::ffff:d.d.d.d (passed through unchanged by the parser in some cases).
// Linear character-class pattern (SAFE-1).
const IPV4_MAPPED_HEX = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i;
const IPV4_MAPPED_DOTTED = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;

/** Blocked IPv4 CIDR ranges. Each entry is [network address as u32, prefix length]. */
const BLOCKED_V4_CIDRS: ReadonlyArray<readonly [number, number]> = [
  [0x7f000000, 8],   // 127.0.0.0/8    — loopback
  [0x0a000000, 8],   // 10.0.0.0/8     — private
  [0xac100000, 12],  // 172.16.0.0/12  — private
  [0xc0a80000, 16],  // 192.168.0.0/16 — private
  [0xa9fe0000, 16],  // 169.254.0.0/16 — link-local + cloud metadata (incl. 169.254.169.254)
  [0x00000000, 8],   // 0.0.0.0/8      — unspecified
  [0xffffffff, 32],  // 255.255.255.255 — broadcast
];

/** DNS hostnames that must always be rejected. */
const BLOCKED_HOSTNAMES = new Set<string>([
  "localhost",
  "metadata.google.internal",
  "metadata.internal",
  "computemetadata.v1",
  "169.254.169.254", // belt-and-suspenders (parsed as IPv4 by URL parser, but guard DNS too)
]);

/** Convert a dotted-decimal IPv4 string to a 32-bit unsigned integer. Returns NaN on malformed input. */
function ipv4ToU32(dotted: string): number {
  const m = IPV4_DOTTED.exec(dotted);
  if (!m) return NaN;
  const [a, b, c, d] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (a > 255 || b > 255 || c > 255 || d > 255) return NaN;
  // Use unsigned right-shift 0 to keep it unsigned 32-bit.
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

/** Return true if the IPv4 u32 falls in any blocked CIDR. */
function isBlockedV4(ip: number): boolean {
  for (const [net, bits] of BLOCKED_V4_CIDRS) {
    const mask = bits === 32 ? 0xffffffff : (~(0xffffffff >>> bits)) >>> 0;
    if ((ip & mask) >>> 0 === (net & mask) >>> 0) return true;
  }
  return false;
}

/** Classify a dotted-decimal hostname as blocked IPv4. Returns true → reject. */
function isDottedV4Blocked(hostname: string): boolean {
  const ip = ipv4ToU32(hostname);
  if (isNaN(ip)) return false; // not a valid IPv4; let DNS classification handle it
  return isBlockedV4(ip);
}

/**
 * Classify a bracketed IPv6 hostname (brackets stripped). Returns true → reject.
 * Covers: ::1 (loopback), :: (unspecified), fc00::/7 (unique-local),
 * fe80::/10 (link-local), ::ffff:0:0/96 (IPv4-mapped, embedded v4 is CIDR-tested).
 */
function isIPv6Blocked(inner: string): boolean {
  const lower = inner.toLowerCase();

  // Loopback ::1
  if (lower === "::1") return true;
  // Unspecified ::
  if (lower === "::") return true;

  // IPv4-mapped: ::ffff:hhhh:hhhh (hex groups, WHATWG normalized form)
  const mappedHex = IPV4_MAPPED_HEX.exec(lower);
  if (mappedHex) {
    // Reconstruct embedded IPv4 from two 16-bit hex groups.
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    const v4u32 = (((hi << 16) | lo) >>> 0);
    return isBlockedV4(v4u32);
  }

  // IPv4-mapped: ::ffff:d.d.d.d (mixed notation — some paths through the parser)
  const mappedDotted = IPV4_MAPPED_DOTTED.exec(lower);
  if (mappedDotted) {
    const ip = ipv4ToU32(mappedDotted[1]);
    if (!isNaN(ip)) return isBlockedV4(ip);
  }

  // fc00::/7 — unique-local (fc00:: through fdff::)
  // First 16-bit group starts with 0xfc or 0xfd.
  const firstGroup = parseInt(lower.split(":")[0] || "0", 16);
  if (!isNaN(firstGroup) && (firstGroup & 0xfe00) === 0xfc00) return true;

  // fe80::/10 — link-local
  if (!isNaN(firstGroup) && (firstGroup & 0xffc0) === 0xfe80) return true;

  return false;
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
  const hostname = url.hostname; // already lowercased + normalized by the WHATWG parser

  // IPv6 literal: .hostname is bracketed [...]
  const ipv6Match = IPV6_BRACKETED.exec(hostname);
  if (ipv6Match) {
    if (isIPv6Blocked(ipv6Match[1])) return { ok: false };
    return { ok: true, url, host: hostname };
  }

  // IPv4 dotted-decimal: reject blocked CIDRs.
  if (IPV4_DOTTED.test(hostname)) {
    if (isDottedV4Blocked(hostname)) return { ok: false };
    return { ok: true, url, host: hostname };
  }

  // DNS name: reject metadata/loopback denylist.
  if (BLOCKED_HOSTNAMES.has(hostname)) return { ok: false };

  // Step 5 — all checks passed.
  return { ok: true, url, host: hostname };
}
