// ABOUTME: Cross-module integration test — wires the REAL deterministic modules end-to-end.
// ABOUTME: Fakes only at the true edges: fetchImpl (network), provider (LLM), and in-memory DB.
import { describe, it, expect } from "vitest";
import { allowConsole } from "../setup/pristine";
import { fetchSourceText } from "../../src/research/source-fetch";
import type { FetchImpl } from "../../src/research/source-fetch";
import { researchClaim } from "../../src/research/pipeline";
import {
  handleResearchMessage,
  makeResearchPackStore,
  type ResearchMessage,
} from "../../src/queue/research-jobs";
import { makeAuditLog } from "../../src/db/audit-log";
import { getPack, computeClaimKey } from "../../src/db/research-packs";
import { upsertArticle } from "../../src/db/articles";
import { freshTestExecutor } from "../helpers/db";
import { fakeProvider } from "./fake-providers";
import type { ResearchInput } from "../../src/research/provider";

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const NEW_DATE = new Date("2026-06-06T00:00:00.000Z");
const PAGE_ID = 99;
const SOURCE_REVISION_ID = 500;

// ---------------------------------------------------------------------------
// Fake fetchImpl — keyed by URL, returns canned HTML as a real ReadableStream
// ---------------------------------------------------------------------------

function makeFetchImpl(pages: Record<string, string>): FetchImpl {
  return async (url: string, _init) => {
    const html = pages[url];
    if (html === undefined) {
      // Any URL not in the map gets a network error (reject)
      throw new Error(`fakeFetchImpl: no canned response for ${url}`);
    }
    const bytes = new TextEncoder().encode(html);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    return {
      status: 200,
      headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
      body: stream,
    };
  };
}

// ---------------------------------------------------------------------------
// Page HTML for the integration test
// ---------------------------------------------------------------------------

// The page includes: &nbsp; between "3" and "May", inline <b> around "site",
// a <script> that must be stripped, and a <style> that must be stripped.
const PAGE_A_HTML =
  "<html><head><title>T</title><style>.x{}</style></head>" +
  "<body><p>Lorem ipsum. NASA confirmed the launch on 3&nbsp;May 2024 at the <b>site</b>.</p>" +
  '<script>var leak="should not match";</script></body></html>';

// ---------------------------------------------------------------------------
// TASK A — Test 1: real HTML extraction + normalization produces a verified card
// ---------------------------------------------------------------------------

describe("integration — real fetchSourceText + researchClaim", () => {
  it("a quote present only after real HTML extraction + normalization becomes a verified card", async () => {
    allowConsole(); // fetchSourceText logs nothing expected; allow for the SSRF-blocked proposal

    const fetchImpl = makeFetchImpl({
      "https://example.com/a": PAGE_A_HTML,
    });

    // REAL fetchSource bound to our fake fetchImpl
    const fetchSource = (url: string) => fetchSourceText(url, { fetchImpl, now: NEW_DATE });

    const proposals = [
      // (a) Should MATCH: &nbsp; folds to space, <b> is inline so "the site" is contiguous, <script> stripped
      {
        url: "https://example.com/a",
        proposedQuote: "NASA confirmed the launch on 3 May 2024 at the site.",
        advisorySupport: true,
      },
      // (b) Should DROP quote_not_found: fabricated sentence never on the page
      {
        url: "https://example.com/a",
        proposedQuote: "a fabricated sentence never on the page",
        advisorySupport: false,
      },
      // (c) Should DROP malformed_url: loopback address is SSRF-blocked, never fetched
      {
        url: "https://127.0.0.1/x",
        proposedQuote: "loopback quote here",
        advisorySupport: false,
      },
    ];

    const provider = fakeProvider(proposals);

    const input: ResearchInput = {
      claimText: "NASA confirmed the launch on 3 May 2024.",
      sectionHeading: "Mission",
      year: 2024,
      sourceRevisionId: SOURCE_REVISION_ID,
    };

    // REAL researchClaim — internally calls REAL verifyProposal + REAL evaluateQuote
    const outcome = await researchClaim(input, {
      provider,
      fetchSource,
      now: NEW_DATE,
      maxProposals: 5,
      perHostCap: 5,
    });

    // Status must be proposals_present
    expect(outcome.status).toBe("proposals_present");
    if (outcome.status !== "proposals_present") return;

    // Exactly ONE card — the first proposal matched
    expect(outcome.cards).toHaveLength(1);
    // The verbatimQuote is the RAW proposed quote (with ASCII space), not normalized
    expect(outcome.cards[0].verbatimQuote).toBe("NASA confirmed the launch on 3 May 2024 at the site.");

    // Partition invariant: 1 card + 2 dispositions === 3 truncated
    expect(outcome.cards.length + outcome.dispositions.length).toBe(3);

    // Dispositions include quote_not_found (fabricated) and malformed_url (loopback)
    const reasons = outcome.dispositions.map((d) => d.reason);
    expect(reasons).toContain("quote_not_found");
    expect(reasons).toContain("malformed_url");

    // Script text must NOT appear in any card (script stripped by real extractor)
    const cardJson = JSON.stringify(outcome.cards);
    expect(cardJson).not.toContain("leak");
    expect(cardJson).not.toContain("should not match");
  });
});

// ---------------------------------------------------------------------------
// TASK A — Test 2: the same outcome flows through the real consumer into a
// persisted pack + codes-only audit
// ---------------------------------------------------------------------------

describe("integration — real handleResearchMessage end-to-end chain", () => {
  it("fetchImpl -> fetchSourceText -> verifyProposal -> evaluateQuote -> researchClaim -> handleResearchMessage -> packStore/audit", async () => {
    allowConsole();

    const fetchImpl = makeFetchImpl({
      "https://example.com/a": PAGE_A_HTML,
    });

    // REAL fetchSource bound to our fake fetchImpl
    const fetchSource = (url: string) => fetchSourceText(url, { fetchImpl, now: NEW_DATE });

    const proposals = [
      {
        url: "https://example.com/a",
        proposedQuote: "NASA confirmed the launch on 3 May 2024 at the site.",
        advisorySupport: true,
      },
      {
        url: "https://example.com/a",
        proposedQuote: "a fabricated sentence never on the page",
        advisorySupport: false,
      },
      {
        url: "https://127.0.0.1/x",
        proposedQuote: "loopback quote here",
        advisorySupport: false,
      },
    ];

    const provider = fakeProvider(proposals);

    const exec = freshTestExecutor();
    // Seed the articles row so the FK constraint on research_packs is satisfied
    await upsertArticle(exec, {
      pageId: PAGE_ID,
      title: "Integration Test Article",
      revisionId: SOURCE_REVISION_ID,
      fetchedAt: NEW_DATE.toISOString(),
    });

    const packStore = makeResearchPackStore(exec);
    const audit = makeAuditLog(exec);

    const input: ResearchInput = {
      claimText: "NASA confirmed the launch on 3 May 2024.",
      sectionHeading: "Mission",
      year: 2024,
      sourceRevisionId: SOURCE_REVISION_ID,
    };

    const claimKey = await computeClaimKey(PAGE_ID, input.sectionHeading, input.claimText, input.year);

    const msg: ResearchMessage = {
      claimKey,
      pageId: PAGE_ID,
      sourceRevisionId: SOURCE_REVISION_ID,
      input,
    };

    // handleResearchMessage with a REAL researchClaim pre-bound to REAL fetchSource
    await handleResearchMessage(msg, {
      researchClaim: (i) =>
        researchClaim(i, {
          provider,
          fetchSource,
          now: NEW_DATE,
          maxProposals: 5,
          perHostCap: 5,
        }),
      packStore,
      audit,
      now: NEW_DATE,
    });

    // --- Pack assertions ---
    const packResult = await getPack(exec, claimKey, SOURCE_REVISION_ID);
    expect(packResult.state).toBe("found");
    if (packResult.state !== "found") return;

    expect(packResult.pack.status).toBe("proposals_present");
    expect(packResult.pack.cards).toHaveLength(1);
    expect(packResult.pack.cards[0].verbatimQuote).toBe(
      "NASA confirmed the launch on 3 May 2024 at the site."
    );

    // --- Audit assertions ---
    const rows = await audit.read();
    const completedRows = rows.filter((r) => r.eventType === "research.completed");
    expect(completedRows).toHaveLength(1);
    expect(completedRows[0].actor).toBe("system");

    // Sentinel-style: the audit payload JSON must NOT contain the card's quote text or URL (codes only)
    const auditPayloadJson = JSON.stringify(completedRows[0].payload);
    expect(auditPayloadJson).not.toContain("NASA confirmed the launch");
    expect(auditPayloadJson).not.toContain("example.com/a");
  });
});
