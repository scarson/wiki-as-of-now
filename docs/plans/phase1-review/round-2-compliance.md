# Phase 1 Review — Round 2: Compliance-Guardrail Adherence

**Reviewer lens:** Compliance guardrails (the sacrosanct contract at
`docs/policy/wikipedia-genai-compliance.md`).
**Branch:** `claude/wikiasofnow-foundation-detector-o2yCO`
**Scope:** Phase 1 foundation only — audit log, research provider boundary, queue
consumer, DB client, migration. No detector, no real LLM yet.
**Mode:** Read-only.
**Date:** 2026-06-04

## Overall verdict: COMPLIANT

The foundation honors every guardrail it touches. No CRITICAL or IMPORTANT
violations were found. The seams that future guardrails depend on are laid
correctly and conservatively. The findings below are MINOR / OBSERVATION level —
mostly missing test coverage of compliance-load-bearing invariants and one
out-of-scope note. I checked specifically for manufactured concerns and did not
inflate anything; the code is genuinely clean against the contract.

---

## Guardrail-by-guardrail findings

### 1. The audit log is foundational and self-recording (G13) — HONORED

- `makeAuditLog` (`src/db/audit-log.ts:34-62`) exposes **only** `append` and
  `read`. There is no `update`, `delete`, `truncate`, or any other mutation/removal
  method on the returned object.
- `append` issues a single `INSERT` (`src/db/audit-log.ts:39-41`); `read` issues a
  single `SELECT ... ORDER BY id` (`src/db/audit-log.ts:50-52`). No `UPDATE` /
  `DELETE` / `DROP` / `TRUNCATE` statement exists anywhere in `src/` (verified by
  repo-wide search — only matches are the `audit-log.ts` INSERT/SELECT and ABOUTME
  comment text).
- The table shape (`migrations/0001_init.sql:3-9`) is append-friendly:
  `id INTEGER PRIMARY KEY AUTOINCREMENT`, `ts`, `actor`, `event_type`,
  `payload_json`. No column invites in-place mutation; rows are immutable facts.
- **"Generating a disclosure is itself logged" is feasible with this shape.** The
  `event_type` + free-form `payload_json` design supports an event such as
  `disclosure.generated` with an identifiers-only payload (e.g. `{ candidateId }`).
  The shape does not block, and is well suited to, the self-recording requirement.
- The schema migration and the canonical readable copy (`src/db/schema.sql`) are
  **byte-identical**, as the header comment claims — verified by direct comparison.

**Caveat (correctly disclosed, not a violation):** the contract explicitly says
stronger tamper-evidence (hash-chaining) is a *future* hardening, "not claimed
today." So append-only-by-API plus an immutable-shaped table is exactly what G13
requires at this stage. The DB itself is not cryptographically tamper-evident, but
the contract does not require that yet. No gap against the contract as written.

### 2. No PII / document content in logs — HONORED

- `AuditEntry.payload` is typed `unknown` (`src/db/audit-log.ts:9`). The doc comment
  on the same interface states the rule plainly: "Payload is identifiers only —
  never PII or document content" (`src/db/audit-log.ts:5`).
- The one production caller, the queue consumer, logs **identifiers only**:
  `payload: { candidateId: msg.candidateId }` (`src/queue/research-jobs.ts:53`). It
  does **not** log `msg.claim` (which holds `claimText` / `sectionHeading`), and it
  does **not** log the provider `result` (which would hold quotes/URLs). The
  function comment makes the intent explicit (`src/queue/research-jobs.ts:34-35`,
  `46-49`).
- The schema comment reinforces the rule at the storage layer:
  `payload_json TEXT NOT NULL -- identifiers only; never PII/document content (see
  compliance + PII pitfall)` (`migrations/0001_init.sql:8`).

**On the `payload: unknown` typing (assessed, judged acceptable):** `unknown`
*permits* anyone to stuff arbitrary content (including claim text) into a payload —
the type system does not enforce "identifiers only." This is an AT-RISK *surface*
in the abstract, but it does not rise to a violation because (a) the only current
caller is compliant, (b) the rule is documented at the interface, the schema, and
the caller, and (c) the project's own PII-in-logs pitfall is referenced. The type
cannot express "no free text" without a restrictive schema, and imposing one now
(before any real event taxonomy exists) would be premature. See MINOR-1 for the
test-coverage gap this leaves.

### 3. The LLM's role is boxed / no machine-written text (G9, G1) — HONORED

- `EvidenceCard` (`src/research/provider.ts:22-29`) carries exactly three fields:
  `url: string`, `verbatimQuote: string`, `advisorySupport: boolean`. There is **no**
  `summary`, `answer`, `text`, `explanation`, `narrative`, or any field that could
  hold model-authored prose.
- The doc comment (`src/research/provider.ts:11-21`) names the relevant guardrails
  correctly — the bounded-LLM-role guardrail ("the LLM's role is boxed to three
  jobs") and the no-machine-written-text guardrail — points to
  `docs/policy/wikipedia-genai-compliance.md`, and restates the disposable-navigation
  bright line ("Any model phrasing of 'the fact' is disposable navigation that must
  never persist into this card"). This matches the contract's bright line for
  machine-generated text (the "no machine-written article text, ever" guardrail and
  the bounded-LLM-role guardrail). References are self-identifying per CLAUDE.md's
  cross-reference rule — guardrails are named, not cited by bare number, and the
  authoritative doc is linked rather than duplicated.

### 4. Detection is deterministic, LLM-free (G10) — HONORED

- There is no detector in Phase 1 (expected). I confirmed **nothing in the
  foundation calls an LLM/model/network for any logic.** A repo-wide search for
  `fetch|http|openai|gemini|anthropic|model|generateContent|axios|undici` across
  `src/` returned **zero** matches in the foundation modules. (The only `http`/`fetch`
  hits are scaffolding links in `src/app/page.tsx`, the Next.js create-app
  boilerplate, which is outside the foundation scope and contains no logic.)
- `StubResearchProvider.research` (`src/research/stub-provider.ts:6-9`) returns a
  hard-coded empty result `{ providerName: "stub", candidates: [] }` — zero model
  calls, zero network, as its ABOUTME states.
- The queue consumer (`src/queue/research-jobs.ts:37-55`) calls **only the injected
  provider** (`deps.provider.research`) — no direct model/network access.

### 5. Provider boundary keeps the LLM swappable + bounded — HONORED

- `ResearchProvider` (`src/research/provider.ts:38-40`) is a single-method seam:
  `research(input: ResearchInput): Promise<ResearchResult>`. A `ResearchResult`
  (`src/research/provider.ts:32-35`) can only contain `providerName` plus
  `EvidenceCard[]`. Because `EvidenceCard` is structurally constrained to
  url + verbatimQuote + advisorySupport (finding 3), **any future real provider is
  type-constrained to return evidence cards — it cannot return free model output**
  (there is no field for it to land in). The boundary does the bounding.
- The consumer depends on the structural shape
  `{ research(input): Promise<ResearchResult> }` (`src/queue/research-jobs.ts:24`),
  so the real provider is swapped by injection without widening the contract.

### 6. Places the foundation could make a future guardrail harder — none found

I looked specifically for seams that silently weaken a future guardrail. None
found. The opposite is true in the load-bearing cases: the `EvidenceCard` shape
structurally forecloses a machine-written-text channel, and the audit-log module's
two-method surface forecloses a mutation channel. The `payload: unknown` typing
(finding 2) is the one place where enforcement is by-convention rather than
by-type, but it is documented in three places and is not a regression risk at this
stage.

---

## Findings by severity

### CRITICAL — none

### IMPORTANT — none

### MINOR

- **MINOR-1 — The audit log's compliance-load-bearing invariants have no test
  coverage.** The only test in the repo is `test/smoke.test.ts` (app-name only).
  G13 ("the audit log is foundational") and the no-PII-in-logs rule are precisely
  the invariants that "make the contract real rather than asserted," yet there is
  no test asserting (a) append-then-read round-trips in insertion order, (b) the
  module exposes no mutation method, or (c) the queue consumer logs identifiers only
  (never `claimText` / the provider result). Per CLAUDE.md's TDD mandate and
  "tests MUST comprehensively cover ALL functionality," these are exactly the
  behaviors that warrant a regression test before more is built on the foundation.
  *Evidence:* `test/smoke.test.ts:1-8`; `src/db/audit-log.ts`;
  `src/queue/research-jobs.ts:50-54`. Severity is MINOR (not IMPORTANT) because the
  current code is correct; the risk is future drift going uncaught.

- **MINOR-2 — `read()` is not yet hardened for the user-facing disclosure path.**
  The in-code NOTE (`src/db/audit-log.ts:44-48`) correctly flags that `JSON.parse`
  throws on a corrupt row and that per-row parsing must be wrapped "before read() is
  used in a user-facing path (disclosure / show-your-work)." This is honest and
  correctly deferred — but because the disclosure guardrail and the show-your-work
  guardrail both read this log, the hardening must land before those paths ship. Not
  a Phase 1 violation; flagging so it is not lost. *Evidence:*
  `src/db/audit-log.ts:44-60`.

### OBSERVATION

- **OBS-1 — `stale_candidates` stores article claim text; this is outside the
  audit-log PII rule but worth tracking.** `migrations/0001_init.sql:16-27` defines
  `sentence_text` and `explanation` columns holding article-derived claim content.
  This is **not** a violation: the contract's no-PII/no-document-content rule is
  scoped to the **audit/debug log** (the PII pitfall and the contract's logging
  rule), not to functional application tables — a staleness detector necessarily
  stores the candidate sentence it flagged. The one thing to keep honoring: that
  this claim text must **never** be copied into an `audit_log.payload_json` (e.g. a
  future "candidate detected" event must log `page_id` / candidate `id`, not
  `sentence_text`). The current consumer already does the right thing. Recording so
  the boundary stays clear as detector events get added.

- **OBS-2 — Audit completion-logging is best-effort, by design and disclosed.** The
  consumer comment (`src/queue/research-jobs.ts:46-49`) notes that if `audit.append`
  throws after `store.set`, a re-delivery skips both the provider and the audit
  entry, so completion can go unlogged; transactional completion-logging is deferred
  to a later milestone. For G13 ("if the log is not robust, the contract is not
  real") this is a known, documented robustness gap — acceptable at the foundation
  stage with a stub provider, but it is a real item for the milestone that wires the
  D1 research-packs table, and should be tracked so the audit trail is not silently
  lossy in production. Not a Phase 1 violation.

---

## Confidence statement

I am confident in the COMPLIANT verdict. The foundation is small (six source
files), and I read each in full plus the migration, the canonical schema copy, the
single test, and the full compliance contract. I ran targeted repo-wide searches
for mutation SQL and for any model/network call and confirmed both are absent from
the foundation. The two structural foreclosures that matter most — no mutation
method on the audit log, no prose field on the evidence card — are present and
correct, which is the strongest evidence that the seams several guardrails depend
on were laid deliberately rather than incidentally. The remaining findings are
missing tests and disclosed future-hardening items, not contract crossings.
