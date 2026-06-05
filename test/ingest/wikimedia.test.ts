// ABOUTME: Tests for the Wikimedia Action-API article fetch (src/ingest/wikimedia.ts).
// ABOUTME: Uses an injected fetchFn — asserts request shape (G14) and typed error handling; no live network.
import { describe, it, expect } from "vitest";
import {
  fetchArticle,
  DEFAULT_USER_AGENT,
  ArticleNotFoundError,
  WikimediaUnavailableError,
  WikimediaResponseError,
  type FetchLike,
} from "../../src/ingest/wikimedia";

/** Builds a fetchFn returning the given JSON body, recording the request it received. */
function stubFetch(
  body: unknown,
  opts: { ok?: boolean; status?: number; throwJson?: boolean } = {}
): { fetchFn: FetchLike; calls: { url: string; headers?: Record<string, string> }[] } {
  const calls: { url: string; headers?: Record<string, string> }[] = [];
  const fetchFn: FetchLike = async (url, init) => {
    calls.push({ url, headers: init?.headers });
    return {
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      json: async () => {
        if (opts.throwJson) throw new SyntaxError("Unexpected token < in JSON");
        return body;
      },
    };
  };
  return { fetchFn, calls };
}

const okBody = (overrides: Record<string, unknown> = {}) => ({
  query: {
    pages: [
      {
        pageid: 60758751,
        ns: 0,
        title: "Artemis program",
        revisions: [
          {
            revid: 1357951754,
            parentid: 1357945752,
            slots: { main: { contentmodel: "wikitext", content: "Lead.\n\n== History ==\nThe rover will launch in 2017." } },
          },
        ],
        ...overrides,
      },
    ],
  },
});

describe("fetchArticle", () => {
  it("requests the Action API with the documented params and a descriptive User-Agent", async () => {
    const { fetchFn, calls } = stubFetch(okBody());
    await fetchArticle("Artemis program", { fetchFn });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe("https://en.wikipedia.org/w/api.php");
    const p = url.searchParams;
    expect(p.get("action")).toBe("query");
    expect(p.get("prop")).toBe("revisions");
    expect(p.get("rvprop")).toBe("content|ids");
    expect(p.get("rvslots")).toBe("main");
    expect(p.get("titles")).toBe("Artemis program");
    expect(p.get("format")).toBe("json");
    expect(p.get("formatversion")).toBe("2");
    expect(p.get("maxlag")).toBe("5");
    expect(p.get("redirects")).toBe("1");
    expect(calls[0].headers?.["User-Agent"]).toBe(DEFAULT_USER_AGENT);
  });

  it("maps the response to a FetchedArticle (using the normalized page title)", async () => {
    const { fetchFn } = stubFetch(okBody());
    const article = await fetchArticle("artemis_program", { fetchFn });
    expect(article).toEqual({
      pageId: 60758751,
      title: "Artemis program",
      revisionId: 1357951754,
      wikitext: "Lead.\n\n== History ==\nThe rover will launch in 2017.",
    });
  });

  it("allows overriding the User-Agent", async () => {
    const { fetchFn, calls } = stubFetch(okBody());
    await fetchArticle("Artemis program", { fetchFn, userAgent: "Custom/1.0 (+https://example.org)" });
    expect(calls[0].headers?.["User-Agent"]).toBe("Custom/1.0 (+https://example.org)");
  });

  it("throws ArticleNotFoundError for a missing page", async () => {
    const { fetchFn } = stubFetch({ query: { pages: [{ ns: 0, title: "Nope", missing: true }] } });
    await expect(fetchArticle("Nope", { fetchFn })).rejects.toBeInstanceOf(ArticleNotFoundError);
  });

  it("throws ArticleNotFoundError for an invalid title", async () => {
    const { fetchFn } = stubFetch({ query: { pages: [{ title: "_", invalid: true, invalidreason: "bad" }] } });
    await expect(fetchArticle("_", { fetchFn })).rejects.toBeInstanceOf(ArticleNotFoundError);
  });

  it("throws WikimediaUnavailableError on maxlag (503 + maxlag error body)", async () => {
    const { fetchFn } = stubFetch(
      { error: { code: "maxlag", info: "Waiting for a database server", lag: 7 } },
      { ok: false, status: 503 }
    );
    await expect(fetchArticle("Artemis program", { fetchFn })).rejects.toBeInstanceOf(WikimediaUnavailableError);
  });

  it("throws WikimediaResponseError on a malformed (non-JSON) body", async () => {
    const { fetchFn } = stubFetch(null, { throwJson: true });
    await expect(fetchArticle("Artemis program", { fetchFn })).rejects.toBeInstanceOf(WikimediaResponseError);
  });

  it("throws WikimediaResponseError when the revision carries no content", async () => {
    const { fetchFn } = stubFetch(okBody({ revisions: [{ revid: 1, parentid: 0, slots: { main: {} } }] }));
    await expect(fetchArticle("Artemis program", { fetchFn })).rejects.toBeInstanceOf(WikimediaResponseError);
  });

  it("rejects an empty title without calling fetch", async () => {
    const { fetchFn, calls } = stubFetch(okBody());
    await expect(fetchArticle("   ", { fetchFn })).rejects.toThrow(/title/i);
    expect(calls).toHaveLength(0);
  });
});
