import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";

describe("0001_init migration", () => {
  it("creates audit_log, articles, stale_candidates", () => {
    const db = new Database(":memory:");
    db.exec(readFileSync("migrations/0001_init.sql", "utf8"));
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
    const db = new Database(":memory:");
    db.exec(readFileSync("migrations/0001_init.sql", "utf8"));
    const cols = db
      .prepare<[], { name: string }>("PRAGMA table_info(audit_log)")
      .all()
      .map((r) => r.name);
    expect(cols).toEqual(
      expect.arrayContaining(["id", "ts", "actor", "event_type", "payload_json"])
    );
  });
});
