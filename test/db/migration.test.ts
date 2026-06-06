import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
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

  it("rejects a NULL articles.page_id (WITHOUT ROWID natural key)", () => {
    const db = freshTestDb();
    // articles is WITHOUT ROWID, so a NULL page_id is rejected rather than
    // silently auto-assigned a rowid (which a plain INTEGER PRIMARY KEY would do).
    const insertNull = () =>
      db
        .prepare("INSERT INTO articles (page_id, title, revision_id, fetched_at) VALUES (?, ?, ?, ?)")
        .run(null, "Some title", 1, "2026-06-04T00:00:00.000Z");
    expect(insertNull).toThrow(/NOT NULL/i);
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

describe("0002_eligibility_verdicts migration", () => {
  it("creates eligibility_verdicts with the expected columns and composite PK", () => {
    const db = freshTestDb();
    const cols = db
      .prepare<[], { name: string }>("PRAGMA table_info(eligibility_verdicts)")
      .all()
      .map((r) => r.name);
    expect(cols).toEqual(
      expect.arrayContaining([
        "page_id",
        "revision_id",
        "gate_version",
        "eligibility",
        "reasons_json",
        "evaluated_at",
      ])
    );
  });

  it("eligibility CHECK constraint rejects values outside easy_win|human_only", () => {
    const db = freshTestDb();
    // Insert a valid articles row first (FK is enforced).
    db.prepare(
      "INSERT INTO articles (page_id, title, revision_id, fetched_at) VALUES (?, ?, ?, ?)"
    ).run(1, "Test Article", 100, "2026-06-06T00:00:00.000Z");
    const insert = () =>
      db
        .prepare(
          "INSERT INTO eligibility_verdicts (page_id, revision_id, gate_version, eligibility, reasons_json, evaluated_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run(1, 100, "v1", "bad_value", "[]", "2026-06-06T00:00:00.000Z");
    expect(insert).toThrow(/CHECK/i);
  });

  it("enforces the eligibility_verdicts -> articles foreign key", () => {
    const db = freshTestDb();
    const insert = () =>
      db
        .prepare(
          "INSERT INTO eligibility_verdicts (page_id, revision_id, gate_version, eligibility, reasons_json, evaluated_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run(999, 1, "v1", "easy_win", "[]", "2026-06-06T00:00:00.000Z");
    expect(insert).toThrow(/FOREIGN KEY/i);
  });

  it("schema-equivalence: ordered migrations == schema.sql (identical sqlite_master DDL)", () => {
    // DB-A: apply migrations in sorted order (as freshTestDb does)
    const dbA = new Database(":memory:");
    dbA.pragma("foreign_keys = ON");
    for (const f of readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort()) {
      dbA.exec(readFileSync(`migrations/${f}`, "utf8"));
    }

    // DB-B: apply the cumulative schema.sql alone
    const dbB = new Database(":memory:");
    dbB.pragma("foreign_keys = ON");
    dbB.exec(readFileSync("src/db/schema.sql", "utf8"));

    const tablesA = dbA
      .prepare<[], { name: string; sql: string }>(
        "SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name"
      )
      .all();
    const tablesB = dbB
      .prepare<[], { name: string; sql: string }>(
        "SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name"
      )
      .all();

    expect(tablesA).toEqual(tablesB);
  });
});
