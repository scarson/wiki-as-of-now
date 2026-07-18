// ABOUTME: researchClaim — the pure, total orchestrator for the research pipeline. Applies cap ordering,
// ABOUTME: runs verifyProposal on survivors, and returns a discriminated-union outcome (no DB, no crypto, no audit).
import type { ResearchInput, ResearchProvider, EvidenceCard, ProviderUsage } from "./provider";
import { ProviderUnavailableError } from "./provider";
import type { DroppedProposal } from "./verify-proposal";
import { verifyProposal } from "./verify-proposal";
import { canonicalizeUrl } from "./canonicalize-url";
import type { SourceFetchResult } from "./source-fetch";

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

export const DEFAULT_MAX_PROPOSALS = 5;
export const DEFAULT_PER_HOST_CAP = 2;
export const DEFAULT_MAX_QUERIES = 8;       // G9 cheap sanity bound (count)
export const DEFAULT_MAX_QUERY_LEN = 256;   // G9 cheap sanity bound (length, code points)

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ResearchOutcome =
  | { status: "provider_unavailable" }
  | {
      status: "no_proposals" | "proposals_present";
      providerName: string;
      modelVersion: string;
      queries: string[];
      cards: EvidenceCard[];
      dispositions: DroppedProposal[];
      overCapCount: number;
      // OPTIONAL metered-spend figures forwarded straight from the provider (Phase 5 quota_ledger source).
      // The provider owns the figures; the pipeline does not compute them. The provider_unavailable arm
      // carries no usage (nothing ran to meter).
      usage?: ProviderUsage;
    };

export interface ResearchClaimDeps {
  provider: ResearchProvider;
  fetchSource: (url: string) => Promise<SourceFetchResult>;
  now: Date;                  // present for spec fidelity + Phase-9 pre-binding; the pure pipeline does NOT read it
  maxProposals?: number;      // default DEFAULT_MAX_PROPOSALS
  perHostCap?: number;        // default DEFAULT_PER_HOST_CAP
}

// ---------------------------------------------------------------------------
// G9 query bound — pure string ops, no LLM
// ---------------------------------------------------------------------------

/**
 * True when a query carries unfilled [placeholder] template residue (observed live: Gemma
 * emitted literal "[Authority]" queries) — bracketed tokens are never genuine retrieval terms.
 */
export function hasPlaceholderResidue(query: string): boolean {
  return /[[\]]/.test(query);
}

/**
 * True when a query contains a full sentence of the claim's surrounding passage — an
 * assertion lifted from the article that presupposes the answer, the same neutrality
 * violation as restating the claim (which the claim-echo rule covers). Keyword fragments
 * that merely borrow entity names from the passage do not contain a full sentence and pass.
 */
export function echoesContextSentence(query: string, surroundingText: string | undefined): boolean {
  if (surroundingText === undefined) return false;
  const collapseWs = (s: string): string => s.trim().replace(/\s+/g, " ");
  const qNorm = collapseWs(query);
  return surroundingText
    .split(/(?<=[.!?])\s+/)
    .some((sentence) => {
      const sNorm = collapseWs(sentence);
      return sNorm.length > 0 && qNorm.includes(sNorm);
    });
}

/**
 * Apply the G9 cheap sanity filter to the queries returned by the provider:
 * 1. Drop any query whose code-point length > DEFAULT_MAX_QUERY_LEN.
 * 2. Drop any query that echoes the full claimText (normalized comparison).
 * 3. Drop any query carrying [placeholder] template residue.
 * 4. Drop any query echoing a full sentence of the surrounding passage.
 * 5. Cap the count to DEFAULT_MAX_QUERIES (keep the first N survivors).
 */
function applyQueryBound(queries: string[], claimText: string, surroundingText?: string): string[] {
  // Collapse all whitespace runs to a single space so an internal-whitespace restatement
  // ("The  claim") still matches the claim. Used ONLY for the echo comparison; the kept
  // query retains its original form.
  const collapseWs = (s: string): string => s.trim().replace(/\s+/g, " ");
  const claimNorm = collapseWs(claimText);
  const filtered = queries.filter((q) => {
    if ([...q.trim()].length > DEFAULT_MAX_QUERY_LEN) return false;
    // Drop a query that RESTATES the full claim sentence — a query must be a neutral retrieval
    // term, not the claim restated. `includes` catches the exact-equal case AND "claim + extra
    // words"; keyword fragments of the claim are allowed (they do not contain the full sentence).
    // The length guard prevents an empty claimText (every string includes "") dropping everything.
    if (claimNorm.length > 0 && collapseWs(q).includes(claimNorm)) return false;
    if (hasPlaceholderResidue(q)) return false;
    if (echoesContextSentence(q, surroundingText)) return false;
    return true;
  });
  return filtered.slice(0, DEFAULT_MAX_QUERIES);
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

/**
 * Pure, total orchestrator for the research pipeline.
 *
 * Cap ordering (this exact order is the security spec — design §5 / decision D9):
 * 1. Truncate raw proposals to maxProposals FIRST (ceiling on raw array, before per-item processing)
 * 2. Classify each URL via canonicalizeUrl (pure, synchronous, non-fetching)
 * 3. Apply per-host cap on canonical host
 * 4. Fetch + verify survivors via verifyProposal
 *
 * Malformed URLs are COUNTED dispositions (never skipped), so garbage never evades maxProposals.
 * The partition invariant: cards.length + dispositions.length === truncated.length.
 */
export async function researchClaim(input: ResearchInput, deps: ResearchClaimDeps): Promise<ResearchOutcome> {
  const { provider, fetchSource } = deps;
  // `now` is present for spec fidelity and Phase-9 pre-binding; the pure pipeline does not read it.
  // Clamp the caps to non-negative integers (a degenerate caller config — 0, negative, NaN, Infinity —
  // must never produce nonsensical truncation or overCapCount, nor reach the impossible
  // `proposals_present`-with-empty-arrays state). Non-finite falls back to the default.
  const clampCap = (v: number | undefined, dflt: number): number =>
    v === undefined || !Number.isFinite(v) ? dflt : Math.max(0, Math.floor(v));
  const maxProposals = clampCap(deps.maxProposals, DEFAULT_MAX_PROPOSALS);
  const perHostCap = clampCap(deps.perHostCap, DEFAULT_PER_HOST_CAP);

  // -------------------------------------------------------------------------
  // Call the provider — only ProviderUnavailableError is caught; others propagate
  // -------------------------------------------------------------------------
  let res: Awaited<ReturnType<ResearchProvider["research"]>>;
  try {
    res = await provider.research(input);
  } catch (e) {
    if (e instanceof ProviderUnavailableError) {
      return { status: "provider_unavailable" };
    }
    throw e;
  }

  const { providerName, modelVersion, proposals: raw, queries, usage } = res;

  // -------------------------------------------------------------------------
  // G9 query bound
  // -------------------------------------------------------------------------
  const boundQueries = applyQueryBound(queries, input.claimText, input.surroundingText);

  // -------------------------------------------------------------------------
  // (1) HARD ceiling — truncate the raw array FIRST, before any per-item processing
  // -------------------------------------------------------------------------
  const truncated = raw.slice(0, maxProposals);
  const overCapCount = Math.max(0, raw.length - maxProposals);

  // -------------------------------------------------------------------------
  // Short-circuit: nothing to process (provider returned no proposals, OR maxProposals clamped
  // the working set to empty). Keyed on the POST-truncation set so the `proposals_present`
  // impossible-state (both arrays empty) is unreachable; overCapCount still records the remainder.
  // -------------------------------------------------------------------------
  if (truncated.length === 0) {
    return {
      status: "no_proposals",
      providerName,
      modelVersion,
      queries: boundQueries,
      cards: [],
      dispositions: [],
      overCapCount,
      usage,
    };
  }

  // -------------------------------------------------------------------------
  // (2–4) Per-proposal processing in cap order
  // -------------------------------------------------------------------------
  const perHostCount = new Map<string, number>();
  const cards: EvidenceCard[] = [];
  const dispositions: DroppedProposal[] = [];

  for (const p of truncated) {
    // (2) Canonicalize URL — pure, synchronous, non-fetching
    const c = canonicalizeUrl(p.url);
    if (!c.ok) {
      // COUNTED as a disposition; never fetched
      dispositions.push({ url: p.url, reason: "malformed_url" });
      continue;
    }

    // (3) Per-host cap on canonical host
    const n = perHostCount.get(c.host) ?? 0;
    if (n >= perHostCap) {
      dispositions.push({ url: p.url, reason: "capped" });
      continue;
    }
    perHostCount.set(c.host, n + 1);

    // (4) Fetch + verify (only survivors reach here)
    const r = await verifyProposal(p, { fetchSource });
    if ("verbatimQuote" in r) {
      cards.push(r);
    } else {
      dispositions.push(r);
    }
  }

  // -------------------------------------------------------------------------
  // Partition invariant — internal correctness check; should never fire
  // -------------------------------------------------------------------------
  if (cards.length + dispositions.length !== truncated.length) {
    throw new Error("partition invariant violated");
  }

  return {
    status: "proposals_present",
    providerName,
    modelVersion,
    queries: boundQueries,
    cards,
    dispositions,
    overCapCount,
    usage,
  };
}
