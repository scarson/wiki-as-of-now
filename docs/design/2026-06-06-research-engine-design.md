<!-- ABOUTME: Design spec for the research engine "verify-pipeline" (slice A of the Gemini-backed research-assist layer). -->
<!-- ABOUTME: Deterministic claim→verified-evidence-cards pipeline; LLM provider faked here, real Gemini is the next slice. Hardened over per-section 3-round adversarial review. -->

# Design — Research engine: the deterministic verify-pipeline (slice A)

**Status:** designed, brainstorm-hardened (6 sections × 3 adversarial rounds: self → Opus → self). Ready for `writing-plans`.

**Goal.** Build the compliance-critical heart of the research-assist layer: take one surfaced stale claim, let a (swappable) research provider *propose* candidate sources, and have the tool **independently fetch each proposed URL and deterministically verify the proposed quote is present**, emitting only verified per-claim **evidence cards** (a real URL + a quote confirmed on that page + an advisory support flag) — never model-authored prose. Persist the result as a research pack keyed to the claim + revision.

**Why this slice, and what it excludes.** The compliance weight lives in the *deterministic* pipeline (fetch + verbatim check + honest dispositions + persistence), which is provider-agnostic and fully testable with **no live LLM and no live network**. This slice builds exactly that, against the existing `ResearchProvider` interface using **fakes**. Explicitly deferred to later slices: the **real Gemini provider** (Google-Search-grounding, neutral-query prompting, model-role config — needs API keys + prompt design); the **snippet assembler + mechanical disclosure**; the **worksheet UI** (display, degradation states, copy-native-wikitext); **per-user quotas + auth** (build-sequence step 5); the **async batch queue + seed list** (step 6).

**Authoritative governing doc:** [docs/policy/wikipedia-genai-compliance.md](../policy/wikipedia-genai-compliance.md) — the sacrosanct contract. The load-bearing guardrails here are **G8** (support-checking + deterministic verbatim-quote check), **G9** (LLM boxed to three jobs; queries neutral/shown/logged), **G12** (mechanical disclosure: AI name+version from the log), **G13** (append-only, codes-only audit), **G14** (responsible automated access / fan-out bounds), **G15** (fetched content is untrusted data, never instructions; the verbatim check is the deterministic backstop), **G16** (no copying source prose; the quote is a pointer, length-bounded). This slice prompted one clarification to G8 (verbatim = *byte-presence*, not rendered visibility — see §3 and the contract change log).

**Build-sequence context:** the back half of step 3 in [docs/design/office-hours/wikiasofnow-v1-design.md](office-hours/wikiasofnow-v1-design.md). Existing scaffolding this slice rewrites/extends: `src/research/provider.ts`, `src/research/stub-provider.ts`, `src/queue/research-jobs.ts`.

---

## Living Document Contract

This is a living document; the executing agent MUST update it as execution progresses (phase claim → 🚧, ship → ✅ + SHA, deviations inline + summarized, discoveries at top). Same discipline as the easy-win-lane plan. The reasoning/review trail (§8) is durable thinking documentation — do not delete it; extend it if later rounds find more.

---

## 1. Architecture & data flow

Every module is small, single-purpose, with dependencies injected for unit-testing. New/changed files:

- **`src/research/provider.ts`** *(refine existing)* — the **provider proposes / pipeline verifies** split:
  - `ProposedEvidence { url: string; proposedQuote: string; advisorySupport: boolean }` — the *unverified* LLM output.
  - `EvidenceCard { url: string; verbatimQuote: string; advisorySupport: boolean }` — the **post-verification** artifact (the raw quote, confirmed present on the page; see §3 on raw-vs-normalized).
  - `ResearchInput { claimText: string; sectionHeading: string; year: number; surroundingText?: string; sourceRevisionId: number }` — enriched for query generation (`surroundingText` optional, plumbed at detection time in a later slice; `claimText` is the candidate's `sentence_text`).
  - `ResearchProvider.research(input): Promise<{ providerName: string; modelVersion: string; proposals: ProposedEvidence[]; queries: string[] }>` — surfaces the **neutral queries** it used (G9: shown/logged) and the model identity (G12). Throws `ProviderUnavailableError` when the backend is unreachable.
- **`src/research/source-fetch.ts`** *(new)* — `fetchSourceText(url, opts): Promise<SourceFetchResult>`. Hardened, untrusted fetch of an arbitrary proposed URL → branded `UntrustedSourceText` or a typed failure. (§2.)
- **`src/research/normalize.ts`** *(new)* — `normalizeForVerbatim(raw): string`, the **shared** normalization contract imported by *both* the extractor and the verbatim check so they can never diverge. (§3.)
- **`src/research/verbatim-check.ts`** *(new)* — `evaluateQuote(pageText: UntrustedSourceText, quote): QuoteResult` where `QuoteResult ∈ { matched | quote_too_short | quote_too_long | quote_not_found }`. Pure, deterministic, no regex on untrusted text. (§3.)
- **`src/research/canonicalize-url.ts`** *(new)* — `canonicalizeUrl(raw): { ok: true; url: URL; host: string } | { ok: false }`. **Pure, synchronous, non-fetching.** Shared by the SSRF guard *and* the pipeline's per-host cap so both count the same host. (§2, §5.)
- **`src/research/verify-proposal.ts`** *(new)* — `verifyProposal(proposal, { fetchSource }): Promise<EvidenceCard | DroppedProposal>`. The standalone compliance seam: fetch the proposed URL, run `evaluateQuote`, emit a verified card or a typed drop. Unit-testable in isolation with a stub `fetchSource` + the **real** `evaluateQuote`. (§5.)
- **`src/research/pipeline.ts`** *(new)* — `researchClaim(input, { provider, fetchSource, now, maxProposals, perHostCap }): Promise<ResearchOutcome>`. Pure and **total** orchestrator (no DB, no crypto, no audit; never throws on provider/fetch output). (§5.)
- **`src/db/research-packs.ts`** *(new)* + **`migrations/0003_research_packs.sql`** + identical block in `src/db/schema.sql` — persistence keyed `(claim_key, source_revision_id)`. (§4.)
- **`src/queue/research-jobs.ts`** *(rewrite existing)* — `handleResearchMessage(msg, deps)` becomes total/contained: identity + persist (terminal-only) + codes-only audit. (§5.)

**Data flow for one claim:**

```
candidate { claimText, sectionHeading, year, sourceRevisionId, pageId }
  → researchClaim(input, …)
      → provider.research(input) → { providerName, modelVersion, proposals[], queries[] }   (or ProviderUnavailableError)
      → cap ordering (§5): truncate to maxProposals → canonicalizeUrl each → per-host count → fetch survivors
      → for each fetched proposal: verifyProposal → fetchSource(url) [UntrustedSourceText] → evaluateQuote
            → matched     → EvidenceCard { url, verbatimQuote: raw, advisorySupport }
            → else        → DroppedProposal { url, reason }
      → ResearchOutcome (discriminated union on status): { providerName, modelVersion, queries[], cards[], dispositions[], overCapCount, status }
  → handleResearchMessage assembles the pack row (msg identity + outcome)
      → persist iff terminal (no_proposals | proposals_present) via INSERT … ON CONFLICT DO NOTHING
      → audit (append-only, codes-only): { claimKey, providerName, modelVersion, cardCount, dispositionTally{…}, overCapCount, status }
```

**Key invariants (each has a named test, §6):**
- The verify step lives **outside** the swappable provider, so it always runs regardless of which model backs the provider.
- The persisted verdict/pack is a **pre-filter + audit record, never the surfacing authority** — surfacing (a later slice) re-checks revision currency (§4).
- `cards.length + dispositions.length === truncated.length` (the partition; §5), with `overCapCount = max(0, rawCount − maxProposals)` recorded separately.
- Audit is **codes-only**; quotes/queries/URLs live only in `research_packs`, never in `audit_log` (G13).

---

## 2. Source-fetch security & HTML→text extraction

`fetchSourceText(url, { fetchImpl, userAgent, now })` fetches an arbitrary, provider-proposed (∴ untrusted) URL. The body is untrusted data (G15): it flows **only** to the deterministic verbatim check, never to a model. Output is branded `UntrustedSourceText` (a zero-runtime-cost TS brand) so any future model-facing code must explicitly unwrap it.

**Hardening (defense-in-depth):**
1. **Scheme:** `https` only.
2. **SSRF guard — parse-then-canonicalize, never regex the raw string.** Via `canonicalizeUrl`: `new URL()` → read `hostname` → classify IPv4-literal / IPv6-literal / DNS name → for IP literals convert to integer / 128-bit and CIDR-test against blocked ranges (`127/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16` incl. `169.254.169.254`, `0.0.0.0/8`, `255.255.255.255`, `::1`, `::`, `::ffff:0:0/96` IPv4-mapped, `fc00::/7`, `fe80::/10`) + known metadata hostnames. **Reject any URL with userinfo** (`username`/`password` non-empty) — no legitimate source page carries credentials; its presence is an injection signal.
3. **Redirects:** `redirect:"error"` for v1 — reject *any* 3xx. Smallest attack surface (no `Location` parsing, no redirect-SSRF/amplification, no opaque-redirect runtime ambiguity); cost is that legit https→https canonicalization redirects fail-closed (proposal dropped, human still works the claim). Consequence: fetched == verified == proposed URL, so there is **no `finalUrl`** field in v1. (Manual ≤N re-checked hops is a later hardening, gated on empirically confirming `workerd` exposes `Location` on manual-redirect responses.)
4. **Timeout:** a **real `AbortController`** wired to `fetch(url, { signal })`; the timeout calls `controller.abort()` (not merely a `Promise.race` sentinel — for arbitrary hosts a slow-loris would otherwise leak a pending fetch; this is *stricter* than the lane's trusted-Wikimedia `withTimeout`).
5. **Size cap:** enforced on **decompressed bytes read from the stream reader** (never `Content-Length`, which is advisory/compressed). Send `Accept-Encoding: identity` to remove the gzip/br decompression-bomb class; the size-cap abort uses the same `AbortController`.
6. **Content-type allowlist:** `text/html` + `text/plain` only; absent/unparseable/other → `unsupported_content_type` (no binary/PDF download).
7. **User-Agent:** descriptive (good citizen on external sites too; mirrors `DEFAULT_USER_AGENT`).
8. **Charset:** header-wins; **fail-closed (drop) on header-vs-`<meta>` charset conflict**; `TextDecoder({ fatal: true })` (malformed sequences throw rather than yielding U+FFFD that could match injected garbage). `text/plain` converges to the same normalized-text contract.
9. **HTML→text extraction via a real parser (`htmlparser2`, portable Node+Workers — chosen over `HTMLRewriter` to keep the security-critical extraction under the existing Node test harness):**
   - Emit text from **text-nodes only** — never attribute values (`alt`/`title`/`content`/`value`/`data-*`) and never comment contents.
   - Strip `script`/`style`/`head`.
   - Insert `\n` between **block-level elements**, treating `<br>/<li>/<td>/<th>/<hr>` as separators and **defaulting unknown/custom elements to separator-inserting** (more separators only cause safe false-drops; too few cause dangerous false-accepts). This `\n` is the cross-block-forgery boundary the verbatim check relies on.
   - Defense-in-depth hidden-text strip (`hidden` attr, `aria-hidden="true"`, inline `display:none`/`visibility:hidden`) — *not* sold as a guarantee (external CSS/computed styles are invisible to a parser); the honest scope is in §3/the G8 clarification.
10. **Typed failures:** `reason ∈ { blocked_scheme, blocked_host, redirect_not_allowed, timeout, too_large, unsupported_content_type, decode_error, http_error, network_error, empty_after_extraction }` — each maps to a per-proposal disposition.

**Named residual (honest, recorded):** in a Cloudflare Worker there is no resolve-then-pin primitive, so the host check is a *string-level* guard that fully covers IP-literal and metadata-hostname proposals but **does not** stop a DNS name that resolves to a blocked IP (DNS rebinding / TOCTOU). Full resolver-based defense is hosted-instance hardening; we do **not** depend on undocumented Cloudflare egress blocking. (Same spirit as the safe-lane gate's named residuals.)

---

## 3. Verbatim-quote check & shared normalization

The single highest-stakes function: the deterministic backstop guaranteeing the model cannot launder a fabricated quote into a persisted card (G8/G15).

**`normalize.ts` — `normalizeForVerbatim(raw)`** (owned here; imported by both the extractor and the check). Fixed order:
1. Unicode **NFC** (canonical — *not* NFKC; NFKC's compatibility folding would collapse distinct glyphs and widen the false-accept surface).
2. **Strip** zero-width / soft-hyphen: U+00AD, U+200B, U+200C, U+200D, U+2060, U+FEFF. The strip set contains **only characters that render zero-width** (audited; zero combining marks) — so stripping is *reader-visible-equivalent*. Visible-space characters go in the fold set, never the strip set (a visible-space char in the strip set would be a join-forgery — locked + tested).
3. **Fold** every visible whitespace (Unicode `Zs` + NEL U+0085 + VT/FF, e.g. U+00A0, U+2000–200A, U+202F, U+205F, U+3000, U+1680, tab) to a single ASCII space, **preserving `\n`** (the block separators).
4. Trim. **Case-sensitive; no punctuation stripping** (so "not awarded" can never normalize to match "awarded").

Idempotent (`normalize(normalize(x)) === normalize(x)` — property-tested). Deterministic across runtimes only if NFC agrees Node-vs-workerd — enforced by the golden fixture (§6 N1).

**`verbatim-check.ts` — `evaluateQuote(pageText, quote)`:**
1. Normalize the quote. Reject empty/whitespace-only → `quote_not_found`. Length in **code points** (`[...s].length`, not UTF-16 `.length`): below `MIN_QUOTE_LEN` (~8 code points, a blunt anti-triviality floor — the human-open gate is the real specificity backstop) → `quote_too_short`; above `MAX_QUOTE_LEN` (~300 code points, the G16 pointer-snippet bound) → `quote_too_long`.
2. If the normalized quote contains `\n` (spans a block boundary) → `quote_not_found`.
3. Otherwise: a `\n`-free needle cannot cross a block boundary, so **`normalizedPage.includes(normalizedQuote)`** already respects segments — **no `split` needed** (zero extra allocation; the Workers-memory and cross-block concerns both resolve). `matched` iff present.
4. Pure, deterministic, **linear-time string ops only — no regex on untrusted page text** (the SAFE-1 threat class; this is a compliance property, not just perf). A hard page-size cap is applied before normalization.

**`MAX_QUOTE_LEN` is enforced both here and re-validated at the persistence read path** (§4) — layered validation per G16 (explicitly blessed by the project rules).

**Determinism rule (load-bearing):** store the **raw** quote in the card; normalize **both** operands at check time in the **same runtime**. Never compare a persisted-normalized quote against freshly-normalized page text across a runtime boundary.

**Compliance clarification (G8 — signed off, see contract change log):** the verbatim check proves the quote is **present in the page's served/extracted text** (after stripping script/style/comments/attributes + the §3 normalization), **NOT** that it is *visually rendered* to a reader. Hidden-text and exotic-CSS forgeries are out of scope for a parser; the **human-open verification gate (G5)** is the visibility backstop — consistent with the contract's existing framing that the quote is "a pointer the human must open the source to confirm." This is a *clarification* (making an existing limitation explicit + adding cheap defense-in-depth), not a weakening.

---

## 4. Persistence schema — `research_packs`

Migration `0003_research_packs.sql` + a **byte-identical** `CREATE TABLE` appended to `src/db/schema.sql` (enforced by the existing schema-equivalence test; ordered `freshTestDb`). Mirrors the proven `eligibility_verdicts` discipline.

```sql
CREATE TABLE research_packs (
  claim_key          TEXT    NOT NULL,   -- SHA-256 hex of canonical(page_id, section_heading, sentence_text, year)
  source_revision_id INTEGER NOT NULL,
  page_id            INTEGER NOT NULL REFERENCES articles(page_id),
  section_heading    TEXT    NOT NULL,
  sentence_text      TEXT    NOT NULL,
  year               INTEGER NOT NULL,
  provider_name      TEXT    NOT NULL,
  model_version      TEXT    NOT NULL,   -- full model identifier for G12 disclosure (name+version); fake → 'fake-provider/0'
  status             TEXT    NOT NULL CHECK (status IN ('no_proposals','proposals_present')),
  queries_json       TEXT    NOT NULL,   -- string[]; the G9 "logged" record lives HERE, not in the audit log
  cards_json         TEXT    NOT NULL,   -- verified EvidenceCard[]
  dispositions_json  TEXT    NOT NULL,   -- dropped proposals + reasons (show-your-work, G6)
  evaluated_at       TEXT    NOT NULL,
  PRIMARY KEY (claim_key, source_revision_id)
) WITHOUT ROWID;
```

**Identity (`claim_key`).** A SHA-256 hex over a collision-safe canonical serialization of `(page_id, section_heading, sentence_text, year)` — **UTF-8 encode each field, prefix by its byte length**, NFC-normalize the string fields (minimal identity normalization, *not* the verbatim fold). Deterministic cross-runtime (SHA-256, no ICU dependence). `claim_key` exists **because the codes-only audit log (G13) cannot carry `sentence_text`** — a compact handle is required regardless; given it exists, it serves as the PK (a bounded 64-char `WITHOUT ROWID` key, better than an unbounded natural key) and the queue/audit handle. The claim components are **also stored as columns** so the worksheet/disclosure can reconstruct *what was researched* (the surrogate `stale_candidates.id` is unstable across re-detect and is never a foreign key here).

**Lifecycle.**
- PK `(claim_key, source_revision_id)`: a new revision → a new pack; same-revision redelivery → idempotent no-op.
- **Surfacing rule (enforced by the later worksheet slice; defined here):** a pack is surfaceable only when `pack.source_revision_id == live articles.revision_id` — the reader MUST revision-match (mirroring `selectEasyWinPageIds`' `ON v.revision_id = a.revision_id`). A non-matching pack is "researched at revision R; article now R+1 — re-verify," never silently surfaced as current.
- The pack table is **mutable cache/history** (the audit log is the append-only one) — the module exposes a `deletePack`/prune affordance (documented in the ABOUTME so nobody mistakes it for an append-only artifact). Superseded/orphaned packs linger until pruned; **compaction is a named-deferred non-goal** (documented unbounded-growth residual).

**Writes.** `INSERT … ON CONFLICT(claim_key, source_revision_id) DO NOTHING` — **write-once** (a research pack is the product of metered LLM spend; deliberately *not* the verdict's upsert — documented so no one "fixes" it to `DO UPDATE`). **Persist only terminal outcomes** (`no_proposals`, `proposals_present`); `provider_unavailable` is audit-only (persisting an empty pack would permanently block retry — a transient outage must not become a permanent "no evidence" pack).

**Reads (user-facing → defensive).** Per-column `JSON.parse` wrapped → a typed `pack_unreadable` state, never throwing through the handler (the audit log could defer this; the pack read is the show-your-work/disclosure path). Validate the parsed `cards`/`dispositions` against the contract at read time (enums in range, quote length within `[MIN, MAX]`) — this **backstops the code-only G16 cap**.

**Note:** JSON columns match the `eligibility_verdicts` `reasons_json` precedent and the point-read-by-PK access pattern; per-card caps/enums are therefore **code-enforced** (the pipeline is the choke point) + read-validated.

---

## 5. Pipeline orchestration

**`verifyProposal(proposal, { fetchSource }) → EvidenceCard | DroppedProposal`** — the standalone seam:
- `fetchSource(proposal.url)` fails → `DroppedProposal { url, reason: <fetch failure code> }`.
- succeeds → `evaluateQuote(text, proposal.proposedQuote)`: `matched` → `EvidenceCard { url, verbatimQuote: raw, advisorySupport }`; else → `DroppedProposal { url, reason: quote_* }`.

**`researchClaim(input, { provider, fetchSource, now, maxProposals, perHostCap }) → ResearchOutcome`** — pure and **total** (never throws on provider/fetch output):
- `provider.research(input)`; `ProviderUnavailableError` caught → `status: 'provider_unavailable'` (no cards/dispositions).
- **Cap ordering is the spec (a G14/G15 security boundary, not a tuning knob):**
  ```
  truncated = proposals.slice(0, maxProposals)   // (1) hard ceiling on the RAW array, before any per-item work
  for p in truncated:
    c = canonicalizeUrl(p.url)                    // (2) pure, synchronous, non-fetching; reject → disposition 'malformed_url' (COUNTED, never fetched)
    if perHostCount[c.host] >= perHostCap → disposition 'capped'   // (3) count on the canonical host
    else perHostCount[c.host]++ ; verifyProposal(p, …)            // (4) fetch + verify
  overCapCount = max(0, proposals.length − maxProposals)          // un-processed remainder, recorded honestly (not individually fetched)
  ```
  Malformed URLs are a **counted disposition, not a skip** (else garbage evades `maxProposals`). `perHostCap` counts on the canonical **host** in v1; **eTLD+1 (Public Suffix List) is the correct unit if `maxProposals` ever grows** — recorded, but the PSL dependency isn't justified at `maxProposals=5` (the total cap already hard-bounds per-claim fan-out). Cross-claim amplification is a per-user-quota concern (step 5).
- **`ResearchOutcome` is a discriminated union on `status`** (`provider_unavailable | no_proposals | proposals_present`), with the asserted partition `cards.length + dispositions.length === truncated.length` for `proposals_present` — impossible states (e.g. `proposals_present` with empty arrays) are unrepresentable, and no proposal is silently lost or double-counted.
- **G9 query neutrality:** enforced by (a) human review of the *persisted* queries (the G9 mechanism — "shown, editable, logged"), (b) the provider slice's prompt design, and (c) a cheap deterministic sanity bound here (cap query count + length; reject a query that echoes the full claim sentence). No LLM-ish "neutrality classifier."

**`handleResearchMessage(msg = { claimKey, pageId, sourceRevisionId, input }, { researchClaim, packStore, audit })`** — the total/contained shell:
- best-effort `packStore.has(claimKey, sourceRevisionId)` (on the **full PK**) → skip. Labeled a **sequential-skip optimization, NOT a concurrency guard.**
- else `outcome = researchClaim(input, …)`; **return-vs-throw encodes ack-vs-retry** (the batch transport — a later wiring detail — uses Cloudflare Queues' **per-message `ack`/`retry`**, never whole-batch throw, so one poison message can't re-drive its siblings):
  - terminal (`no_proposals` | `proposals_present`) → assemble pack → `packStore.insertIfAbsent` (`ON CONFLICT DO NOTHING`) → `audit.append` codes-only → **ack**.
  - `provider_unavailable` → audit-only (no persist) → **retry-signal** (redelivery re-attempts; dead-letters after the queue max).
  - malformed *message* (bad input shape) → `audit research.failed` → **ack** (don't retry a permanently-bad input).
  - DB/unexpected error → **retry-signal** (transient; dead-letter after max). All other errors are contained per-message.
- **Audit payload (codes-only, G13):** `{ claimKey, providerName, modelVersion, cardCount, dispositionTally{ quote_not_found, fetch_failed, malformed_url, capped, quote_too_short, quote_too_long, … }, overCapCount, status }`. A **`quote_not_found` spike is the provider-hallucination canary** in the append-only log. Never quotes/queries/URLs.

**Idempotency / spend.** The durable `ON CONFLICT DO NOTHING` insert is the idempotency authority; `has()` is the sequential-skip optimization. Concurrent redelivery can still **double-spend** the provider (the call precedes the insert) — accepted in v1 (the fake provider has no spend); the real-provider slice adds a pre-claim placeholder row. The future per-user quota MUST reconcile on pack **inserts** (write-once), not provider **calls**, or the double-spend leaks into the quota ledger. Duplicate `research.completed` audit rows on concurrent redelivery are accepted (append-only, key-identifiable — the established easy-win-lane stance).

**Defaults (named, tunable):** `DEFAULT_MAX_PROPOSALS = 5`, `DEFAULT_PER_HOST_CAP = 2`, `DEFAULT_FETCH_TIMEOUT_MS = 10_000`, `DEFAULT_MAX_SOURCE_BYTES ≈ 2 MB`. These bound the LLM-proposed fan-out + cost + the §2 amplifier, and are the natural inputs to the future per-user quota.

---

## 6. Testing strategy

Disciplines: **real logic under test, fakes only as seam *byte/proposal* sources** (the seam is the byte boundary — fakes emit raw transport bytes: gzip-compressed, HTML-with-markup; never post-processed text, or `normalize`/the extractor get bypassed). **No live LLM, no live network.** Slice A has **no e2e** — no test here proves the real Gemini provider or real network; that is the provider slice. TDD throughout.

**Four enforced controls (the false-confidence killers):**
- **N1 — workerd NFC golden fixture (not vapor).** A scripted `pnpm gen:nfc-golden` (one-shot Worker via `wrangler unstable_dev`) runs the NFC corpus through the *actual* `normalize.ts` on `workerd` and commits `test/fixtures/nfc-golden-workerd.json`; a Node vitest asserts `normalize(input) === golden.output`. The Node-only test is labeled *self-consistency, not parity*. (CI-absence is a separate flagged project gap — see §9.)
- **N3 — audit is an allowlist + sentinel probe, not a denylist.** Assert the payload's keys ⊆ an enumerated set of code/id keys and every value is number / known enum code / id (never free text); **plus** seed the claim/quote/URL with `SENTINEL_LEAK_<rand>` and assert the serialized audit `not.toContain` it.
- **N4 — determinism/no-network is an armed trap.** `setupFiles` monkeypatches `globalThis.fetch` / `Date.now` / `Math.random` / `crypto.randomUUID` to **throw** inside pure/Slice-A tests (restored after). `canonicalizeUrl` asserted synchronous (returns a value, not a Promise) under the fetch-trap. Plus a property test: `researchClaim` twice → deep-equal incl. `claim_key` + ordering, and **shuffled proposal order → order-stable**.
- **N7 — bipolar composition guards.** Every adversarial corpus asserts *both* polarities: the SSRF corpus includes **legitimate public URLs that MUST pass** (else block-everything scores 100% and the layer is silently dead); the extractor corpus includes visible text that **must be extracted** alongside hidden text that must be excluded; the verbatim corpus exercises all four reason codes.

**Authorship honesty:** adversarial corpora are derived **spec-first** from the threat enumeration (§§2–3), not from reading the implementation's branches. The **SSRF + HTML-extraction** corpora are generated by a **blind-adversary subagent** (one that has not seen the implementation) to break the author↔corpus coupling. `normalize`/`verbatim` invariants use **property-based generation (`fast-check`, dev dependency)** where the property is checkable without hand-labeling (idempotence, NFC-equivalence, code-point math).

**Per-unit (each named invariant from §§1–5 gets a test):**
- `normalize.ts` — driven into existence by **its own** unit test first (the shared module is internal logic, never faked); idempotence, strip/fold tables, `\n` preservation, NFC, the golden fixture.
- `verbatim-check.ts` — real normalization; `matched` cases **require normalization to do work** (composed-vs-decomposed / case / whitespace) paired with a cross-block **negative**; all four reason codes; code-point length; single-giant-segment degradation documented + tested; a ReDoS-pathological input completes under a tight time bound (SAFE-1 pattern).
- `source-fetch.ts` — injected `fetchImpl` emits **real `ReadableStream`s in multiple chunks**, incl. a **compression bomb** (decompressed-byte cap fires, not wire-byte); SSRF rejections (IP-encodings, userinfo, scheme) + **legit-URL-passes**; `redirect:"error"` rejects 3xx; charset decode + fatal-on-conflict; **abort → no leaked fetch, no unhandled rejection**; extraction (text-nodes only, separators, hidden-text excluded + visible extracted).
- `verify-proposal.ts` — stub fetch + **real** `evaluateQuote`: "page lacks the quote → card dropped" standalone.
- `pipeline.ts` (`researchClaim`) — **orchestration invariants** (not stub rigging): cap ordering with **>cap proposals on the same host** + a `fetchCalls` counter asserting exactly the limit; partition `cards+dispositions==truncated` in **every** outcome test; `overCapCount`; status derivation; totality.
- `research-packs.ts` — `freshTestExecutor` (D1-parity, never raw `Database`); `ON CONFLICT DO NOTHING` no-op; DB-1 NULL-rejection; FK; defensive `pack_unreadable` read; read-time cap validation; `has()` on the **full PK** (different `source_revision_id` not skipped); the `example.co.uk` eTLD+1 trap if/when that unit is adopted; `deletePack`; schema-equivalence + ordered-migration for `0003`.
- `handleResearchMessage` — terminal→persist+audit (allowlist+sentinel); `provider_unavailable`→audit-only + retry-signal + nothing persisted; containment branches; `has()` sequential-skip.

**Suite-wide pristine (§1 of testing-pitfalls):** `setupFiles` fails the run on unexpected `console.error`/`console.warn` and unhandled rejections, with an explicit allowlist for legitimate error-path logging — so "capture the expected error" is the only way to pass.

**Honest integration boundaries:** the Queues ack/retry test is labeled *handler-discipline* (a later integration slice proves the real Queues mapping); `research_packs` tests are *D1-parity* tests.

---

## 7. Compliance mapping

| Guardrail | How this slice honors it |
|---|---|
| Support-checking + verbatim-quote check (G8) | The deterministic `evaluateQuote` is the only path to a card; it proves byte-presence (clarified scope: served text, not rendered visibility — §3 + change log); support remains the human's judgment (advisory flag). |
| LLM boxed to three jobs (G9) | The provider only *proposes* (queries + URL + pointed-at quote); the pipeline verifies. Queries persisted + surfaced for human review; cheap deterministic neutrality bound; semantic neutrality owned by the provider slice + human. |
| Mechanical disclosure (G12) | `model_version` stores the full model identifier (name+version); fake reports a sentinel; the disclosure path (later slice) treats a missing version as a hard error. |
| Append-only, codes-only audit (G13) | `audit_log` gets only `{ claimKey, providerName, modelVersion, counts, status }`; quotes/queries/URLs live only in `research_packs`. Allowlist+sentinel-tested. |
| Responsible access (G14) | `maxProposals` + `perHostCap` enforced *before* fetching, on the provider's (untrusted) output, in the locked cap order; descriptive UA; bounded per-claim fan-out. |
| Untrusted fetched content (G15) | Branded `UntrustedSourceText` flows only to the verbatim check; the SSRF/scheme/size/redirect/content-type hardening; the verbatim check is the deterministic fabrication backstop. |
| No copying source prose (G16) | `verbatimQuote` is a length-capped pointer (`MAX_QUOTE_LEN`), enforced in the check + re-validated at read; the assembler (later slice) enforces "discourage pasting." |

---

## 8. Reasoning chain & adversarial review trail

Each section ran three rounds (self → Opus → self). What changed, and the load-bearing disagreements:

- **§1 Architecture.** Opus sharpened: candidate `id` is *silently reassigned* on re-detect (not just orphaned) → forced the content-derived `claim_key`. Added: `verifyProposal` as a standalone testable seam; `UntrustedSourceText` branded type (G15 at the type level); single audit writer (the consumer); two-axis honesty (pack status + per-proposal disposition); typed codes-only audit payload.
- **§2 Source-fetch.** Opus's headline class: a crafted page making the verbatim check certify a quote a reader never sees. Resolutions: parse-then-canonicalize SSRF (IP-encoding bypasses); `htmlparser2` over a regex stripper; **decompression-bomb + real `AbortController`** (the lane's `Promise.race`-doesn't-abort compromise is unacceptable for arbitrary hosts); shared decode→normalize→block-join contract; block separator as the anti-forgery boundary. **Decisions (Sam):** portable parser over `HTMLRewriter`; `redirect:"error"` for v1; the G8 byte-presence clarification.
- **§3 Verbatim check.** Opus tagged a CRITICAL false-accept (zero-width strip-to-nothing "joins" tokens) and recommended map-to-space. **I pushed back and Sam agreed:** the strip set contains only *zero-width-rendering* characters, so stripping is *reader-visible-equivalent* — map-to-space would cause false-*rejects* of legit soft-hyphenated text, and the verbatim check's role is presence-not-support (human-open backstops representation). Kept strip-to-nothing + a rigorous strip-vs-fold classification (the real defense). Accepted: NFC determinism (golden fixture; normalize both operands at check time); code-point lengths; the `\n`-needle `includes` simplification (no `split`); NFC-not-NFKC.
- **§4 Persistence.** Opus: hashing the claim discards its identity (CRITICAL). **I diverged from Opus's pure-natural-PK recommendation:** the codes-only audit *forces* a compact `claim_key` regardless, so PK = `(claim_key, source_revision_id)` + claim components stored as columns (bounded key, recoverable identity, audit handle). Accepted: stale-pack surfacing rule + prune affordance (mirror the verdict pattern); `ON CONFLICT DO NOTHING` (write-once, *not* upsert); defensive shape-validating read.
- **§5 Orchestration.** Opus CRITICALs: the **cap *order*** is the security spec (truncate → canonicalize → count → fetch; malformed = counted disposition); **batch-poison containment** + the **`provider_unavailable` permanent-block bug** (audit-only, don't persist). Accepted: discriminated-union outcome + partition assertion; per-reason audit tally (hallucination canary); `has()` on the full PK; quota reconciles on inserts not calls. Calibration: per-host (not eTLD+1) for v1, documented.
- **§6 Testing.** Opus CRITICALs were all about false confidence: the workerd NFC golden fixture (vs vapor), audit allowlist+sentinel (vs denylist), armed determinism traps (vs convention), bipolar composition guards (vs over-blocking false-pass). Accepted with the blind-adversary corpora + `fast-check`, and the suite-wide pristine enforcement. **Decisions (Sam):** `fast-check` dev dep; blind-adversary for SSRF + HTML-extraction; the golden-fixture script.

**What I'm still uncertain about:** whether `MIN_QUOTE_LEN ≈ 8` is the right floor (tune against real date-anchored quotes during implementation); whether `htmlparser2`'s hidden-text handling needs more than the cheap defense-in-depth strip (bounded by the human-open gate regardless).

**What I'd add with more time:** a property-based generator for the SSRF IP-encoding space (beyond the blind-adversary corpus); a fuzz pass on the extractor against real Wikipedia-cited source pages (deferred — needs network, so it belongs with the provider slice's e2e).

---

## 9. Deferred / named residuals (do NOT silently re-open)

- **DNS-rebinding SSRF residual** (Worker has no resolve-then-pin) — host check covers IP-literals/metadata-hostnames only; full resolver defense = hosted-instance hardening.
- **`provider_unavailable` retries** until the queue dead-letters (transient); **double-spend** on concurrent redelivery accepted in v1 (placeholder row in the provider slice).
- **Pack compaction / retention** — superseded/orphaned packs linger; prune affordance exists, automatic compaction deferred.
- **eTLD+1 per-domain cap** — host-level for v1; revisit when `maxProposals` grows.
- **Manual redirect following** — `redirect:"error"` for v1; manual ≤N hops gated on confirming `workerd` `Location` exposure.
- **No CI exists in the repo** (no `.github/workflows`) — the NFC golden fixture + the gate trio are runnable locally; wiring them (and the `gen:nfc-golden` regeneration) into CI is a **separate project gap flagged to Sam**, not part of this slice.
- **Out-of-slice discovery:** the shipped `test/ingest/easy-win-lane.test.ts:114` audit assertion uses the **denylist** pattern §6 N3 condemns; it should be upgraded to allowlist+sentinel — recorded, not fixed here.
- **Later slices:** real Gemini provider; snippet assembler + mechanical disclosure; worksheet UI + surfacing-rule enforcement + copy-native-wikitext; per-user quotas + auth; async batch queue + seed list.

---

## 10. Decisions log

| # | Decision | Rationale |
|---|---|---|
| D1 | Slice = deterministic verify-pipeline only; real Gemini deferred | Compliance weight is in the deterministic part; fully testable with no LLM/network |
| D2 | provider proposes / pipeline verifies; verify outside the swappable seam | The deterministic backstop must always run regardless of model |
| D3 | Portable `htmlparser2` over `HTMLRewriter` | Keeps the security-critical extraction under the existing Node test harness |
| D4 | `redirect:"error"` for v1 | Smallest SSRF/redirect attack surface; failures are cheap (proposal dropped) |
| D5 | G8 clarification: verbatim = byte-presence, not rendered visibility | Honest scope; human-open gate is the visibility backstop (contract change-logged) |
| D6 | Strip zero-width to nothing (not map-to-space) + strict strip/fold classification | Reader-visible-equivalence; map-to-space would false-reject legit text |
| D7 | PK `(claim_key, source_revision_id)` + claim components stored | Codes-only audit forces a compact handle; bounded key; recoverable identity |
| D8 | `ON CONFLICT DO NOTHING` (write-once), persist terminal-only | Research is metered spend; `provider_unavailable` must not permanently block retry |
| D9 | Cap order truncate→canonicalize→count→fetch; malformed = counted disposition | The order is a G14/G15 security boundary |
| D10 | NFC golden fixture; armed determinism traps; audit allowlist+sentinel; bipolar corpora; blind-adversary; `fast-check` | Make the compliance/determinism guarantees *enforced*, not conventional |
