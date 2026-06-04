# WikiAsOfNow
## Project Design, Purpose, and Implementation Document

**Project name:** WikiAsOfNow  
**Working subtitle:** Find articles whose “as of” reality has expired.  

**Status:** Draft v1.0  
**Intended audience:** Human maintainers, coding agents, and future contributors  
**Primary implementation target:** Cloudflare Workers + D1  
**Primary research layer:** Google Gemini API with Google Search grounding  
**Frontend framework:** Deliberately left open as a tracked decision item  
**Hosting posture:** Public open-source project on GitHub; initially personal-tool-first, but designed so limited public usage is feasible without redesign

---

## 1. Executive Summary

This project is a research and editor-assistance tool for identifying Wikipedia articles that are likely stale because they contain claims that were future-oriented when written but are now in the past, timeline sections that have gone cold, or status-oriented prose that is probably out of date.

Example stale patterns:

- “As a result of the pilot, DoD plans to issue a competitive RFP in 2019.”
- “The X-Band Sea-Based Radar is expected to remain at location X through 2023.”
- “Construction is scheduled to begin in 2021.”
- “The committee will publish recommendations next year.”

The goal is **not** to auto-write Wikipedia article text. The goal is to:

1. detect likely stale claims or stale status sections,
2. rank them by confidence and likely editor usefulness,
3. retrieve fresh, relevant, preferably high-quality sources,
4. present those sources with structured reasoning and evidence,
5. help a human editor manually update Wikipedia.

This is intentionally aligned with a human-in-the-loop editing workflow.

The system is built around a **cheap deterministic core** and an **optional, metered LLM research layer**:

- Deterministic / cheap layer: corpus ingestion, stale-claim heuristics, change tracking, topic labeling, ranking, search index management.
- LLM / expensive layer: query reformulation, source triage, claim-current-state synthesis, evidence pack generation, and optional semantic clustering / semantic search assist.

The architecture should support both:

- **personal use** with low or near-zero recurring variable cost, and
- **limited public use** with authentication, quotas, abuse protection, and explicit cost boundaries.

---

## 2. Product Purpose

### 2.1 Core problem
Wikipedia contains many statements that were accurate snapshots of expected future events at the time they were written, but which later became stale because the event should already have happened or the status should already have changed.

This is especially common in domains like:

- military procurement and defense programs,
- space missions,
- public infrastructure,
- transportation projects,
- standards and regulations,
- lawsuits and regulatory enforcement,
- elections and appointments,
- product roadmaps,
- major construction projects,
- organizational restructurings,
- technology rollouts and policy timelines.

Wikipedia has some existing maintenance structures for stale content, but editors still face several problems:

- the backlog is too large to browse manually,
- stale claims are mixed in with still-fine time references,
- many flagged articles do not actually have an obvious high-value next edit,
- the hard part is often not noticing staleness, but discovering **what happened next** with reliable sourcing.

### 2.2 Product thesis
A useful tool here is not “AI writes Wikipedia.”

A useful tool is:

> “Find likely stale claims in articles I care about, tell me exactly why they look stale, and hand me a well-organized source pack showing what the current state likely is so I can verify and edit manually.”

### 2.3 Product principle
The system should always separate these layers:

1. **Detection** — Is this claim likely stale?
2. **Research** — What probably happened after the claim?
3. **Evidence** — What sources support that conclusion?
4. **Editing** — Human editor updates article text.

The system may assist with 1–3. It should not assume authority to perform 4 automatically.

---

## 3. Product Goals and Non-Goals

### 3.1 Goals

#### MVP goals
- Identify likely stale claims at sentence/section level.
- Support topic-based filtering and browsing.
- Support article-level research workflow for a stale claim.
- Use fresh web-grounded research to answer “what is the current state now?”
- Present evidence in a way a human editor can validate and use.
- Keep fixed hosting costs low.
- Keep public abuse exposure low.
- Be open-source and coding-agent-friendly.

#### Early post-MVP goals
- Watchlists for topic areas and saved articles.
- Topic clustering or semantic exploration.
- Freshness score and stale confidence score.
- Citation/source quality scoring.
- Differential scans over new Wikipedia edits.
- User auth and rate-limited public access.

#### Advanced goals
- WikiProject-oriented feeds.
- Change alerts when a previously stale candidate likely now has sufficient sourcing.
- Better claim decomposition and multi-source synthesis.
- Local semantic index over stale claims and topical article embeddings.
- Exportable evidence packs and maybe sandbox notes for editors.

### 3.2 Non-goals
- Automatically editing Wikipedia.
- Automatically generating encyclopedic replacement prose for direct posting.
- Solving all citation quality problems on Wikipedia.
- Attempting to mirror the entire editorial workflow of Wikipedia.
- Becoming a general-purpose search engine over the full web.

---

## 4. High-Level Architecture Decision

### 4.1 Selected primary platform
The selected base architecture is:

- **Cloudflare Workers** for API/backend orchestration
- **Cloudflare D1** for relational storage
- **Cloudflare Pages** or Worker-served frontend assets for the web UI
- **Google Gemini API** for the main LLM-backed research layer, especially grounded web research and structured outputs
- **Optional Cloudflare Workers AI + Vectorize** for embeddings and semantic retrieval features

### 4.2 Why this architecture
This stack is chosen because it balances:

- extremely low fixed hosting cost,
- simple deployment,
- good TypeScript ergonomics,
- good OSS friendliness,
- low ops overhead,
- strong edge security/WAF/bot protections,
- a viable path to authenticated public use,
- optional AI features without requiring the entire app to be AI-native.

### 4.3 Core philosophy of the architecture
The platform should be optimized so that:

- most traffic is cheap,
- most scans are deterministic,
- LLM usage is selective and cacheable,
- high-cost paths are authenticated and rate limited,
- the app remains useful even if LLM usage is turned off.

---

## 5. User Personas

### 5.1 Primary persona: topic-focused Wikipedia editor
A user who cares about a topic area, such as military systems, radar, aerospace, public transit, or a specific WikiProject area, and wants a curated list of likely stale update opportunities.

Needs:
- topical filtering,
- high confidence candidates,
- clear explanation of why candidate is stale,
- fast access to strong sources.

### 5.2 Secondary persona: researcher / maintainer
A user who wants to scan a domain, evaluate the detector, tune stale heuristics, and compare data-source freshness.

Needs:
- visibility into detector internals,
- auditing and debugging views,
- ability to re-run scans,
- confidence and ranking diagnostics.

### 5.3 Tertiary persona: casual contributor
A user who is not deeply embedded in a topic but wants “easy wins” with strong primary or high-quality secondary sourcing.

Needs:
- low-friction feed,
- clear citation guidance,
- confidence that sources are sufficient.

---

## 6. Key Workflows

### 6.1 Workflow A: Browse stale opportunities by topic
1. User opens site.
2. User selects topic or WikiProject-like area, e.g. “Military procurement.”
3. App returns ranked stale candidates.
4. Each result shows:
   - article title,
   - stale sentence excerpt,
   - why flagged,
   - last citation date(s),
   - confidence,
   - “research current state” action.

### 6.2 Workflow B: Research a specific stale claim
1. User opens a candidate.
2. App shows extracted stale claim and context paragraph/section.
3. App shows article revision metadata and existing citation metadata.
4. App optionally calls Gemini grounded search.
5. App returns:
   - likely current status summary,
   - source list with titles and domains,
   - source relevance rationale,
   - classification of source type (primary, secondary, tertiary),
   - suggested facts to verify before editing.

### 6.3 Workflow C: Direct article lookup
1. User pastes a Wikipedia URL or title.
2. App fetches or reads local state for the article.
3. App detects stale candidates.
4. User selects one candidate for research.

### 6.4 Workflow D: Topic overview / cluster exploration
1. User selects a topic cluster or query phrase.
2. App returns grouped stale candidates by subtopic.
3. User can drill into high-confidence clusters.

### 6.5 Workflow E: Maintainer batch scan
1. Scheduled worker processes ingest latest dumps/deltas.
2. Scanner detects newly stale candidates.
3. Scores and indexes updated.
4. Candidate caches invalidated if article changed materially.

---

## 7. Data Source Strategy

The data source model should not rely on any one mechanism. Instead, it should combine three layers:

1. **Bulk corpus snapshots** for scalable analysis.
2. **Incremental/delta sources** for freshness between snapshots.
3. **Live per-article API lookups** for just-in-time truth before presenting results.

### 7.1 Wikimedia full corpus snapshots
Use English Wikipedia dumps as the canonical bulk analysis input.

Use cases:
- initial corpus bootstrap,
- large-scale stale-claim scans,
- topic classification runs,
- extracting article text and historical stale candidates,
- building local article metadata index.

Why use dumps:
- avoids hammering live APIs for bulk processing,
- efficient for full-corpus scanning,
- deterministic and repeatable,
- easier to precompute derived datasets.

### 7.2 Incremental dump / changes pipeline
Use Wikimedia incremental adds/changes dumps and/or equivalent change streams to avoid reprocessing the full corpus for every update cycle.

Use cases:
- update recently changed articles,
- refresh stale candidate extraction for changed pages,
- track newly introduced or newly resolved stale claims.

### 7.3 EventStreams / recent-changes live feed
Use Wikimedia EventStreams or recent changes feeds as a near-real-time signal source.

Use cases:
- know which pages changed recently,
- queue those pages for re-evaluation,
- detect if a stale candidate likely became obsolete because article text changed.

### 7.4 Live API lookups
Use live MediaWiki APIs only for targeted work:

- fetching current revision text for an article under active user inspection,
- verifying page metadata and latest revision IDs,
- pulling categories, templates, and revision metadata,
- small-scope lookups where freshness matters more than batch efficiency.

### 7.5 Optional precomputed external datasets
Use external public datasets such as Hugging Face-hosted Wikipedia datasets or precomputed embedding datasets only as optional accelerators, not as the canonical truth source.

Appropriate uses:
- bootstrapping semantic exploration quickly,
- prototyping topic clustering,
- experimenting without first embedding the full corpus yourself,
- comparing embedding quality and indexing strategies.

Not appropriate as canonical store because:
- they may lag current Wikipedia,
- schema and chunking may not align to this use case,
- they may not preserve revision IDs or exact page structure needed for robust synchronization,
- they may encode embeddings with a model you do not want to standardize on.

### 7.6 External research sources for current-state answers
The current-state research layer should prioritize source types such as:

- official press releases,
- agency statements,
- project/program update pages,
- legislative documents,
- public filings,
- major news coverage,
- specialty trade press,
- archival releases,
- known reference sites depending on domain.

The system should treat these source types differently and label them.

---

## 8. Freshness and Synchronization Model

This is a core design area.

### 8.1 Canonical freshness principle
The app should operate with a **tiered freshness model**:

- **Corpus freshness**: how current the local snapshot is.
- **Article freshness**: how current our local copy of a specific article is.
- **Candidate freshness**: whether a specific stale-candidate extraction is based on latest article text.
- **Research freshness**: how recently the current-state evidence pack was generated.

These are distinct.

### 8.2 Proposed synchronization model

#### Layer 1: Full refresh
- Periodically ingest latest full or near-full dump.
- Rebuild or revalidate article text store and candidate extraction corpus.
- This is the heavyweight, low-frequency path.

#### Layer 2: Delta refresh
- Continuously or periodically ingest incremental adds/changes or recent-changes queues.
- Re-run extraction only on changed articles.
- This is the normal freshness path.

#### Layer 3: User-triggered live validation
- Before showing research results for a page, check whether latest revision ID matches local cached revision.
- If not, fetch live article content and re-run extraction for that page.
- This protects against stale local state while keeping bulk costs down.

### 8.3 Freshness policy recommendation
For MVP, use:

- periodic corpus refresh from dump,
- delta tracking for changed pages,
- mandatory live validation on article open / research invocation.

This avoids over-engineering while keeping user-visible results trustworthy.

### 8.4 Cache invalidation policy
Invalidate stale candidate caches when:

- page revision changed,
- page title moved,
- stale sentence no longer exists,
- section heading changes materially,
- source pack older than configurable TTL,
- external evidence query or ranking logic version changes.

### 8.5 TTL recommendations
Suggested defaults:

- article snapshot TTL for high-interest pages: short
- source pack TTL: moderate
- topic aggregate TTL: moderate to long
- semantic cluster rebuild TTL: long / scheduled

Exact TTLs should be config-driven, not hardcoded.

---

## 9. Stale-Claim Detection Model

The stale-candidate detector is the most important deterministic component.

### 9.1 Detector philosophy
Do not start with embeddings.
Start with explainable extraction and scoring.

The first detector should be primarily heuristic / rule-based with an explicit score breakdown.

### 9.2 Candidate unit
The system should extract stale candidates primarily at the following levels:

1. **sentence level** — best for direct stale future-tense claims,
2. **paragraph level** — useful when the sentence depends on adjacent context,
3. **section level** — useful for “Timeline,” “Development,” “Procurement,” “Status,” “Future,” etc.,
4. **table/timeline entry level** — optional later feature.

### 9.3 Primary stale patterns

#### A. Future-tense now in the past
Examples:
- plans to
- will
- is expected to
- is scheduled to
- is slated to
- aims to
- is due to
- anticipated in [year]
- by [past year]
- next year / next month relative references

#### B. “Current status” phrases likely frozen in time
Examples:
- currently
- presently
- as of [year]
- remains at
- is ongoing
- is under development
- is under review
- is under construction
- is deployed at
- is stationed at
- is awaiting

#### C. Timeline exhaustion
- section’s latest date is well in the past,
- no later events in timeline despite subject obviously continuing,
- article’s latest cited event is old relative to subject type.

#### D. Stale maintenance templates / hidden category cues
- As-of style date markers,
- update templates,
- categories indicating potentially dated statements or obsolete info.

#### E. Citation-age mismatch
- stale claim supported only by old sources,
- no subsequent sources despite claim implying expected future action.

### 9.4 Negative patterns / false positive guards
The detector should reduce score when:

- sentence is historical quotation of a past expectation,
- claim is explicitly framed as a historical plan already superseded elsewhere in article,
- subject is truly static and claim still valid,
- date reference is part of a completed narrative rather than an unresolved expectation,
- article already contains a later resolution nearby.

### 9.5 Scoring dimensions
Each candidate should have a multi-factor score such as:

- temporal risk score,
- future-tense confidence,
- unresolved-status confidence,
- citation-age score,
- article-neglect score,
- topic update-likelihood score,
- false-positive suppression score,
- user-value / editor-value score.

### 9.6 Explainability requirement
Every candidate shown to users must include an explanation like:

- “Contains future-tense phrase ‘plans to issue’ tied to 2019, which is now 7 years in the past.”
- “Most recent citation attached to this sentence is from 2018.”
- “Article has changed since scan / has not changed since scan.”
- “This sentence appears in a Procurement section.”

This is essential both for trust and for debugging.

---

## 10. Topic Modeling, Clustering, and Search Boundary Design

### 10.1 Why topic boundary matters
Users do not want to browse the full stale-content backlog. The experience becomes far more useful when scoped to a domain of interest.

Examples:
- military aviation,
- naval systems,
- radar and sensors,
- missile defense,
- rail transit,
- public infrastructure,
- software standards,
- judicial nominations,
- state ballot measures.

### 10.2 Topic boundary approaches
Use a layered topic model rather than a single taxonomy.

#### Layer A: Wikipedia-native topic signals
- categories,
- templates,
- WikiProject banners if available in talk page metadata,
- infobox types,
- section heading patterns.

#### Layer B: lexical / rule-based topic labels
- regex and keyword maps,
- curated domain vocabularies,
- alias dictionaries.

#### Layer C: semantic topic embeddings
- article or section embeddings,
- stale-claim embeddings,
- nearest-neighbor cluster browsing,
- “more like this stale claim.”

### 10.3 Recommendation for MVP
Do not require embeddings for topic browsing.

Use:
- categories,
- templates,
- keyword/topic maps,
- optionally one coarse article embedding for fallback discovery.

This yields a simpler, cheaper, more interpretable first version.

### 10.4 Role of embeddings later
Embeddings become valuable for:

- clustering stale claims into editor-interest groups,
- semantic expansion from one article to similar articles,
- finding stale claims near a user query even if category labels are weak,
- de-duplicating candidate patterns,
- semantic source retrieval and reranking.

---

## 11. LLM Research Layer Design (Gemini)

### 11.1 Why Gemini is selected for the main research layer
The main research layer needs:

- good low-latency general reasoning,
- web-grounded retrieval capability,
- structured outputs,
- potential tool use / function-calling path,
- cost efficiency for user-triggered research.

Gemini is selected because the product’s “what happened after this?” workflow maps well to grounded web research and structured result generation.

### 11.2 LLM job boundaries
The LLM should **not** be used for initial stale-candidate extraction. It should be used for bounded higher-value work such as:

1. claim normalization,
2. query generation,
3. source triage,
4. current-state synthesis,
5. evidence extraction into schema,
6. secondary scoring of source relevance.

### 11.3 Research pipeline for one stale claim
Proposed pipeline:

1. **Input packaging**
   - stale sentence,
   - surrounding paragraph or section,
   - article title,
   - article topic labels,
   - dates/citations already attached.

2. **Question framing**
   - Gemini reformulates the stale claim into one or more “answerable current-state questions.”
   - Example: “Did DoD issue the competitive RFP? If so, when and what happened after it?”

3. **Grounded search**
   - Gemini uses Google Search grounding to retrieve current web evidence.

4. **Structured extraction**
   - model outputs structured JSON with:
     - likely status,
     - candidate facts,
     - source list,
     - source types,
     - confidence notes,
     - unresolved questions.

5. **Application-side validation**
   - app verifies source URLs/domains, de-dupes, and normalizes metadata.

6. **Presentation layer**
   - evidence pack shown to user with source labels and human-readable rationale.

### 11.4 Research output schema
Example schema fields:

- `claim_id`
- `question`
- `status_summary`
- `status_class`
  - unresolved
  - likely updated
  - likely completed
  - likely canceled
  - likely moved / redeployed / renamed
- `candidate_facts[]`
- `sources[]`
  - title
  - url
  - domain
  - source_type
  - publication_date
  - relevance_reason
- `confidence`
- `editor_notes[]`
- `open_questions[]`

### 11.5 Model selection strategy
Do not hardcode one model forever. Instead define logical model roles:

#### Role 1: cheap interactive grounded research model
Default for most user-triggered tasks.

#### Role 2: higher-quality fallback / batch synthesis model
Use for difficult or ambiguous claims.

#### Role 3: optional non-grounded classification model
Use for cheaper metadata classification if needed.

Model names should be configuration, not architecture.

### 11.6 Why not use Workers AI for this main research step
Workers AI is useful, but the main research step specifically benefits from built-in search-grounding capabilities and richer web-aware synthesis. Workers AI remains useful for embeddings or certain auxiliary inference jobs, but is not the first choice for the “find the current state with sources” workflow.

---

## 12. Embeddings and Semantic Search Strategy

### 12.1 Embeddings are optional, not foundational
This project should not depend on embeddings for MVP correctness.

The app should remain useful without a vector database.

### 12.2 Where embeddings likely help most

#### A. Topic exploration
- “show stale claims similar to this one”
- “show stale candidates in radar and missile defense”

#### B. Claim similarity and dedupe
- merge equivalent stale patterns across many pages,
- identify near-duplicate stale procurement claims.

#### C. Semantic retrieval over internal corpus
- search stale claims by semantic meaning rather than keyword.

#### D. Optional source reranking
- rank candidate sources against normalized stale question.

### 12.3 Potential embedding implementation options

#### Option 1: Cloudflare Workers AI + Vectorize
Pros:
- native to chosen hosting stack,
- easy low-ops integration,
- no separate vector infrastructure,
- good fit if semantic layer remains modest.

Cons:
- another paid service dimension,
- dimensions/query-cost tradeoffs,
- less portable than a pure provider abstraction if overused everywhere.

#### Option 2: Precomputed external embeddings from Hugging Face
Pros:
- very fast experimentation,
- can bootstrap topic exploration without full corpus embedding job,
- useful for analysis notebooks and prototype evaluation.

Cons:
- stale relative to current corpus,
- often mismatched chunking/schema,
- may lack revision metadata or exact article structure,
- may use an embedding model not ideal for ongoing production usage.

#### Option 3: Self-generated embeddings pipeline
Pros:
- full control,
- consistent chunking,
- can embed stale claims rather than full article bodies,
- easiest to keep synchronized over time.

Cons:
- batch processing cost,
- implementation time.

### 12.4 Recommendation
For MVP:
- no required vector layer.

For v1.1 or v2:
- add a **small semantic index over stale candidates**, not the entire full text of English Wikipedia.

This is a key scope discipline point.

Indexing only stale candidates or article summaries yields much better cost/complexity tradeoffs than embedding everything.

### 12.5 What needs embeddings, concretely?
For this use case, embeddings are most useful for these records:

- stale candidate normalized text,
- article lead or summary,
- topic label description,
- optional source summaries.

You likely do **not** need embeddings for:
- every paragraph of Wikipedia,
- every full revision,
- every raw citation.

### 12.6 Suggested semantic-search design
The first semantic index should store vectors for:

- `stale_candidate.title + normalized_claim + topic_tags + section_heading`

Potential use cases:
- similar-candidate browse,
- semantic topic feed,
- “find candidates like this.”

---

## 13. Storage and Data Model

The project intentionally uses D1 as the first-party relational store.

### 13.1 Why D1
- serverless,
- scale-to-zero billing model,
- easy Cloudflare integration,
- good fit for metadata-heavy app,
- low fixed cost,
- relational schema fits well for articles / candidates / scans / source packs.

### 13.2 Data classes

#### A. Article metadata
- page ID
- title
- namespace
- current revision ID
- latest revision timestamp
- categories
- templates / maintenance tags
- topic labels
- last local sync timestamp

#### B. Article text snapshots
Store enough current article text for extraction and display needs.

Possible strategy:
- store cleaned article text / parsed segments,
- optionally store compressed raw wikitext elsewhere if needed,
- avoid storing excessive full revision history in D1.

#### C. Stale candidates
- candidate ID
- article ID
- sentence/paragraph text
- normalized claim
- section heading
- stale score breakdown
- extracted dates
- extracted citations
- detector version
- source revision ID used
- current status (open / outdated / invalidated / reviewed)

#### D. Research packs
- research pack ID
- candidate ID
- latest article revision checked
- model version/config
- prompt/input fingerprint
- structured summary JSON
- generated-at timestamp
- cache status

#### E. Sources
- normalized source URL
- domain
- title
- publication date
- source type
- metadata extraction results
- usage count across candidates

#### F. User/account data
Keep minimal:
- internal user ID
- auth provider subject ID
- created-at
- quota counters
- role flags
- optional saved topics / watchlists

### 13.3 Likely schema tables
Possible initial D1 schema:

- `articles`
- `article_topics`
- `article_categories`
- `article_templates`
- `article_snapshots`
- `stale_candidates`
- `candidate_citations`
- `candidate_scores`
- `research_packs`
- `research_pack_sources`
- `sources`
- `users`
- `user_saved_topics`
- `user_saved_candidates`
- `job_runs`
- `article_sync_queue`
- `claim_embeddings` (optional, later)

### 13.4 What not to store in D1 initially
- full historical revision corpus,
- full raw dumps as blobs,
- large vector datasets,
- arbitrary web page content archives at scale.

Use object storage later if needed.

### 13.5 Optional storage extension points
Future additions may include:

- R2 for raw dump shards, article snapshots, or evidence artifacts,
- Vectorize for semantic indexing,
- KV for lightweight caches / config,
- Queues for ingestion and research jobs.

These are optional and should not be required on day one.

---

## 14. Authentication, Abuse Prevention, and Public Hosting

### 14.1 Problem statement
If the app exposes LLM-backed research to the public without controls, it becomes an abuse target and an open relay for paid model usage.

That is unacceptable.

### 14.2 Requirements
Public-hosted mode must support:

- user identity or meaningful friction,
- per-user quotas,
- rate limiting,
- WAF / bot filtering,
- observability,
- easy kill-switch for expensive features.

### 14.3 Recommended auth model
Use **Google OAuth / OIDC login** for interactive users.

Reasons:
- low user friction,
- basic anti-abuse gating,
- aligned with likely editor demographics,
- avoids collecting more personal information than necessary.

Only minimal user identity data should be stored.

### 14.4 Cloudflare-specific security posture
Use Cloudflare protections for:

- WAF rules,
- bot protections,
- rate limiting,
- edge request filtering,
- origin hiding (if any external services are used).

### 14.5 Access model recommendations

#### MVP personal / small-alpha mode
- auth optional for local/self-host use,
- auth required for hosted LLM features.

#### Public beta mode
- auth required for all personalized or expensive actions,
- anonymous browsing allowed only for cheap cached read paths if desired.

### 14.6 Quota model
Quotas should apply to:

- grounded research requests per day,
- source-pack generation requests,
- article deep-refresh requests,
- optional semantic search requests if they become expensive.

### 14.7 Cloudflare Access vs app-level auth
Cloudflare Access is useful infrastructure, but for a public-friendly open-source web app, app-level OAuth/OIDC is likely the better long-term user experience.

Cloudflare Access may still be useful for:
- admin tools,
- internal staging,
- maintainer-only dashboards.

---

## 15. Frontend Framework Decision Area

This remains intentionally open.

### 15.1 Requirements for the frontend
The UI should support:

- search/browse over candidates,
- topic filters,
- article detail views,
- evidence pack views,
- account/login flows,
- responsive UX,
- likely some client-side state and optimistic loading.

The UX should feel polished and editorial, not like an internal dashboard.

### 15.2 Framework options under consideration

#### Option A: React + Vite + Cloudflare Pages/Workers
Pros:
- simple,
- popular,
- agent-friendly,
- minimal framework magic,
- easy to keep stable.

Cons:
- more manual routing/data decisions,
- no built-in SSR conventions.

#### Option B: Next.js deployed to Cloudflare via OpenNext or equivalent adapter
Pros:
- very common,
- rich ecosystem,
- strong agent familiarity,
- server components / route handlers available,
- good for more app-like experiences.

Cons:
- more moving parts,
- compatibility and adapter surface must be watched,
- framework complexity is higher.

#### Option C: TanStack Start / other modern full-stack React frameworks
Pros:
- powerful,
- modern data handling,
- strong types.

Cons:
- potentially higher churn,
- somewhat less universal agent familiarity than React/Next.

### 15.3 Recommendation
Treat frontend framework as a tracked research item rather than a blocker.

**Default recommendation right now:**
- Start with **React + TypeScript** as the lowest-risk constant.
- Decide between **Vite-first** and **Next.js-on-Cloudflare** after a short spike based on:
  - SSR needs,
  - auth ergonomics,
  - deployment simplicity,
  - coding-agent reliability,
  - desired UI polish and routing complexity.

### 15.4 Non-requirement
This product does not require SSR to validate product value. Therefore frontend framework choice should not block backend and data-pipeline implementation.

---

## 16. API and Service Boundaries

### 16.1 Backend services in the Worker
Possible API surface:

- `GET /api/topics`
- `GET /api/candidates`
- `GET /api/articles/:id`
- `GET /api/articles/:id/candidates`
- `POST /api/research/:candidateId`
- `POST /api/articles/lookup`
- `GET /api/users/me`
- `POST /api/users/saved-topics`
- `GET /api/admin/jobs`

### 16.2 Internal service modules
Recommended service boundaries in code:

- `wiki-ingest`
- `wiki-sync`
- `claim-extractor`
- `claim-scorer`
- `topic-labeler`
- `research-orchestrator`
- `source-normalizer`
- `auth-service`
- `quota-service`
- `cache-service`
- `admin-jobs`

### 16.3 Research orchestration boundary
The research layer should be cleanly encapsulated so that Gemini can be swapped or supplemented later.

Define a provider interface like:

- `generateResearchPack(candidate, options)`
- `classifySourceSet(candidate, sources)`
- `generateSearchQueries(candidate)`

Do not let provider-specific prompt formats leak everywhere.

---

## 17. Ingestion and Processing Pipeline

### 17.1 Processing stages

#### Stage 1: Corpus bootstrap
- fetch dump metadata
- acquire latest snapshot
- parse article records
- normalize and store article metadata

#### Stage 2: Article normalization
- extract plaintext / structured article segments
- preserve section boundaries
- preserve citation mappings where feasible
- capture revision ID and timestamps

#### Stage 3: Candidate extraction
- sentence split / paragraph split
- detect stale patterns
- assign candidate IDs
- compute scores and explanations

#### Stage 4: Topic tagging
- category-based tags
- keyword and infobox tags
- optional semantic tags

#### Stage 5: Indexing
- relational storage updates
- optional vector index updates
- aggregate counters / topic feeds

#### Stage 6: Incremental refresh
- pull changed articles
- re-run stages 2–5 on changed subset
- invalidate stale caches as needed

### 17.2 Job orchestration
Prefer explicit job records and idempotent processing.

Each job should record:
- job type,
- source dataset version,
- started-at,
- completed-at,
- success/failure,
- counts processed,
- detector version,
- notes/errors.

### 17.3 Idempotency requirements
All ingestion and reprocessing code should be safe to retry.

Important because:
- dump jobs may be interrupted,
- queue retries happen,
- coding agents may regenerate implementation details.

---

## 18. Source Quality and Evidence Modeling

### 18.1 Source types
Each source should be classified as one of:

- primary official source,
- secondary high-quality news,
- trade/specialty publication,
- tertiary reference,
- low-confidence / not recommended.

### 18.2 Why source typing matters
Wikipedia editing is not only about current truth, but also about whether the evidence is suitable.

The app should help the editor answer:
- Is there a likely update?
- Is the source quality strong enough for Wikipedia?
- Is this best used as background or as a citation candidate?

### 18.3 Source heuristics
Potential signals:
- official domain list / domain patterns,
- publication recency,
- article title overlap with normalized question,
- known trade press allowlists,
- duplicate coverage by independent outlets,
- presence of press-release language.

### 18.4 Evidence pack output goals
An evidence pack should include:
- concise current-state synthesis,
- source table,
- notes about what is primary vs secondary,
- caution flags if only primary sources exist,
- note when no solid update source could be found.

### 18.5 Honesty requirement
The system must be able to return:

- “Likely stale, but unable to find strong current sources.”
- “Possible update found, but source support is weak.”
- “Article has already been updated since this candidate was extracted.”

---

## 19. Cost Model and Metered Boundaries

### 19.1 Fixed-cost principle
The app should have very low baseline cost.

The chosen stack is good for this because the core platform cost remains small relative to managed server infrastructure.

### 19.2 Primary variable cost drivers
The likely cost drivers are:

1. LLM grounded research calls,
2. optional embedding generation and vector queries,
3. optional large object storage if raw dumps/artifacts are stored long term,
4. heavy live Wikipedia/API traffic if used incorrectly.

### 19.3 Cost-control strategy

#### Cheap by default
- browsing cached candidates is cheap,
- topic pages are cheap,
- article lookup is mostly cheap.

#### Expensive only on explicit action
- grounded research only runs when user requests it,
- research results are cached,
- repeated requests reuse prior packs when valid.

#### Abuse control
- auth required for research,
- quotas enforced,
- per-IP and per-user limits,
- admin kill-switch to disable research layer.

### 19.4 Future monetization / subsidy options
Not a product goal now, but architecture should allow:
- maintainer-funded public quotas,
- BYOK LLM provider keys,
- supporter/donor quotas,
- private self-host mode.

### 19.5 BYOK possibility
The architecture should leave room for a bring-your-own-key mode later, though this is not required for MVP.

---

## 20. Open Source Strategy

### 20.1 Project posture
Project should be public on GitHub from the start.

### 20.2 Why OSS matters here
- attracts Wikipedia-adjacent contributors,
- increases trust,
- makes scoring and source logic inspectable,
- makes self-hosting possible,
- reduces concern that an opaque AI system is steering edits.

### 20.3 Repository goals
The repo should be agent-friendly:
- predictable layout,
- strong READMEs,
- explicit local setup,
- migration scripts,
- sample datasets / fixtures,
- documented environment variables,
- documented provider interfaces.

### 20.4 Suggested repo structure

```text
/apps
  /web
  /worker
/packages
  /core-domain
  /wiki-ingest
  /claim-detector
  /research
  /db
  /auth
  /ui
/docs
  architecture.md
  data-model.md
  prompt-contracts.md
  ops.md
/infrastructure
  wrangler
  migrations
/scripts
  bootstrap
  backfill
  eval
```

### 20.5 Licensing
Prefer a permissive OSS license unless later reasons suggest otherwise.

### 20.6 Agent-coding guidance
The repo should include a contributor guide specifically for coding agents and human maintainers that states:

- architectural invariants,
- do-not-cross boundaries,
- schema conventions,
- testing expectations,
- deployment steps,
- safe retries,
- where prompt logic lives,
- which parts are configuration-driven.

---

## 21. Testing Strategy

### 21.1 Testing philosophy
This project needs strong correctness tests on extraction and scoring logic.

The detector is where quiet regressions are most dangerous.

### 21.2 Test categories

#### Unit tests
- date extraction
- sentence parsing
- stale phrase detection
- negative examples / false-positive suppression
- score calculation

#### Fixture tests
Use curated Wikipedia excerpts or synthetic fixtures for:
- procurement claim stale cases,
- timeline stale cases,
- false positives,
- already-updated cases,
- ambiguous cases.

#### Integration tests
- ingest one article end-to-end
- produce candidates
- invoke research provider mock
- persist research pack

#### Provider contract tests
- Gemini structured output shape
- graceful failure / timeout handling
- cache and retry behavior

#### UI tests
- topic filter flow,
- candidate detail rendering,
- auth / quota messaging.

### 21.3 Evaluation set
Create a gold set of manually labeled stale and non-stale examples.

This is critical for iterative detector improvement.

### 21.4 Regression harness
Every detector version should be evaluated against:
- precision,
- recall,
- false positive rate,
- value-weighted precision for top-ranked results.

---

## 22. Observability and Operations

### 22.1 Minimum observability
Track:
- request volume,
- research invocation count,
- cache hit rate,
- candidate generation volume,
- sync lag,
- per-topic candidate counts,
- auth failures,
- quota denials,
- provider errors.

### 22.2 Error handling
The app must degrade gracefully:
- stale candidates still browseable if research provider fails,
- cached research pack still usable if live research unavailable,
- clear user-visible errors for quota or provider issues.

### 22.3 Operational controls
Need admin controls for:
- pause research calls,
- pause sync jobs,
- requeue article refresh,
- invalidate pack cache for a candidate,
- change model role mapping.

---

## 23. Recommended MVP Scope

### 23.1 MVP features
Implement these first:

1. ingest a bounded article subset or topic slice,
2. extract stale candidates,
3. score and rank them,
4. browse by topic,
5. open candidate detail,
6. trigger Gemini grounded research,
7. view structured evidence pack,
8. basic auth + quotas for research.

### 23.2 Bounded domain recommendation
For practical delivery, start with one domain such as:
- military procurement / defense systems,
- or another high-staleness area with rich official sources.

This keeps detector tuning tractable.

### 23.3 Why a bounded domain first
- better evaluation quality,
- easier source-quality heuristics,
- easier topic labeling,
- faster product feedback,
- more satisfying early results.

---

## 24. Proposed Implementation Phases

### Phase 0: Design and scaffolding
- repo setup
- Cloudflare deployment scaffold
- D1 schema migrations
- config system
- basic frontend shell

### Phase 1: Single-article workflow
- article lookup by title/URL
- live fetch
- stale-candidate extraction
- candidate display
- research invocation
- evidence pack display

### Phase 2: Local corpus subset
- ingest selected topic subset
- persistent candidate store
- ranking and browse views
- topic filters

### Phase 3: Incremental freshness
- revision validation
- changed-article queue
- reprocessing pipeline

### Phase 4: Authentication and quotas
- Google login
- per-user rate limits
- research gating

### Phase 5: Semantic enhancements
- optional candidate embeddings
- similar-candidate browse
- topic clusters

### Phase 6: Scaling and public hardening
- observability
- richer admin controls
- stronger caching
- optional BYOK / self-host docs

---

## 25. Key Unresolved Decisions to Track Explicitly

These are open items, but they should not block core development.

### 25.1 Frontend framework
Decision needed after a short spike:
- React + Vite,
- or Next.js on Cloudflare.

### 25.2 Exact article text storage representation
Need decision on:
- plaintext only,
- parsed sections,
- or preserving some wikitext structure.

### 25.3 Source metadata extraction depth
Need decision on whether to fetch and parse source pages deeply or rely mostly on Gemini-grounded summaries plus URL metadata.

### 25.4 Scope of local Wikipedia storage
Need decision on whether to:
- store only selected topic slices first,
- or immediately support broader corpus metadata.

### 25.5 Embedding scope
Need decision on whether first semantic index should include:
- only stale candidates,
- article summaries,
- or selected sections.

---

## 26. Implementation Recommendations for a Coding Agent

### 26.1 Architectural invariants
A coding agent should preserve these invariants:

1. The stale detector must be explainable.
2. The app must remain useful without embeddings.
3. LLM research must be isolated behind a provider interface.
4. Expensive actions must be authenticated and rate limited.
5. Live article validation must occur before user-facing research if local state may be stale.
6. D1 is the default source of application truth for app metadata.
7. Bulk Wikipedia processing must not depend on live API crawling.
8. Frontend framework choice must not force a rewrite of core domain logic.

### 26.2 Recommended engineering order
A coding agent should implement in this order:

1. core domain types and DB schema,
2. article lookup and local article storage,
3. stale-candidate extraction with fixture tests,
4. candidate ranking and explanation rendering,
5. research provider interface,
6. Gemini provider implementation,
7. auth and quotas,
8. batch ingestion,
9. optional semantic layer.

### 26.3 Prompt / contract discipline
Prompts should live in code as versioned assets with:
- explicit schemas,
- deterministic low-temperature settings where appropriate,
- structured output contracts,
- logging of prompt versions.

### 26.4 Data model discipline
Schema migrations should be explicit and additive where possible.
Do not bury app-critical logic in unversioned ad hoc JSON blobs if a typed relational column is more appropriate.

---

## 27. Suggested Initial User Experience

### Home page
- clear explanation of product purpose,
- search by article,
- browse by topic,
- featured topic cards.

### Topic page
- ranked list of stale candidates,
- sort by confidence / freshness / article importance,
- filters.

### Candidate detail page
- article context,
- extracted stale sentence,
- why flagged,
- citation dates,
- research button,
- evidence pack panel.

### Research result page / panel
- concise likely-current-state summary,
- sources table,
- source-type labels,
- notes and caveats,
- quick open links.

### Account area
- remaining quota,
- saved topics,
- saved candidates.

---

## 28. Final Recommendation

Build **WikiAsOfNow** as a **deterministic stale-claim finder with a selective Gemini-backed research assistant**, not as a generalized AI editor.

The strongest starting architecture is:

- **Cloudflare Workers** for the app and orchestration,
- **D1** for relational storage,
- **Google Gemini** for grounded current-state research,
- **optional Workers AI + Vectorize** later for embeddings and semantic features,
- **React + TypeScript** on the frontend, with the exact framework choice deferred briefly.

The strongest product strategy is:

- start with a bounded topic domain,
- make the detector explainable,
- make research evidence-rich,
- require auth for expensive features,
- keep the open-source codebase highly legible to both humans and coding agents.

This provides a realistic path to an actually useful tool without committing early to avoidable complexity.

---

## 29. Source Notes for Human Maintainers

These notes summarize key external facts that informed the design and should be re-verified periodically during implementation:

- Cloudflare Workers paid plan pricing and included usage.
- Cloudflare D1 pricing and included reads/writes/storage.
- Cloudflare Workers AI pricing and available embedding model support.
- Cloudflare Vectorize pricing and dimensions-based billing model.
- Gemini pricing and Google Search grounding pricing.
- Gemini support for structured outputs combined with built-in tools.
- Wikimedia guidance to use dumps for bulk data and live APIs for narrower access.
- Wikimedia API rate-limiting and etiquette guidance.
- Wikimedia EventStreams for near-real-time recent changes.

Do not hardcode these commercial details into business logic. Keep them in docs/config and revisit periodically.
