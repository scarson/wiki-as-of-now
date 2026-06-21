// ABOUTME: LIVE eval on the REAL detector gold corpus — measures source composition + Wikipedia-dependence
// ABOUTME: + fetch-funnel health on actual stale claims. No ground truth (not fabricated): answers "does excluding Wikipedia leave real claims with workable sources?" — not verbatim recall. NOT in the suite.
import { test } from "vitest";
import { writeFileSync } from "node:fs";
import goldSet from "../../test/gold/gold-set.json";
import { fetchSourceText, type FetchImpl, type SourceFetchFailureReason } from "../../src/research/source-fetch";
import { isCircularSource } from "../../src/research/source-exclusion";

const fetchImpl = ((url, init) => fetch(url, { ...init, redirect: "manual" })) as FetchImpl;
const RESULTS_PER_QUERY = 6;
const MAX_CLAIMS = 32; // all stale claims in the gold set

type GoldEntry = { fixture: string; sentenceSubstring: string; stale?: boolean };

/** Article title from the fixture filename — the only "context" available without re-parsing wikitext. */
const titleOf = (fixture: string) => fixture.replace(/\.wikitext$/i, "").replace(/[_-]+/g, " ");
/** Query stand-in for the (Workers-AI) query generator: article subject + the claim phrase. */
const queryFor = (e: GoldEntry) => `${titleOf(e.fixture)} ${e.sentenceSubstring}`;

async function search(provider: "brave" | "tavily", query: string): Promise<{ urls: string[]; error?: string }> {
  try {
    if (provider === "brave") {
      const u = `https://api.search.brave.com/res/v1/web/search?${new URLSearchParams({ q: query, count: String(RESULTS_PER_QUERY) })}`;
      const res = await fetch(u, { headers: { Accept: "application/json", "X-Subscription-Token": process.env.BRAVE_API_KEY ?? "" } });
      if (!res.ok) return { urls: [], error: `http ${res.status}` };
      const body = (await res.json()) as { web?: { results?: { url?: string }[] } };
      return { urls: (body.web?.results ?? []).map((r) => r.url).filter((x): x is string => !!x).slice(0, RESULTS_PER_QUERY) };
    }
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.TAVILY_API_KEY ?? ""}` },
      body: JSON.stringify({ query, max_results: RESULTS_PER_QUERY, search_depth: "basic", include_answer: false, include_raw_content: false }),
    });
    if (!res.ok) return { urls: [], error: `http ${res.status}` };
    const body = (await res.json()) as { results?: { url?: string }[] };
    return { urls: (body.results ?? []).map((r) => r.url).filter((x): x is string => !!x).slice(0, RESULTS_PER_QUERY) };
  } catch (e) {
    return { urls: [], error: String(e) };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Agg = {
  claims: number; totalResults: number; circularResults: number; rank1Circular: number;
  claimsWithNonCircularFetchable: number; claimsWithNothing: number;
  nonCircularAttempts: number; nonCircularOk: number; reasons: Record<string, number>; searchErrors: number;
};
const blank = (): Agg => ({ claims: 0, totalResults: 0, circularResults: 0, rank1Circular: 0, claimsWithNonCircularFetchable: 0, claimsWithNothing: 0, nonCircularAttempts: 0, nonCircularOk: 0, reasons: {}, searchErrors: 0 });

test("corpus funnel — real gold-set stale claims, Wikipedia-exclusion impact + fetch health", { timeout: 40 * 60_000 }, async () => {
  const entries = (Object.values(goldSet) as GoldEntry[]).filter((e) => e.stale).slice(0, MAX_CLAIMS);
  const agg: Record<"brave" | "tavily", Agg> = { brave: blank(), tavily: blank() };

  for (const e of entries) {
    const q = queryFor(e);
    for (const provider of ["brave", "tavily"] as const) {
      if (provider === "brave") await sleep(1100); // throttle Brave to respect the rate limit
      const a = agg[provider];
      a.claims++;
      const s = await search(provider, q);
      if (s.error) a.searchErrors++;
      a.totalResults += s.urls.length;
      let nonCircularOkThisClaim = 0;
      for (let i = 0; i < s.urls.length; i++) {
        let host = "";
        try { host = new URL(s.urls[i]).hostname; } catch { /* unparseable */ }
        const circular = host !== "" && isCircularSource(host);
        if (circular) { a.circularResults++; if (i === 0) a.rank1Circular++; continue; } // excluded in production — count, don't fetch
        a.nonCircularAttempts++;
        const r = await fetchSourceText(s.urls[i], { fetchImpl });
        if (r.ok) { a.nonCircularOk++; nonCircularOkThisClaim++; }
        else a.reasons[r.reason as SourceFetchFailureReason] = (a.reasons[r.reason as SourceFetchFailureReason] ?? 0) + 1;
      }
      if (nonCircularOkThisClaim > 0) a.claimsWithNonCircularFetchable++; else a.claimsWithNothing++;
    }
  }

  const fmt = (label: "brave" | "tavily") => {
    const a = agg[label];
    return `\n[${label.toUpperCase()}]  search errors: ${a.searchErrors}` +
      `\n  claims: ${a.claims}  |  avg results/claim: ${(a.totalResults / a.claims).toFixed(1)}` +
      `\n  Wikipedia/circular results: ${a.circularResults}/${a.totalResults} (${((a.circularResults / a.totalResults) * 100).toFixed(0)}%)  |  rank-1 was circular: ${a.rank1Circular}/${a.claims}` +
      `\n  claims with >=1 non-circular FETCHABLE source (material after exclusion): ${a.claimsWithNonCircularFetchable}/${a.claims}` +
      `\n  claims with NOTHING fetchable after exclusion:                            ${a.claimsWithNothing}/${a.claims}` +
      `\n  non-circular page fetch: ${a.nonCircularOk}/${a.nonCircularAttempts} ok  |  failures: ${JSON.stringify(a.reasons)}`;
  };

  const report = `\n========== CORPUS FUNNEL (real gold-set, n=${entries.length} stale claims, top-${RESULTS_PER_QUERY}) ==========` +
    `\n(No ground truth — measures source composition + fetch funnel, NOT verbatim recall.)\n` + fmt("brave") + "\n" + fmt("tavily") + "\n";
  writeFileSync("/tmp/search-eval-corpus.txt", report);
  console.log(report);
});
