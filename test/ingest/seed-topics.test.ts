// ABOUTME: Tests for the two launch topics + buildSeedList — fixtures for network, real D1 for persistence.
// ABOUTME: Verifies dedup-by-pageId, ranking order, window snapshot, and persisted round-trip.
import { describe, it, expect } from "vitest";
import { freshTestExecutor } from "../helpers/db";
import { SEED_TOPICS, buildSeedList } from "../../src/ingest/seed-topics";
import { getSeedListWithEntries } from "../../src/db/seed-lists";

describe("seed-topics", () => {
  it("defines exactly the two launch topics", () => {
    expect(Object.keys(SEED_TOPICS).sort()).toEqual([
      "infrastructure-megaprojects",
      "military-procurement",
    ]);
  });

  it("each topic carries a slug, title, and at least one seed category", () => {
    for (const [slug, t] of Object.entries(SEED_TOPICS)) {
      expect(t.slug).toBe(slug);
      expect(typeof t.title).toBe("string");
      expect(t.categories.length).toBeGreaterThan(0);
    }
  });

  it("buildSeedList composes members → counts → rank → persists, with a fixed clock", async () => {
    const db = freshTestExecutor();
    const deps = {
      now: new Date("2026-06-13T12:00:00Z"),
      fetchCategoryMembers: async () => [
        { pageId: 1, title: "Alpha" },
        { pageId: 2, title: "Beta" },
        { pageId: 1, title: "Alpha" }, // dup pageId
      ],
      fetchPageviewCount: async (t: string) => (t === "Alpha" ? 9000 : 4000),
    };
    const result = await buildSeedList(db, "military-procurement", deps);
    expect(result.entryCount).toBe(2); // dedup by pageId
    const read = await getSeedListWithEntries(db, "military-procurement");
    expect(read.state).toBe("found");
    if (read.state === "found") {
      expect(read.entries.map((e) => e.rank)).toEqual([1, 2]);
      expect(read.entries[0].articleTitle).toBe("Alpha");
      expect(read.entries[0].pageviewCount).toBe(9000);
      expect(read.list.windowEnd).toBe("2026-06-11");
      expect(read.list.entryCount).toBe(2);
    }
  });

  it("buildSeedList on an unknown topic throws (caller bug, not a runtime input)", async () => {
    const db = freshTestExecutor();
    await expect(
      buildSeedList(db, "bogus", {
        now: new Date(),
        fetchCategoryMembers: async () => [],
        fetchPageviewCount: async () => 0,
      })
    ).rejects.toThrow(/unknown seed topic/);
  });

  it("buildSeedList with an empty category set persists an empty list, not a crash", async () => {
    const db = freshTestExecutor();
    const result = await buildSeedList(db, "military-procurement", {
      now: new Date("2026-06-13T12:00:00Z"),
      fetchCategoryMembers: async () => [],
      fetchPageviewCount: async () => 0,
    });
    expect(result.entryCount).toBe(0);
    const read = await getSeedListWithEntries(db, "military-procurement");
    expect(read.state).toBe("found");
    if (read.state === "found") expect(read.entries).toEqual([]);
  });
});
