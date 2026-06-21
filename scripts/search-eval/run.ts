// ABOUTME: One-off LIVE empirical eval — Brave vs Tavily URL-discovery recall, reusing the project's
// ABOUTME: real fetchSourceText + evaluateQuote. NOT part of the suite (run via its own vitest config). Needs BRAVE_API_KEY/TAVILY_API_KEY.
import { test } from "vitest";
import { writeFileSync } from "node:fs";
import { fetchSourceText, type FetchImpl, type UntrustedSourceText } from "../../src/research/source-fetch";
import { evaluateQuote } from "../../src/research/verbatim-check";

// Real global fetch adapted to the project's FetchImpl shape (Response already has {status, headers, body}).
const fetchImpl = ((url, init) => fetch(url, init)) as FetchImpl;

const RESULTS_PER_QUERY = 5;

/**
 * Ground-truth cases. Each `expected` is a high-confidence, verbatim-stable answer string
 * (>= MIN_QUOTE_LEN = 8 code points) that SHOULD appear on an authoritative source page.
 * Mostly stable general-knowledge facts (certain ground truth) + a couple of current-state
 * facts (term-bounded, safe through 2026). This is a LOWER bound on difficulty: these are
 * easier than the niche, date-anchored Wikipedia staleness claims the product targets, so
 * strong scores here do NOT prove performance on hard claims — but weak scores would be damning,
 * and it is an apples-to-apples comparison through the project's own verification machinery.
 */
const CASES: { query: string; expected: string }[] = [
  { query: "capital city of Australia", expected: "Canberra" },
  { query: "author of the novel Pride and Prejudice", expected: "Jane Austen" },
  { query: "scientist who developed the theory of general relativity", expected: "Albert Einstein" },
  { query: "highest mountain above sea level on Earth", expected: "Mount Everest" },
  { query: "speed of light in vacuum in metres per second", expected: "299,792,458" },
  { query: "first human to walk on the Moon", expected: "Neil Armstrong" },
  { query: "playwright who wrote Romeo and Juliet", expected: "William Shakespeare" },
  { query: "official currency of Japan", expected: "Japanese yen" },
  { query: "largest ocean on Earth", expected: "Pacific Ocean" },
  { query: "creator of the Python programming language", expected: "Guido van Rossum" },
  { query: "company that develops the Windows operating system", expected: "Microsoft" },
  { query: "painter of the Mona Lisa", expected: "Leonardo da Vinci" },
  { query: "current President of France", expected: "Emmanuel Macron" },
  { query: "landmark iron lattice tower in Paris France", expected: "Eiffel Tower" },
  { query: "largest coral reef system in the world", expected: "Great Barrier Reef" },
];
const ACTIVE = CASES;

type SearchOutcome = { urls: string[]; ms: number; error?: string };

async function braveSearch(query: string): Promise<SearchOutcome> {
  const t0 = performance.now();
  try {
    const u = `https://api.search.brave.com/res/v1/web/search?${new URLSearchParams({ q: query, count: String(RESULTS_PER_QUERY) })}`;
    const res = await fetch(u, { headers: { Accept: "application/json", "X-Subscription-Token": process.env.BRAVE_API_KEY ?? "" } });
    const ms = performance.now() - t0;
    if (!res.ok) return { urls: [], ms, error: `http ${res.status}` };
    const body = (await res.json()) as { web?: { results?: { url?: string }[] } };
    const urls = (body.web?.results ?? []).map((r) => r.url).filter((x): x is string => !!x).slice(0, RESULTS_PER_QUERY);
    return { urls, ms };
  } catch (e) {
    return { urls: [], ms: performance.now() - t0, error: String(e) };
  }
}

async function tavilySearch(query: string): Promise<SearchOutcome> {
  const t0 = performance.now();
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.TAVILY_API_KEY ?? ""}` },
      body: JSON.stringify({ query, max_results: RESULTS_PER_QUERY, search_depth: "basic", include_answer: false, include_raw_content: false }),
    });
    const ms = performance.now() - t0;
    if (!res.ok) return { urls: [], ms, error: `http ${res.status}` };
    const body = (await res.json()) as { results?: { url?: string }[] };
    const urls = (body.results ?? []).map((r) => r.url).filter((x): x is string => !!x).slice(0, RESULTS_PER_QUERY);
    return { urls, ms };
  } catch (e) {
    return { urls: [], ms: performance.now() - t0, error: String(e) };
  }
}

/** Fetch each URL with the project's real fetcher; return the 1-based rank of the first page whose text contains `expected` verbatim. */
async function firstVerifiedRank(urls: string[], expected: string): Promise<{ rank: number | null; fetched: number; fetchFails: string[] }> {
  let fetched = 0;
  const fetchFails: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const r = await fetchSourceText(urls[i], { fetchImpl });
    if (!r.ok) { fetchFails.push(r.reason); continue; }
    fetched++;
    if (evaluateQuote(r.text as UntrustedSourceText, expected) === "matched") {
      return { rank: i + 1, fetched, fetchFails };
    }
  }
  return { rank: null, fetched, fetchFails };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ProviderAgg = { hits: number; rrSum: number; firstRanks: number[]; searchMs: number[]; searchErrors: number; pagesFetched: number; pageAttempts: number };
const blank = (): ProviderAgg => ({ hits: 0, rrSum: 0, firstRanks: [], searchMs: [], searchErrors: 0, pagesFetched: 0, pageAttempts: 0 });

test("brave vs tavily — live URL-discovery recall", { timeout: 20 * 60_000 }, async () => {
  const brave = blank();
  const tavily = blank();
  const perCase: string[] = [];

  for (const c of ACTIVE) {
    // Brave (throttled ~1 req/s to respect the free-tier rate limit), then Tavily.
    const bs = await braveSearch(c.query);
    await sleep(1100);
    const ts = await tavilySearch(c.query);

    const bv = await firstVerifiedRank(bs.urls, c.expected);
    const tv = await firstVerifiedRank(ts.urls, c.expected);

    for (const [agg, s, v] of [[brave, bs, bv], [tavily, ts, tv]] as const) {
      agg.searchMs.push(s.ms);
      if (s.error) agg.searchErrors++;
      agg.pageAttempts += s.urls.length;
      agg.pagesFetched += v.fetched;
      if (v.rank !== null) { agg.hits++; agg.rrSum += 1 / v.rank; agg.firstRanks.push(v.rank); }
    }

    perCase.push(
      `${bv.rank !== null ? "✓@" + bv.rank : "✗"}  ${tv.rank !== null ? "✓@" + tv.rank : "✗"}   ${c.query}` +
      `${bs.error ? "  [brave " + bs.error + "]" : ""}${ts.error ? "  [tavily " + ts.error + "]" : ""}`,
    );
    // eslint-disable-next-line no-console
    console.log(`done: ${c.query}  brave=${bv.rank !== null ? "@" + bv.rank : "miss"} tavily=${tv.rank !== null ? "@" + tv.rank : "miss"}`);
  }

  const n = ACTIVE.length;
  const fmt = (a: ProviderAgg) => ({
    recall: `${a.hits}/${n} (${((a.hits / n) * 100).toFixed(0)}%)`,
    mrr: (a.rrSum / n).toFixed(3),
    meanFirstRank: a.firstRanks.length ? (a.firstRanks.reduce((x, y) => x + y, 0) / a.firstRanks.length).toFixed(2) : "—",
    medianSearchMs: median(a.searchMs).toFixed(0),
    searchErrors: a.searchErrors,
    fetchSuccess: `${a.pagesFetched}/${a.pageAttempts}`,
  });

  const report =
    `\n================ LIVE EVAL: Brave vs Tavily (n=${n}, top-${RESULTS_PER_QUERY}, real fetchSource+evaluateQuote) ================\n` +
    `Metric            | Brave                | Tavily\n` +
    `recall@${RESULTS_PER_QUERY} (any) | ${pad(fmt(brave).recall)} | ${fmt(tavily).recall}\n` +
    `MRR               | ${pad(fmt(brave).mrr)} | ${fmt(tavily).mrr}\n` +
    `mean first rank   | ${pad(fmt(brave).meanFirstRank)} | ${fmt(tavily).meanFirstRank}\n` +
    `median search ms  | ${pad(fmt(brave).medianSearchMs)} | ${fmt(tavily).medianSearchMs}\n` +
    `search errors     | ${pad(String(fmt(brave).searchErrors))} | ${fmt(tavily).searchErrors}\n` +
    `page fetch ok     | ${pad(fmt(brave).fetchSuccess)} | ${fmt(tavily).fetchSuccess}\n` +
    `\nPer-case (brave / tavily):\n` + perCase.join("\n") + "\n";
  writeFileSync("/tmp/search-eval-results.txt", report);
  // eslint-disable-next-line no-console
  console.log(report);
});

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function pad(s: string): string { return s.padEnd(20); }
