<!-- ABOUTME: v1 build design for WikiAsOfNow — concretizes the office-hours v1 into a buildable plan: the Workers AI + Brave research layer, the dark archival visual system, Cloudflare provisioning, two-branch gitflow, and a Miniflare-first build sequence. -->
<!-- ABOUTME: Produced in a /superpowers:brainstorming session on 2026-06-13; companion to the design spec, the compliance contract, and the office-hours v1 design. -->

# Design: WikiAsOfNow v1 — Build Design

Status: APPROVED (brainstorming, 2026-06-13)
Supersedes no document; **concretizes** the build implied by the office-hours v1 design.

**Companion documents (authoritative on their topics — this doc does not restate them):**
- Architecture/product spec: [docs/design/WikiAsOfNow_design_spec.md](WikiAsOfNow_design_spec.md) — to be amended to v1.1 by this build (see §7).
- Compliance social contract (sacrosanct, binding): [docs/policy/wikipedia-genai-compliance.md](../policy/wikipedia-genai-compliance.md) — the enumerated guardrails (the no-machine-written-text guardrail G1 … the no-copying guardrail G16) are inviolable project invariants.
- v1 product flow + build sequence: [docs/design/office-hours/wikiasofnow-v1-design.md](office-hours/wikiasofnow-v1-design.md) — the problem framing (batch-triage assistant that protects editing flow), the seven-step build sequence, and the success criteria. This doc resolves that doc's open questions on the LLM/search layer and adds the visual system, infra, and sequencing.
- Visual system: [DESIGN.md](../../DESIGN.md) (+ [PRODUCT.md](../../PRODUCT.md)) — the dark archival design system written this session.
- Research-engine slice design (already implemented): [docs/design/2026-06-06-research-engine-design.md](2026-06-06-research-engine-design.md) — the propose-only provider seam, the write-once research-pack ledger.
- Research-queue transport (already implemented): [docs/design/2026-06-07-research-queue-transport-design.md](2026-06-07-research-queue-transport-design.md) — the dormant research worker, queue producer/consumer, atomic commits.

---

## 1. What this session decided (the delta)

The architecture is largely settled by the spec and the compliance contract; the deterministic spine is already built and tested. This session resolved the remaining unknowns that blocked a full v1 build:

1. **The AI layer is concrete (replaces the spec's planned Gemini).** Cloudflare **Workers AI** — `@cf/google/gemma-4-26b-a4b-it` (Gemma 4 26B) as the primary research model, `@cf/moonshotai/kimi-k2.6` as the escalation backup — paired with the **Brave Search API** for source discovery. This resolves the office-hours doc's "structured connectors — one or zero" open question as **zero structured connectors for v1**: generic web search + the tool's own deterministic fetch + the verbatim-quote check (the support-checking guardrail G8). See §3.
2. **The visual identity is decided** — dark-first, archival precision; see [DESIGN.md](../../DESIGN.md) and §5.
3. **Infrastructure is specified** — worker renamed to `wiki-as-of-now`, fresh Cloudflare provisioning, two workers on shared D1, **two-branch gitflow (`dev` integration → `main` live)**. See §6.
4. **Build sequence is Miniflare-first, deploy-last**, with the two live integrations (Brave, Google OAuth) behind flags so absent credentials are soft gates, not blockers. See §8.
5. **The spec will be amended to v1.1** to stop describing the contract-prohibited LLM-synthesis pipeline and to record the Workers-AI reversal of its §11.6. See §7.

The full reasoning trail (cost model, model selection evolution, alternatives ruled out, residual uncertainties) is the appendix in §11 — captured per this project's thinking-documentation discipline because it is expensive to regenerate and load-bearing for a future revisor.

---

## 2. v1 product surface

The complete v1 flow, per the office-hours design's seven-step sequence and success criteria. Each surface is rendered in the dark archival system of [DESIGN.md](../../DESIGN.md).

| # | Surface | What the user does | Key compliance ties |
|---|---|---|---|
| 1 | **Triage queue** | Browse a bounded topic (military procurement; infrastructure megaprojects), pageview-ranked, easy-win lane first; or drop an ad-hoc URL | safe-lane guardrail (G11) gates what enters the easy-win lane |
| 2 | **Article view** | See detected stale claims (signature rust-underline marker), eligibility badge, deterministic explanation; pick one to research | deterministic detection (G10); show-your-work (G6) |
| 3 | **Research worksheet** | Review per-claim evidence cards (verified verbatim quote + real source URL, never model prose); see all degradation/honesty states; drift re-validation on open | propose-only LLM (G9); anchor-to-real-URL (G3); verbatim-quote check (G8); no-machine-written-text (G1) |
| 4 | **Source-open gate** | Per-source "I opened and read this source" confirmation; audit-logged | the mandatory-human-verification gate (G5); honest proxy admission |
| 5 | **Snippet assembler** | Write the sentence themselves; tool builds the mechanical wikitext `<ref>` from deterministic source metadata | no-machine-written-text (G1); no-machine-derived-citations (G2); no-copying (G16) |
| 6 | **Disclosure** | Get a two-part, human-editable edit summary, template-filled with the AI model name+version from the audit log | mechanical-disclosure guardrail (G12) |
| 7 | **Transparency view** | See the non-selected candidate results and the per-edit audit trail | show-your-work (G6); full-candidate-set (G7) |
| 8 | **About/compliance + abuse path** | Read what the tool will/won't do (rendered from the contract); report abuse; session-completion feedback | the contract's public-trust posture |

Auth & metering wrap the flow: Google OAuth sign-in plus an **admin-flag secret** for self-testing before OAuth creds exist; per-user quotas counted on **research-pack inserts** (the existing write-once ledger), each pack row also recording usage stats (Workers AI neurons + Brave query count) for observability; global daily caps + a research **kill switch**.

**Not rebuilt:** the detector, safe-lane gate, lookup/ingestion, D1 schema + append-only audit log (the audit-log guardrail G13), write-once research packs, the SSRF-hardened source fetcher (G15), and the deterministic verbatim-quote checker (G8) **already exist and are tested**. v1 surfaces and wires them; it does not touch the deterministic detection invariant.

---

## 3. The research layer (Workers AI + Brave)

The main new backend work. It slots behind the **already-built** `ResearchProvider` seam (`src/research/provider.ts`), replacing `StubResearchProvider`.

### 3.1 Data flow

```
stale claim
   │
   ├─▶ Gemma 4 (query generation) ──▶ ≤8 neutral queries, each ≤256 code points, no verbatim claim-echo
   │                                         │
   │                                   Brave Search API ──▶ ranked REAL source URLs
   │                                         │
   │                          OUR SSRF-hardened fetcher (G15) ──▶ real page text (untrusted data)
   │                                         │
   └─▶ Gemma 4 (relevance triage) ──▶ propose ≤5 evidence items {url, proposedQuote, advisorySupport}
                                             │
                       deterministic verbatim-quote check (G8) ──▶ accept/reject each quote
                                             │
                                       evidence cards (verified quotes + real URLs only)
```

The LLM is **boxed to the three jobs of the bounded-LLM-role guardrail (G9)**: normalize the question into neutral queries; relevance-triage real retrieved documents; point at the resolving passage (verbatim quote + advisory support). It **never** authors prose a user sees, never originates a citation, never synthesizes across sources. The deterministic verbatim check is the backstop: a paraphrase instead of a verbatim substring is *rejected*, so yield never depends on the model behaving — a misbehaving model produces "quote not found," which is safe.

### 3.2 Why Brave, not Gemini grounding (the search decision)

Generic web search that returns **real, resolving source URLs** is a hard requirement: the anchor-to-a-real-URL guardrail (G3), the mechanical-citation guardrail (G2), and the verbatim-quote check (G8) all need the tool to hold the *real* page and its *real* canonical URL. Evaluated June 2026:

- **Gemini "Grounding with Google Search"** returns `groundingChunks[].web.uri` as **redirect proxies** (`vertexaisearch.cloud.google.com/grounding-api-redirect/…`), not direct source URLs, and its ToS **mandates rendering Google "Search Suggestions" chips** to users. Both fight a deterministic-verification, Google-free archival tool. ([grounding docs](https://ai.google.dev/gemini-api/docs/grounding))
- **Google Custom Search JSON API** (the general web-search API) is **closed to new customers**, sunsetting Jan 1, 2027; its replacements are domain-limited (Vertex AI Search, ≤50 domains) or enterprise-sales-gated. A Google developer account does not grandfather in a new project. ([overview](https://developers.google.com/custom-search/v1/overview))
- **Brave Search API** — first-party independent index, returns direct URLs, clean ToS, usage-based ($5/1k queries, $5/mo auto-credit covering hobby volume). ([brave.com/search/api](https://brave.com/search/api/))

Brave is selected. **Tavily** is the documented fallback option if Brave's index or terms ever fall short (the provider seam is agnostic). **ToS constraint to honor:** Brave standard plans don't grant rights to *store* their results — the architecture already sidesteps this by persisting only our own fetched-page URLs + content hashes in the audit log, never Brave's titles/snippets.

### 3.3 Model configuration

Model IDs live in **config, not code** (Workers AI's deprecation cadence is fast — two bulk waves in eight months — and auto-aliasing can raise prices, so config-pinning is load-bearing).

- **Primary: `@cf/google/gemma-4-26b-a4b-it`** — 256K context (a full source page, or several, fits with no chunking), $0.10/$0.30 per M tokens, MoE 26B/4B-active (fast), function calling + reasoning. Strong instruction-following for extractive verbatim-quote mining.
- **Escalation: `@cf/moonshotai/kimi-k2.6`** — frontier-scale, 262K context, built for structured agentic output; used if Gemma's real-claim verbatim yield disappoints. **Persistent upgrade note:** a `kimi-k2.7-code` variant exists today but is code-tuned (wrong for prose extraction); watch for a *general* (non-`-code`) `kimi-k2.7` and upgrade the backup pin when it lands. Confirm the exact live ID against the `env.AI` binding when wiring.
- **JSON handling:** Gemma 4 is not on Workers AI's *documented* JSON-mode model list, so every call is wrapped in a **JSON-parse-and-retry gate** (one retry on malformed/schema-invalid output); the deterministic verbatim checker is the final correctness backstop, so schema compliance is never model-dependent. Always set `max_tokens` explicitly (Workers AI per-model defaults vary and silently truncate JSON).
- **Latency/limits:** ~25–30 s per-message budget with a per-message `AbortController`; retry/backoff on Workers AI 429 (capacity)/408 (timeout); the 300 req/min text-generation limit is irrelevant at hobby volume.

### 3.4 Cost (per research pack, ~0.12M input / 5k output tokens, ~8 searches)

Effectively **$0/day at 2–10 packs/day**: Workers AI free tier is 10k neurons/day; Brave's $5/mo credit covers ~1,000 queries/mo. Paid-tier marginal cost ≈ $0.013/pack (Gemma) + ~$0.04 Brave search. Full arithmetic and the Gemini comparison are in §11.1.

### 3.5 Provider-swap preconditions (named in the transport plan)

- Delete stub `model_version = 'fake-provider/0'` research packs (with a test) so they don't permanently block real research for their (claim-key, revision) pairs.
- Add the **pre-claim placeholder row** that bounds concurrent-redelivery double-spend (research-engine design §5).
- Keep provider selection **env-gated/injectable** so the existing workerd test that hardwires `"fake-provider/0"` stays on the stub path.
- **Cron stays disabled** until the real provider is verified end-to-end; enabling it is the last, human-confirmable step (interval must exceed worst-case batch drain).

### 3.6 Credential workarounds (build now, verify live later)

Brave key and Google OAuth creds arrive after the build starts. Neither hard-blocks:

- **Brave absent:** only the *search* step needs it. The live Brave client is built but gated on `BRAVE_API_KEY`; when absent, a **fixture-backed search provider** returns recorded real URLs for test claims, and the tool's own fetcher fetches those real public pages — so fetch + verbatim-check + triage (the real logic) run today. Real Gemma 4 is reachable now via the `env.AI` remote-binding proxy under wrangler auth (no separate key). A **manual "I already have a source URL" paste path** ships as a genuine feature that bypasses search entirely. Live Brave is a single-seam swap tomorrow.
- **OAuth absent:** auth code is written but the live Google flow gates on `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`; when absent the app runs in **single-admin mode** behind the admin-flag secret (one user — Sam — quotas keyed to it, every research action gated). Providing creds tomorrow flips on multi-user sign-in with no rework.

---

## 4. The deterministic spine (status: built)

For completeness — these are wired, not built. The detector (`src/detector/*`), safe-lane gate (`src/safelane/*`), lookup/ingestion (`src/ingest/*`), D1 migrations 0001–0003, append-only audit log (`src/db/audit-log.ts`), write-once research packs (`src/db/research-packs.ts`), SSRF-hardened fetcher + verbatim checker (`src/research/*`), and the dormant research worker + queue transport (`src/queue/*`, `workers/research/*`) all exist with passing tests. The build consumes their public interfaces.

---

## 5. Visual system (summary; authoritative in DESIGN.md)

North Star: **"The Archivist's Desk Lamp."** Dark-first, near-black neutral surfaces (chroma 0 — never cream/parchment), with chromatic warmth carried only by brand colors and type. **Ledger Olive** primary; two accent lanes with strict jobs — **Oxidized Rust = staleness only**, **Iron-Gall Blue = evidence/links/focus only** (the Two Lanes Rule visually encodes the deterministic-detection-vs-research distinction). Serif display over humanist-sans body; mono for provenance identifiers (revision IDs, claim keys, hashes, timestamps). Flat tonal layering, borders not shadows. Responsive motion with a `prefers-reduced-motion` alternative for every animation. WCAG 2.2 AA plus keyboard-first triage ergonomics. The signature gesture is the **stale marker**: a 2px rust underline on the stale phrase, inline in the sentence like an archivist's pencil. Full tokens, rules, and do's/don'ts in [DESIGN.md](../../DESIGN.md).

---

## 6. Infrastructure, deploy & branching

### 6.1 Worker naming & topology
- Rename both wrangler configs from `wikiasofnow` to **`wiki-as-of-now`** (matching the dashboard worker), moving `WORKER_SELF_REFERENCE.service` in lockstep; re-run `cf-typegen`.
- **Two workers, shared D1:** the Next.js/OpenNext **app worker** (queue *producer* + `POST /api/research/:candidateId` enqueue route + the surfacing read) and the dedicated **research worker** (queue consumer + cron). The app worker gains an `AI` binding (or routes model calls through the research worker); the research worker gains the `AI` binding + `BRAVE_API_KEY` secret.

### 6.2 Provisioning (fresh — nothing exists yet)
- `wrangler d1 create` per environment (`wiki-as-of-now-dev`, `wiki-as-of-now`); paste real IDs into **both** configs; `wrangler d1 migrations apply --remote`.
- `wrangler queues create` per environment (queues are account-global single-consumer, so dev and prod need distinct names: `research-dev`/`research-dlq-dev` vs `research`/`research-dlq`). **Requires Workers Paid** (Sam confirmed).
- wrangler `env` blocks carry per-env worker names, D1 IDs, queue names, and the self-reference override.

### 6.3 Two-branch gitflow (`dev` → `main`)
- **`dev`** is the integration branch; **`main`** is the live/deploy branch. Feature work happens in worktrees off `dev`; PRs merge to `dev`; `dev` → `main` promotes to production.
- This **changes the current single-branch model** in [docs/git-strategy.md](../git-strategy.md) (which assumes local `dev` mirrors `origin/dev` with no `main` deploy branch). The build updates `git-strategy.md` and re-runs the `git-strategy-init` skill to encode dev→main, env-promotion, and which branch each CI deploy job targets.

### 6.4 Deploy mechanics
- **Local `bunx wrangler` deploys** during the build (wrangler authenticated — Sam confirmed). **`node` is not on PATH in this environment; use `bun`/`bunx` or nvm.** Wrangler is invoked as `bunx wrangler`, never `npx`.
- CI gains `opennextjs-cloudflare build` + `wrangler deploy --dry-run` checks (closing the "bundle never built in CI" gap) plus the existing test suite. The **dev→main CI deploy pipeline lands designed-but-dormant** until Sam adds `CLOUDFLARE_API_TOKEN` + account-id GitHub secrets.
- **Worker Builds is disconnected** by Sam before the run so its auto-deploys can't race ours. (Decision rationale: low-stakes, reversible; we choose explicit CI/wrangler control over the dashboard's git-connected auto-deploy for a two-worker + migrations topology.)

---

## 7. Spec reconciliation → v1.1

The design spec ([WikiAsOfNow_design_spec.md](WikiAsOfNow_design_spec.md), Draft v1.0) describes an LLM role (§6.2, §11.2/§11.4, §18.4, §27) that the compliance contract **prohibits** (machine-written summaries/synthesis), and its §11.6 rejected Workers AI for lacking search grounding. The contract governs (spec §26.1). The build amends the spec to **v1.1**:

1. **Record the Workers-AI + Brave decision**, reversing §11.6 with the rationale in §3.2 (Gemini grounding's redirect proxies + Search-Suggestions mandate make bundled grounding a worse fit than separating search (Brave, real URLs) from a propose-only LLM).
2. **Rewrite §6.2/§11/§18.4/§27** so the spec stops describing the prohibited synthesis pipeline, aligning it with the propose-only research layer (the bounded-LLM-role guardrail G9) and folding in the audit-log/G8/G11/G12 components the v1.0 text predates.
3. **Add a change-log entry.** This removes spec text that *contradicts* the guardrails — it strengthens compliance, it does not weaken a guardrail, so it is within agent remit; the contract itself is untouched. (Done as Phase 0 of the implementation plan, as a tracked reviewable change, not buried in brainstorming.)

---

## 8. Build phases (Miniflare-first, deploy-last)

Dependency-ordered, following the office-hours seven-step sequence, sequenced so external credentials are needed only at the end. Each phase is independently CI-passing and TDD'd (production code under `src/` and `workers/`; the project's TDD mandate applies).

- **Phase 0 — Spec v1.1 + worker rename + git-strategy update.** Amend the spec (§7); rename workers (§6.1); update `git-strategy.md` for dev→main (§6.3). Docs/config — no TDD gate, but the rename re-runs typegen and must keep the suite green.
- **Phase 1 — Research provider (real, on Miniflare).** Build `WorkersAiResearchProvider` (Gemma 4 via `env.AI`; query-gen + triage; JSON-retry gate; `ProviderUnavailableError`); the Brave client (gated on key) + the fixture search provider + the manual-URL path; the provider-swap preconditions (§3.5: stub-pack deletion, pre-claim placeholder row, env-gated selection). Verified against real Gemma (remote binding) + recorded search fixtures + real page fetches. **Cron stays off.**
- **Phase 2 — Research reachability.** App-worker queue producer binding + `POST /api/research/:candidateId` (eligibility-gated); the surfacing read consuming `getSurfaceablePack()` (currently zero consumers); revision-drift re-validation.
- **Phase 3 — Core worksheet flow (UI).** Article view (stale marker) → research worksheet (evidence cards; all degradation/honesty states) → source-open gate (G5 checkbox, audit-logged) → snippet assembler (human sentence + mechanical `<ref>`, G1/G2/G16) → disclosure (G12 two-part summary from the audit log). The worksheet must not provide any slot where model prose could surface.
- **Phase 4 — Queue & topic seeding.** Easy-win lane / batch-queue page (consume `/api/easy-win`); ad-hoc capture; pageview-ranked seed lists for **military procurement** and **infrastructure megaprojects** (category/WikiProject × Wikimedia Pageviews API, via live MediaWiki); async research over Cloudflare Queues.
- **Phase 5 — Auth, quotas, kill-switch.** Arctic Google OAuth + `jose` sessions, gated on creds with single-admin fallback (§3.6); `users`/quota tables (`WITHOUT ROWID` per the DB pitfall); quotas reconciled on **pack inserts** with per-pack usage stats; anonymous demo/browse mode; admin research kill-switch.
- **Phase 6 — Transparency, About, polish.** Show-your-work view (render `dispositions_json`, non-selected results — G6/G7); About/compliance page rendered from the contract; abuse-report path; session-completion feedback (quality-not-volume).
- **Phase 7 — Provision & deploy.** Create dev+prod D1/queues (§6.2); apply migrations remotely; first real deploys of both workers; CI build+dry-run; dev→main pipeline dormant pending secrets. **Then, last and human-confirmed:** drop in Brave + OAuth creds, smoke-test live, and only then enable cron.

**Verification ceiling (honest):** true end-to-end ("user researches a claim → assembles an edit") is fully verifiable only after Phase 7 with real D1/queues/AI and live credentials. Everything before runs on Miniflare with real Gemma via remote binding; DONE claims for Phases 1–6 mean "verified on Miniflare," explicitly not "verified in production." This is the accepted tradeoff of Miniflare-first, neutralized because the credentials arrive at the same phase the live verification needs them.

---

## 9. Pre-flight checklist (Sam)

Confirmed available now: Workers Paid plan; Worker Builds will be disconnected; wrangler authenticated (`bunx wrangler whoami`).

Arriving tomorrow (soft-gated, not blockers): **Brave Search API key**; **Google OAuth client id/secret**. Until then the build uses the §3.6 workarounds. When ready, each is added to Workers secrets (`bunx wrangler secret put`), never to a CLI flag or committed file (the no-secrets-in-flags pitfall).

---

## 10. Decisions ledger (this session)

Plain-English record of every locked decision, so a future reader needs no session context:

- **Register/identity:** product; archival-precision personality; dark-first; serif-display + sans-body; rust(staleness)+iron-gall(evidence) accents on deep olive. (PRODUCT.md, DESIGN.md)
- **Research model:** Gemma 4 26B primary, Kimi K2.6 backup (watch for general kimi-k2.7), model IDs in config.
- **Search backend:** Brave Search API; Tavily as the documented fallback option.
- **Search execution:** zero structured-source connectors for v1; generic web search → tool-side fetch → verbatim check.
- **Spec:** amend to v1.1 (reverse §11.6; rewrite the synthesis sections; change-log entry).
- **Worker naming:** rename to `wiki-as-of-now`; Worker Builds disconnected; local wrangler deploys now, CI deploy dormant.
- **Branching:** two-branch gitflow, `dev` integration → `main` live.
- **Auth:** Google OAuth in scope, behind a flag, with an admin-secret single-user fallback for self-testing.
- **G5 gate:** explicit "I opened and read this source" checkbox, audit-logged (approved as the compliance mechanism).
- **UI scope:** full v1 surface (all eight surfaces in §2).
- **Launch topics:** military procurement **and** infrastructure megaprojects.
- **Metering:** quota counts research-pack inserts; per-pack usage stats (neurons + query count); global caps + kill switch.
- **Stub packs:** delete `fake-provider/0` rows before the real provider goes live.
- **Build sequencing:** Miniflare-first, deploy-last; credentials soft-gated.

---

## 11. Reasoning appendix (thinking documentation)

Captured per the project's thinking-documentation discipline: the reasoning is expensive to regenerate and load-bearing for whoever revises this.

### 11.1 The cost model that drove the search/model decisions

Sam blocked the spec-reconciliation and search-backend decisions on a cost comparison of Workers AI + Brave vs Gemini-with-grounding, on the reasonable hypothesis that Gemini's Google Search tools come free. The finding:

- **Cost is a wash, and Gemini grounding *is* free at this volume.** Gemini 3 grounding allows 5,000 grounded prompts/month free (hobby volume ≤1,500/mo); both paths cost ≈$0/day at 2–10 packs/day. The hypothesis was correct on cost.
- **Workers AI + Brave wins on architecture, not price.** Two Gemini-grounding facts are disqualifying for *this* deterministic-verification tool: (a) grounding returns redirect-proxy URLs (`vertexaisearch.cloud.google.com/grounding-api-redirect/…`), not real source URLs — breaking the tool's need to fetch and verify the real page itself (G2/G3/G8); (b) ToS mandates rendering Google Search-Suggestions chips. So the spec's §11.6 *conclusion* (separate search from the LLM) is right even though its stated *reason* (Workers AI can't ground) was wrong.
- **Google's general web-search API is also closed** to new developers (Custom Search JSON API closed to new customers, sunsetting 2027-01-01), so even Sam's existing Google account offers no clean query→real-URLs path. This is Google exiting the category, not a preference against Google.

Per-pack arithmetic: workload ≈ 8 query-gen calls (~1k in/200 out) + 5 triage calls (~15–25k in/400 out) ≈ 0.12M input / 5k output, plus ~8 searches. Gemma 4 ($0.10/$0.30/M) ≈ $0.013/pack tokens; Brave $5/1k ≈ $0.04/pack search; both under free tiers at hobby volume. Pricing fetched via WebFetch 2026-06-12 and should be re-transcribed with `url-to-markdown` before it enters the v1.1 spec (the project's WebFetch-fabrication pitfall).

### 11.2 Model selection evolution

First recommendation led with `gpt-oss-120b` (triage) + `qwen3-30b` (query-gen) on a research agent's "strongest instruction follower" judgment. Sam's instinct toward **Gemma 4** was better and the recommendation was revised: Gemma 4 26B has a bigger context (256K vs gpt-oss's 128K — no chunking), is ~3.5× cheaper on input, is current (survived the May-2026 deprecation wave), and Google's instruction-following pedigree fits extractive quote-mining. gpt-oss-120b / kimi-k2.6 became the escalation tier. The pleasing symmetry: the spec planned Gemini (Google's *API*, a poor fit) and we land on Gemma (Google's *open model*, on Cloudflare's metal, no Google key) — Google's quality without Google's API friction.

### 11.3 Considered and ruled out

- **Gemini API (any tier) for the research layer** — ruled out: redirect-proxy URLs + Search-Suggestions mandate (§11.1); also keeps the LLM off-platform from the data and audit log.
- **Google Custom Search / Vertex AI Search** — ruled out: closed to new customers / domain-limited / enterprise-gated.
- **SERP-scraper search APIs (Serper, SerpAPI)** — ruled out: operate against Google's ToS, a poor foundation for a compliance-first tool.
- **Structured official-source connectors (defense.gov, SAM.gov, GAO) for v1** — deferred (office-hours open question resolved to zero): each is ~M-effort of bespoke normalization; generic web search covers v1.
- **`kimi-k2.7-code` as the backup** — ruled out: code-tuned, wrong for prose verbatim extraction; use k2.6 until a general k2.7 ships.
- **Provision-first build sequencing** — not chosen: Sam lacks Brave/OAuth creds until tomorrow, making Miniflare-first the better fit (no mid-build credential blockers); the deferred-real-infra-verification tradeoff lands exactly when the credentials arrive anyway.

### 11.4 What I'm still uncertain about

- **Gemma 4's real verbatim-quote yield** on actual stale-claim sources — the yield-critical bar. Untestable in CI (no live LLM in tests, by project rule); needs a deployed smoke test in Phase 7. The escalation tier (kimi-k2.6) and the model-in-config design exist precisely to absorb a disappointing result.
- **Whether Gemma 4 honors `response_format` json_schema** on Workers AI (it's not on the documented JSON-mode list). Mitigated by the JSON-retry gate + deterministic checker, so it's a quality/latency question, not a correctness one.
- **Pageviews ranking specifics** (window, refresh cadence, storage) for the two launch topics — left to Phase 4; doubles as a future impact stat.
- **Exact live model ID for the Kimi backup** — confirm against the `env.AI` binding at wiring time.

### 11.5 What I'd add with more time

A measured A/B harness (Gemma 4 vs gpt-oss-120b vs llama-4-scout's grammar-constrained `guided_json`) over a labeled set of real stale-claim sources, scored on quote-found rate, before pinning the primary model. Deferred because it needs live deployment; the config-pinned model makes it a fast post-launch follow-up rather than a blocker.
