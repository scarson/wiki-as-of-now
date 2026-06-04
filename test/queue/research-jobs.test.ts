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
    await handleResearchMessage({ candidateId: 7, claim: { claimText: "x", sectionHeading: "S", year: 2017 } }, { provider, audit, store });
    await handleResearchMessage({ candidateId: 7, claim: { claimText: "x", sectionHeading: "S", year: 2017 } }, { provider, audit, store });
    expect(provider.research).toHaveBeenCalledTimes(1); // idempotent
    expect(appended.filter(e => e.eventType === "research.completed").length).toBe(1);
  });
});
