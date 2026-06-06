// ABOUTME: Hardened fetch of an arbitrary (untrusted) source URL → branded UntrustedSourceText.
// ABOUTME: SSRF guard, redirect rejection, streaming decompressed-byte cap, charset decode, htmlparser2 extraction.

// Named residual (accepted; consistent with design §2 and canonicalize-url.ts):
// DNS-rebinding / TOCTOU — the host guard is string-level at the URL supplied by the caller; there is
// no resolve-then-pin step in Workers. A name that resolves to a blocked IP after the guard passes is
// out of scope. Deprecated IPv4-compatible ::/96 IPv6 addresses (e.g. [::7f00:1]) are also a named
// residual — ipaddr.js classifies them as "unicast"; they do not route to the embedded IPv4 on modern stacks.

import { Parser as HtmlParser } from "htmlparser2";
import { canonicalizeUrl } from "./canonicalize-url";
import { normalizeForVerbatim } from "./normalize";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

declare const __brand: unique symbol;
export type UntrustedSourceText = string & { readonly [__brand]: "UntrustedSourceText" };

export type SourceFetchFailureReason =
  | "blocked_scheme"
  | "blocked_host"
  | "redirect_not_allowed"
  | "timeout"
  | "too_large"
  | "unsupported_content_type"
  | "decode_error"
  | "http_error"
  | "network_error"
  | "empty_after_extraction";

export type SourceFetchResult =
  | { ok: true; text: UntrustedSourceText }
  | { ok: false; reason: SourceFetchFailureReason };

/** Injected transport seam — lets tests supply a fake without touching real network. */
export type FetchImpl = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{ status: number; headers: Headers; body: ReadableStream<Uint8Array> }>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum decompressed bytes to accumulate before aborting (2 MB). */
const DEFAULT_MAX_SOURCE_BYTES = 2_000_000;

/** Default fetch timeout in milliseconds (10 s). */
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

const DEFAULT_USER_AGENT =
  "WikiAsOfNow/1.0 (research-verify; +https://wikiasofnow.com)";

// ---------------------------------------------------------------------------
// HTML tags — inline vs block (for separator insertion)
// ---------------------------------------------------------------------------

// Tags that are inline — they do NOT insert a block boundary.
// Everything not in this set (including unknown/custom elements) is treated as
// a block-level separator (more separators = safe false-drops; too few = dangerous false-accepts).
const INLINE_TAGS = new Set([
  "a", "abbr", "acronym", "b", "bdo", "bdi", "big", "br", "button", "cite",
  "code", "data", "del", "dfn", "em", "i", "img", "input", "ins", "kbd",
  "label", "map", "mark", "object", "optgroup", "option", "output", "q",
  "rp", "rt", "ruby", "s", "samp", "select", "small", "span", "strong",
  "sub", "sup", "textarea", "time", "tt", "u", "var",
]);

// Subtrees whose text content must be completely suppressed (not just skipped).
const SKIP_SUBTREES = new Set(["script", "style", "head"]);

// ---------------------------------------------------------------------------
// Charset helpers
// ---------------------------------------------------------------------------

/** Extract charset name from a Content-Type header value, or null if absent. */
function charsetFromContentType(ct: string): string | null {
  // Match charset=<value> (case-insensitive, quoted or unquoted)
  const m = ct.match(/;\s*charset\s*=\s*"?([^";,\s]+)"?/i);
  return m ? m[1].toLowerCase() : null;
}

/** Normalize a charset name to a canonical alias accepted by TextDecoder. */
function normalizeCharset(name: string): string {
  // Common aliases that TextDecoder accepts directly; just lower-case and return.
  return name.toLowerCase().replace(/_/g, "-");
}

/** Return true if two charset names refer to the same encoding (case/alias-insensitive). */
function charsetsConflict(a: string, b: string): boolean {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/_/g, "-").replace(/\s/g, "");
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return false;
  // Common alias pairs
  const aliases: Record<string, string> = {
    "latin1": "iso-8859-1",
    "latin-1": "iso-8859-1",
    "iso8859-1": "iso-8859-1",
    "iso88591": "iso-8859-1",
    "utf8": "utf-8",
    "ascii": "us-ascii",
    "usascii": "us-ascii",
    "win1252": "windows-1252",
    "cp1252": "windows-1252",
  };
  const resolve = (s: string) => aliases[s] ?? s;
  return resolve(na) !== resolve(nb);
}

// ---------------------------------------------------------------------------
// Meta-charset extraction via a lightweight two-pass HTML pre-scan
// ---------------------------------------------------------------------------

/**
 * Scan the first ~4 KB of decoded HTML text for a <meta charset> or
 * <meta http-equiv=content-type> declaration and return the charset string,
 * or null if none found.
 */
function extractMetaCharset(html: string): string | null {
  // Only scan the head portion to keep it fast and avoid false positives in body.
  // Scan up to 4 KB (enough to cover any real <head>).
  const head = html.slice(0, 4096);

  // <meta charset="...">
  const metaCharset = head.match(
    /<meta\s[^>]*charset\s*=\s*["']?([^"'\s/>]+)["']?/i,
  );
  if (metaCharset) return metaCharset[1].toLowerCase();

  // <meta http-equiv="content-type" content="text/html; charset=...">
  const metaEquiv = head.match(
    /<meta\s[^>]*http-equiv\s*=\s*["']?content-type["']?[^>]*content\s*=\s*["']([^"']+)["']/i,
  );
  if (metaEquiv) {
    const charset = charsetFromContentType(metaEquiv[1]);
    if (charset) return charset;
  }

  // Also try reversed attribute order: content=... http-equiv=content-type
  const metaEquiv2 = head.match(
    /<meta\s[^>]*content\s*=\s*["']([^"']+)["'][^>]*http-equiv\s*=\s*["']?content-type["']/i,
  );
  if (metaEquiv2) {
    const charset = charsetFromContentType(metaEquiv2[1]);
    if (charset) return charset;
  }

  return null;
}

// ---------------------------------------------------------------------------
// HTML text extraction via htmlparser2
// ---------------------------------------------------------------------------

/**
 * Check whether an attribute set marks the element as hidden to readers.
 * Defense-in-depth: hidden attribute, aria-hidden="true", display:none, visibility:hidden.
 */
function isHiddenByAttrs(attrs: Record<string, string>): boolean {
  if ("hidden" in attrs) return true;
  if (attrs["aria-hidden"] === "true") return true;
  const style = attrs["style"] ?? "";
  if (/display\s*:\s*none/i.test(style)) return true;
  if (/visibility\s*:\s*hidden/i.test(style)) return true;
  return false;
}

/**
 * Extract readable text from an HTML string using htmlparser2.
 * - Emits TEXT-NODE text only (never attribute values or comment text).
 * - Drops <script>, <style>, <head> subtrees entirely.
 * - Inserts a block boundary (\n) around block-level elements.
 * - Unknown/custom elements default to block-separator behavior.
 * - Drops text inside elements with hidden/aria-hidden/display:none/visibility:hidden.
 * - htmlparser2 decodes HTML entities automatically in text nodes.
 */
function extractTextFromHtml(html: string): string {
  const parts: string[] = [];

  // skipDepth > 0: inside a subtree we suppress (script/style/head).
  let skipDepth = 0;
  // hiddenDepth > 0: inside a hidden subtree (hidden attr, aria-hidden, display:none, etc.).
  let hiddenDepth = 0;

  const parser = new HtmlParser(
    {
      onopentag(name: string, attrs: Record<string, string>) {
        // If already inside a skip subtree, extend it.
        if (skipDepth > 0) {
          skipDepth++;
          return;
        }
        if (SKIP_SUBTREES.has(name)) {
          skipDepth++;
          return;
        }

        // Hidden subtree tracking.
        if (hiddenDepth > 0) {
          hiddenDepth++;
          return;
        }
        if (isHiddenByAttrs(attrs)) {
          hiddenDepth++;
          return;
        }

        // Block-level (or unknown) → insert separator before.
        if (!INLINE_TAGS.has(name)) {
          parts.push("\n");
        }
      },

      ontext(text: string) {
        if (skipDepth > 0 || hiddenDepth > 0) return;
        parts.push(text);
      },

      onclosetag(name: string) {
        if (skipDepth > 0) {
          skipDepth--;
          return;
        }
        if (hiddenDepth > 0) {
          hiddenDepth--;
          return;
        }
        // Block-level (or unknown) → insert separator after.
        if (!INLINE_TAGS.has(name)) {
          parts.push("\n");
        }
      },

      // Never emit comment content — oncomment is intentionally absent.
    },
    {
      // Decode HTML entities in text nodes (htmlparser2 default: true).
      decodeEntities: true,
      // lowerCaseTags: ensures our Set lookups work correctly.
      lowerCaseTags: true,
      // lowerCaseAttributeNames: for hidden/aria-hidden/style lookups.
      lowerCaseAttributeNames: true,
    },
  );

  parser.write(html);
  parser.end();

  return parts.join("");
}

// ---------------------------------------------------------------------------
// Main implementation
// ---------------------------------------------------------------------------

/**
 * Fetch an untrusted source URL and return normalized, extracted text.
 *
 * Security hardening (in order):
 * 1. Scheme + SSRF guard via canonicalizeUrl — rejects before any network I/O.
 * 2. Request headers: Accept-Encoding: identity (prevents compression bombs); User-Agent.
 * 3. Redirects = error — any 3xx status rejected; non-2xx → http_error.
 * 4. Content-type allowlist: only text/html and text/plain proceed.
 * 5. Streaming decompressed-byte cap (DEFAULT_MAX_SOURCE_BYTES) — never trusts Content-Length.
 * 6. Real AbortController timeout (DEFAULT_FETCH_TIMEOUT_MS).
 * 7. Charset decode with TextDecoder fatal mode; header charset wins over meta charset on conflict.
 * 8. HTML extraction via htmlparser2 (text nodes only); text/plain passthrough.
 * 9. Empty-after-extraction check.
 */
export async function fetchSourceText(
  url: string,
  opts: { fetchImpl: FetchImpl; userAgent?: string; now?: Date },
): Promise<SourceFetchResult> {
  // -------------------------------------------------------------------------
  // Step 1 — Scheme + SSRF guard
  // -------------------------------------------------------------------------
  const canonical = canonicalizeUrl(url);
  if (!canonical.ok) {
    // Distinguish blocked_scheme from blocked_host:
    // If the URL at least parses and its protocol is not https:, it's a scheme issue.
    // Otherwise (bad host, blocked IP, bad userinfo, non-parseable) → blocked_host.
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") {
        return { ok: false, reason: "blocked_scheme" };
      }
    } catch {
      // URL didn't parse at all → blocked_host (no valid scheme either)
      return { ok: false, reason: "blocked_host" };
    }
    return { ok: false, reason: "blocked_host" };
  }

  // -------------------------------------------------------------------------
  // Step 6 — Abort controller (timeout)
  // -------------------------------------------------------------------------
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, DEFAULT_FETCH_TIMEOUT_MS);

  // -------------------------------------------------------------------------
  // Steps 2–10 — Network I/O under the abort signal
  // -------------------------------------------------------------------------
  let response: { status: number; headers: Headers; body: ReadableStream<Uint8Array> };
  try {
    response = await opts.fetchImpl(url, {
      headers: {
        "User-Agent": opts.userAgent ?? DEFAULT_USER_AGENT,
        "Accept-Encoding": "identity",
      },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutHandle);
    // If the abort fired before fetchImpl resolved, the rejection is the timeout.
    if (controller.signal.aborted) {
      return { ok: false, reason: "timeout" };
    }
    // Suppress the error — it's already captured in the return value.
    void err;
    return { ok: false, reason: "network_error" };
  }

  // -------------------------------------------------------------------------
  // Step 3 — Redirect and HTTP error handling
  // -------------------------------------------------------------------------
  const { status } = response;
  if (status >= 300 && status <= 399) {
    clearTimeout(timeoutHandle);
    return { ok: false, reason: "redirect_not_allowed" };
  }
  if (status < 200 || status > 299) {
    clearTimeout(timeoutHandle);
    return { ok: false, reason: "http_error" };
  }

  // -------------------------------------------------------------------------
  // Step 4 — Content-type allowlist
  // -------------------------------------------------------------------------
  const contentTypeHeader = response.headers.get("content-type") ?? "";
  const mimeType = contentTypeHeader.split(";")[0].trim().toLowerCase();
  if (mimeType !== "text/html" && mimeType !== "text/plain") {
    clearTimeout(timeoutHandle);
    // Do not consume the body.
    return { ok: false, reason: "unsupported_content_type" };
  }
  const headerCharset = charsetFromContentType(contentTypeHeader) ?? "utf-8";

  // -------------------------------------------------------------------------
  // Steps 5 + 6 — Streaming read with decompressed-byte cap + timeout abort
  // -------------------------------------------------------------------------
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let timedOut = false;
  let tooLarge = false;

  const reader = response.body.getReader();

  // Build a promise that resolves when the AbortController fires.
  // This lets us race each chunk-read against the abort signal so the loop
  // unblocks even when the underlying stream's pull() hangs indefinitely.
  let signalReject!: (reason: unknown) => void;
  const abortPromise = new Promise<never>((_res, rej) => {
    signalReject = rej;
  });
  const onAbort = () => signalReject(new Error("aborted"));
  controller.signal.addEventListener("abort", onAbort, { once: true });

  try {
    while (true) {
      // Check if abort fired (timeout) before each chunk read.
      if (controller.signal.aborted) {
        timedOut = true;
        reader.cancel().catch(() => { /* ignore cancel errors */ });
        break;
      }

      let done: boolean;
      let value: Uint8Array | undefined;
      try {
        // Race the chunk read against the abort signal so that a hanging stream
        // doesn't prevent the timeout from firing.
        const result = await Promise.race([reader.read(), abortPromise]);
        ({ done, value } = result);
      } catch {
        // The abort promise rejected (timeout) or read() threw.
        if (controller.signal.aborted) {
          timedOut = true;
        }
        reader.cancel().catch(() => { /* ignore cancel errors */ });
        break;
      }

      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > DEFAULT_MAX_SOURCE_BYTES) {
        tooLarge = true;
        controller.abort();
        reader.cancel().catch(() => { /* ignore cancel errors */ });
        break;
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timeoutHandle);
    controller.signal.removeEventListener("abort", onAbort);
    // Release the lock if still held.
    try {
      reader.releaseLock();
    } catch {
      // Already released or stream already closed — ignore.
    }
  }

  if (tooLarge) return { ok: false, reason: "too_large" };
  if (timedOut) return { ok: false, reason: "timeout" };

  // -------------------------------------------------------------------------
  // Step 7 — Charset decode
  // -------------------------------------------------------------------------
  // Assemble the raw bytes.
  const totalLen = chunks.reduce((s, c) => s + c.byteLength, 0);
  const raw = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    raw.set(chunk, offset);
    offset += chunk.byteLength;
  }

  // Decode with the header charset using fatal mode (malformed sequences → throw).
  let decoded: string;
  try {
    const decoder = new TextDecoder(normalizeCharset(headerCharset), { fatal: true });
    decoded = decoder.decode(raw);
  } catch {
    return { ok: false, reason: "decode_error" };
  }

  // For HTML: check for meta charset conflict AFTER decoding with the header charset.
  // If the meta charset disagrees with the header charset → fail closed.
  if (mimeType === "text/html") {
    const metaCharset = extractMetaCharset(decoded);
    if (metaCharset !== null && charsetsConflict(headerCharset, metaCharset)) {
      return { ok: false, reason: "decode_error" };
    }
  }

  // -------------------------------------------------------------------------
  // Step 8 — Extraction
  // -------------------------------------------------------------------------
  let rawText: string;
  if (mimeType === "text/html") {
    rawText = extractTextFromHtml(decoded);
  } else {
    // text/plain — body IS the content (no markup parsing).
    rawText = decoded;
  }

  // Run through the shared normalization contract.
  const normalized = normalizeForVerbatim(rawText);

  // -------------------------------------------------------------------------
  // Step 9 — Empty-after-extraction guard
  // -------------------------------------------------------------------------
  if (normalized.trim() === "") {
    return { ok: false, reason: "empty_after_extraction" };
  }

  // Brand the result.
  return { ok: true, text: normalized as UntrustedSourceText };
}
