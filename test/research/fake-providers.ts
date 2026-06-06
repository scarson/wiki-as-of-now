// ABOUTME: Deterministic fake ResearchProvider implementations for use in tests.
// ABOUTME: No network, clock, or RNG — all outputs are fully determined by the inputs.
import type {
  ResearchProvider,
  ResearchInput,
  ProviderResearch,
  ProposedEvidence,
} from "../../src/research/provider";
import { ProviderUnavailableError } from "../../src/research/provider";

/**
 * Returns a provider that resolves with the given canned proposals.
 *
 * @param proposals - The proposals the fake will return.
 * @param opts.queries - Search queries to attribute; defaults to [].
 * @param opts.providerName - Provider name; defaults to "fake".
 * @param opts.modelVersion - Model version; defaults to "fake-provider/0".
 */
export function fakeProvider(
  proposals: ProposedEvidence[],
  opts?: { queries?: string[]; providerName?: string; modelVersion?: string }
): ResearchProvider {
  return {
    async research(_input: ResearchInput): Promise<ProviderResearch> {
      return {
        providerName: opts?.providerName ?? "fake",
        modelVersion: opts?.modelVersion ?? "fake-provider/0",
        proposals,
        queries: opts?.queries ?? [],
      };
    },
  };
}

/**
 * Returns a provider whose research() always rejects with ProviderUnavailableError.
 * Used to test pipeline behavior when the backend is unreachable.
 */
export function unavailableProvider(): ResearchProvider {
  return {
    async research(_input: ResearchInput): Promise<ProviderResearch> {
      throw new ProviderUnavailableError();
    },
  };
}

/**
 * Returns a provider that emits `n` proposals, each with a distinct https URL.
 * Designed for the maxProposals cap test; handles n=10_000.
 */
export function floodProvider(n: number): ResearchProvider {
  const proposals: ProposedEvidence[] = Array.from({ length: n }, (_, i) => ({
    url: `https://flood.example.com/item/${i}`,
    proposedQuote: `quote ${i}`,
    advisorySupport: true,
  }));
  return fakeProvider(proposals, { providerName: "flood", modelVersion: "fake-provider/0" });
}

/**
 * Returns a provider that emits `n` proposals all on the SAME canonical host.
 * All paths are distinct (e.g. /a0, /a1, …) so URL uniqueness is preserved,
 * but the host is always `https://example.com`. Used for the perHostCap test.
 */
export function sameHostProvider(n: number): ResearchProvider {
  const proposals: ProposedEvidence[] = Array.from({ length: n }, (_, i) => ({
    url: `https://example.com/a${i}`,
    proposedQuote: `quote ${i}`,
    advisorySupport: true,
  }));
  return fakeProvider(proposals, { providerName: "same-host", modelVersion: "fake-provider/0" });
}

/**
 * Returns a provider that emits `n` proposals spread across many subdomains of
 * a single registrable domain (e.g. a1.example.com, a2.example.com, …).
 * Documents the host-vs-eTLD+1 distinction: each proposal is on a different
 * hostname even though they share the registrable domain `example.com`.
 */
export function subdomainFanoutProvider(n: number): ResearchProvider {
  const proposals: ProposedEvidence[] = Array.from({ length: n }, (_, i) => ({
    url: `https://a${i}.example.com/`,
    proposedQuote: `quote ${i}`,
    advisorySupport: true,
  }));
  return fakeProvider(proposals, { providerName: "subdomain-fanout", modelVersion: "fake-provider/0" });
}

/**
 * Returns a provider that emits a mix of valid https URLs and problematic URLs:
 * - two well-formed https URLs (should pass URL validation)
 * - a non-URL string ("not a url")
 * - an http:// URL (non-https → should be rejected by the pipeline)
 * - a loopback address (https://127.0.0.1/ → should be blocked)
 *
 * Used for malformed_url and blocked-host disposition tests.
 */
export function malformedUrlProvider(): ResearchProvider {
  const proposals: ProposedEvidence[] = [
    { url: "https://valid.example.com/page1", proposedQuote: "valid quote 1", advisorySupport: true },
    { url: "https://valid.example.com/page2", proposedQuote: "valid quote 2", advisorySupport: false },
    { url: "not a url", proposedQuote: "bad quote", advisorySupport: false },
    { url: "http://insecure.example.com/", proposedQuote: "insecure quote", advisorySupport: false },
    { url: "https://127.0.0.1/", proposedQuote: "loopback quote", advisorySupport: false },
  ];
  return fakeProvider(proposals, { providerName: "malformed-url", modelVersion: "fake-provider/0" });
}
