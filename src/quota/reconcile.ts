// ABOUTME: Quota reconciliation — the metered unit is research-pack inserts, counted on a UTC-day window.
// ABOUTME: assertQuotaAvailable is the advisory pre-enqueue check; the write-once ledger committed with the pack is authoritative.
import type { SqlExecutor, SqlStatement } from "../db/client";
import type { ResearchPack } from "../db/research-packs";
import { insertQuotaEntryStatement, countPacksForUserOnDay, countPacksGlobalOnDay } from "../db/quota-ledger";
import type { QuotaConfig } from "./config";

export class QuotaExceededError extends Error {
  constructor(public readonly scope: "user" | "global") {
    super(`quota exceeded: ${scope} daily cap reached`);
    this.name = "QuotaExceededError";
  }
}

/** UTC calendar-day key (YYYY-MM-DD) for the daily-cap window. Always UTC (CC-13). */
export function utcDayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/** Builds the bound, unexecuted ledger-insert statement to commit atomically WITH the pack insert.
 *  Same executor instance as the pack statement (CC-3). Records neurons/brave count as observability stats only. */
export function quotaEntryFor(
  db: SqlExecutor,
  args: { userId: string; pack: ResearchPack; neurons: number; braveQueryCount: number },
): SqlStatement {
  return insertQuotaEntryStatement(db, {
    claimKey: args.pack.claimKey,
    sourceRevisionId: args.pack.sourceRevisionId,
    userId: args.userId,
    evaluatedAt: args.pack.evaluatedAt,
    neurons: args.neurons,
    braveQueryCount: args.braveQueryCount,
  });
}

/**
 * Advisory pre-enqueue check. Throws QuotaExceededError if the user or global UTC-day cap is
 * already reached. NOT a hard guarantee against concurrent enqueues (count-then-act — testing-pitfalls §5):
 * the authoritative bound is the write-once ledger committed atomically with the pack on the
 * sequential consumer (CC-16). This check fails fast and keeps the queue from filling with
 * work that will be capped at commit time.
 */
export async function assertQuotaAvailable(
  db: SqlExecutor,
  userId: string,
  nowIso: string,
  config: QuotaConfig,
): Promise<void> {
  const day = utcDayKey(nowIso);
  const userCount = await countPacksForUserOnDay(db, userId, day);
  if (userCount >= config.perUserDailyCap) throw new QuotaExceededError("user");
  const globalCount = await countPacksGlobalOnDay(db, day);
  if (globalCount >= config.globalDailyCap) throw new QuotaExceededError("global");
}
