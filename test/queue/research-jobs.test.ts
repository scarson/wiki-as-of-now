// ABOUTME: Tests for the research-job queue consumer.
// ABOUTME: Verifies idempotency (provider called once for duplicate messages) and audit logging.
import { describe, it, expect, vi } from "vitest";
import { handleResearchMessage } from "../../src/queue/research-jobs";
import type { AuditEntry } from "../../src/db/audit-log";

describe("research job consumer", () => {
  it("runs research once and logs completion", async () => {
    const provider = { research: vi.fn().mockResolvedValue({ providerName: "stub", candidates: [] }) };
    const appended: AuditEntry[] = [];
    const audit = { append: (e: AuditEntry) => { appended.push(e); } };
    const store = new Map<number, unknown>();
    const msg = { candidateId: 7, claim: { claimText: "x", sectionHeading: "S", year: 2017 } };
    await handleResearchMessage(msg, { provider, audit, store });
    await handleResearchMessage(msg, { provider, audit, store }); // re-delivery of the same message
    expect(provider.research).toHaveBeenCalledTimes(1); // idempotent
    expect(appended.filter(e => e.eventType === "research.completed").length).toBe(1);
    expect(store.has(7)).toBe(true); // result persisted under candidateId
    expect(store.get(7)).toEqual({ providerName: "stub", candidates: [] });
  });
});
