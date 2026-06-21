// ABOUTME: Tests for the processBatch transport wrapper (src/queue/process-batch.ts).
// ABOUTME: Covers per-message ack/retry, isolation, codes-only warn, and malformed-body ack via real consumer.
import { describe, it, expect, vi } from "vitest";
import { processBatch } from "../../src/queue/process-batch";
import { handleResearchMessage, makeResearchPackStore, type ResearchConsumerDeps, type ResearchMessage } from "../../src/queue/research-jobs";
import { makeAuditLog } from "../../src/db/audit-log";
import { freshTestExecutor } from "../helpers/db";
import { allowConsole } from "../setup/pristine";

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

/** Build a fake message with controllable ack/retry spies. */
function makeMsg(body: unknown) {
  return {
    body,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

/** A valid 64-char hex claimKey. */
const VALID_CLAIM_KEY = "a".repeat(64);

/** A valid ResearchMessage body shape. */
function validBody(overrides: Partial<ResearchMessage> = {}): ResearchMessage {
  return {
    claimKey: VALID_CLAIM_KEY,
    pageId: 1,
    sourceRevisionId: 1,
    input: {
      claimText: "The fleet will reach full strength by 2025.",
      sectionHeading: "History",
      year: 2025,
      sourceRevisionId: 1,
    },
    ...overrides,
  };
}

/** Build a fake batch from an array of {body, ack, retry} objects. */
function makeBatch(messages: ReturnType<typeof makeMsg>[]) {
  return { messages };
}

// ---------------------------------------------------------------------------
// (a) resolve → ack
// ---------------------------------------------------------------------------

describe("processBatch — resolve → ack", () => {
  it("when handle resolves, ack() is called exactly once and retry() is not called", async () => {
    const handle = vi.fn().mockResolvedValue(undefined);
    const msg = makeMsg(validBody());
    const batch = makeBatch([msg]);
    const deps = {} as ResearchConsumerDeps;

    await processBatch(batch, deps, handle);

    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(msg.retry).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (b) throw → retry (+ codes-only warn)
// ---------------------------------------------------------------------------

describe("processBatch — throw → retry", () => {
  it("when handle throws, retry() is called exactly once, ack() is not called, and a codes-only console.warn fires", async () => {
    allowConsole();
    const handle = vi.fn().mockRejectedValue(new Error("SomeTransientError"));
    const msg = makeMsg(validBody());
    const batch = makeBatch([msg]);
    const deps = {} as ResearchConsumerDeps;
    const warnSpy = vi.spyOn(console, "warn");

    await processBatch(batch, deps, handle);

    expect(msg.retry).toHaveBeenCalledTimes(1);
    expect(msg.ack).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (c) per-message isolation — middle throw does not abort loop or reject outer promise
// ---------------------------------------------------------------------------

describe("processBatch — per-message isolation", () => {
  it("a 3-message batch where the middle message throws: msg[0] and msg[2] are acked, msg[1] is retried, and processBatch resolves", async () => {
    allowConsole();
    const bodies = [validBody(), validBody(), validBody()];
    const msgs = bodies.map(makeMsg);
    const batch = makeBatch(msgs);
    const deps = {} as ResearchConsumerDeps;

    const handle = vi.fn().mockImplementation(async (msg: ResearchMessage) => {
      if (msg === bodies[1]) throw new Error("MiddleError");
    });

    // processBatch must RESOLVE (not reject) even though one message threw
    await expect(processBatch(batch, deps, handle)).resolves.toBeUndefined();

    expect(msgs[0].ack).toHaveBeenCalledTimes(1);
    expect(msgs[0].retry).not.toHaveBeenCalled();

    expect(msgs[1].ack).not.toHaveBeenCalled();
    expect(msgs[1].retry).toHaveBeenCalledTimes(1);

    expect(msgs[2].ack).toHaveBeenCalledTimes(1);
    expect(msgs[2].retry).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (d) incremental ack — earlier ack is NOT undone by a later throw
// ---------------------------------------------------------------------------

describe("processBatch — incremental ack", () => {
  it("msg[0] is acked immediately even when msg[1] later throws (ack is per-message, not batched at end)", async () => {
    allowConsole();
    const bodies = [validBody(), validBody(), validBody()];
    const msgs = bodies.map(makeMsg);
    const batch = makeBatch(msgs);
    const deps = {} as ResearchConsumerDeps;

    const handle = vi.fn().mockImplementation(async (msg: ResearchMessage) => {
      if (msg === bodies[1]) throw new Error("LateThrow");
    });

    await processBatch(batch, deps, handle);

    // msg[0] must have been acked and never retried — even though msg[1] threw later
    expect(msgs[0].ack).toHaveBeenCalledTimes(1);
    expect(msgs[0].retry).not.toHaveBeenCalled();
  });

  it("msg[0].ack() is invoked BEFORE handle is called for msg[1] (incremental, not post-loop)", async () => {
    allowConsole();
    const bodies = [validBody(), validBody(), validBody()];
    const msgs = bodies.map(makeMsg);
    const batch = makeBatch(msgs);
    const deps = {} as ResearchConsumerDeps;

    const handle = vi.fn().mockImplementation(async (msg: ResearchMessage) => {
      if (msg === bodies[1]) throw new Error("LateThrow");
    });

    await processBatch(batch, deps, handle);

    // Ordering proof: msg[0].ack must have fired before handle was called the second time
    // (for msg[1]). A post-loop/deferred dispatch implementation would fail this because
    // all acks/retries would be dispatched AFTER all handler invocations complete.
    const ackOrder = msgs[0].ack.mock.invocationCallOrder[0];
    const handleMsg1Order = handle.mock.invocationCallOrder[1];
    expect(ackOrder).toBeLessThan(handleMsg1Order);
  });
});

// ---------------------------------------------------------------------------
// (e) malformed body → ack (integration with the REAL consumer)
// ---------------------------------------------------------------------------

describe("processBatch — malformed body → ack (real consumer)", () => {
  it("a malformed message body (missing required fields: sourceRevisionId and input) causes the real handleResearchMessage to resolve → processBatch acks it", async () => {
    allowConsole();
    const exec = freshTestExecutor();
    const auditLog = makeAuditLog(exec);
    const packStore = makeResearchPackStore(exec);
    const deps: ResearchConsumerDeps = {
      researchClaim: vi.fn(),
      packStore,
      audit: auditLog,
      now: new Date("2026-06-07T00:00:00.000Z"),
      quotaConfig: { perUserDailyCap: 1_000_000, globalDailyCap: 1_000_000 },
    };

    // Malformed body: missing required fields (sourceRevisionId and input) — real consumer will audit+return (resolve)
    const malformedBody = { claimKey: "x", pageId: 1 };
    const msg = makeMsg(malformedBody);
    const batch = makeBatch([msg]);

    await processBatch(batch, deps, handleResearchMessage);

    // Because the real consumer RESOLVES on malformed input, processBatch must ack
    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(msg.retry).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (f) retry log is codes-only — sentinel must not appear in warn arguments
// ---------------------------------------------------------------------------

describe("processBatch — retry warn is codes-only (no body text / error message text)", () => {
  it("when handle throws, the console.warn arguments do not contain claim text or error message text", async () => {
    allowConsole();

    const SENTINEL = "SENTINEL_LEAK_XYZ_DO_NOT_LOG";
    const sentinelBody: ResearchMessage = {
      claimKey: VALID_CLAIM_KEY,
      pageId: 1,
      sourceRevisionId: 1,
      input: {
        claimText: `${SENTINEL} This text must never appear in logs.`,
        sectionHeading: "History",
        year: 2025,
        sourceRevisionId: 1,
      },
    };
    const handle = vi.fn().mockRejectedValue(new Error(`${SENTINEL} error message must not appear`));

    const msg = makeMsg(sentinelBody);
    const batch = makeBatch([msg]);
    const deps = {} as ResearchConsumerDeps;

    const warnArgs: unknown[][] = [];
    const warnSpy = vi.spyOn(console, "warn").mockImplementation((...args) => {
      warnArgs.push(args);
    });

    await processBatch(batch, deps, handle);

    // warn must have been called
    expect(warnSpy).toHaveBeenCalled();
    expect(warnArgs.length).toBeGreaterThan(0);

    // The warn arguments must NOT contain the sentinel anywhere (codes only)
    const serialized = JSON.stringify(warnArgs);
    expect(serialized).not.toContain(SENTINEL);

    // The warn SHOULD include the valid 64-hex claimKey
    expect(serialized).toContain(VALID_CLAIM_KEY);
  });

  it("when the body has a non-hex claimKey and handle throws, warn uses a placeholder (not the raw claimKey)", async () => {
    allowConsole();

    const SENTINEL = "SENTINEL_PII_CLAIMKEY";
    const badKeyBody = {
      claimKey: `${SENTINEL} John Doe SSN 123-45-6789`,
      pageId: 1,
      sourceRevisionId: 1,
      input: { claimText: "Some claim.", sectionHeading: "History", year: 2025 },
    };
    const handle = vi.fn().mockRejectedValue(new Error("transient"));

    const msg = makeMsg(badKeyBody);
    const batch = makeBatch([msg]);
    const deps = {} as ResearchConsumerDeps;

    const warnArgs: unknown[][] = [];
    vi.spyOn(console, "warn").mockImplementation((...args) => {
      warnArgs.push(args);
    });

    await processBatch(batch, deps, handle);

    const serialized = JSON.stringify(warnArgs);
    expect(serialized).not.toContain(SENTINEL);
  });
});
