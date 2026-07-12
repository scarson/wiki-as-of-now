// ABOUTME: Typed data layer for topic seed lists — upsert a list + replace its ranked entries, read them back.
// ABOUTME: Replace-entries is sequential delete-then-insert (no batch primitive needed; one writer per topic).
import type { SqlExecutor } from "./client";

export interface SeedList {
  topic: string;
  title: string;
  refreshedAt: string;
  windowStart: string;
  windowEnd: string;
  entryCount: number;
}
export interface SeedListEntry {
  topic: string;
  rank: number;
  pageId: number;
  articleTitle: string;
  pageviewCount: number;
}
export type SeedListRead =
  | { state: "found"; list: SeedList; entries: SeedListEntry[] }
  | { state: "not_found" };

interface RawListRow {
  topic: string;
  title: string;
  refreshed_at: string;
  window_start: string;
  window_end: string;
  entry_count: number;
}
interface RawEntryRow {
  topic: string;
  rank: number;
  page_id: number;
  article_title: string;
  pageview_count: number;
}

/** Inserts a seed-list header or, if the topic exists, updates its mutable fields in place. */
export async function upsertSeedList(db: SqlExecutor, list: SeedList): Promise<void> {
  await db
    .prepare(
      "INSERT INTO seed_lists (topic, title, refreshed_at, window_start, window_end, entry_count) " +
        "VALUES (?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(topic) DO UPDATE SET title=excluded.title, refreshed_at=excluded.refreshed_at, " +
        "window_start=excluded.window_start, window_end=excluded.window_end, entry_count=excluded.entry_count"
    )
    .bind(list.topic, list.title, list.refreshedAt, list.windowStart, list.windowEnd, list.entryCount)
    .run();
}

/** Replace ALL entries for a topic. Sequential delete-then-insert; the parent seed_lists row must already exist. */
export async function replaceSeedListEntries(
  db: SqlExecutor,
  topic: string,
  entries: SeedListEntry[]
): Promise<void> {
  await db.prepare("DELETE FROM seed_list_entries WHERE topic = ?").bind(topic).run();
  for (const e of entries) {
    await db
      .prepare(
        "INSERT INTO seed_list_entries (topic, rank, page_id, article_title, pageview_count) VALUES (?, ?, ?, ?, ?)"
      )
      .bind(e.topic, e.rank, e.pageId, e.articleTitle, e.pageviewCount)
      .run();
  }
}

/** Reads a seed list and its ranked entries; returns not_found (never throws) for an unknown topic. */
export async function getSeedListWithEntries(db: SqlExecutor, topic: string): Promise<SeedListRead> {
  const listRows = await db
    .prepare(
      "SELECT topic, title, refreshed_at, window_start, window_end, entry_count FROM seed_lists WHERE topic = ?"
    )
    .bind(topic)
    .all<RawListRow>();
  if (listRows.length === 0) return { state: "not_found" };
  const r = listRows[0];
  const list: SeedList = {
    topic: r.topic,
    title: r.title,
    refreshedAt: r.refreshed_at,
    windowStart: r.window_start,
    windowEnd: r.window_end,
    entryCount: r.entry_count,
  };
  const entryRows = await db
    .prepare(
      "SELECT topic, rank, page_id, article_title, pageview_count FROM seed_list_entries WHERE topic = ? ORDER BY rank ASC"
    )
    .bind(topic)
    .all<RawEntryRow>();
  const entries: SeedListEntry[] = entryRows.map((e) => ({
    topic: e.topic,
    rank: e.rank,
    pageId: e.page_id,
    articleTitle: e.article_title,
    pageviewCount: e.pageview_count,
  }));
  return { state: "found", list, entries };
}
