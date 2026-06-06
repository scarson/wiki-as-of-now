// ABOUTME: Tests for researchClaim — the pure orchestrator that applies cap ordering, verifies proposals,
// ABOUTME: and returns a discriminated-union outcome. Covers security boundaries G14/G15 and partition invariant.
import { describe, it, expect } from "vitest";
import { armDeterminismTraps } from "../helpers/determinism";
import {
  researchClaim,
  DEFAULT_MAX_PROPOSALS,
  DEFAULT_PER_HOST_CAP,
  DEFAULT_MAX_QUERIES,
  DEFAULT_MAX_QUERY_LEN,
} from "../../src/research/pipeline";
import type { SourceFetchResult, UntrustedSourceText, SourceFetchFailureReason } from "../../src/research/source-fetch";
import type { ResearchInput } from "../../src/research/provider";
import {
  fakeProvider,
  unavailableProvider,
  floodProvider,
  sameHostProvider,
  malformedUrlProvider,
} from "./fake-providers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CLAIM: ResearchInput = {
  claimText: "The population of France was 67 million in 2020.",
  sectionHeading: "Demographics",
  year: 2020,
  sourceRevisionId: 42,
};

const NOW = new Date("2024-01-01T00:00:00Z");

/** Brand a string as UntrustedSourceText for the stub fetchSource. */
const trusted = (s: string): UntrustedSourceText => s as unknown as UntrustedSourceText;

/**
 * A fetchSource stub that returns page text containing the proposedQuote for
 * URLs that contain "/good/" and a typed failure for URLs containing "/bad/".
 * Counts calls so tests can assert exact fetch counts.
 */
function makeStub(goodText?: string) {
  let calls = 0;
  const stub = async (url: string): Promise<SourceFetchResult> => {
    calls++;
    if (url.includes("/bad/")) {
      return { ok: false, reason: "network_error" as SourceFetchFailureReason };
    }
    return { ok: true, text: trusted(goodText ?? "default page text") };
  };
  return { stub, getCalls: () => calls };
}

/**
 * A fetchSource stub that always returns the provided text (or a default).
 * Used when we need to match proposedQuotes embedded in the page.
 */
function makePageStub(textForUrl: (url: string) => string) {
  let calls = 0;
  const stub = async (url: string): Promise<SourceFetchResult> => {
    calls++;
    return { ok: true, text: trusted(textForUrl(url)) };
  };
  return { stub, getCalls: () => calls };
}

/** Like makePageStub but can also return failures for specific URLs. */
function makeConditionalStub(decide: (url: string) => SourceFetchResult | { ok: true; text: string }) {
  let calls = 0;
  const stub = async (url: string): Promise<SourceFetchResult> => {
    calls++;
    const r = decide(url);
    if (r.ok) {
      return { ok: true, text: trusted(r.text) };
    }
    return r;
  };
  return { stub, getCalls: () => calls };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("researchClaim pipeline", () => {
  armDeterminismTraps();

  // -------------------------------------------------------------------------
  // Test 1: maxProposals cap + fetchCalls
  // -------------------------------------------------------------------------
  it("caps raw proposals at maxProposals and fetches EXACTLY maxProposals URLs (not all raw)", async () => {
    // floodProvider(50) — 50 proposals all on distinct hosts
    // maxProposals: 5 → only 5 should be fetched
    const provider = floodProvider(50);
    // The flood proposals have proposedQuote "quote N" (7 chars: too short for MIN_QUOTE_LEN=8).
    // For this test we only care about fetch counts. The proposals will be verified but dropped
    // (quote_too_short), which is fine — the partition + overCapCount are what we assert.
    const { stub, getCalls } = makePageStub((url) => {
      // Extract index from URL like https://flood.example.com/item/3
      const m = url.match(/\/item\/(\d+)$/);
      if (!m) return "no match";
      return `quote ${m[1]}`; // page contains the proposedQuote
    });

    // perHostCap must be >= 5 here: floodProvider puts all proposals on flood.example.com,
    // so with the default perHostCap=2 only 2 would be fetched. The spec test checks that
    // exactly maxProposals fetches occur when the per-host cap is not the binding constraint.
    const outcome = await researchClaim(CLAIM, {
      provider,
      fetchSource: stub,
      now: NOW,
      maxProposals: 5,
      perHostCap: 50, // not the binding constraint for this test
    });

    expect(outcome.status).toBe("proposals_present");
    if (outcome.status !== "proposals_present") return; // narrow

    // Exactly 5 fetches — NOT 50 (the cap truncates BEFORE fetching)
    expect(getCalls()).toBe(5);

    // overCapCount reflects the full surplus
    expect(outcome.overCapCount).toBe(45);

    // Partition invariant
    expect(outcome.cards.length + outcome.dispositions.length).toBe(5);
  });

  // -------------------------------------------------------------------------
  // Test 2: perHostCap on the same host
  // -------------------------------------------------------------------------
  it("caps per-host proposals: first perHostCap fetched, rest dispositioned as 'capped'", async () => {
    // sameHostProvider(5) — 5 proposals all on example.com
    // perHostCap: 2 → 2 fetched, 3 dropped as capped
    const provider = sameHostProvider(5);

    // Build page text that contains "quote N" (at least 8 chars for MIN_QUOTE_LEN)
    // sameHostProvider uses proposedQuote "quote 0", "quote 1", etc. (7 chars — too short)
    // We need to make the quotes at least 8 code points. Since we can't change the fake,
    // we'll verify fetches are exactly 2 regardless of whether the quote matches.
    const { stub, getCalls } = makePageStub((_url) => "some page text that does not matter for cap test");

    const outcome = await researchClaim(CLAIM, {
      provider,
      fetchSource: stub,
      now: NOW,
      maxProposals: 5,
      perHostCap: 2,
    });

    expect(outcome.status).toBe("proposals_present");
    if (outcome.status !== "proposals_present") return;

    // Exactly 2 fetches (not 5)
    expect(getCalls()).toBe(2);

    // 3 dispositions with reason "capped"
    const capped = outcome.dispositions.filter((d) => d.reason === "capped");
    expect(capped).toHaveLength(3);

    // Partition: 2 fetched (→ dispositioned as quote_too_short/not_found) + 3 capped = 5
    expect(outcome.cards.length + outcome.dispositions.length).toBe(5);
  });

  // -------------------------------------------------------------------------
  // Test 3: malformed URLs counted as dispositions, never fetched
  // -------------------------------------------------------------------------
  it("counts malformed/blocked URLs as dispositions without fetching them", async () => {
    // malformedUrlProvider() returns 5 proposals:
    //   [0] https://valid.example.com/page1  — valid
    //   [1] https://valid.example.com/page2  — valid (same host — second per-host slot)
    //   [2] "not a url"                       — malformed_url
    //   [3] http://insecure.example.com/      — malformed_url (non-https)
    //   [4] https://127.0.0.1/               — malformed_url (blocked host)
    const provider = malformedUrlProvider();

    // Make the two valid proposals' pages contain their proposedQuote so they
    // become EvidenceCards (or at least get fetched). Quotes are "valid quote 1"
    // (13 chars ≥ MIN_QUOTE_LEN=8) and "valid quote 2" (13 chars).
    const { stub, getCalls } = makePageStub((url) => {
      if (url.includes("page1")) return "valid quote 1 appears here";
      if (url.includes("page2")) return "valid quote 2 appears here";
      return "generic content";
    });

    const outcome = await researchClaim(CLAIM, {
      provider,
      fetchSource: stub,
      now: NOW,
      maxProposals: DEFAULT_MAX_PROPOSALS, // 5 — all proposals included
    });

    expect(outcome.status).toBe("proposals_present");
    if (outcome.status !== "proposals_present") return;

    // Only the 2 valid URLs should be fetched (malformed ones never reach fetchSource)
    expect(getCalls()).toBe(2);

    // Malformed dispositions: "not a url", http, 127.0.0.1 → 3 of reason malformed_url
    const malformed = outcome.dispositions.filter((d) => d.reason === "malformed_url");
    expect(malformed).toHaveLength(3);

    // The 2 valid URLs should produce EvidenceCards
    expect(outcome.cards).toHaveLength(2);

    // Partition: 2 cards + 3 malformed_url dispositions = 5 (truncated.length = min(5, 5) = 5)
    expect(outcome.cards.length + outcome.dispositions.length).toBe(5);
  });

  // -------------------------------------------------------------------------
  // Test 4: partition invariant in every outcome branch
  // -------------------------------------------------------------------------
  describe("partition invariant holds in every outcome branch", () => {
    it("no_proposals: cards + dispositions = 0", async () => {
      const provider = fakeProvider([]);
      const { stub } = makeStub();
      const outcome = await researchClaim(CLAIM, { provider, fetchSource: stub, now: NOW });
      expect(outcome.status).toBe("no_proposals");
      if (outcome.status !== "no_proposals") return;
      expect(outcome.cards.length + outcome.dispositions.length).toBe(0);
      expect(outcome.overCapCount).toBe(0);
    });

    it("proposals_present with mixed cards/dispositions: partition holds", async () => {
      // 3 proposals: first 2 produce cards, last fails fetch
      const proposals = [
        { url: "https://a.com/1", proposedQuote: "confirmed on 3 May 2024", advisorySupport: true },
        { url: "https://b.com/2", proposedQuote: "published in January 2023", advisorySupport: false },
        { url: "https://c.com/3", proposedQuote: "launched October 15 2022", advisorySupport: true },
      ];
      const provider = fakeProvider(proposals);
      const { stub } = makeConditionalStub((url) => {
        if (url.includes("a.com/1")) return { ok: true, text: "confirmed on 3 May 2024 is accurate" };
        if (url.includes("b.com/2")) return { ok: true, text: "published in January 2023 and verified" };
        // c.com/3 fetch fails
        return { ok: false, reason: "network_error" as SourceFetchFailureReason };
      });

      const outcome = await researchClaim(CLAIM, { provider, fetchSource: stub, now: NOW });
      expect(outcome.status).toBe("proposals_present");
      if (outcome.status !== "proposals_present") return;

      // 2 cards + 1 disposition = 3 (truncated.length = 3 ≤ DEFAULT_MAX_PROPOSALS)
      expect(outcome.cards.length + outcome.dispositions.length).toBe(3);
      expect(outcome.cards).toHaveLength(2);
      expect(outcome.dispositions).toHaveLength(1);
      expect(outcome.overCapCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Test 5: status derivation
  // -------------------------------------------------------------------------
  describe("status derivation", () => {
    it("returns provider_unavailable when the provider rejects with ProviderUnavailableError", async () => {
      const provider = unavailableProvider();
      const { stub } = makeStub();
      const outcome = await researchClaim(CLAIM, { provider, fetchSource: stub, now: NOW });
      expect(outcome.status).toBe("provider_unavailable");
    });

    it("returns no_proposals when provider returns empty proposals array", async () => {
      const provider = fakeProvider([]);
      const { stub } = makeStub();
      const outcome = await researchClaim(CLAIM, { provider, fetchSource: stub, now: NOW });
      expect(outcome.status).toBe("no_proposals");
      if (outcome.status !== "no_proposals") return;
      expect(outcome.cards).toHaveLength(0);
      expect(outcome.dispositions).toHaveLength(0);
      expect(outcome.overCapCount).toBe(0);
    });

    it("returns proposals_present when provider returns at least one valid proposal", async () => {
      const proposals = [
        { url: "https://example.com/source", proposedQuote: "on 3 May 2024 the event occurred", advisorySupport: true },
      ];
      const provider = fakeProvider(proposals);
      const { stub } = makePageStub((_url) => "on 3 May 2024 the event occurred in a report");
      const outcome = await researchClaim(CLAIM, { provider, fetchSource: stub, now: NOW });
      expect(outcome.status).toBe("proposals_present");
    });
  });

  // -------------------------------------------------------------------------
  // Test 6: discriminated union — impossible states
  // -------------------------------------------------------------------------
  describe("discriminated union impossible states", () => {
    it("provider_unavailable outcome has NO cards, dispositions, or queries properties", async () => {
      const provider = unavailableProvider();
      const { stub } = makeStub();
      const outcome = await researchClaim(CLAIM, { provider, fetchSource: stub, now: NOW });
      expect(outcome.status).toBe("provider_unavailable");
      expect("cards" in outcome).toBe(false);
      expect("dispositions" in outcome).toBe(false);
      expect("queries" in outcome).toBe(false);
    });

    it("proposals_present outcome with verified cards is not both-arrays-empty", async () => {
      const proposals = [
        { url: "https://example.com/page", proposedQuote: "a reliable source said so", advisorySupport: true },
      ];
      const provider = fakeProvider(proposals);
      const { stub } = makePageStub((_url) => "a reliable source said so in the article");
      const outcome = await researchClaim(CLAIM, { provider, fetchSource: stub, now: NOW });
      expect(outcome.status).toBe("proposals_present");
      if (outcome.status !== "proposals_present") return;
      // At least one entry (cards or dispositions) must be non-empty
      expect(outcome.cards.length + outcome.dispositions.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Test 7: G9 query bound
  // -------------------------------------------------------------------------
  it("applies G9 query bound: drops echo of claimText, drops over-length queries, caps at DEFAULT_MAX_QUERIES", async () => {
    const claimText = CLAIM.claimText; // "The population of France was 67 million in 2020."

    // Build 23 queries: 1 echo, 1 over-long, 20 good short ones + 1 extra
    const echoQuery = claimText;
    const overLongQuery = "a".repeat(DEFAULT_MAX_QUERY_LEN + 1);
    const goodQueries: string[] = Array.from({ length: 20 }, (_, i) => `France population query ${i + 1}`);
    const allQueries = [echoQuery, overLongQuery, ...goodQueries];
    // allQueries has 22 items; after dropping echo + over-long = 20 good ones → cap to DEFAULT_MAX_QUERIES (8)

    const provider = fakeProvider([], { queries: allQueries });
    const { stub } = makeStub();
    const outcome = await researchClaim(CLAIM, { provider, fetchSource: stub, now: NOW });

    expect(outcome.status).toBe("no_proposals");
    if (outcome.status !== "no_proposals") return;

    // Echo and over-long must be excluded
    expect(outcome.queries).not.toContain(echoQuery);
    expect(outcome.queries).not.toContain(overLongQuery);

    // Count must be ≤ DEFAULT_MAX_QUERIES
    expect(outcome.queries.length).toBeLessThanOrEqual(DEFAULT_MAX_QUERIES);

    // All remaining queries should be from goodQueries
    for (const q of outcome.queries) {
      expect(goodQueries).toContain(q);
    }
  });

  // -------------------------------------------------------------------------
  // Test 8: totality — never throws on adversarial provider/fetch output
  // -------------------------------------------------------------------------
  describe("totality — pipeline never throws", () => {
    it("does not throw on flood provider (50 proposals with maxProposals:5)", async () => {
      const provider = floodProvider(50);
      const { stub } = makePageStub((_url) => "generic page text content here");
      await expect(
        researchClaim(CLAIM, { provider, fetchSource: stub, now: NOW, maxProposals: 5 })
      ).resolves.toBeDefined();
    });

    it("does not throw on malformed URL provider", async () => {
      const provider = malformedUrlProvider();
      const { stub } = makeStub("valid quote 1 appears here valid quote 2 appears here");
      await expect(
        researchClaim(CLAIM, { provider, fetchSource: stub, now: NOW })
      ).resolves.toBeDefined();
    });

    it("does not throw on sameHost provider with tight perHostCap", async () => {
      const provider = sameHostProvider(10);
      const { stub } = makeStub();
      await expect(
        researchClaim(CLAIM, { provider, fetchSource: stub, now: NOW, perHostCap: 1 })
      ).resolves.toBeDefined();
    });

    it("does not throw when fetchSource returns typed failures for some URLs", async () => {
      const proposals = [
        { url: "https://good.example.com/", proposedQuote: "confirmed on 3 May 2024", advisorySupport: true },
        { url: "https://bad.example.com/",  proposedQuote: "another valid source text", advisorySupport: false },
        { url: "https://good2.example.com/", proposedQuote: "the event happened in 2023", advisorySupport: true },
      ];
      const provider = fakeProvider(proposals);
      const { stub } = makeConditionalStub((url) => {
        if (url.includes("bad.example.com")) return { ok: false, reason: "timeout" as SourceFetchFailureReason };
        if (url.includes("good.example.com") && !url.includes("good2")) return { ok: true, text: "confirmed on 3 May 2024 is here" };
        return { ok: true, text: "the event happened in 2023 reference" };
      });

      const outcome = await researchClaim(CLAIM, { provider, fetchSource: stub, now: NOW });
      expect(outcome.status).toBe("proposals_present");
      if (outcome.status !== "proposals_present") return;

      // The fetch failure for bad.example.com becomes a disposition — no throw
      const timeoutDrop = outcome.dispositions.find((d) => d.reason === "timeout");
      expect(timeoutDrop).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Test 9: repeatability (determinism)
  // -------------------------------------------------------------------------
  it("returns deep-equal output when called twice with the same input and stubs", async () => {
    // NOTE: We test same-input → same-output (repeatability).
    // We do NOT test shuffle-invariance. truncation (slice(0, maxProposals)) is order-dependent
    // by design — a shuffled input legitimately yields a different surviving set.
    // Deviation from spec §6 N4's "shuffled → order-stable" phrasing (which conflicts with
    // order-dependent truncation); recorded in the plan's Deviations.
    const proposals = [
      { url: "https://r1.example.com/", proposedQuote: "confirmed on 3 May 2024", advisorySupport: true },
      { url: "https://r2.example.com/", proposedQuote: "published in January 2023", advisorySupport: false },
      { url: "https://r3.example.com/", proposedQuote: "the data shows 99 percent accuracy", advisorySupport: true },
    ];
    const provider = fakeProvider(proposals);

    const makeRepeatableStub = () => {
      const stub = async (url: string): Promise<SourceFetchResult> => {
        if (url.includes("r1")) return { ok: true, text: trusted("confirmed on 3 May 2024 reference") };
        if (url.includes("r2")) return { ok: true, text: trusted("published in January 2023 source") };
        if (url.includes("r3")) return { ok: true, text: trusted("the data shows 99 percent accuracy here") };
        return { ok: false, reason: "network_error" as SourceFetchFailureReason };
      };
      return stub;
    };

    const outcome1 = await researchClaim(CLAIM, { provider, fetchSource: makeRepeatableStub(), now: NOW });
    const outcome2 = await researchClaim(CLAIM, { provider, fetchSource: makeRepeatableStub(), now: NOW });

    expect(outcome1).toEqual(outcome2);
  });

  // -------------------------------------------------------------------------
  // Default constants sanity check
  // -------------------------------------------------------------------------
  it("exports the correct default constants", () => {
    expect(DEFAULT_MAX_PROPOSALS).toBe(5);
    expect(DEFAULT_PER_HOST_CAP).toBe(2);
    expect(DEFAULT_MAX_QUERIES).toBe(8);
    expect(DEFAULT_MAX_QUERY_LEN).toBe(256);
  });
});
