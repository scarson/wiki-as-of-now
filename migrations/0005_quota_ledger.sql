-- 0005: quota_ledger — one write-once row per committed research_packs insert (the metered unit).
-- Neurons + brave_query_count are observability stats, NOT the metered quantity (metering = row count).
CREATE TABLE quota_ledger (
  claim_key          TEXT    NOT NULL,   -- matches research_packs PK component
  source_revision_id INTEGER NOT NULL,   -- matches research_packs PK component
  user_id            TEXT    NOT NULL REFERENCES users(user_id),
  evaluated_at       TEXT    NOT NULL,   -- ISO 8601 UTC; the daily-cap window key derives from this
  neurons            INTEGER NOT NULL,   -- Workers AI neurons used producing this pack (observability)
  brave_query_count  INTEGER NOT NULL,   -- Brave queries issued producing this pack (observability)
  PRIMARY KEY (claim_key, source_revision_id)
) WITHOUT ROWID;
