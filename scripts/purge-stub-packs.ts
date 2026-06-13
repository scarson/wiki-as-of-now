// ABOUTME: Purges stub (fake-provider/0) research packs — a provider-swap precondition (integration-contract §2.8 / CC-7).
// ABOUTME: Stub packs are write-once PK-poison; they must be deleted before the real provider goes live.
import type { SqlExecutor } from "../src/db/client";

const STUB_MODEL_VERSION = "fake-provider/0";

/** Deletes all research packs whose model_version is the stub sentinel. Returns the count removed. */
export async function purgeStubPacks(db: SqlExecutor): Promise<number> {
  const rows = await db
    .prepare("SELECT COUNT(*) AS n FROM research_packs WHERE model_version = ?")
    .bind(STUB_MODEL_VERSION)
    .all<{ n: number }>();
  const count = rows[0]?.n ?? 0;
  await db.prepare("DELETE FROM research_packs WHERE model_version = ?").bind(STUB_MODEL_VERSION).run();
  return count;
}
