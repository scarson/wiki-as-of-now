// ABOUTME: Wikimedia Pageviews REST client + pure pageview-ranking over a trailing 30-day window.
// ABOUTME: Window math takes an injected `now` (testable); fetch is sequential and UA-tagged (G14).
import { DEFAULT_USER_AGENT } from "./wikimedia";
import type { FetchLike } from "./wikimedia";

const PAGEVIEWS_BASE =
  "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents";

export interface PageviewWindow {
  start: string;
  end: string;
} // YYYY-MM-DD
const DAY_MS = 86_400_000;
const LAG_DAYS = 2; // Pageviews data lags ~24-48h; end the window LAG_DAYS before `now`
const WINDOW_DAYS = 30;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Trailing 30 complete days ending LAG_DAYS before `now` (UTC). Deterministic in `now`. */
export function pageviewWindow(now: Date): PageviewWindow {
  const end = new Date(now.getTime() - LAG_DAYS * DAY_MS);
  const start = new Date(end.getTime() - (WINDOW_DAYS - 1) * DAY_MS);
  return { start: isoDay(start), end: isoDay(end) };
}

/** Sum of daily views for one article over the window. A 404 (never-viewed) returns 0. */
export async function fetchPageviewCount(
  title: string,
  window: PageviewWindow,
  options: { fetchFn?: FetchLike; userAgent?: string } = {}
): Promise<number> {
  const fetchFn = options.fetchFn ?? (globalThis.fetch as unknown as FetchLike);
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const enc = encodeURIComponent(title.replace(/ /g, "_"));
  const url = `${PAGEVIEWS_BASE}/${enc}/daily/${window.start.replace(/-/g, "")}/${window.end.replace(/-/g, "")}`;
  const res = await fetchFn(url, { headers: { "User-Agent": userAgent } });
  if (res.status === 404) return 0;
  const body = (await res.json()) as { items?: { views?: number }[] };
  return (body.items ?? []).reduce((s, i) => s + (typeof i.views === "number" ? i.views : 0), 0);
}

export interface RankableArticle {
  pageId: number;
  title: string;
  pageviewCount: number;
}
export interface RankedArticle extends RankableArticle {
  rank: number;
}

/** Ranks DESC by count; ties broken by title ASC for determinism. 1-based ranks. */
export function rankByPageviews(articles: RankableArticle[]): RankedArticle[] {
  return [...articles]
    .sort((a, b) => b.pageviewCount - a.pageviewCount || a.title.localeCompare(b.title))
    .map((a, i) => ({ ...a, rank: i + 1 }));
}
