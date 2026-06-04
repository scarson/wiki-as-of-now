import { describe, it, expect } from "vitest";
import { freshTestDb } from "../helpers/db";

describe("0001_init migration", () => {
  it("creates audit_log, articles, stale_candidates", () => {
    const db = freshTestDb();
    const tables = db
      .prepare<[], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      )
      .all()
      .map((r) => r.name);
    expect(tables).toEqual(
      expect.arrayContaining(["articles", "audit_log", "stale_candidates"])
    );
  });

  it("audit_log has an append-only shape (id, ts, actor, event_type, payload_json)", () => {
    const db = freshTestDb();
    const cols = db
      .prepare<[], { name: string }>("PRAGMA table_info(audit_log)")
      .all()
      .map((r) => r.name);
    expect(cols).toEqual(
      expect.arrayContaining(["id", "ts", "actor", "event_type", "payload_json"])
    );
  });

  it("articles has the expected columns", () => {
    const db = freshTestDb();
    const cols = db
      .prepare<[], { name: string }>("PRAGMA table_info(articles)")
      .all()
      .map((r) => r.name);
    expect(cols).toEqual(
      expect.arrayContaining(["page_id", "title", "revision_id", "fetched_at"])
    );
  });

  it("stale_candidates has the expected columns", () => {
    const db = freshTestDb();
    const cols = db
      .prepare<[], { name: string }>("PRAGMA table_info(stale_candidates)")
      .all()
      .map((r) => r.name);
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "page_id",
        "section_heading",
        "sentence_text",
        "year",
        "marker",
        "score",
        "explanation",
        "detector_version",
        "source_revision_id",
      ])
    );
  });

  it("enforces the stale_candidates -> articles foreign key", () => {
    const db = freshTestDb();
    // page_id 999 has no matching articles row; FK enforcement (PRAGMA foreign_keys=ON
    // in freshTestDb, matching D1) must reject the insert.
    const insert = () =>
      db
        .prepare(
          "INSERT INTO stale_candidates (page_id, section_heading, sentence_text, year, marker, score, explanation, detector_version, source_revision_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .run(999, "S", "text", 2017, "as of", 0.5, "why", "v1", 1);
    expect(insert).toThrow(/FOREIGN KEY/i);
  });
});
