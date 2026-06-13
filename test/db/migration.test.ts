import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
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

  it("rejects a NULL PK component (WITHOUT ROWID composite natural key)", () => {
    const db = freshTestDb();
    // eligibility_verdicts is WITHOUT ROWID with a composite PK (page_id, revision_id, gate_version).
    // All three PK columns are NOT NULL, so a NULL in any key column must be rejected.
    db.prepare(
      "INSERT INTO articles (page_id, title, revision_id, fetched_at) VALUES (?, ?, ?, ?)"
    ).run(1, "Test Article", 100, "2026-06-06T00:00:00.000Z");
    const insertNullRevision = () =>
      db
        .prepare(
          "INSERT INTO eligibility_verdicts (page_id, revision_id, gate_version, eligibility, reasons_json, evaluated_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run(1, null, "v1", "easy_win", "[]", "2026-06-06T00:00:00.000Z");
    expect(insertNullRevision).toThrow(/NOT NULL/i);
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

    // type IN ('table','index') so CREATE UNIQUE INDEX statements (e.g. users_identity_unique)
    // are parity-checked too — an index present in a migration but missing from schema.sql must fail.
    const tablesA = dbA
      .prepare<[], { name: string; sql: string }>(
        "SELECT name, sql FROM sqlite_master WHERE type IN ('table','index') ORDER BY name"
      )
      .all();
    const tablesB = dbB
      .prepare<[], { name: string; sql: string }>(
        "SELECT name, sql FROM sqlite_master WHERE type IN ('table','index') ORDER BY name"
      )
      .all();

    expect(tablesA).toEqual(tablesB);
  });
});

describe("0003_research_packs migration", () => {
  it("creates the research_packs table", () => {
    const db = freshTestDb();
    const tables = db
      .prepare<[], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      )
      .all()
      .map((r) => r.name);
    expect(tables).toContain("research_packs");
  });

  it("research_packs has all expected columns", () => {
    const db = freshTestDb();
    const cols = db
      .prepare<[], { name: string }>("PRAGMA table_info(research_packs)")
      .all()
      .map((r) => r.name);
    expect(cols).toEqual(
      expect.arrayContaining([
        "claim_key",
        "source_revision_id",
        "page_id",
        "section_heading",
        "sentence_text",
        "year",
        "provider_name",
        "model_version",
        "status",
        "queries_json",
        "cards_json",
        "dispositions_json",
        "evaluated_at",
      ])
    );
  });

  it("rejects a NULL claim_key (WITHOUT ROWID composite PK — DB-1)", () => {
    const db = freshTestDb();
    // Insert a valid articles row for the FK, then try inserting a NULL PK component.
    db.prepare(
      "INSERT INTO articles (page_id, title, revision_id, fetched_at) VALUES (?, ?, ?, ?)"
    ).run(1, "Test Article", 100, "2026-06-06T00:00:00.000Z");
    const insertNull = () =>
      db
        .prepare(
          "INSERT INTO research_packs (claim_key, source_revision_id, page_id, section_heading, sentence_text, year, provider_name, model_version, status, queries_json, cards_json, dispositions_json, evaluated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .run(
          null, 100, 1, "History", "The fleet will reach full strength.", 2017,
          "fake-provider", "fake-provider/0", "no_proposals", "[]", "[]", "[]",
          "2026-06-06T00:00:00.000Z"
        );
    expect(insertNull).toThrow(/NOT NULL/i);
  });

  it("status CHECK rejects values outside no_proposals|proposals_present", () => {
    const db = freshTestDb();
    db.prepare(
      "INSERT INTO articles (page_id, title, revision_id, fetched_at) VALUES (?, ?, ?, ?)"
    ).run(1, "Test Article", 100, "2026-06-06T00:00:00.000Z");
    const insert = () =>
      db
        .prepare(
          "INSERT INTO research_packs (claim_key, source_revision_id, page_id, section_heading, sentence_text, year, provider_name, model_version, status, queries_json, cards_json, dispositions_json, evaluated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .run(
          "abc123", 100, 1, "History", "The fleet will reach full strength.", 2017,
          "fake-provider", "fake-provider/0", "invalid_status", "[]", "[]", "[]",
          "2026-06-06T00:00:00.000Z"
        );
    expect(insert).toThrow(/CHECK/i);
  });

  it("enforces the research_packs -> articles(page_id) foreign key", () => {
    const db = freshTestDb();
    // page_id 999 has no matching articles row.
    const insert = () =>
      db
        .prepare(
          "INSERT INTO research_packs (claim_key, source_revision_id, page_id, section_heading, sentence_text, year, provider_name, model_version, status, queries_json, cards_json, dispositions_json, evaluated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .run(
          "abc123", 100, 999, "History", "The fleet will reach full strength.", 2017,
          "fake-provider", "fake-provider/0", "no_proposals", "[]", "[]", "[]",
          "2026-06-06T00:00:00.000Z"
        );
    expect(insert).toThrow(/FOREIGN KEY/i);
  });
});

describe("0004_users migration", () => {
  it("creates the users table with the expected columns", () => {
    const db = freshTestDb();
    const cols = db
      .prepare<[], { name: string }>("PRAGMA table_info(users)")
      .all()
      .map((r) => r.name);
    expect(cols).toEqual(
      expect.arrayContaining(["user_id", "identity_provider", "identity_subject", "email", "created_at"]),
    );
  });

  it("rejects a NULL user_id (WITHOUT ROWID natural-key PK)", () => {
    const db = freshTestDb();
    // DB-1: a plain INTEGER PRIMARY KEY would silently fabricate a key on NULL.
    // user_id is a TEXT WITHOUT ROWID PK, so NULL must be rejected loudly.
    const insertNullPk = () =>
      db
        .prepare(
          "INSERT INTO users (user_id, identity_provider, identity_subject, email, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(null, "google", "sub-1", "x@example.com", "2026-06-13T00:00:00.000Z");
    expect(insertNullPk).toThrow(/NOT NULL/i);
  });

  it("enforces a unique (identity_provider, identity_subject) so one OAuth identity maps to one user", () => {
    const db = freshTestDb();
    const ins = (uid: string) =>
      db
        .prepare(
          "INSERT INTO users (user_id, identity_provider, identity_subject, email, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(uid, "google", "same-subject", "a@example.com", "2026-06-13T00:00:00.000Z");
    ins("user-a");
    expect(() => ins("user-b")).toThrow(/UNIQUE/i);
  });
});

describe("0008_seed_lists migration — seed_lists / seed_list_entries schema", () => {
  it("seed_lists is WITHOUT ROWID with a NOT NULL text PK and rejects a NULL topic", () => {
    const db = freshTestDb();
    const cols = db
      .prepare<[], { name: string; notnull: number; pk: number }>(
        "PRAGMA table_info(seed_lists)"
      )
      .all();
    expect(cols.map((c) => c.name).sort()).toEqual(
      ["topic", "title", "refreshed_at", "window_start", "window_end", "entry_count"].sort()
    );
    const topic = cols.find((c) => c.name === "topic")!;
    expect(topic.pk).toBe(1);
    expect(topic.notnull).toBe(1);
    // WITHOUT ROWID proven by NULL-PK rejection (a rowid table would fabricate a key).
    const insertNull = () =>
      db
        .prepare(
          "INSERT INTO seed_lists (topic, title, refreshed_at, window_start, window_end, entry_count) VALUES (NULL,'x','t','a','b',0)"
        )
        .run();
    expect(insertNull).toThrow(/NOT NULL|constraint/i);
  });

  it("seed_list_entries has a composite NOT NULL PK and a FK to seed_lists(topic)", () => {
    const db = freshTestDb();
    const cols = db
      .prepare<[], { name: string; notnull: number; pk: number }>(
        "PRAGMA table_info(seed_list_entries)"
      )
      .all();
    expect(cols.map((c) => c.name).sort()).toEqual(
      ["topic", "rank", "page_id", "article_title", "pageview_count"].sort()
    );
    expect(cols.filter((c) => c.pk > 0).map((c) => c.name).sort()).toEqual(
      ["rank", "topic"].sort()
    );
    for (const c of cols) if (c.pk > 0) expect(c.notnull).toBe(1);
    // FK fires: an entry for a topic with no parent seed_lists row is rejected.
    const insertGhost = () =>
      db
        .prepare(
          "INSERT INTO seed_list_entries (topic, rank, page_id, article_title, pageview_count) VALUES ('ghost',1,123,'X',5)"
        )
        .run();
    expect(insertGhost).toThrow(/FOREIGN KEY|constraint/i);
  });

  it("schema.sql == ordered migrations for the new tables (parity)", () => {
    // The existing parity test above already compares ALL sqlite_master DDL.
    // This assertion guards the two new names explicitly so a missed schema.sql edit is obvious.
    const dbMig = new Database(":memory:");
    for (const f of readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort()) {
      dbMig.exec(readFileSync(`migrations/${f}`, "utf8"));
    }
    const dbSchema = new Database(":memory:");
    dbSchema.exec(readFileSync("src/db/schema.sql", "utf8"));
    const names = (d: Database.Database) =>
      d
        .prepare<[], { name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('seed_lists','seed_list_entries') ORDER BY name"
        )
        .all()
        .map((r) => r.name);
    expect(names(dbMig)).toEqual(["seed_list_entries", "seed_lists"]);
    expect(names(dbSchema)).toEqual(["seed_list_entries", "seed_lists"]);
  });
});
