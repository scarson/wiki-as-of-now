// ABOUTME: One-off LIVE eval — Brave vs Tavily URL-discovery, with (a) full per-URL fetch-failure categorization
// ABOUTME: (the redirect:"error" recall-tax measurement) and (b) recall WITH vs WITHOUT Wikipedia (WP:CIRCULAR). NOT in the suite. Needs BRAVE_API_KEY/TAVILY_API_KEY.
import { test } from "vitest";
import { writeFileSync } from "node:fs";
import { fetchSourceText, type FetchImpl, type UntrustedSourceText, type SourceFetchFailureReason } from "../../src/research/source-fetch";
import { evaluateQuote } from "../../src/research/verbatim-check";
import { isCircularSource } from "../../src/research/source-exclusion";

// Faithfully reproduce production: source-fetch rejects any 3xx (redirect_not_allowed), which only
// fires if the underlying fetch does NOT auto-follow. Default undici follows; force redirect:"manual"
// so source-fetch sees the 3xx status and applies its own rejection (matches the v1 "reject redirects" design).
const fetchImpl = ((url, init) => fetch(url, { ...init, redirect: "manual" })) as FetchImpl;
const RESULTS_PER_QUERY = 8;

// Circular-source classification reuses the SHIPPED production filter so the eval matches reality.

const EASY_CASES: { query: string; expected: string }[] = [
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

// HARD set — niche / recent / date-anchored facts (the product's real distribution), each with a
// verbatim-stable answer (>= 8 code points) verifiable on a NON-Wikipedia authoritative source.
// Author-constructed proxy (real detector output needs Workers AI, unavailable here) — a documented limitation.
const HARD_CASES: { query: string; expected: string }[] = [
  { query: "2024 Nobel Prize in Literature laureate", expected: "Han Kang" },
  { query: "company that acquired Activision Blizzard", expected: "Microsoft" },
  { query: "chief executive officer of OpenAI", expected: "Sam Altman" },
  { query: "2024 Nobel Peace Prize laureate organization", expected: "Nihon Hidankyo" },
  { query: "winner of the 2024 United States presidential election", expected: "Donald Trump" },
  { query: "NASA spacecraft that returned samples from asteroid Bennu", expected: "OSIRIS-REx" },
  { query: "Prime Minister of the United Kingdom since July 2024", expected: "Keir Starmer" },
  { query: "2024 Masters Tournament golf champion", expected: "Scottie Scheffler" },
  { query: "country that won the 2022 FIFA World Cup", expected: "Argentina" },
  { query: "2024 Nobel Prize in Physics laureate", expected: "Geoffrey Hinton" },
  { query: "team that won the 2023 Cricket World Cup", expected: "Australia" },
  { query: "person who invented the World Wide Web", expected: "Tim Berners-Lee" },
];

const EVAL_SET = process.env.EVAL_SET === "hard" ? "hard" : "easy";
const CASES = EVAL_SET === "hard" ? HARD_CASES : EASY_CASES;

type Rec = { rank: number; host: string; isWiki: boolean; ok: boolean; reason?: SourceFetchFailureReason; matched: boolean };

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

async function probe(urls: string[], expected: string): Promise<Rec[]> {
  const recs: Rec[] = [];
  for (let i = 0; i < urls.length; i++) {
    let host = "";
    try { host = new URL(urls[i]).hostname; } catch { /* leave blank */ }
    const isWiki = isCircularSource(host);
    const r = await fetchSourceText(urls[i], { fetchImpl });
    if (!r.ok) { recs.push({ rank: i + 1, host, isWiki, ok: false, reason: r.reason, matched: false }); continue; }
    recs.push({ rank: i + 1, host, isWiki, ok: true, matched: evaluateQuote(r.text as UntrustedSourceText, expected) === "matched" });
  }
  return recs;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const firstRank = (recs: Rec[], pred: (r: Rec) => boolean): number | null => {
  const hit = recs.filter((r) => r.matched && pred(r)).sort((a, b) => a.rank - b.rank)[0];
  return hit ? hit.rank : null;
};

test("brave vs tavily — wiki-excluded recall + fetch-failure breakdown", { timeout: 30 * 60_000 }, async () => {
  const all: Record<"brave" | "tavily", Rec[][]> = { brave: [], tavily: [] };
  const searchErr: Record<"brave" | "tavily", number> = { brave: 0, tavily: 0 };

  for (const c of CASES) {
    const bs = await search("brave", c.query);
    await sleep(1100);
    const ts = await search("tavily", c.query);
    if (bs.error) searchErr.brave++;
    if (ts.error) searchErr.tavily++;
    all.brave.push(await probe(bs.urls, c.expected));
    all.tavily.push(await probe(ts.urls, c.expected));
  }

  const n = CASES.length;
  const lines: string[] = [];
  const summarize = (label: "brave" | "tavily") => {
    const cases = all[label];
    let recallWith = 0, recallNoWiki = 0, wikiOnly = 0, rank1Wiki = 0, rrNoWiki = 0;
    const reasons: Record<string, number> = {};
    let attempts = 0, okCount = 0;
    cases.forEach((recs) => {
      const withRank = firstRank(recs, () => true);
      const noWikiRank = firstRank(recs, (r) => !r.isWiki);
      if (withRank !== null) recallWith++;
      if (noWikiRank !== null) { recallNoWiki++; rrNoWiki += 1 / noWikiRank; }
      if (withRank !== null && noWikiRank === null) wikiOnly++;          // excluding wiki DROPS this case
      if (recs[0]?.matched && recs[0]?.isWiki) rank1Wiki++;             // the rank-1 verifier was wiki
      recs.forEach((r) => { attempts++; if (r.ok) { okCount++; } else reasons[r.reason ?? "?"] = (reasons[r.reason ?? "?"] ?? 0) + 1; });
    });
    lines.push(
      `\n[${label.toUpperCase()}]  search errors: ${searchErr[label]}` +
      `\n  recall@${RESULTS_PER_QUERY}  WITH wiki:    ${recallWith}/${n} (${((recallWith / n) * 100).toFixed(0)}%)` +
      `\n  recall@${RESULTS_PER_QUERY}  NO wiki:      ${recallNoWiki}/${n} (${((recallNoWiki / n) * 100).toFixed(0)}%)   MRR(no-wiki)=${(rrNoWiki / n).toFixed(3)}` +
      `\n  cases wiki was the ONLY verifier (excluding it drops recall): ${wikiOnly}/${n}` +
      `\n  cases where rank-1 verifier was Wikipedia:                    ${rank1Wiki}/${n}` +
      `\n  page fetch: ${okCount}/${attempts} ok  |  failure reasons: ${JSON.stringify(reasons)}`,
    );
  };
  summarize("brave");
  summarize("tavily");

  const report = `\n========== LIVE EVAL [${EVAL_SET.toUpperCase()}] (n=${n}, top-${RESULTS_PER_QUERY}, real fetchSource+evaluateQuote) ==========` + lines.join("\n") + "\n";
  writeFileSync(`/tmp/search-eval-${EVAL_SET}.txt`, report);
  console.log(report);
});
