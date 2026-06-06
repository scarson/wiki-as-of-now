// ABOUTME: Fetches one Wikipedia article's metadata snapshot via one atomic MediaWiki Action-API call.
// ABOUTME: Responsible access (descriptive UA, maxlag); treats the response as untrusted data, never instructions.
import type { ArticleMetadata } from "../domain/types";
import { BLP_CATEGORIES, canonicalizeCategoryTitle } from "../safelane/denylists";

/**
 * A single fetched article revision: identifiers, raw wikitext, and the safe-lane
 * metadata (namespace, revision timestamp, BLP-category probe) — all derived from
 * ONE resolved page of ONE response, so there is no two-snapshot skew.
 */
export interface FetchedArticle {
  pageId: number;
  title: string;
  revisionId: number;
  revisionTimestamp: string;
  namespace: number;
  blpProbe: "present" | "absent" | "unknown";
  wikitext: string;
  fetchedAt: string;
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
  warnings?: { categories?: unknown };
  query?: {
    pages?: MwPage[];
  };
}
interface MwPage {
  pageid?: number;
  title?: string;
  ns?: number;
  missing?: boolean;
  invalid?: boolean;
  revisions?: { revid?: number; timestamp?: string; slots?: { main?: { content?: string } } }[];
  categories?: unknown;
}

/** The canonical BLP-set sent to `clcategories` as the bounded, truncation-proof membership probe. */
const BLP_PROBE_TITLES = BLP_CATEGORIES.map(c => `Category:${canonicalizeCategoryTitle(c)}`).join("|");

function buildUrl(title: string): string {
  const params = new URLSearchParams({
    action: "query",
    prop: "revisions|categories|info",
    rvprop: "content|ids|timestamp",
    rvslots: "main",
    clcategories: BLP_PROBE_TITLES,
    titles: title,
    format: "json",
    formatversion: "2",
    maxlag: "5",
    redirects: "1",
  });
  return `${API_ENDPOINT}?${params.toString()}`;
}

/**
 * Reads the BLP-membership probe from one response: `present` when the
 * `clcategories`-filtered match list is non-empty, `absent` when the call
 * succeeded and membership is definitively none, `unknown` (fail-closed) when a
 * `clcategories` warning fired or the `categories` field is present but malformed.
 */
function deriveBlpProbe(body: MwResponse, page: MwPage): "present" | "absent" | "unknown" {
  if (body.warnings?.categories !== undefined) return "unknown";
  const cats = page.categories;
  if (cats === undefined) return "absent";
  if (!Array.isArray(cats)) return "unknown";
  if (!cats.every(c => c != null && typeof (c as { title?: unknown }).title === "string")) return "unknown";
  return cats.length > 0 ? "present" : "absent";
}

/**
 * Parses one Action-API response body into a {@link FetchedArticle}. This is the
 * single response→fields path: `fetchArticle` runs its typed-error guards first
 * and then delegates here, and the gold-set test maps frozen raw envelopes through
 * this same function so the probe/normalization paths are exercised, not bypassed.
 * Assumes the body holds a valid resolved `pages[0]` (guaranteed by the guards for
 * the live path; true by construction for the committed gold envelopes).
 */
export function mapResponseToMetadata(body: MwResponse, fetchedAt: string): FetchedArticle {
  const page = (body.query?.pages?.[0] ?? {}) as MwPage;
  const revision = page.revisions?.[0];
  return {
    pageId: page.pageid as number,
    title: page.title as string,
    revisionId: revision?.revid as number,
    revisionTimestamp: revision?.timestamp as string,
    namespace: page.ns as number,
    blpProbe: deriveBlpProbe(body, page),
    wikitext: revision?.slots?.main?.content as string,
    fetchedAt,
  };
}

/** The trivial rename bridge from ingest output to the gate's input shape. The ONLY place the rename lives. */
export function toArticleMetadata(f: FetchedArticle): ArticleMetadata {
  return {
    resolvedPageId: f.pageId,
    resolvedTitle: f.title,
    revisionId: f.revisionId,
    revisionTimestamp: f.revisionTimestamp,
    namespace: f.namespace,
    blpProbe: f.blpProbe,
    wikitext: f.wikitext,
    fetchedAt: f.fetchedAt,
  };
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
  // Captured at response-parse time (not by a downstream new Date()), so fetchedAt
  // describes the same moment as the snapshot it timestamps (spec §5 / R4-6).
  const fetchedAt = new Date().toISOString();

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

  return mapResponseToMetadata(body, fetchedAt);
}
