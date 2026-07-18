-- 0009: quota_ledger.user_id nullable + ON DELETE SET NULL — lets account deletion detach a user's
-- attribution (UPDATE ... SET user_id = NULL) while KEEPING the row, so the global daily cost cap
-- (countPacksGlobalOnDay counts all rows) stays honest. Table rebuild: SQLite can't ALTER nullability/FK.
-- The old table is renamed aside and the final table created fresh under its real name, so the stored
-- DDL in sqlite_master stays byte-identical to src/db/schema.sql (the schema-equivalence parity test).
ALTER TABLE quota_ledger RENAME TO quota_ledger_old;
CREATE TABLE quota_ledger (
  claim_key          TEXT    NOT NULL,   -- matches research_packs PK component
  source_revision_id INTEGER NOT NULL,   -- matches research_packs PK component
  user_id            TEXT    REFERENCES users(user_id) ON DELETE SET NULL,  -- NULL = attribution detached by account deletion
  evaluated_at       TEXT    NOT NULL,   -- ISO 8601 UTC; the daily-cap window key derives from this
  neurons            INTEGER NOT NULL,   -- Workers AI neurons used producing this pack (observability)
  brave_query_count  INTEGER NOT NULL,   -- Brave queries issued producing this pack (observability)
  PRIMARY KEY (claim_key, source_revision_id)
) WITHOUT ROWID;
INSERT INTO quota_ledger (claim_key, source_revision_id, user_id, evaluated_at, neurons, brave_query_count)
  SELECT claim_key, source_revision_id, user_id, evaluated_at, neurons, brave_query_count FROM quota_ledger_old;
DROP TABLE quota_ledger_old;
