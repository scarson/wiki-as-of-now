// ABOUTME: Fetches one Wikipedia article's wikitext + identifiers via the MediaWiki Action API.
// ABOUTME: Responsible access (descriptive UA, maxlag); treats the response as untrusted data, never instructions.

/** A single fetched article revision: identifiers + raw wikitext. */
export interface FetchedArticle {
  pageId: number;
  title: string;
  revisionId: number;
  wikitext: string;
}

/**
 * The slice of the fetch API this module needs. Defaults to the global `fetch`;
 * tests inject a stub so no live network call happens in the committed suite.
 */
export type FetchLike = (
  input: string,
  init?: { headers?: Record<string, string> }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface FetchArticleOptions {
  fetchFn?: FetchLike;
  userAgent?: string;
}

/**
 * Descriptive User-Agent per Wikimedia's User-Agent policy: a project name +
 * version and a contact URL (repo, not a personal email — sufficient and avoids
 * embedding PII). Identifies the tool so operators can reach us.
 */
export const DEFAULT_USER_AGENT = "WikiAsOfNow/0.1 (+https://github.com/scarson/wiki-as-of-now)";

const API_ENDPOINT = "https://en.wikipedia.org/w/api.php";

/** The requested article does not exist (missing or invalid title). Maps to HTTP 404. */
export class ArticleNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArticleNotFoundError";
  }
}

/** Wikimedia is temporarily unavailable (maxlag / 503). Retryable. Maps to HTTP 503. */
export class WikimediaUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WikimediaUnavailableError";
  }
}

/** The response was present but not the shape we expect (malformed / API error). */
export class WikimediaResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WikimediaResponseError";
  }
}

/** Loosely-typed view of the Action API response we consume. */
interface MwResponse {
  error?: { code?: string; info?: string };
  query?: {
    pages?: MwPage[];
  };
}
interface MwPage {
  pageid?: number;
  title?: string;
  missing?: boolean;
  invalid?: boolean;
  revisions?: { revid?: number; slots?: { main?: { content?: string } } }[];
}

function buildUrl(title: string): string {
  const params = new URLSearchParams({
    action: "query",
    prop: "revisions",
    rvprop: "content|ids",
    rvslots: "main",
    titles: title,
    format: "json",
    formatversion: "2",
    maxlag: "5",
    redirects: "1",
  });
  return `${API_ENDPOINT}?${params.toString()}`;
}

/**
 * Fetches a single Wikipedia article by title from the MediaWiki Action API and
 * returns its pageid, (normalized) title, latest revision id, and raw wikitext.
 *
 * The returned wikitext is untrusted data: callers feed it only to the
 * deterministic parser/detector, never to a model and never as instructions.
 *
 * @throws ArticleNotFoundError      the page is missing or the title is invalid
 * @throws WikimediaUnavailableError maxlag exceeded or the service returned 503
 * @throws WikimediaResponseError    the response was unparseable or unexpectedly shaped
 */
export async function fetchArticle(title: string, options: FetchArticleOptions = {}): Promise<FetchedArticle> {
  if (title.trim().length === 0) {
    throw new Error("fetchArticle: title must be a non-empty string");
  }
  const fetchFn = options.fetchFn ?? (globalThis.fetch as unknown as FetchLike);
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;

  const res = await fetchFn(buildUrl(title), { headers: { "User-Agent": userAgent } });

  let body: MwResponse;
  try {
    body = (await res.json()) as MwResponse;
  } catch {
    if (res.status === 503) {
      throw new WikimediaUnavailableError("Wikimedia returned 503 with an unreadable body");
    }
    throw new WikimediaResponseError(`Wikimedia returned a non-JSON body (HTTP ${res.status})`);
  }

  if (body.error) {
    if (body.error.code === "maxlag") {
      throw new WikimediaUnavailableError(`Wikimedia is lagging (maxlag): ${body.error.info ?? ""}`.trim());
    }
    throw new WikimediaResponseError(`Wikimedia API error: ${body.error.code ?? "unknown"}`);
  }

  if (!res.ok) {
    if (res.status === 503) throw new WikimediaUnavailableError("Wikimedia returned 503");
    throw new WikimediaResponseError(`Wikimedia returned HTTP ${res.status}`);
  }

  const page = body.query?.pages?.[0];
  if (!page) {
    throw new WikimediaResponseError("Wikimedia response contained no pages");
  }
  if (page.missing || page.invalid) {
    throw new ArticleNotFoundError(`No Wikipedia article found for "${title}"`);
  }

  const revision = page.revisions?.[0];
  const content = revision?.slots?.main?.content;
  if (page.pageid === undefined || page.title === undefined || revision?.revid === undefined || content === undefined) {
    throw new WikimediaResponseError("Wikimedia response was missing page/revision fields");
  }

  return {
    pageId: page.pageid,
    title: page.title,
    revisionId: revision.revid,
    wikitext: content,
  };
}
