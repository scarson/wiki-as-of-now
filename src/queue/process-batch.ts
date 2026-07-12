// ABOUTME: Sequential per-message ack/retry transport wrapper for Cloudflare Queue consumers.
// ABOUTME: Maps handler resolve→ack and handler throw→retry with full per-message isolation.

import { handleResearchMessage, type ResearchMessage, type ResearchConsumerDeps } from "./research-jobs";

// Sequential iteration is LOAD-BEARING for cross-message G14 host politeness —
// do NOT parallelize without first adding a global per-host throttle (spec §3/§8).

/** Minimal structural interface matching a Cloudflare Queue message (body/ack/retry subset). */
export interface QueueMessageLike {
  readonly body: unknown;
  ack(): void;
  retry(): void;
}

/** Minimal structural interface matching a Cloudflare MessageBatch. */
export interface MessageBatchLike {
  readonly messages: readonly QueueMessageLike[];
}

/** 64-char lowercase hex pattern — matches real computeClaimKey output. */
const HEX64 = /^[0-9a-f]{64}$/;

/**
 * Processes all messages in a batch sequentially, mapping each handler outcome
 * to the correct Cloudflare Queue disposition:
 *   - handler resolves → ack() (message consumed; idempotent or persisted)
 *   - handler throws   → console.warn (codes-only) + retry()
 *
 * Per-message isolation: a throw on one message does NOT abort the loop or
 * propagate to the caller — every other message is still processed and
 * individually acked or retried.
 */
export async function processBatch(
  batch: MessageBatchLike,
  deps: ResearchConsumerDeps,
  handle: (msg: ResearchMessage, deps: ResearchConsumerDeps) => Promise<void> = handleResearchMessage,
): Promise<void> {
  for (const queueMsg of batch.messages) {
    try {
      await handle(queueMsg.body as ResearchMessage, deps);
      queueMsg.ack();
    } catch (e) {
      // Codes-only retry note (G13): never log body text or error message text.
      // Derive claimKey only when it is a genuine 64-hex string; otherwise "unknown".
      const rawKey = (queueMsg.body as Record<string, unknown> | null)?.claimKey;
      const claimKey = typeof rawKey === "string" && HEX64.test(rawKey) ? rawKey : "unknown";
      const reason = e instanceof Error ? e.name : "unknown";
      console.warn("research.message.retry", { claimKey, reason });
      queueMsg.retry();
    }
  }
}
