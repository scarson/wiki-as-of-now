-- WikiAsOfNow cumulative schema: audit_log, articles, stale_candidates, eligibility_verdicts, research_packs.
-- Equivalent to applying migrations/0001_init.sql, 0002_eligibility_verdicts.sql, 0003_research_packs.sql in order.
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,                 -- ISO 8601 UTC
  actor TEXT NOT NULL,              -- user id or 'system'
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL        -- identifiers only; never PII/document content (see compliance + PII pitfall)
);
CREATE TABLE articles (
  page_id INTEGER PRIMARY KEY NOT NULL,  -- Wikipedia pageid (natural key); WITHOUT ROWID rejects NULL
  title TEXT NOT NULL,
  revision_id INTEGER NOT NULL,
  fetched_at TEXT NOT NULL
) WITHOUT ROWID;
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
CREATE TABLE eligibility_verdicts (
  page_id      INTEGER NOT NULL REFERENCES articles(page_id),
  revision_id  INTEGER NOT NULL,
  gate_version TEXT    NOT NULL,
  eligibility  TEXT    NOT NULL CHECK (eligibility IN ('easy_win','human_only')),
  reasons_json TEXT    NOT NULL,
  evaluated_at TEXT    NOT NULL,
  PRIMARY KEY (page_id, revision_id, gate_version)
) WITHOUT ROWID;
CREATE TABLE research_packs (
  claim_key          TEXT    NOT NULL,   -- SHA-256 hex of canonical(page_id, section_heading, sentence_text, year)
  source_revision_id INTEGER NOT NULL,
  page_id            INTEGER NOT NULL REFERENCES articles(page_id),
  section_heading    TEXT    NOT NULL,
  sentence_text      TEXT    NOT NULL,
  year               INTEGER NOT NULL,
  provider_name      TEXT    NOT NULL,
  model_version      TEXT    NOT NULL,   -- full model identifier for G12 disclosure (name+version); fake → 'fake-provider/0'
  status             TEXT    NOT NULL CHECK (status IN ('no_proposals','proposals_present')),
  queries_json       TEXT    NOT NULL,   -- string[]; the G9 "logged" record lives HERE, not in the audit log
  cards_json         TEXT    NOT NULL,   -- verified EvidenceCard[]
  dispositions_json  TEXT    NOT NULL,   -- dropped proposals + reasons (show-your-work, G6)
  evaluated_at       TEXT    NOT NULL,
  PRIMARY KEY (claim_key, source_revision_id)
) WITHOUT ROWID;
