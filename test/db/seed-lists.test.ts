// ABOUTME: Real-D1 data-layer tests for the seed-list store — upsert+replace round-trip, full-swap, FK enforcement.
// ABOUTME: Uses freshTestExecutor() (FK ON, migrations applied) so behavior matches Cloudflare D1.
import { describe, it, expect } from "vitest";
import { freshTestExecutor } from "../helpers/db";
import {
  upsertSeedList,
  replaceSeedListEntries,
  getSeedListWithEntries,
} from "../../src/db/seed-lists";

const LIST = {
  topic: "military-procurement",
  title: "Military procurement",
  refreshedAt: "2026-06-13T00:00:00.000Z",
  windowStart: "2026-05-13",
  windowEnd: "2026-06-11",
  entryCount: 2,
};

describe("seed-lists data layer", () => {
  it("upsert + replace entries round-trips, ordered by rank", async () => {
    const db = freshTestExecutor();
    await upsertSeedList(db, LIST);
    await replaceSeedListEntries(db, "military-procurement", [
      { topic: "military-procurement", rank: 1, pageId: 100, articleTitle: "Alpha", pageviewCount: 9000 },
      { topic: "military-procurement", rank: 2, pageId: 200, articleTitle: "Beta", pageviewCount: 4000 },
    ]);
    const read = await getSeedListWithEntries(db, "military-procurement");
    expect(read.state).toBe("found");
    if (read.state === "found") {
      expect(read.list.windowEnd).toBe("2026-06-11");
      expect(read.entries.map((e) => e.rank)).toEqual([1, 2]);
      expect(read.entries[0].articleTitle).toBe("Alpha");
    }
  });

  it("upsert is idempotent on topic (updates the header in place, no duplicate row)", async () => {
    const db = freshTestExecutor();
    await upsertSeedList(db, LIST);
    await upsertSeedList(db, { ...LIST, title: "Renamed", entryCount: 5 });
    const read = await getSeedListWithEntries(db, "military-procurement");
    expect(read.state).toBe("found");
    if (read.state === "found") {
      expect(read.list.title).toBe("Renamed");
      expect(read.list.entryCount).toBe(5);
    }
  });

  it("replace is a full swap, not an append", async () => {
    const db = freshTestExecutor();
    await upsertSeedList(db, LIST);
    await replaceSeedListEntries(db, "military-procurement", [
      { topic: "military-procurement", rank: 1, pageId: 100, articleTitle: "Alpha", pageviewCount: 9000 },
    ]);
    await replaceSeedListEntries(db, "military-procurement", [
      { topic: "military-procurement", rank: 1, pageId: 999, articleTitle: "Gamma", pageviewCount: 8000 },
    ]);
    const read = await getSeedListWithEntries(db, "military-procurement");
    expect(read.state).toBe("found");
    if (read.state === "found") {
      expect(read.entries).toHaveLength(1);
      expect(read.entries[0].pageId).toBe(999);
    }
  });

  it("replace with an empty entry set clears all rows for the topic", async () => {
    const db = freshTestExecutor();
    await upsertSeedList(db, LIST);
    await replaceSeedListEntries(db, "military-procurement", [
      { topic: "military-procurement", rank: 1, pageId: 100, articleTitle: "Alpha", pageviewCount: 9000 },
    ]);
    await replaceSeedListEntries(db, "military-procurement", []);
    const read = await getSeedListWithEntries(db, "military-procurement");
    expect(read.state).toBe("found");
    if (read.state === "found") expect(read.entries).toEqual([]);
  });

  it("unknown topic returns not_found (never throws)", async () => {
    const db = freshTestExecutor();
    const read = await getSeedListWithEntries(db, "nonexistent");
    expect(read.state).toBe("not_found");
  });

  it("entry FK to a missing parent topic is rejected by D1 (CC-6 FK parity)", async () => {
    const db = freshTestExecutor();
    await expect(
      replaceSeedListEntries(db, "no-parent", [
        { topic: "no-parent", rank: 1, pageId: 1, articleTitle: "X", pageviewCount: 1 },
      ])
    ).rejects.toThrow();
  });
});
