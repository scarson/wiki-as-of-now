<!-- ABOUTME: Design spec for the verified current-state ground-truth corpus — real answers (verbatim quote + archived source) for the stale gold-set claims. -->
<!-- ABOUTME: Read alongside test/gold/gold-set.json (the claims this corpus answers) and docs/design/2026-06-06-research-engine-design.md (the verify pipeline it tests). -->

# Verified current-state ground-truth corpus — design

**Status:** approved design, pilot-batch-first build pending.
**Author:** Claude + Sam, 2026-06-21.
**Depends on:** the search/discovery work in PR #21 (`src/research/source-exclusion.ts` `isCircularSource`, reused as the discovery-stage circular-source filter) — the *build* needs it; this *spec* does not.

## 1. Why this exists

The deterministic detector finds **stale** claims (a forward assertion tied to a
now-past target year). It deliberately does **not** know what the *current* state
of the world is — that is the research assistant's job, and by compliance contract
([docs/policy/wikipedia-genai-compliance.md](../policy/wikipedia-genai-compliance.md),
G8) the only thing the tool ever asserts about a source is a **deterministic
verbatim-presence check**, never an LLM judgment.

Today we have no held-out record of what the *right* current-state answer is for
any stale claim. That gap costs us twice:

1. **The search/discovery evals are proxies.** The Brave-vs-Tavily funnel eval
   (`scripts/search-eval/corpus-funnel.ts`, introduced by the search work in PR #21)
   measures source *composition* and fetch success — "did we find ≥1 non-circular
   fetchable source" — not whether any found source actually **verifies the
   current state**. We are measuring plumbing, not recall of truth.
2. **The verify pipeline has no end-to-end deterministic fixture.** PR #17's
   integration test wires the real modules together but against *hand-authored*
   pages. We have never asserted "given this real archived source and this real
   claim, the pipeline emits the evidence card we expect."

This corpus closes both: a held-out set of **verified current-state answers**, each
anchored to a **verbatim quote present on an archived snapshot of a real source**.

## 2. Verification model — the two-tier gate (the trust core)

Every candidate answer passes a **deterministic verbatim gate first**, then a
**conservative tier classification** that decides whether the agent may
auto-certify it or must escalate it to Sam.

### 2.1 Deterministic verbatim gate (always, non-negotiable)

The proposed quote MUST be verbatim-present on the archived snapshot, proven by the
project's own `evaluateQuote`
([src/research/verbatim-check.ts](../../src/research/verbatim-check.ts)) run against
the snapshot's normalized text. Past this gate, fabrication is impossible: every
recorded fact is a real contiguous span on a real captured page. This is the same
machinery that gates every surfaced quote in production, so the corpus is verified
by the system under test's own backstop — not by a parallel, weaker check.

### 2.2 Tier classification

**Tier 1 — agent auto-certifies (`certification: agent_auto`)** only when **ALL**
of the following hold:

- **Source authority.** The source host is on a curated high-reliability allowlist
  *by type*: government/military (`.gov`, `.mil`, official national domains),
  major news agencies, the **primary official org named in the claim** (the
  manufacturer / agency / program office), or standards / peer-reviewed bodies.
  This is a deterministic host check, the same shape as `isCircularSource`.
- **Self-evident support.** The verbatim quote contains, in **one contiguous
  span**, BOTH the claim's subject anchor (the program / entity) AND the resolving
  fact (the changed status + a date or number). The support must not require
  stitching multiple passages or supplying background knowledge — the agent must
  be able to point at the exact span that resolves the claim.
- **Unambiguous disposition.** Exactly one disposition fits; no competing reading
  is plausible.

**Tier 2 — escalate to Sam (`certification: human_confirmed`)** for **everything
else**, including:

- medium/low-authority source (blog, forum, SEO aggregator, secondary outlet);
- support that needs inference across the page or outside knowledge;
- contested, political, or ambiguous current state; conflicting sources;
- paywalled or uncertain transcription;
- **no qualifying source found** → `disposition: unverifiable` (these are valuable
  — the pipeline *should* honestly report "no evidence");
- the agent's own confidence is below threshold for any reason.

**Bias rule: when in doubt, escalate.** Over-escalation is cheap (Sam reviews a few
extra items); over-certification silently corrupts the ground truth that
everything downstream is measured against. This mirrors the project's fail-closed
ethos (G11 safe-lane gate fails to `human_only`).

### 2.3 Auditability and calibration

Every record stores `certification` (`agent_auto` | `human_confirmed`) and
`verifiedAsOf`. Because the agent's "self-evident support" / "unambiguous
disposition" judgments are themselves the kind of relevance call the contract
reserves for humans (G8), the auto-tier is **not** taken on faith:

- Sam **spot-checks a random sample** of `agent_auto` records (target ~20% of the
  pilot, adjustable). If the sampled error rate exceeds a small threshold, we
  **tighten the gate and re-run** the auto-tier — the gate is calibrated against
  observed error, not assumed correct.
- Any `agent_auto` item can be promoted to `human_confirmed` (or corrected) at any
  time; the field records provenance, not a permanent verdict.

This bounds Sam's review load to the genuinely uncertain items (Tier 2) plus a
calibration sample, instead of every claim.

## 3. Record schema

Each record extends a **stale** gold-set entry (`stale: true` in
[test/gold/gold-set.json](../../test/gold/gold-set.json)), keyed by the same
identity the gold-set uses: `(fixture, sentenceSubstring)`.

```jsonc
{
  "fixture": "zumwalt-class_destroyer.wikitext",
  "sentenceSubstring": "will be ready to test the CPS in 2025",
  "expectedYear": 2025,

  "disposition": "confirmed_stale",      // coarse, 4-value (§3.1)
  "outcome": "event_occurred",           // granular, 6-value, nests under disposition (§3.1)

  "evidence": [
    {
      "sourceUrl": "https://www.navy.mil/...",
      "snapshot": "test/gold/sources/2026-06-21-navy-cps-test.md",
      "contentHashSha256": "…",          // copied from the snapshot's url-to-markdown frontmatter
      "verbatimQuote": "…exact span, passes evaluateQuote against the snapshot…",
      "supportsStaleness": true          // advisory: this span shows the claim is now outdated
    }
  ],

  "certification": "agent_auto",         // agent_auto | human_confirmed
  "verifiedAsOf": "2026-06-21"
}
```

`unverifiable` records carry `evidence: []` and are always `human_confirmed`.

### 3.1 Dispositions — record both, compare side by side

Per Sam's call, we record **both** a coarse and a granular disposition so we can
assess which granularity earns its keep before standardizing on one. The granular
`outcome` **strictly nests** inside the coarse `disposition` (an integrity test
enforces the nesting):

| `disposition` (4-value) | `outcome` (6-value) | meaning |
|---|---|---|
| `confirmed_stale` | `event_occurred` | the predicted thing happened; the claim should move to past tense + outcome |
| `confirmed_stale` | `slipped_still_pending` | the target date passed; the event has not happened as of the source date (the claim's *year* is wrong) |
| `superseded` | `event_cancelled` | the planned thing was cancelled / abandoned |
| `superseded` | `superseded` | the plan was replaced by a different plan / number / date |
| `still_current` | `still_current` | the claim is still accurate (e.g. a negative; the target genuinely remains future) |
| `unverifiable` | `unverifiable` | no reliable source establishes the current state |

The verbatim quote is the primary artifact; both disposition fields are
machine-comparable labels over it. No machine-authored prose is stored.

## 4. Grounding — archived snapshots, not live URLs

Each cited source is transcribed with the **`url-to-markdown` skill** (faithful
markdown + a `content_hash_sha256` in frontmatter; see
[docs/policy/sources/](../policy/sources/) for the existing convention) and the
snapshot is **committed**. This is load-bearing:

- The deterministic test suite **bans live network**; tests assert against the
  pinned snapshot, so they are **stable forever** even as the live web changes,
  paywalls, or dies.
- Current-state facts rot; a pinned + hashed capture is the only way a "this is the
  current state" fixture stays meaningful as evidence rather than as a dangling URL.

We use `url-to-markdown` (not a summarizing fetcher) for the reason recorded in the
pitfalls doc: summarizing fetchers paraphrase lossily and have fabricated content
in this project before. The quote must be transcribed faithfully because we then
assert it is *byte-present*.

## 5. Storage / layout

Mirrors the existing gold-set conventions (a JSON set + a companion README, like
`recall-set.json` / `recall-set-README.md`):

```
test/gold/answers.json                       # the records (§3), a flat array
test/gold/answers-README.md                  # protocol, scope, the spot-check audit log
test/gold/sources/<YYYY-MM-DD>-<slug>.md      # committed url-to-markdown snapshots
test/gold/sources/README.md                  # snapshot convention (mirrors docs/policy/sources/README.md)
```

## 6. Freshness / rot handling

- `verifiedAsOf` per record dates the verification.
- The pinned + hashed snapshot makes **offline tests immortal** — they test
  against the capture, not the live source, so they never flake on web drift.
- An **integrity test** asserts (a) every `verbatimQuote` is still byte-present in
  its referenced snapshot via `evaluateQuote`, (b) each snapshot's
  `contentHashSha256` matches the recorded hash, and (c) `outcome` nests under
  `disposition` per the §3.1 table. This catches accidental edits to either side —
  same spirit as the workerd NFC golden fixture.
- Real-world drift (a `currentState` that itself becomes outdated) only matters for
  the **online** eval, not the offline suite. Handled by re-running the build for
  records past a freshness window (e.g. annual re-confirm, or when flagged);
  `verifiedAsOf` makes the staleness of the ground truth itself tractable.

## 7. Build workflow

Per claim (independent, parallelizable across subagents):

1. Read the fixture context around `sentenceSubstring`; derive a **neutral** query
   (G9 — no leading/loaded phrasing).
2. Brave search → candidate URLs; drop circular sources via `isCircularSource`.
3. Fetch candidates with the project's own fetcher; find a source that states the
   resolving fact.
4. Transcribe that source with `url-to-markdown`; **commit the snapshot**.
5. Extract the verbatim span; run `evaluateQuote` against the snapshot — **must
   pass** or the candidate is rejected.
6. Classify the tier (§2.2). `agent_auto` records are written directly;
   escalations go to a **review queue** (a markdown checklist for Sam) with the
   candidate evidence attached.
7. Record both dispositions (§3.1) + provenance.

After the build: Sam works the escalation queue and spot-checks a sample of the
auto-tier (§2.3).

## 8. What this enables

- **Offline (suite, deterministic):** the verify/extract path against snapshots —
  "given snapshot S and proposed quote Q, `evaluateQuote` matches and the pipeline
  emits the expected card" — plus the §6 corpus-integrity test.
- **Online (manual eval):** the full pipeline including **live search**, scored
  against *real* ground truth — upgrading the search evals from proxy (source
  composition) to faithful (verbatim recall of the current-state answer).

## 9. Scope and pilot staging

- **Scope:** all checkable-world-fact claims among the `stale: true` gold-set
  entries across the 68 fixtures. Pure detector-mechanics entries (det2/det3 false-
  positive probes that assert no world fact) are **skipped with a recorded reason**,
  not answered.
- **Pilot first (approved):** build **one article batch (~8–10 claims)** end to
  end, then Sam reviews the result *and* the auto/escalate calibration before the
  rest is green-lit. The pilot is the calibration instrument for §2.3.

---

## Appendix A — reasoning trail (why these choices)

This is a methodology artifact; per the project's thinking-documentation rules the
reasoning is captured as a first-class part of the doc.

### A.1 Decisions and their rationale

- **Agent-proposes / human-confirms, not agent-authors-truth.** The corpus is the
  yardstick everything downstream is measured against; an LLM silently inventing a
  "current state" would poison the measurement and violate the spirit of G8. The
  deterministic verbatim gate + conservative tiering keeps the human in the loop
  exactly where judgment is irreducible (relevance, authority, disposition) and
  removes them where a machine is *more* reliable (byte-presence).

- **Two-tier gate rather than "human reviews everything" or "agent does
  everything."** Reviewing all ~44+ claims by hand doesn't scale and wastes Sam's
  attention on slam-dunks (a `.mil` page whose quote literally states the resolved
  fact). Trusting the agent on everything reintroduces the fabrication risk the
  whole project is built to avoid. The gate bounds human effort to genuine
  uncertainty while keeping the auto-tier auditable and calibrated.

- **Conservative, objective-leaning auto-certify criteria + bias-to-escalate.**
  The "self-evident support" test can't be made fully deterministic — it's a
  relevance judgment. We make it *conservative and objective where we can* (host
  allowlist by type; single-contiguous-span requirement) and accept that residual
  judgment by pairing it with a Sam-audited spot-check that **calibrates** the
  gate against observed error. The asymmetry (cheap over-escalation vs. expensive
  silent corruption) sets the bias.

- **Archived snapshots over live URLs.** Non-negotiable given the no-live-network
  test rule and the fact that current-state facts rot. The byte-presence assertion
  is only meaningful against a frozen capture.

- **Record both dispositions.** Sam asked to assess the 4-value and 6-value sets
  side by side rather than commit up front. Recording both (with an enforced
  nesting invariant) costs almost nothing and lets the choice be made on real data:
  if the granular `outcome` rarely changes a decision, drop it; if it carries
  signal, promote it.

- **Reuse `isCircularSource` and `evaluateQuote` rather than reimplement.** The
  corpus must be verified by the *system under test's own* backstop, or it isn't a
  faithful fixture for that system. Defense-in-depth, not duplication.

### A.2 Considered and ruled out

- **A live-URL corpus (no snapshots).** Rejected: fails the offline-suite rule and
  rots silently; a green test today becomes a 404 next quarter with no signal.
- **Agent auto-certifies everything, Sam audits after.** Rejected as the *primary*
  model: it inverts the fail-closed bias. (We keep the audit, but as calibration of
  a conservative gate, not as the only guard.)
- **A single disposition field chosen now.** Rejected per Sam — premature; decide
  on data.
- **Free-text "current state" prose as the primary artifact.** Rejected: invites
  machine-authored summary (G1 risk) and is unverifiable. The verbatim quote is the
  artifact; dispositions are labels over it.
- **Storing the answer in the EvidenceCard shape directly.** Considered (maximizes
  reuse for pipeline e2e assertions) but deferred — the record is a superset
  (adds disposition + provenance + snapshot pin); the offline test can construct
  the expected card from the record rather than the record *being* a card.

### A.3 What I'm still uncertain about

- **The exact authority allowlist boundary.** "Major news agency" and "primary
  official org named in the claim" are clear at the center, fuzzy at the edge
  (is a trade-press outlet like a defense-industry journal Tier 1?). The pilot's
  spot-check is partly there to calibrate this; I expect to tighten the allowlist
  after seeing real escalation/auto splits.
- **Whether `slipped_still_pending` is reliably distinguishable from
  `unverifiable`.** "The date passed and it hasn't happened" can be hard to source
  positively (absence of evidence). These may collapse in practice — a thing the
  side-by-side disposition data should reveal.
- **Pilot batch selection.** Whether to pick the *easiest* article (clean .mil/.gov
  sourcing, to validate the happy path) or a *deliberately mixed* one (to exercise
  the escalation path). Leaning mixed, so the calibration sample is meaningful —
  but open to Sam's preference.

### A.4 What I'd add with more time

- A small `inter-rater` check: have a second agent independently propose answers
  for the pilot batch and diff against the first, as an additional calibration
  signal beyond Sam's spot-check.
- A `supersededBy` pointer on `superseded` records (the new plan/number), to make
  the corpus useful for "what changed" analysis, not just "is it stale."
