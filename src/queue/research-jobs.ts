// ABOUTME: Research-job queue consumer — idempotent handler that drives the research provider.
// ABOUTME: Also exports a thin producer (enqueueResearch) for posting to a Cloudflare Queue binding.
import type { AuditEntry } from "../db/audit-log";
import type { ResearchInput, ResearchResult } from "../research/provider";

/** A message posted to the research queue. */
export interface ResearchMessage {
  candidateId: number;
  claim: ResearchInput;
}

/**
 * Minimal result store — a Map<number, unknown> satisfies this structurally.
 * Production backing (D1 research-packs table) is a later milestone.
 */
export interface ResearchResultStore {
  has(id: number): boolean;
  get(id: number): unknown;
  set(id: number, value: unknown): void;
}

/** Injected dependencies for the research-job consumer. */
export interface ResearchDeps {
  provider: { research(input: ResearchInput): Promise<ResearchResult> };
  audit: { append(entry: AuditEntry): void };
  store: ResearchResultStore;
}

/**
 * Idempotent queue consumer: if a result for candidateId already exists in the
 * store, returns immediately without calling the provider or appending an audit
 * entry. Otherwise, runs research, stores the result, and records completion.
 *
 * Audit payload contains identifiers only (candidateId) — never the research
 * result or any document content, per compliance requirements.
 */
export async function handleResearchMessage(
  msg: ResearchMessage,
  deps: ResearchDeps
): Promise<void> {
  if (deps.store.has(msg.candidateId)) {
    return;
  }
  const result = await deps.provider.research(msg.claim);
  deps.store.set(msg.candidateId, result);
  // If audit.append throws after store.set, the result is already stored: a
  // re-delivery will skip the provider (store.has is true) AND skip this audit
  // entry, so completion goes unlogged. Transactional completion-logging is a
  // later milestone (D1 can't half-commit across tables anyway).
  deps.audit.append({
    actor: "system",
    eventType: "research.completed",
    payload: { candidateId: msg.candidateId },
  });
}

/**
 * Thin producer — posts a ResearchMessage to a Cloudflare Queue binding.
 * Not unit-tested here; wiring to a live queue is a deploy-time concern.
 */
export async function enqueueResearch(
  queue: { send(message: ResearchMessage): Promise<void> },
  msg: ResearchMessage
): Promise<void> {
  await queue.send(msg);
}
