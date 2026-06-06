// ABOUTME: Tests for fetchSourceText — hardened URL fetch with SSRF guard, redirect rejection,
// ABOUTME: streaming size cap, content-type allowlist, charset decode, htmlparser2 extraction, and timeout.
import { describe, it, expect, vi, afterEach } from "vitest";
import { allowConsole } from "../setup/pristine";
import { fetchSourceText } from "../../src/research/source-fetch";
import type { FetchImpl, SourceFetchResult } from "../../src/research/source-fetch";
import ssrfCorpus from "../fixtures/research/ssrf-corpus.json";
import extractionCorpus from "../fixtures/research/extraction-corpus.json";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a real ReadableStream<Uint8Array> from pre-encoded chunks. */
function makeStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

/** Build a ReadableStream that never closes (simulates a hanging connection). */
function hangingStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(_controller) {
      // never enqueue or close — hangs indefinitely
    },
    cancel() {
      // allow cancellation without error
    },
  });
}

/** Build a stream that emits chunks lazily (for abort-mid-stream testing). */
function chunkyStream(
  totalBytes: number,
  chunkSize: number,
  onChunkRead?: () => void,
): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= totalBytes) {
        controller.close();
        return;
      }
      const size = Math.min(chunkSize, totalBytes - sent);
      controller.enqueue(new Uint8Array(size).fill(0x61)); // 'a'
      sent += size;
      onChunkRead?.();
    },
    cancel() {
      // allow cancellation
    },
  });
}

/** Build a FetchImpl that returns the given response. */
function fakeFetch(
  status: number,
  headers: Record<string, string>,
  body: ReadableStream<Uint8Array>,
): { impl: FetchImpl; callCount: () => number } {
  let calls = 0;
  const impl: FetchImpl = async (_url, _init) => {
    calls++;
    return {
      status,
      headers: new Headers(headers),
      body,
    };
  };
  return { impl, callCount: () => calls };
}

/** Encode a string to UTF-8 bytes. */
const enc = new TextEncoder();

/** Build a single-chunk HTML fetch fake. */
function htmlFetch(html: string, charset?: string): FetchImpl {
  const ct = charset
    ? `text/html; charset=${charset}`
    : "text/html; charset=utf-8";
  const bytes = enc.encode(html);
  return fakeFetch(200, { "content-type": ct }, makeStream([bytes])).impl;
}

/** Build a single-chunk text/plain fetch fake. */
function plainFetch(text: string): FetchImpl {
  const bytes = enc.encode(text);
  return fakeFetch(
    200,
    { "content-type": "text/plain; charset=utf-8" },
    makeStream([bytes]),
  ).impl;
}

// ---------------------------------------------------------------------------
// SSRF corpus — data-driven
// ---------------------------------------------------------------------------

describe("fetchSourceText — SSRF guard (corpus-driven)", () => {
  const rejectCases = ssrfCorpus.filter((c) => c.expected === "reject");
  const passCases = ssrfCorpus.filter((c) => c.expected === "pass");

  it(`covers ${rejectCases.length} reject cases and ${passCases.length} pass cases`, () => {
    expect(rejectCases.length).toBeGreaterThan(10);
    expect(passCases.length).toBeGreaterThan(5);
  });

  describe("reject cases — fetchImpl NEVER called", () => {
    it.each(rejectCases.map((c) => [c.threat, c.url] as [string, string]))(
      "blocks %s",
      async (threat, url) => {
        let called = false;
        const fetchImpl: FetchImpl = async () => {
          called = true;
          throw new Error("should not be called");
        };
        const result = await fetchSourceText(url, { fetchImpl });
        expect(result.ok, `expected ok:false for threat=${threat}`).toBe(false);
        expect(
          called,
          `fetchImpl must NOT be called for blocked URL (threat=${threat})`,
        ).toBe(false);
        if (!result.ok) {
          expect(
            ["blocked_scheme", "blocked_host"] as string[],
            `reason must be blocked_scheme or blocked_host, got ${result.reason}`,
          ).toContain(result.reason);
        }
      },
    );
  });

  describe("pass cases — guard must NOT block (fetchImpl called, ok:true)", () => {
    // Sample the pass cases (all of them, not just a few — completeness)
    it.each(passCases.map((c) => [c.threat, c.url] as [string, string]))(
      "allows %s",
      async (threat, url) => {
        const smallHtmlBytes = enc.encode("<p>hello</p>");
        const { impl, callCount } = fakeFetch(
          200,
          { "content-type": "text/html; charset=utf-8" },
          makeStream([smallHtmlBytes]),
        );
        const result = await fetchSourceText(url, { fetchImpl: impl });
        // For a pass case the guard must not block; the result is ok:true iff the fake
        // returns a valid 200 with extractable text.
        expect(
          callCount(),
          `fetchImpl must be called for allowed URL (threat=${threat})`,
        ).toBeGreaterThan(0);
        // The fake always returns valid HTML so we expect ok:true
        expect(result.ok, `expected ok:true for threat=${threat}, got reason: ${!result.ok ? (result as {reason:string}).reason : ""}`).toBe(true);
      },
    );
  });

  describe("blocked_scheme vs blocked_host distinction", () => {
    it("returns blocked_scheme for http:// URLs (wrong scheme, not blocked host)", async () => {
      let called = false;
      const result = await fetchSourceText("http://en.wikipedia.org/wiki/Rust", {
        fetchImpl: async () => { called = true; throw new Error("nope"); },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("blocked_scheme");
      expect(called).toBe(false);
    });

    it("returns blocked_scheme for ftp:// URLs", async () => {
      const result = await fetchSourceText("ftp://ftp.example.com/file.txt", {
        fetchImpl: async () => { throw new Error("nope"); },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("blocked_scheme");
    });

    it("returns blocked_host for https://127.0.0.1 (blocked IP, valid scheme)", async () => {
      let called = false;
      const result = await fetchSourceText("https://127.0.0.1/admin", {
        fetchImpl: async () => { called = true; throw new Error("nope"); },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("blocked_host");
      expect(called).toBe(false);
    });

    it("returns blocked_host for https://localhost", async () => {
      const result = await fetchSourceText("https://localhost/admin", {
        fetchImpl: async () => { throw new Error("nope"); },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("blocked_host");
    });

    it("returns blocked_host for unparseable URL (not a URL at all)", async () => {
      const result = await fetchSourceText("not a url at all", {
        fetchImpl: async () => { throw new Error("nope"); },
      });
      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(["blocked_scheme", "blocked_host"]).toContain(result.reason);
    });
  });
});

// ---------------------------------------------------------------------------
// Extraction corpus — data-driven (htmlparser2 text extraction)
// ---------------------------------------------------------------------------

describe("fetchSourceText — HTML extraction (corpus-driven)", () => {
  const cases = extractionCorpus;

  it(`covers ${cases.length} extraction cases`, () => {
    expect(cases.length).toBeGreaterThan(15);
  });

  it.each(
    cases.map(
      (c) => [c.threat, c.html, c.mustContain, c.mustExclude] as [string, string, string[], string[]],
    ),
  )(
    "extraction: %s",
    async (threat, html, mustContain, mustExclude) => {
      const result = await fetchSourceText("https://example.com/article", {
        fetchImpl: htmlFetch(html),
      });
      expect(result.ok, `expected ok:true for ${threat}`).toBe(true);
      if (!result.ok) return;
      const text = result.text as string;
      for (const s of mustContain) {
        expect(
          text,
          `mustContain "${s}" missing from extracted text (threat=${threat})`,
        ).toContain(s);
      }
      for (const s of mustExclude) {
        expect(
          text,
          `mustExclude "${s}" found in extracted text (threat=${threat})`,
        ).not.toContain(s);
      }
    },
  );
});

// Regression: block separators in INLINE context must still insert a \n boundary.
// The blind corpus's <br> case wrapped it between <div>s (the divs masked the boundary),
// so it could not detect <br> being mis-classified as inline. These isolate the separator:
// a quote bridging the two halves must be impossible because a \n sits between them.
describe("fetchSourceText — block separators isolate (no surrounding block element)", () => {
  // Void / replaced elements between two inline text runs must insert a boundary.
  it.each([
    ["br", "First line.<br>Second line."],
    ["hr", "First line.<hr>Second line."],
    ["img", "First line.<img src=x>Second line."],
    ["input", "First line.<input value=x>Second line."],
  ])("a <%s> between inline text yields a \\n boundary (no bridge)", async (_tag, html) => {
    const result = await fetchSourceText("https://example.com/", { fetchImpl: htmlFetch(html) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const text = result.text as string;
    expect(text).toContain("\n");
    expect(text).toBe("First line.\nSecond line.");
    // The forged bridge (no boundary) must NOT be present.
    expect(text).not.toContain("First line.Second line.");
  });

  // Reader-distinct widget containers: two adjacent ones must not bridge their text.
  it.each([
    ["button", "<button>First line.</button><button>Second line.</button>"],
    ["select/option", "<select><option>First line.</option><option>Second line.</option></select>"],
    ["textarea", "<textarea>First line.</textarea><textarea>Second line.</textarea>"],
    ["output", "<output>First line.</output><output>Second line.</output>"],
    ["object", "<object>First line.</object><object>Second line.</object>"],
    ["label", "<label>First line.</label><label>Second line.</label>"],
  ])("adjacent <%s> widgets do not bridge their text", async (_tag, html) => {
    const result = await fetchSourceText("https://example.com/", { fetchImpl: htmlFetch(html) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const text = result.text as string;
    expect(text).toContain("First line.");
    expect(text).toContain("Second line.");
    expect(text).not.toContain("First line.Second line.");
    expect(text).not.toContain("First line. Second line.");
  });

  // Genuinely-inline phrasing elements MUST still bridge (a guard against over-separating).
  it.each([
    ["span", "Contiguous <span>inline</span> text here."],
    ["a", "Contiguous <a href=x>inline</a> text here."],
    ["em", "Contiguous <em>inline</em> text here."],
  ])("a <%s> does NOT insert a boundary (stays contiguous)", async (_tag, html) => {
    const result = await fetchSourceText("https://example.com/", { fetchImpl: htmlFetch(html) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const text = result.text as string;
    expect(text).not.toContain("\n");
    expect(text).toBe("Contiguous inline text here.");
  });

  it("a quote-shaped string cannot bridge a <br> line break", async () => {
    const result = await fetchSourceText("https://example.com/", {
      fetchImpl: htmlFetch("The grant was approved.<br>The grant was later rescinded."),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const text = result.text as string;
    expect(text).not.toContain("approved. The grant was later");
    expect(text).not.toContain("approved.The grant was later");
  });
});

// ---------------------------------------------------------------------------
// Streaming size cap (decompressed bytes, NOT Content-Length)
// ---------------------------------------------------------------------------

describe("fetchSourceText — streaming size cap (too_large)", () => {
  it("returns too_large when decompressed body exceeds 2MB and aborts mid-stream", async () => {
    // 3 MB total in 256-KB chunks, content-type text/html
    const CHUNK_SIZE = 256 * 1024;
    const TOTAL = 3 * 1024 * 1024;
    let chunksRead = 0;

    const stream = chunkyStream(TOTAL, CHUNK_SIZE, () => { chunksRead++; });
    const { impl } = fakeFetch(
      200,
      { "content-type": "text/html; charset=utf-8" },
      stream,
    );

    const result = await fetchSourceText("https://example.com/big", { fetchImpl: impl });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("too_large");

    // We should have stopped before reading all 3MB (12 × 256KB chunks)
    // The cap is 2MB = ~8 chunks, so we should NOT have read all 12
    expect(chunksRead).toBeLessThan(12);
  });

  it("accepts a body just under 2MB without error", async () => {
    // 1.9 MB in one chunk — just under the cap
    const TOTAL = 1_900_000;
    const htmlBytes = new Uint8Array(TOTAL);
    // Make it valid enough: start with an HTML tag, fill rest with 'a'
    const prefix = enc.encode("<p>");
    const suffix = enc.encode("</p>");
    htmlBytes.set(prefix, 0);
    htmlBytes.fill(0x61, prefix.length, TOTAL - suffix.length); // 'a'
    htmlBytes.set(suffix, TOTAL - suffix.length);

    const { impl } = fakeFetch(
      200,
      { "content-type": "text/html; charset=utf-8" },
      makeStream([htmlBytes]),
    );

    const result = await fetchSourceText("https://example.com/just-under", { fetchImpl: impl });
    // Should not return too_large
    expect(result.ok).toBe(true);
  });

  it("does NOT trust Content-Length header — enforces streaming cap regardless", async () => {
    // Claim Content-Length: 100 but actually send 3MB
    const TOTAL = 3 * 1024 * 1024;
    const stream = chunkyStream(TOTAL, 256 * 1024);
    const { impl } = fakeFetch(
      200,
      { "content-type": "text/html; charset=utf-8", "content-length": "100" },
      stream,
    );

    const result = await fetchSourceText("https://example.com/big-lie", { fetchImpl: impl });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("too_large");
  });
});

// ---------------------------------------------------------------------------
// Redirect rejection
// ---------------------------------------------------------------------------

describe("fetchSourceText — redirect rejection", () => {
  it.each([
    [301, "Moved Permanently"],
    [302, "Found"],
    [307, "Temporary Redirect"],
    [308, "Permanent Redirect"],
  ])("returns redirect_not_allowed for status %d (%s)", async (status) => {
    const { impl } = fakeFetch(
      status,
      { "content-type": "text/html", location: "https://other.example.com/" },
      makeStream([]),
    );
    const result = await fetchSourceText("https://example.com/page", { fetchImpl: impl });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("redirect_not_allowed");
  });
});

// ---------------------------------------------------------------------------
// HTTP errors
// ---------------------------------------------------------------------------

describe("fetchSourceText — http_error", () => {
  it.each([
    [404, "Not Found"],
    [500, "Internal Server Error"],
    [403, "Forbidden"],
    [401, "Unauthorized"],
  ])("returns http_error for status %d (%s)", async (status) => {
    const { impl } = fakeFetch(
      status,
      { "content-type": "text/html" },
      makeStream([]),
    );
    const result = await fetchSourceText("https://example.com/page", { fetchImpl: impl });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("http_error");
  });
});

// ---------------------------------------------------------------------------
// Content-type allowlist
// ---------------------------------------------------------------------------

describe("fetchSourceText — content-type allowlist", () => {
  it("accepts text/html", async () => {
    const result = await fetchSourceText("https://example.com/", {
      fetchImpl: htmlFetch("<p>hello world</p>"),
    });
    expect(result.ok).toBe(true);
  });

  it("accepts text/plain", async () => {
    const result = await fetchSourceText("https://example.com/", {
      fetchImpl: plainFetch("hello world text"),
    });
    expect(result.ok).toBe(true);
  });

  it.each([
    ["application/pdf"],
    ["image/png"],
    ["application/json"],
    ["application/octet-stream"],
    ["text/javascript"],
    ["application/xml"],
  ])("rejects content-type: %s", async (ct) => {
    // Body must NOT be consumed — getReader() must not be called on the body stream
    // for unsupported content types.
    const bodyStream = makeStream([enc.encode("should not be read")]);
    let getReaderCalled = false;
    const originalGetReader = bodyStream.getReader.bind(bodyStream);
    // getReader has an overloaded signature (byob vs default); cast the spy to satisfy it.
    bodyStream.getReader = ((...args: unknown[]) => {
      getReaderCalled = true;
      return (originalGetReader as (...a: unknown[]) => unknown)(...args);
    }) as typeof bodyStream.getReader;
    const { impl } = fakeFetch(200, { "content-type": ct }, bodyStream);
    const result = await fetchSourceText("https://example.com/", { fetchImpl: impl });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unsupported_content_type");
    // The body must not have been read
    expect(getReaderCalled).toBe(false);
  });

  it("rejects missing content-type", async () => {
    const { impl } = fakeFetch(200, {}, makeStream([enc.encode("hello")]));
    const result = await fetchSourceText("https://example.com/", { fetchImpl: impl });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unsupported_content_type");
  });
});

// ---------------------------------------------------------------------------
// Charset handling
// ---------------------------------------------------------------------------

describe("fetchSourceText — charset decode", () => {
  it("decodes iso-8859-1 (latin-1) content correctly", async () => {
    // é in iso-8859-1 is byte 0xe9
    const html = "<p>caf\xe9</p>";
    const bytes = Buffer.from(html, "latin1");
    const { impl } = fakeFetch(
      200,
      { "content-type": "text/html; charset=iso-8859-1" },
      makeStream([new Uint8Array(bytes)]),
    );
    const result = await fetchSourceText("https://example.com/", { fetchImpl: impl });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toContain("café");
  });

  it("decodes utf-8 (default) content correctly", async () => {
    const html = "<p>hello ✓</p>";
    const result = await fetchSourceText("https://example.com/", {
      fetchImpl: htmlFetch(html),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toContain("✓");
  });

  it("returns decode_error when header charset is utf-8 but bytes are invalid utf-8", async () => {
    allowConsole();
    // 0xff is not valid utf-8
    const badBytes = new Uint8Array([0x3c, 0x70, 0x3e, 0xff, 0x3c, 0x2f, 0x70, 0x3e]); // <p>[bad]</p>
    const { impl } = fakeFetch(
      200,
      { "content-type": "text/html; charset=utf-8" },
      makeStream([badBytes]),
    );
    const result = await fetchSourceText("https://example.com/", { fetchImpl: impl });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("decode_error");
  });

  it("returns decode_error when <meta charset> conflicts with Content-Type header charset", async () => {
    allowConsole();
    // Header says utf-8, meta says iso-8859-1 — conflict → fail closed
    const html = `<html><head><meta charset="iso-8859-1"></head><body><p>hello</p></body></html>`;
    const result = await fetchSourceText("https://example.com/", {
      fetchImpl: htmlFetch(html, "utf-8"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("decode_error");
  });

  it("returns decode_error when <meta http-equiv=content-type> conflicts with header charset", async () => {
    allowConsole();
    // Header says utf-8, meta http-equiv says windows-1252 — conflict → fail closed
    const html = `<html><head><meta http-equiv="content-type" content="text/html; charset=windows-1252"></head><body><p>hello</p></body></html>`;
    const result = await fetchSourceText("https://example.com/", {
      fetchImpl: htmlFetch(html, "utf-8"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("decode_error");
  });

  it("accepts consistent charset (meta matches header)", async () => {
    // Both say utf-8 — no conflict
    const html = `<html><head><meta charset="utf-8"></head><body><p>consistent charset</p></body></html>`;
    const result = await fetchSourceText("https://example.com/", {
      fetchImpl: htmlFetch(html, "utf-8"),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toContain("consistent charset");
  });

  it("returns decode_error for an unknown/unsupported charset", async () => {
    allowConsole();
    const { impl } = fakeFetch(
      200,
      { "content-type": "text/html; charset=x-totally-fake-charset-zzz" },
      makeStream([enc.encode("<p>hello</p>")]),
    );
    const result = await fetchSourceText("https://example.com/", { fetchImpl: impl });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("decode_error");
  });
});

// ---------------------------------------------------------------------------
// Timeout + abort hygiene
// ---------------------------------------------------------------------------

describe("fetchSourceText — timeout and abort hygiene", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns timeout when the stream hangs past the timeout window (fake timers)", async () => {
    allowConsole();
    vi.useFakeTimers();

    let signalAborted = false;

    const fetchImpl: FetchImpl = async (_url, init) => {
      init.signal.addEventListener("abort", () => { signalAborted = true; });
      return {
        status: 200,
        headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
        // hangingStream() never resolves its pull() — our impl races it against the abort signal
        body: hangingStream(),
      };
    };

    // Start the fetch — it will hang on reader.read() racing the abort promise
    const resultPromise = fetchSourceText("https://example.com/slow", { fetchImpl });

    // Advance past the 10s default timeout — fires setTimeout, aborts the controller,
    // which resolves the abortPromise in the Promise.race inside fetchSourceText.
    await vi.advanceTimersByTimeAsync(15_000);

    const result = await resultPromise;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("timeout");

    // The signal must have been aborted
    expect(signalAborted).toBe(true);

    vi.useRealTimers();
  }, 30_000);

  it("proves no unhandled rejection escapes on abort — fetchSourceText resolves, not rejects", async () => {
    // Abort hygiene: fetchSourceText MUST always resolve (never reject) even on timeout.
    // The abortPromise rejection is caught inside the read loop's try/catch; reader.cancel()
    // errors are swallowed. This test proves the structural guarantee using fake timers.
    allowConsole();
    vi.useFakeTimers();

    let signalAborted = false;

    const fetchImpl: FetchImpl = async (_url, init) => {
      init.signal.addEventListener("abort", () => { signalAborted = true; });
      return {
        status: 200,
        headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
        body: hangingStream(),
      };
    };

    // fetchSourceText MUST return a Promise<SourceFetchResult>, never a rejected Promise.
    // We verify this by awaiting it (if it rejects, the test throws automatically).
    const resultPromise = fetchSourceText("https://example.com/slow3", { fetchImpl });
    await vi.advanceTimersByTimeAsync(15_000);

    // If fetchSourceText leaked a rejection instead of resolving, this line would throw.
    const result = await resultPromise;

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("timeout");
    expect(signalAborted).toBe(true);

    vi.useRealTimers();
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Network error
// ---------------------------------------------------------------------------

describe("fetchSourceText — network_error", () => {
  it("returns network_error when fetchImpl rejects", async () => {
    allowConsole();
    const fetchImpl: FetchImpl = async () => {
      throw new Error("ECONNREFUSED");
    };
    const result = await fetchSourceText("https://example.com/", { fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("network_error");
  });

  it("returns network_error when fetchImpl rejects with non-Error", async () => {
    allowConsole();
    const fetchImpl: FetchImpl = async () => {
      throw "something weird";
    };
    const result = await fetchSourceText("https://example.com/", { fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("network_error");
  });
});

// ---------------------------------------------------------------------------
// Empty after extraction
// ---------------------------------------------------------------------------

describe("fetchSourceText — empty_after_extraction", () => {
  it("returns empty_after_extraction for HTML with only script/style/comments", async () => {
    allowConsole();
    const html = `<html>
      <head><title>page</title></head>
      <body>
        <script>var x = 1;</script>
        <style>.cls { color: red; }</style>
        <!-- just a comment -->
      </body>
    </html>`;
    const result = await fetchSourceText("https://example.com/empty", {
      fetchImpl: htmlFetch(html),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("empty_after_extraction");
  });

  it("returns empty_after_extraction for an empty HTML body", async () => {
    allowConsole();
    const result = await fetchSourceText("https://example.com/empty2", {
      fetchImpl: htmlFetch("<html><body>   </body></html>"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("empty_after_extraction");
  });

  it("returns empty_after_extraction for whitespace-only text/plain", async () => {
    allowConsole();
    const result = await fetchSourceText("https://example.com/empty3", {
      fetchImpl: plainFetch("   \n\t  "),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("empty_after_extraction");
  });
});

// ---------------------------------------------------------------------------
// text/plain passthrough (no HTML parsing)
// ---------------------------------------------------------------------------

describe("fetchSourceText — text/plain passthrough", () => {
  it("returns the plain text body verbatim (after normalization), no markup parsing", async () => {
    const text = "Plain text content here.\nSecond line.";
    const result = await fetchSourceText("https://example.com/plain", {
      fetchImpl: plainFetch(text),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain("Plain text content here.");
      expect(result.text).toContain("Second line.");
    }
  });
});

// ---------------------------------------------------------------------------
// User-Agent header
// ---------------------------------------------------------------------------

describe("fetchSourceText — User-Agent header", () => {
  it("sends a User-Agent header by default", async () => {
    let sentHeaders: Record<string, string> = {};
    const fetchImpl: FetchImpl = async (_url, init) => {
      sentHeaders = init.headers;
      return {
        status: 200,
        headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
        body: makeStream([enc.encode("<p>hello</p>")]),
      };
    };
    await fetchSourceText("https://example.com/", { fetchImpl });
    expect(sentHeaders["User-Agent"] ?? sentHeaders["user-agent"]).toBeTruthy();
  });

  it("allows overriding the User-Agent via opts.userAgent", async () => {
    let sentHeaders: Record<string, string> = {};
    const fetchImpl: FetchImpl = async (_url, init) => {
      sentHeaders = init.headers;
      return {
        status: 200,
        headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
        body: makeStream([enc.encode("<p>hello</p>")]),
      };
    };
    await fetchSourceText("https://example.com/", {
      fetchImpl,
      userAgent: "CustomBot/2.0",
    });
    const ua = sentHeaders["User-Agent"] ?? sentHeaders["user-agent"];
    expect(ua).toBe("CustomBot/2.0");
  });

  it("sends Accept-Encoding: identity to prevent compression bombs", async () => {
    let sentHeaders: Record<string, string> = {};
    const fetchImpl: FetchImpl = async (_url, init) => {
      sentHeaders = init.headers;
      return {
        status: 200,
        headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
        body: makeStream([enc.encode("<p>hello</p>")]),
      };
    };
    await fetchSourceText("https://example.com/", { fetchImpl });
    const ae = sentHeaders["Accept-Encoding"] ?? sentHeaders["accept-encoding"];
    expect(ae).toBe("identity");
  });
});

// ---------------------------------------------------------------------------
// Multi-chunk streaming correctness
// ---------------------------------------------------------------------------

describe("fetchSourceText — multi-chunk streaming correctness", () => {
  it("correctly assembles text across many small chunks", async () => {
    // Split a valid HTML document into many 1-byte chunks
    const html = "<p>The quick brown fox jumped over the lazy dog.</p>";
    const bytes = enc.encode(html);
    const chunks = Array.from(bytes, (b) => new Uint8Array([b]));
    const { impl } = fakeFetch(
      200,
      { "content-type": "text/html; charset=utf-8" },
      makeStream(chunks),
    );
    const result = await fetchSourceText("https://example.com/chunky", { fetchImpl: impl });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain("quick brown fox");
    }
  });
});

// ---------------------------------------------------------------------------
// Sanity: result type is UntrustedSourceText
// ---------------------------------------------------------------------------

describe("fetchSourceText — result branding", () => {
  it("ok:true result carries UntrustedSourceText brand (structurally a string)", async () => {
    const result: SourceFetchResult = await fetchSourceText("https://example.com/", {
      fetchImpl: htmlFetch("<p>hello world</p>"),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // UntrustedSourceText is a branded string — must be typeof string at runtime
      expect(typeof result.text).toBe("string");
      expect(result.text).toContain("hello world");
    }
  });
});
