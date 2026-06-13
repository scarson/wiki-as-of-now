// ABOUTME: The G5 "I opened and read this source" gate — codes-only audit entry + the gated unlock.
// ABOUTME: Payload is identifiers only (claimKey, sourceRevisionId, urlHash) — never the raw url/quote (CC-12/G13).
import type { SqlExecutor } from "../db/client";
import { makeAuditLog, type AuditEntry } from "../db/audit-log";

export const SOURCE_OPENED_EVENT_TYPE = "source.opened";

/** 64-char lowercase hex — the canonical claimKey shape; malformed identifiers must never reach the log. */
const HEX64 = /^[0-9a-f]{64}$/;

export interface GateAuditInput {
  actor: string;
  claimKey: string;
  sourceRevisionId: number;
  urlHash: string;
}

export function gateAuditEntry(input: GateAuditInput): AuditEntry {
  return {
    actor: input.actor,
    eventType: SOURCE_OPENED_EVENT_TYPE,
    payload: { claimKey: input.claimKey, sourceRevisionId: input.sourceRevisionId, urlHash: input.urlHash },
  };
}

/** SHA-256 hex of the source URL — the identifier of which source was opened, without logging the raw URL (CC-12). */
export async function hashUrl(url: string): Promise<string> {
  const bytes = new TextEncoder().encode(url);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface ConfirmInput {
  actor: string;
  claimKey: string;
  sourceRevisionId: number;
  url: string;
}

/**
 * The G5 gate: hashes the source URL, appends a codes-only append-only audit row, and reports unlocked
 * ONLY after the append commits (G5: a card cannot produce a finished citation until the source is opened
 * and that open is logged). Rejects a non-64-hex claimKey before any write (G13 — no malformed identifiers).
 */
export async function confirmSourceOpened(db: SqlExecutor, input: ConfirmInput): Promise<{ unlocked: true }> {
  if (!HEX64.test(input.claimKey)) throw new Error("claimKey must be 64-char lowercase hex");
  const urlHash = await hashUrl(input.url);
  await makeAuditLog(db).append(
    gateAuditEntry({ actor: input.actor, claimKey: input.claimKey, sourceRevisionId: input.sourceRevisionId, urlHash }),
  );
  return { unlocked: true };
}
