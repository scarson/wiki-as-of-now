-- WikiAsOfNow initial schema: audit_log, articles, stale_candidates.
-- Canonical readable copy lives at src/db/schema.sql (byte-identical).
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,                 -- ISO 8601 UTC
  actor TEXT NOT NULL,              -- user id or 'system'
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL        -- identifiers only; never PII/document content (see compliance + PII pitfall)
);
CREATE TABLE articles (
  page_id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  revision_id INTEGER NOT NULL,
  fetched_at TEXT NOT NULL
);
CREATE TABLE stale_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL REFERENCES articles(page_id),
  section_heading TEXT NOT NULL,
  sentence_text TEXT NOT NULL,
  year INTEGER NOT NULL,
  marker TEXT NOT NULL,
  score REAL NOT NULL,
  explanation TEXT NOT NULL,
  detector_version TEXT NOT NULL,
  source_revision_id INTEGER NOT NULL
);
