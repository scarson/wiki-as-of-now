<!-- ABOUTME: Comparative evaluation of Brave Search API (Search + Grounding) vs Tavily as the URL-discovery backend for WikiAsOfNow's research layer. -->
<!-- ABOUTME: Conclusion — keep Brave Search; reject Brave Grounding and Tavily; resolve a cross-cutting result-storage ToS question independent of the choice. Multi-agent web research, June 2026. -->

# Research — Brave Search API vs Tavily as the search backend

**Status:** research complete; recommendation below. Produced 2026-06-21 via a 5-lane parallel web-research fan-out (Tavily API shape, Tavily benchmark claims, Brave Search API + ToS, Brave Grounding API, independent comparisons + developer sentiment), each lane grounded in the actual integration shape and cross-validated.

**Question (Sam):** Assess using the Brave Search API vs Tavily for this project. Tavily makes bold, seemingly benchmark-substantiated search-performance claims; Brave has both a **Search** and a **Grounding** API and we hadn't considered the latter.

**Companion docs:** the existing rationale lives in [WikiAsOfNow_design_spec.md §11.6 "Why Workers AI + Brave, not Gemini grounding"](WikiAsOfNow_design_spec.md) (the real-URL / no-mandated-branding criteria this evaluation reuses) and [2026-06-06-research-engine-design.md](2026-06-06-research-engine-design.md) (the provider-proposes / pipeline-verifies architecture). The governing compliance contract is [docs/policy/wikipedia-genai-compliance.md](../policy/wikipedia-genai-compliance.md) (guardrails G1 no-machine-written-text, G3 anchor-to-a-real-URL, G8 verbatim-quote check, G9 bounded LLM role, G15 untrusted fetched content).

---

## TL;DR / recommendation

**Keep the Brave Search API as the search backend. Do not adopt Tavily. Do not adopt Brave's Grounding API.** Separately — and independent of this choice — **resolve a result-storage Terms-of-Service question** that currently bites Brave *and* would bite Tavily *and* implicates the existing `brave-search.ts` storage-ToS comment.

The decision turns on one architectural fact about *how this project uses search*, which inverts most of the marketing:

> The search backend has exactly one job here: **turn a neutral query into ranked, real, fetchable source URLs.** The tool then **discards the provider's snippets/answers**, **fetches each page itself** (SSRF-hardened, G15), and runs a **deterministic verbatim-quote check** (G8). It must **never persist provider-authored prose** (G1).

Everything Tavily and Brave-Grounding sell on top of raw URLs — clean extracted content, LLM-synthesized answers, grounded citations — is at best **redundant** with the project's own fetch+verify step and at worst an **anti-fit** with the no-machine-written-text guardrail. So the evaluation collapses to: *as a real-URL-discovery backend, is Tavily worth switching to?* The evidence says no.

| | Verdict | One-line reason |
|---|---|---|
| **Brave Search API** (current) | **KEEP** | Wins the one independent retrieval-relevance benchmark; own index; cheaper/faster; correct output shape. |
| **Tavily Search API** | **REJECT (switch not justified)** | Headline benchmarks measure answer-synthesis we discard; independent relevance ranks it *below* Brave; aggregator with no own index (upstream-fragile); pricier per query; stale-link reports. |
| **Brave Grounding API** | **REJECT (wrong shape)** | Returns model-authored prose, no raw-results-only mode — same category problem as the already-rejected Gemini grounding. |
| **Tavily Extract / Crawl / Map** | **REJECT (redundant)** | Duplicates the project's own SSRF-hardened fetcher and the prose it is compliance-bound to discard. |
| **Result-storage ToS** | **RESOLVED — accepted risk (Sam, 2026-06-21)** | Brave §3.1(b)(i) and Tavily §3.2 both restrict storing results; the tool durably persists source URLs in `research_packs`. Decision: defensible on its merits + de-minimis volume — see §4. |

**Empirical confirmation (live, 2026-06-21 — §8):** a 15-case head-to-head through the project's *own* `fetchSourceText` + `evaluateQuote` shows Brave and Tavily tied at **100% recall@5** on an easy set, but Brave wins on result authority — **MRR 1.000 (verifiable source at rank 1 every time) vs Tavily 0.802 (mean first-verified rank 1.6)** — the axis a capped fetch-and-verify pipeline is most sensitive to. (Tavily's raw search call was faster, 50 vs 141 ms; immaterial — page-fetch dominates.)

---

## 1. How the search backend is actually used (the decisive framing)

The integration is a one-method seam (`src/research/search-provider.ts`):

```ts
interface SearchHit { url: string; }            // ONLY the URL is retained — never title/snippet
interface SearchProvider { search(query: string): Promise<SearchHit[]>; }
```

`BraveSearchProvider` (`src/research/brave-search.ts`) already implements it and **deliberately keeps only `result.url`**, dropping Brave's titles/descriptions. Downstream (`workers-ai-provider.ts`): the model generates neutral queries → `search()` returns URLs → the tool's own `fetchSource` fetches each page → the model proposes a verbatim quote → the deterministic check verifies it → an `EvidenceCard { url, verbatimQuote, advisorySupport }` is persisted in `research_packs`.

Two consequences that govern the whole evaluation:

1. **Snippet/answer quality is nearly irrelevant.** The provider's own text never reaches the model or the user; the tool re-fetches and re-verifies. What matters is **URL recall/relevance**: does the query surface the URL that *actually contains a verifiable supporting quote*?
2. **Switching cost is trivial.** A swap is one new `TavilySearchProvider implements SearchProvider` class plus one branch in `select-provider.ts`. The seam was built for exactly this. So "it's already integrated" is **not** a strong argument for Brave — Brave has to win on merit. It does.

---

## 2. Brave's Grounding API — the right question, the wrong shape

Sam flagged Brave's Grounding API as unconsidered. We considered it; it does not fit, for the same structural reason the project **already rejected Gemini "Grounding with Google Search"** (spec §11.6).

- **What it is:** "AI Grounding," launched 2025-08-05, part of Brave's **Answers** tier. Endpoint is OpenAI-chat-compatible (`/res/v1/chat/completions`); it **streams a model-synthesized answer** with citations embedded as inline `<citation>{…"url":…,"snippet":…}</citation>` tags. *[Brave blog — vendor; api-dashboard docs — vendor]*
- **Make-or-break #1 — output is model-authored prose, with no raw-results-only mode.** Brave's docs: *"This API doesn't offer a raw-results-only mode… designed specifically for grounded, synthesized answers."* That synthesized text is exactly what **G1 (no machine-written text)** forbids the tool from using or persisting. *[api-dashboard docs — vendor]*
- **Make-or-break #2 — it does avoid Gemini's two *specific* dealbreakers, but that doesn't rescue it.** Unlike Gemini grounding, Brave's citation URLs appear to be **real source URLs** (not `vertexaisearch…/grounding-api-redirect/…` proxies), and attribution reads **optional** ("may provide attribution… 'POWERED BY BRAVE'") rather than the mandatory Search-Suggestions render Google requires. Good — but moot: the **prose payload itself** is the disqualifier, independent of the URL format. *[api-dashboard ToS — vendor; could not verify a verbatim citation URL string in docs; a community thread reports citations sometimes missing → would need a live smoke test]*
- **Cost/latency are also worse for our purpose:** $4/1k queries **+ $5/1M tokens**, throttled to **2 req/s**, single-search answers stream in "under 4.5s" (Research mode "into the minutes") — vs the plain Search API's $5/1k, 50 req/s, single index lookup. *[Brave pricing — vendor]*

**Verdict: REJECT (wrong shape).** The correct Brave product for this pipeline is the **plain Web Search endpoint we already use**. (Brave also exposes an `/llm/context` endpoint returning raw passages + a URL-keyed `sources` map with no prose — a cleaner shape than Grounding, but **redundant** here because the project does its own extraction and verbatim check.)

---

## 3. Tavily's benchmark claims — bold, transparent, and mostly about the wrong metric

Sam's read — "bold but seemingly substantiated in benchmarks" — is fair on its face, but the substantiation measures something this project throws away.

- **The headline: "SOTA on SimpleQA, 93.3%."** Methodology (to Tavily's credit, fully disclosed and reproducible): for each SimpleQA question, Tavily returns documents → **GPT-4.1 synthesizes an answer from those documents** → OpenAI's classifier grades the answer. So 93.3% scores **answer synthesis** (retrieval *plus* GPT-4.1's reading comprehension) — **not** "did the returned URL contain the fact." This is precisely the synthesis step the project discards. **Largely irrelevant to us.** *[tavily.com blog — vendor, self-run]*
- **The retrieval-relevant self-claim is contradicted by independent data.** Tavily's own "Document Relevance" benchmark reports Tavily **83.0%** vs Brave **56.2%**, Exa 51.3% — but it runs on a **self-generated dataset** (Tavily's "Dynamic Eval Datasets Generator"). The one **independent** head-to-head (AIMultiple, see §5) **inverts** this: on retrieval relevance, **Brave ranks #1 and Tavily 5th of 8, with Brave ~1 point *ahead* of Tavily** across repeated statistical tests. A self-run benchmark showing a 27-point lead, flipped to a deficit by independent testing, is the textbook signal to treat the self-run numbers as marketing. *[github.com/tavily-ai — vendor; aimultiple.com — independent]*
- **Vendor SimpleQA numbers don't even agree with each other.** Tavily self-reports 93.3%; competitor Linkup's benchmark reports **Tavily at 73%**. Different answerer LLMs and pipelines → not cross-comparable. All vendor SimpleQA "we're SOTA" claims (Tavily, Linkup, Exa, You.com) should be read as marketing artifacts, not falsifiable facts. *[linkup.so — vendor]*
- **The "180 ms p50, fastest on the market" site claim** is unbacked by any head-to-head; independent measurement puts Tavily latency near **~1,000 ms** (Brave: 669 ms). *[tavily.com — vendor; aimultiple.com — independent]*

**Net:** Tavily's benchmarks are commendably transparent but (a) the famous one measures answer accuracy we don't use, and (b) the retrieval-relevant ones are self-run on self-generated data and are contradicted by the only independent source. They are not a reason to switch.

---

## 4. The result-storage ToS — the one finding that actually demands action (provider-agnostic)

This is the most important practical discovery, and it is **largely independent of the Brave-vs-Tavily choice** — it implicates the architecture and the current code.

- **Brave (post-Feb-2026 restructure):** ToS **§3.1(b)(i)** — customer must not *"store, cache, or create a database of Search Results, **in whole or in part**, other than transient storage required for operation."* "Search Results" (§1.10) explicitly includes the returned URLs. **No tier grants storage rights** in the 2026 structure — the old "Data for AI" plan was about *AI-inference* rights (now folded into the $5/1k Search plan) and is gone; storing **only the URL is not carved out.** *[api-dashboard ToS — vendor]*
- **Tavily:** ToS grants **no explicit storage right** at all; **§3.2** bars using the service to "build a competitive product," to "compete with Tavily," and "(viii) … data mining, robots, or similar data gathering or extraction methods." Its binding Privacy Policy **reserves the right to reuse query data**; "zero data retention" is an **enterprise-contract** feature, not the default — and the FAQ/Trust-Center marketing of ZDR **contradicts** the binding policy. If anything, Tavily's contractual posture is **more** restrictive/ambiguous than Brave's. *[tavily.com/terms, tavily.com/privacy — vendor]*
- **Why it bites us concretely:** the tool **durably persists the source `url`** inside `research_packs.cards_json` (`EvidenceCard.url`, confirmed in `src/db/research-packs.ts`) and surfaces it to users — that is not "transient storage required for operation."
- **The existing code already assumes this is fine and may be wrong.** `brave-search.ts` says *"Retains ONLY result URLs (never Brave titles/snippets; storage-ToS §3.2)."* Two problems: the **section number is now stale** (the Feb-2026 ToS restructure moved/renamed it; the operative clause is §3.1(b)(i)), and the **premise** — that URL-only retention sidesteps the restriction — is **not supported** by the "in whole or in part" language.
- **The honest nuance (don't overclaim):** the persisted URL is one the tool **independently fetched and verified**, surfaced as a *citation the user is encouraged to open* — arguably no longer "Brave's Search Result" but "a source the human is citing." Whether that, or the "transient storage required for operation" exception, covers the `research_packs` write is a **genuine legal judgment call**, not a clear violation. It is also not unique to Brave.

**Action (provider-agnostic):** get explicit confirmation from Brave (support/legal, or the Enterprise tier) that transiently holding and citing a verified result URL is permitted, **or** confirm the citation-not-result framing, **and** update the stale `brave-search.ts` comment to cite the current clause and the resolution. This is the same question whichever provider we pick, so it is **not** a reason to prefer one over the other.

**Decision (Sam, 2026-06-21): accept the risk; no escalation to Brave legal.** Rationale, recorded as the durable judgment call: (a) the persisted item is a real source URL the tool **independently fetched and verified** and surfaces as a **citation the human is meant to open** — the "a source the user is citing," not "a database of Brave's Search Results," framing is the operative reading, and is defensible on its merits; (b) usage sits at **de-minimis, effectively-free-tier volume** (a single solo, open-source, Wikipedia-improving project within Brave's ~1,000-search $5 monthly credit), so enforcement risk against this use is negligible. The `brave-search.ts` ABOUTME comment is updated to drop the stale §3.2 reference and the unsupported URL-only-carve-out premise, pointing here instead. This decision is **provider-agnostic** — it does not depend on or favor Brave vs Tavily — and is **revisitable** if the project ever moves to non-trivial public volume, at which point Brave Enterprise / written clarification becomes the right path.

---

## 5. Independent evidence and strategic durability (where Brave clearly wins)

- **The one rigorous independent benchmark — AIMultiple "Agentic Search" (2026)** — measures exactly our metric (retrieval relevance + source quality, **no answer synthesis**): 100 real queries, ~4,000 results judged by an LLM with 10% human verification, bootstrap CIs, explicit "no AIMultiple customers featured" disclosure. Result: **Brave #1, Agent Score 14.89 (relevance 4.28/5, quality 3.48/5, 669 ms — fastest); Tavily 5th, 13.67 (4.18/5, 3.27/5, ~998 ms).** The top four (Brave, Firecrawl, Exa, Parallel-Pro) are a statistical tie; *"Brave was the only API to reliably outperform Tavily."* *[aimultiple.com — independent]*
- **Architecture — Brave owns an independent index; Tavily aggregates.** Independent analysis (Garden Research) describes Tavily as having **no proprietary index** (reportedly fanning out to Google/Serper), classing such aggregators as **"vulnerable to upstream changes."** Brave is repeatedly described as "the only large independent western search index with an open API." With **Microsoft's Bing Web Search API retired (2025-08-11)** and **Google's Custom Search JSON API sunsetting (~2027)**, an own-index provider is the more **durable** bet; an aggregator inherits the fragility of the very APIs that are disappearing. *[gardenresearch.eu — independent; index-size figures are Brave's own, unaudited]*
- **Independent developer reports flag Tavily-specific failure modes** consistent with a cache-aggregator: junk-by-default results (nav/cookie/footer noise), **stale/404 links** ("pulls from cached sources that haven't been revalidated"), and historical 429/502 instability. Our fetch-and-verify design *mitigates* stale links (we'd drop the 404s), but it means Tavily's relevance scores can point at dead pages. *[github.com community #167015, gpt-researcher issues — independent; some reports are dated 2023–24]*
- **Corporate risk:** Tavily was **acquired by Nebius Group (Feb 2026)** per funding aggregators — a roadmap/pricing-stability unknown. *[sacra.com / nolist.ai — aggregators, not a primary announcement]*

---

## 6. Cost, throughput, latency (at this project's volume)

| | Brave Search API | Tavily Search (basic) |
|---|---|---|
| Per-query cost | **~$5 / 1,000 requests** | ~$8 / 1,000 (PAYG $0.008/credit; **advanced = 2 credits**) |
| Free allowance | **$5/mo credit (~1,000 searches)** — *free tier removed Feb 2026* | 1,000 credits/mo |
| Throughput | **50 req/s** | 100 RPM (dev) / 1,000 RPM (prod) |
| Independent latency | **669 ms** | ~998 ms |
| Index | **Own (~30–40B pages, vendor-claimed)** | **Aggregator, no own index** |
| Cloudflare Workers | plain `fetch` + `X-Subscription-Token` (in use) | plain `fetch` + Bearer (skip the SDK on edge) |

The metered unit here is **search calls** (`braveCount: 5` results/call; ~4–12 calls per claim research, capped by `maxCandidateUrls: 12`), not tokens — so Brave's flat $5/1k is the relevant figure, and it is **cheaper per query** than Tavily basic and **much** cheaper than Tavily advanced. Throughput/latency differences are immaterial at hobby-to-modest volume but both favor Brave. **Note for the spec:** §11.6's "cost is a wash, both effectively free" is now **stale** — Brave removed its free tier in Feb 2026 (≈1,000 free searches/month via $5 credit, then metered). Worth a one-line spec update.

---

## 7. Classification (per the project's comparative-evaluation rules)

- **BROKEN (disqualifying for our use):** Brave Grounding API output shape (model prose, no raw mode) — violates G1; Tavily Extract/Crawl/Map — redundant with our own fetch+verify.
- **MISSING:** Tavily has no own index (aggregator, upstream-fragile); no independent URL-recall benchmark exists on *our* fact distribution (date-anchored Wikipedia staleness claims) — the AIMultiple proxy uses general queries.
- **FIXABLE / action items:** the result-storage ToS question (provider-agnostic) and the stale `brave-search.ts` §3.2 comment; a spec update to §11.6's "effectively free" cost claim.

Per the rules, the clean-winner result is itself treated as suspicious — so note the **strongest counter-case for Tavily**, made fairly: Tavily's `/search` *is* a competent mid-pack backend that returns real URLs and runs fine on Workers; its output is "cleaner" for consumers that *don't* re-fetch (vendor blogs claim this, though an independent dev reports the opposite "lots of junk"); and `include_answer=false` would neutralize the prose concern. The case fails not because Tavily is bad, but because **for a fetch-and-verify-yourself pipeline its differentiators are inert**, it costs more, it ranks *below* Brave on the one independent relevance test, and it trades an own-index for an upstream-fragile aggregator — i.e., switching spends money and effort to move *down* the independent ranking and *down* in durability.

---

## 8. Empirical result — live head-to-head (2026-06-21)

Ran with both live keys (provisioned by Sam as environment variables): `scripts/search-eval/run.ts` — 15 ground-truth cases, top-5 results per provider, **every returned URL pushed through the project's real `fetchSourceText` (SSRF-hardened) + `evaluateQuote` (deterministic verbatim check)**. "Verified" = the fetched page contains the ground-truth answer string verbatim. Only the two trivial search clients are new code; the verification machinery is the project's own.

| Metric | Brave | Tavily |
|---|---|---|
| recall@5 (any verified source in top 5) | **15/15 (100%)** | **15/15 (100%)** |
| MRR (reciprocal rank of first verified source) | **1.000** | 0.802 |
| mean rank of first verified source | **1.00** | 1.60 |
| median search-call latency | 141 ms | **50 ms** |
| search errors | 0 | 0 |

**Read.** On this set, **both providers always surface a verifiable source within the top 5** (the recall floor is saturated — expected for easy facts). The differentiator is **rank/authority**: **Brave's #1 result is the verifiable authoritative source in all 15 cases (MRR 1.0)**, whereas Tavily's first verifiable source averages rank **1.6** because it interleaves social/video/aggregator URLs ahead of the authoritative page (e.g. for "capital city of Australia," Tavily's #1 was a Facebook video; the verifiable source was #2). This **corroborates the independent AIMultiple source-quality edge — now reproduced on the project's own verification machinery.** It matters disproportionately *here*: the real pipeline caps candidates (`perQueryHitCap=3`, `maxCandidateUrls=12`) and the strict fetcher drops most URLs, so a **rank-1 authoritative hit is far likelier to survive the cap+fetch funnel** than a rank-2–5 one.

**Honest limitations — do not overread:**
- **Easy set.** General-knowledge facts, *not* the niche, date-anchored Wikipedia staleness claims that are the product's hard case. This is a **lower bound on difficulty**: it differentiates rank/authority, not deep recall. The 100% recall is *not* evidence either provider handles hard claims — to test that, sample real detector candidates and hold `generateQueries` constant (the harness is structured to extend that way).
- **n=15, single run** — directional, not statistically powered.
- **Latency cut the other way.** Tavily's raw search call was *faster* here (50 vs 141 ms) — opposite to AIMultiple's end-to-end figure. Both are sub-second and immaterial: page-fetching, not the search call, dominates pipeline latency. Reported as measured, against the narrative.
- **Page-fetch success was not cleanly isolated** (the harness stops at the first verified hit, so fetch attempts are confounded by early-stop). One robust **side-observation** did surface and is worth a research-engine ticket: the v1 fetcher's `redirect:"error"` + content-type allowlist drops a large fraction of real-world candidate URLs (many sites 301 http→https or to a CDN) — **symmetric across providers**, so not a Brave-vs-Tavily signal, but a real recall tax on the pipeline itself.

**Net:** the live test **confirms the doc-based call** — Brave matches Tavily on raw recall and **beats it on result authority/rank**, the axis this capped, fetch-and-verify pipeline is most sensitive to. Nothing here argues for switching. Reproduce with `pnpm exec vitest run -c scripts/search-eval/vitest.eval.config.mts` (needs `BRAVE_API_KEY` + `TAVILY_API_KEY` in env).

---

## 9. Reasoning chain, alternatives considered, and uncertainties

**How the framing was chosen.** The first instinct — "compare two search APIs on benchmark quality" — was wrong, and reading the integration first is what corrected it. Once it was clear the seam consumes **URLs only** and the tool re-fetches/re-verifies, most of both vendors' marketing surface (clean content, answers, grounding) became inert, and the question narrowed to URL discovery + ToS + durability + cost. Grounding the five research lanes in that framing (rather than asking "which is the better search API") is what made the independent retrieval-relevance benchmark — not the SimpleQA answer-accuracy numbers — the load-bearing evidence.

**Alternatives considered and ruled out:**
- *Adopt Brave Grounding for richer results* — ruled out: prose output violates G1; the `/llm/context` raw-passage endpoint is the better Brave shape but is redundant with our own extraction.
- *Switch to Tavily on its benchmark reputation* — ruled out: the marquee benchmark measures answer synthesis we discard; independent relevance ranks it below Brave; aggregator durability risk; higher per-query cost.
- *Use Tavily Extract to replace our own fetcher* — ruled out: duplicates the SSRF-hardened fetch and hands back prose we're bound to discard; also moves the compliance-critical fetch off our own controlled path.
- *Treat "already integrated" as the reason to keep Brave* — explicitly rejected as weak; the swap is one class. Brave is kept on merit (independent benchmark, own index, cost), not inertia.

**What I'm still uncertain about (flagged, not hidden):**
- **URL recall on our specific distribution** — unmeasured by any source (see §8); the single biggest residual unknown.
- **The storage-ToS resolution** — a genuine legal judgment call (verified-citation framing vs "transient storage" exception); needs Sam/legal, not an engineering guess. Affects both providers equally.
- **Brave's index-size / freshness figures** — vendor-reported, unaudited.
- **The exact engines Tavily aggregates** — the *that-it-aggregates* claim is well-corroborated; the *Google+Serper* specifics rest on one independent source; Tavily doesn't disclose.
- **Brave Grounding citation-URL format and reliability** — docs show only placeholders; a community thread reports missing sources; would need a live smoke test if ever reconsidered.

**Source-quality caveat:** this niche is dominated by vendor/SEO "comparison" blogs. The load-bearing independent signal is concentrated in a small set — AIMultiple's benchmark, Garden Research, GitHub community/issue threads, implicator.ai, Search Engine Journal — and every vendor-authored claim above is tagged as such inline.

---

## 10. Sources

**Independent:**
- AIMultiple, "Agentic Search" benchmark — https://aimultiple.com/agentic-search
- Garden Research, agentic web search 2026 — https://gardenresearch.eu/agentic_web_search_2026
- GitHub community discussion #167015 (Tavily output/staleness) — https://github.com/orgs/community/discussions/167015
- gpt-researcher issues #290, #1047 (Tavily instability) — https://github.com/assafelovic/gpt-researcher/issues/1047
- implicator.ai, Brave free-tier removal — https://www.implicator.ai/brave-drops-free-search-api-tier-puts-all-developers-on-metered-billing/
- Search Engine Journal, Brave independence / AI Grounding — https://www.searchenginejournal.com/brave-search-cuts-ties-with-bing-goes-independent/485736/

**Vendor (treat claims as self-reported):**
- Brave Search API pricing / ToS — https://api-dashboard.search.brave.com/documentation/pricing · https://api-dashboard.search.brave.com/documentation/resources/terms-of-service
- Brave AI Grounding — https://brave.com/blog/ai-grounding/ · https://api-dashboard.search.brave.com/app/documentation/ai-grounding/responses
- Tavily Search API ref / credits / ToS / privacy — https://docs.tavily.com/documentation/api-reference/endpoint/search · https://docs.tavily.com/documentation/api-credits · https://www.tavily.com/terms · https://tavily.com/privacy
- Tavily SimpleQA blog / evals repo — https://www.tavily.com/blog/tavily-evaluation-part-1-tavily-achieves-sota-on-simpleqa-benchmark · https://github.com/tavily-ai/tavily-search-evals
- Linkup SimpleQA (Tavily at 73%) — https://www.linkup.so/blog/linkup-establishes-sota-performance-on-simpleqa
