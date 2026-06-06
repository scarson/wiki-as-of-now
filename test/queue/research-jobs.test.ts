// ABOUTME: Tests for the research-job queue consumer and producer (src/queue/research-jobs.ts).
// ABOUTME: Covers idempotency, terminal persistence, audit allowlist+sentinel (G13), retry signaling, malformed messages.
import { describe, it, expect, vi } from "vitest";
import {
  handleResearchMessage,
  enqueueResearch,
  makeResearchPackStore,
  type ResearchMessage,
  type ResearchConsumerDeps,
} from "../../src/queue/research-jobs";
import { makeAuditLog } from "../../src/db/audit-log";
import { computeClaimKey, getPack, packExists } from "../../src/db/research-packs";
import { upsertArticle } from "../../src/db/articles";
import { freshTestExecutor } from "../helpers/db";
import { allowConsole } from "../setup/pristine";
import type { ResearchOutcome } from "../../src/research/pipeline";
import type { EvidenceCard } from "../../src/research/provider";
import type { DroppedProposal } from "../../src/research/verify-proposal";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const PAGE_ID = 42;
const SOURCE_REVISION_ID = 100;
const FIXED_NOW = new Date("2026-06-06T12:00:00.000Z");

function makeInput(overrides: Partial<{
  claimText: string;
  sectionHeading: string;
  year: number;
  sourceRevisionId: number;
}> = {}) {
  return {
    claimText: "The fleet will reach full strength by 2025.",
    sectionHeading: "History",
    year: 2025,
    sourceRevisionId: SOURCE_REVISION_ID,
    ...overrides,
  };
}

function makeProposalsPresentOutcome(overrides: Partial<{
  cards: EvidenceCard[];
  dispositions: DroppedProposal[];
  overCapCount: number;
}> = {}): ResearchOutcome {
  return {
    status: "proposals_present",
    providerName: "fake-provider",
    modelVersion: "fake-provider/1.0",
    queries: ["query one", "query two"],
    cards: [
      {
        url: "https://example.com/source",
        verbatimQuote: "The fleet reached full strength by 2025.",
        advisorySupport: true,
      },
    ],
    dispositions: [
      { url: "https://example.com/other", reason: "quote_not_found" },
    ],
    overCapCount: 0,
    ...overrides,
  };
}

function makeNoProposalsOutcome(): ResearchOutcome {
  return {
    status: "no_proposals",
    providerName: "fake-provider",
    modelVersion: "fake-provider/1.0",
    queries: ["query one"],
    cards: [],
    dispositions: [],
    overCapCount: 0,
  };
}

// ---------------------------------------------------------------------------
// terminal — proposals_present persists + exactly one audit
// ---------------------------------------------------------------------------

describe("handleResearchMessage — proposals_present terminal", () => {
  it("persists the pack and emits exactly one research.completed audit row", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, { pageId: PAGE_ID, title: "Test Article", revisionId: SOURCE_REVISION_ID, fetchedAt: FIXED_NOW.toISOString() });

    const input = makeInput();
    const claimKey = await computeClaimKey(PAGE_ID, input.sectionHeading, input.claimText, input.year);
    const msg: ResearchMessage = { claimKey, pageId: PAGE_ID, sourceRevisionId: SOURCE_REVISION_ID, input };

    const outcome = makeProposalsPresentOutcome();
    const researchClaim = vi.fn().mockResolvedValue(outcome);
    const auditLog = makeAuditLog(exec);
    const packStore = makeResearchPackStore(exec);

    const deps: ResearchConsumerDeps = { researchClaim, packStore, audit: auditLog, now: FIXED_NOW };
    await handleResearchMessage(msg, deps);

    // Pack persisted
    const result = await getPack(exec, claimKey, SOURCE_REVISION_ID);
    expect(result.state).toBe("found");
    if (result.state !== "found") return;
    expect(result.pack.claimKey).toBe(claimKey);
    expect(result.pack.pageId).toBe(PAGE_ID);
    expect(result.pack.sourceRevisionId).toBe(SOURCE_REVISION_ID);
    expect(result.pack.status).toBe("proposals_present");
    expect(result.pack.evaluatedAt).toBe(FIXED_NOW.toISOString());
    // outcome is proposals_present (terminal) — narrowed assertion
    if (outcome.status !== "proposals_present") throw new Error("test setup error");
    expect(result.pack.cards).toEqual(outcome.cards);
    expect(result.pack.dispositions).toEqual(outcome.dispositions);

    // Exactly one audit row for research.completed
    const rows = await auditLog.read();
    const completedRows = rows.filter(r => r.eventType === "research.completed");
    expect(completedRows).toHaveLength(1);
    expect(completedRows[0].actor).toBe("system");
  });
});

// ---------------------------------------------------------------------------
// terminal — no_proposals also persists + audits
// ---------------------------------------------------------------------------

describe("handleResearchMessage — no_proposals terminal", () => {
  it("persists the pack and emits exactly one research.completed audit row", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, { pageId: PAGE_ID, title: "Test Article", revisionId: SOURCE_REVISION_ID, fetchedAt: FIXED_NOW.toISOString() });

    const input = makeInput();
    const claimKey = await computeClaimKey(PAGE_ID, input.sectionHeading, input.claimText, input.year);
    const msg: ResearchMessage = { claimKey, pageId: PAGE_ID, sourceRevisionId: SOURCE_REVISION_ID, input };

    const outcome = makeNoProposalsOutcome();
    const researchClaim = vi.fn().mockResolvedValue(outcome);
    const auditLog = makeAuditLog(exec);
    const packStore = makeResearchPackStore(exec);

    const deps: ResearchConsumerDeps = { researchClaim, packStore, audit: auditLog, now: FIXED_NOW };
    await handleResearchMessage(msg, deps);

    // Pack persisted with no_proposals status
    const result = await getPack(exec, claimKey, SOURCE_REVISION_ID);
    expect(result.state).toBe("found");
    if (result.state !== "found") return;
    expect(result.pack.status).toBe("no_proposals");
    expect(result.pack.cards).toEqual([]);

    // Exactly one audit row
    const rows = await auditLog.read();
    const completedRows = rows.filter(r => r.eventType === "research.completed");
    expect(completedRows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// AUDIT ALLOWLIST + SENTINEL (G13 compliance)
// ---------------------------------------------------------------------------

describe("handleResearchMessage — audit allowlist + sentinel (G13)", () => {
  it("audit payload keys are within the allowed set and contain no PII/content/sentinel", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, { pageId: PAGE_ID, title: "Test Article", revisionId: SOURCE_REVISION_ID, fetchedAt: FIXED_NOW.toISOString() });

    // Embed a sentinel in the claim text and in the outcome's card quote and URL.
    // The sentinel MUST NOT appear in any audit payload.
    const sentinel = `SENTINEL_LEAK_${Math.random().toString(36).slice(2).toUpperCase()}`;
    const input = makeInput({ claimText: `${sentinel} The fleet will reach full strength by 2025.` });
    const claimKey = await computeClaimKey(PAGE_ID, input.sectionHeading, input.claimText, input.year);
    const msg: ResearchMessage = { claimKey, pageId: PAGE_ID, sourceRevisionId: SOURCE_REVISION_ID, input };

    const outcome: ResearchOutcome = {
      status: "proposals_present",
      providerName: "fake-provider",
      modelVersion: "fake-provider/1.0",
      queries: [`${sentinel}-query`],
      cards: [
        {
          url: `https://${sentinel}.example.com/source`,
          verbatimQuote: `${sentinel} verbatim quote text here for evidence.`,
          advisorySupport: true,
        },
      ],
      dispositions: [{ url: `https://${sentinel}-dropped.example.com`, reason: "quote_not_found" }],
      overCapCount: 2,
    };

    const researchClaim = vi.fn().mockResolvedValue(outcome);
    const auditLog = makeAuditLog(exec);
    const packStore = makeResearchPackStore(exec);

    const deps: ResearchConsumerDeps = { researchClaim, packStore, audit: auditLog, now: FIXED_NOW };
    await handleResearchMessage(msg, deps);

    const rows = await auditLog.read();
    expect(rows.length).toBeGreaterThan(0);

    // ALLOWLIST per event type: EVERY audit payload this consumer writes must only have these keys
    // (so a future edit that adds a content-bearing field to ANY event type is caught).
    const allowedKeysByEvent: Record<string, Set<string>> = {
      "research.completed": new Set(["claimKey", "providerName", "modelVersion", "status", "cardCount", "overCapCount", "dispositionTally"]),
      "research.failed": new Set(["claimKey", "reason"]),
      "research.unavailable": new Set(["claimKey", "status"]),
    };
    for (const row of rows) {
      const allowed = allowedKeysByEvent[row.eventType];
      expect(allowed, `Unexpected audit eventType: "${row.eventType}"`).toBeDefined();
      if (!allowed) continue;
      const payload = row.payload as Record<string, unknown>;
      for (const key of Object.keys(payload)) {
        expect(allowed.has(key), `Unexpected audit key "${key}" on ${row.eventType}`).toBe(true);
      }
      if (row.eventType === "research.completed") {
        // Value type assertions (codes/ids/counts only)
        expect(typeof payload.claimKey).toBe("string");
        expect(typeof payload.providerName).toBe("string");
        expect(typeof payload.modelVersion).toBe("string");
        expect(["no_proposals", "proposals_present"]).toContain(payload.status);
        expect(typeof payload.cardCount).toBe("number");
        expect(typeof payload.overCapCount).toBe("number");
        expect(typeof payload.dispositionTally).toBe("object");
        expect(payload.dispositionTally !== null).toBe(true);
        // dispositionTally keys are reason codes, values are counts (numbers)
        for (const [, v] of Object.entries(payload.dispositionTally as Record<string, unknown>)) {
          expect(typeof v).toBe("number");
        }
      }
    }

    // SENTINEL: the sentinel must NOT appear in ANY audit payload
    const allPayloadsJson = JSON.stringify(rows.map(r => r.payload));
    expect(allPayloadsJson).not.toContain(sentinel);

    // The PACK may contain sentinel (that's fine — only the audit must not)
    const packResult = await getPack(exec, claimKey, SOURCE_REVISION_ID);
    expect(packResult.state).toBe("found");
  });

  it("dispositionTally is a count of dispositions by reason code", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, { pageId: PAGE_ID, title: "Test Article", revisionId: SOURCE_REVISION_ID, fetchedAt: FIXED_NOW.toISOString() });

    const input = makeInput();
    const claimKey = await computeClaimKey(PAGE_ID, input.sectionHeading, input.claimText, input.year);
    const msg: ResearchMessage = { claimKey, pageId: PAGE_ID, sourceRevisionId: SOURCE_REVISION_ID, input };

    const outcome: ResearchOutcome = {
      status: "proposals_present",
      providerName: "fake-provider",
      modelVersion: "fake-provider/1.0",
      queries: ["q1"],
      cards: [
        { url: "https://example.com/a", verbatimQuote: "Quote A from source A for this claim.", advisorySupport: true },
      ],
      dispositions: [
        { url: "https://example.com/b", reason: "quote_not_found" },
        { url: "https://example.com/c", reason: "quote_not_found" },
        { url: "https://example.com/d", reason: "capped" },
      ],
      overCapCount: 1,
    };

    const researchClaim = vi.fn().mockResolvedValue(outcome);
    const auditLog = makeAuditLog(exec);
    const packStore = makeResearchPackStore(exec);

    await handleResearchMessage(msg, { researchClaim, packStore, audit: auditLog, now: FIXED_NOW });

    const rows = await auditLog.read();
    const completed = rows.find(r => r.eventType === "research.completed");
    expect(completed).toBeDefined();
    const payload = completed!.payload as Record<string, unknown>;
    expect(payload.cardCount).toBe(1);
    expect(payload.overCapCount).toBe(1);
    expect(payload.dispositionTally).toEqual({ quote_not_found: 2, capped: 1 });
  });
});

// ---------------------------------------------------------------------------
// provider_unavailable — nothing persisted, handler THROWS (retry signal)
// ---------------------------------------------------------------------------

describe("handleResearchMessage — provider_unavailable", () => {
  it("persists nothing, throws for retry, and records a codes-only audit row", async () => {
    allowConsole(); // the handler may log on unavailable path (no stray console expected, but allow)
    const exec = freshTestExecutor();
    await upsertArticle(exec, { pageId: PAGE_ID, title: "Test Article", revisionId: SOURCE_REVISION_ID, fetchedAt: FIXED_NOW.toISOString() });

    const input = makeInput();
    const claimKey = await computeClaimKey(PAGE_ID, input.sectionHeading, input.claimText, input.year);
    const msg: ResearchMessage = { claimKey, pageId: PAGE_ID, sourceRevisionId: SOURCE_REVISION_ID, input };

    const researchClaim = vi.fn().mockResolvedValue({ status: "provider_unavailable" } as ResearchOutcome);
    const auditLog = makeAuditLog(exec);
    const packStore = makeResearchPackStore(exec);

    // Handler MUST throw (retry signal)
    await expect(handleResearchMessage(msg, { researchClaim, packStore, audit: auditLog, now: FIXED_NOW }))
      .rejects.toThrow();

    // NOTHING persisted in research_packs
    expect(await packExists(exec, claimKey, SOURCE_REVISION_ID)).toBe(false);

    // An audit row records it with codes only
    const rows = await auditLog.read();
    const unavailableRow = rows.find(r => r.eventType === "research.unavailable");
    expect(unavailableRow).toBeDefined();
    const payload = unavailableRow!.payload as Record<string, unknown>;
    expect(payload.claimKey).toBe(claimKey);
    expect(payload.status).toBe("provider_unavailable");

    // A redelivery can still re-attempt (no blocking row)
    await expect(handleResearchMessage(msg, { researchClaim, packStore, audit: auditLog, now: FIXED_NOW }))
      .rejects.toThrow();
    expect(await packExists(exec, claimKey, SOURCE_REVISION_ID)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Containment — unexpected error from researchClaim
// ---------------------------------------------------------------------------

describe("handleResearchMessage — unexpected error containment", () => {
  it("unexpected throw from researchClaim → research.failed audit (codes only) + handler rejects", async () => {
    allowConsole();
    const exec = freshTestExecutor();
    await upsertArticle(exec, { pageId: PAGE_ID, title: "Test Article", revisionId: SOURCE_REVISION_ID, fetchedAt: FIXED_NOW.toISOString() });

    const input = makeInput();
    const claimKey = await computeClaimKey(PAGE_ID, input.sectionHeading, input.claimText, input.year);
    const msg: ResearchMessage = { claimKey, pageId: PAGE_ID, sourceRevisionId: SOURCE_REVISION_ID, input };

    const SECRET_ERROR_TEXT = "database_connection_failure_SUPERSECRET";
    const researchClaim = vi.fn().mockRejectedValue(new Error(SECRET_ERROR_TEXT));
    const auditLog = makeAuditLog(exec);
    const packStore = makeResearchPackStore(exec);

    // Handler MUST reject (retry)
    await expect(handleResearchMessage(msg, { researchClaim, packStore, audit: auditLog, now: FIXED_NOW }))
      .rejects.toThrow();

    // Audit row is codes-only — must NOT contain the raw error message
    const rows = await auditLog.read();
    const failedRow = rows.find(r => r.eventType === "research.failed");
    expect(failedRow).toBeDefined();
    const payload = failedRow!.payload as Record<string, unknown>;
    expect(payload.claimKey).toBe(claimKey);
    expect(payload.reason).toBe("unexpected_error");
    // The secret error text must NOT appear in the audit payload
    expect(JSON.stringify(payload)).not.toContain(SECRET_ERROR_TEXT);
  });

  it("malformed message (missing input) → handler RESOLVES (ack) + research.failed with malformed_message", async () => {
    allowConsole();
    const exec = freshTestExecutor();
    const auditLog = makeAuditLog(exec);
    const packStore = makeResearchPackStore(exec);
    const researchClaim = vi.fn();

    // Malformed: missing input
    const badMsg = { claimKey: "some-key", pageId: PAGE_ID, sourceRevisionId: SOURCE_REVISION_ID } as unknown as ResearchMessage;
    // Handler MUST resolve (ack permanently-bad input, do NOT retry)
    await expect(handleResearchMessage(badMsg, { researchClaim, packStore, audit: auditLog, now: FIXED_NOW }))
      .resolves.toBeUndefined();

    expect(researchClaim).not.toHaveBeenCalled();
    const rows = await auditLog.read();
    const failedRow = rows.find(r => r.eventType === "research.failed");
    expect(failedRow).toBeDefined();
    const payload = failedRow!.payload as Record<string, unknown>;
    expect(payload.reason).toBe("malformed_message");
  });

  it("malformed message (empty claimKey) → handler RESOLVES (ack) + research.failed with malformed_message", async () => {
    allowConsole();
    const exec = freshTestExecutor();
    const auditLog = makeAuditLog(exec);
    const packStore = makeResearchPackStore(exec);
    const researchClaim = vi.fn();

    const input = makeInput();
    const badMsg: ResearchMessage = { claimKey: "", pageId: PAGE_ID, sourceRevisionId: SOURCE_REVISION_ID, input };
    await expect(handleResearchMessage(badMsg, { researchClaim, packStore, audit: auditLog, now: FIXED_NOW }))
      .resolves.toBeUndefined();

    expect(researchClaim).not.toHaveBeenCalled();
    const rows = await auditLog.read();
    const failedRow = rows.find(r => r.eventType === "research.failed");
    expect(failedRow).toBeDefined();
    expect((failedRow!.payload as Record<string, unknown>).reason).toBe("malformed_message");
  });

  it("malformed message does NOT echo a content-bearing claimKey into the audit (G13)", async () => {
    allowConsole();
    const exec = freshTestExecutor();
    const auditLog = makeAuditLog(exec);
    const packStore = makeResearchPackStore(exec);
    const researchClaim = vi.fn();

    // A crafted/corrupted message smuggling PII/content in claimKey, missing input → fails validation.
    const sentinel = `SENTINEL_LEAK_${Math.random().toString(36).slice(2).toUpperCase()}`;
    const badMsg = { claimKey: `${sentinel} John Doe SSN 123-45-6789`, pageId: PAGE_ID, sourceRevisionId: SOURCE_REVISION_ID } as unknown as ResearchMessage;
    await expect(handleResearchMessage(badMsg, { researchClaim, packStore, audit: auditLog, now: FIXED_NOW }))
      .resolves.toBeUndefined();

    expect(researchClaim).not.toHaveBeenCalled();
    const rows = await auditLog.read();
    // The raw (non-64-hex) claimKey must be replaced with a placeholder — the sentinel must NOT leak.
    expect(JSON.stringify(rows.map(r => r.payload))).not.toContain(sentinel);
    const failedRow = rows.find(r => r.eventType === "research.failed");
    expect(failedRow).toBeDefined();
    expect((failedRow!.payload as Record<string, unknown>).claimKey).toBe("malformed");
    expect((failedRow!.payload as Record<string, unknown>).reason).toBe("malformed_message");
  });
});

// ---------------------------------------------------------------------------
// has() sequential-skip on the FULL PK
// ---------------------------------------------------------------------------

describe("handleResearchMessage — idempotency skip on full PK", () => {
  it("same (claimKey, sourceRevisionId) → researchClaim NOT called; different sourceRevisionId → IS called", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, {
      pageId: PAGE_ID,
      title: "Test Article",
      revisionId: SOURCE_REVISION_ID,
      fetchedAt: FIXED_NOW.toISOString(),
    });
    // Also upsert the article at rev R+1 so the FK succeeds for the second message
    const REV2 = SOURCE_REVISION_ID + 1;
    await upsertArticle(exec, {
      pageId: PAGE_ID,
      title: "Test Article",
      revisionId: REV2,
      fetchedAt: FIXED_NOW.toISOString(),
    });

    const input = makeInput();
    const claimKey = await computeClaimKey(PAGE_ID, input.sectionHeading, input.claimText, input.year);

    const outcome = makeProposalsPresentOutcome();
    const researchClaim = vi.fn().mockResolvedValue(outcome);
    const auditLog = makeAuditLog(exec);
    const packStore = makeResearchPackStore(exec);

    const deps: ResearchConsumerDeps = { researchClaim, packStore, audit: auditLog, now: FIXED_NOW };

    const msg1: ResearchMessage = { claimKey, pageId: PAGE_ID, sourceRevisionId: SOURCE_REVISION_ID, input };

    // First call — processes and persists
    await handleResearchMessage(msg1, deps);
    expect(researchClaim).toHaveBeenCalledTimes(1);

    // Second call with SAME (claimKey, sourceRevisionId) → SKIP
    await handleResearchMessage(msg1, deps);
    expect(researchClaim).toHaveBeenCalledTimes(1); // still 1 — skipped

    // Third call with DIFFERENT sourceRevisionId → NOT skipped
    const input2 = { ...input, sourceRevisionId: REV2 };
    const msg2: ResearchMessage = { claimKey, pageId: PAGE_ID, sourceRevisionId: REV2, input: input2 };
    await handleResearchMessage(msg2, deps);
    expect(researchClaim).toHaveBeenCalledTimes(2); // called again for new revision

    // Both packs exist
    expect(await packExists(exec, claimKey, SOURCE_REVISION_ID)).toBe(true);
    expect(await packExists(exec, claimKey, REV2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Concurrent double-write (sequential simulation per testing-pitfalls §5)
// ---------------------------------------------------------------------------

describe("handleResearchMessage — concurrent double-write", () => {
  it("two sequential invocations of the same message → pack singular and intact; duplicate audit row acceptable", async () => {
    const exec = freshTestExecutor();
    await upsertArticle(exec, { pageId: PAGE_ID, title: "Test Article", revisionId: SOURCE_REVISION_ID, fetchedAt: FIXED_NOW.toISOString() });

    const input = makeInput();
    const claimKey = await computeClaimKey(PAGE_ID, input.sectionHeading, input.claimText, input.year);
    const msg: ResearchMessage = { claimKey, pageId: PAGE_ID, sourceRevisionId: SOURCE_REVISION_ID, input };

    const outcome1 = makeProposalsPresentOutcome({
      cards: [{ url: "https://example.com/first", verbatimQuote: "First outcome verbatim quote.", advisorySupport: true }],
    });
    const outcome2 = makeProposalsPresentOutcome({
      cards: [{ url: "https://example.com/second", verbatimQuote: "Second outcome different verbatim.", advisorySupport: false }],
    });

    const auditLog = makeAuditLog(exec);

    // Simulate two concurrent consumers both reaching researchClaim before either persists.
    // We use a packStore that reports has()=false for both (race condition simulation).
    // Testing-pitfalls §5: sequence deterministically with await, never timing.
    let callCount = 0;
    const researchClaim = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve(callCount === 1 ? outcome1 : outcome2);
    });

    // Real packStore — insertIfAbsent is idempotent (ON CONFLICT DO NOTHING)
    const packStore = makeResearchPackStore(exec);

    const deps: ResearchConsumerDeps = { researchClaim, packStore, audit: auditLog, now: FIXED_NOW };

    // Fully await first, then second (deterministic sequencing)
    await handleResearchMessage(msg, deps);
    // Second invocation: has() will now return true → skip (idempotency check)
    await handleResearchMessage(msg, deps);

    // Pack is singular — only one row exists
    const result = await getPack(exec, claimKey, SOURCE_REVISION_ID);
    expect(result.state).toBe("found");
    if (result.state !== "found") return;
    // The FIRST outcome must be preserved (write-once)
    expect(result.pack.cards[0].url).toBe("https://example.com/first");

    // researchClaim called exactly once (second was skipped by has() check)
    expect(researchClaim).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Producer: enqueueResearch
// ---------------------------------------------------------------------------

describe("enqueueResearch", () => {
  it("computes the claimKey and sends the correct message shape", async () => {
    const sent: ResearchMessage[] = [];
    const queue = { send: vi.fn(async (m: ResearchMessage) => { sent.push(m); }) };

    const input = makeInput();
    const params = { pageId: PAGE_ID, sourceRevisionId: SOURCE_REVISION_ID, input };
    await enqueueResearch(queue, params);

    expect(queue.send).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(1);

    const msg = sent[0];
    expect(msg.pageId).toBe(PAGE_ID);
    expect(msg.sourceRevisionId).toBe(SOURCE_REVISION_ID);
    expect(msg.input).toEqual(input);

    // claimKey must match computeClaimKey(pageId, sectionHeading, claimText, year)
    const expectedKey = await computeClaimKey(PAGE_ID, input.sectionHeading, input.claimText, input.year);
    expect(msg.claimKey).toBe(expectedKey);
  });

  it("sends a message with a 64-char hex claimKey", async () => {
    const sent: ResearchMessage[] = [];
    const queue = { send: vi.fn(async (m: ResearchMessage) => { sent.push(m); }) };

    const input = makeInput();
    await enqueueResearch(queue, { pageId: PAGE_ID, sourceRevisionId: SOURCE_REVISION_ID, input });

    expect(sent[0].claimKey).toMatch(/^[0-9a-f]{64}$/);
  });
});
