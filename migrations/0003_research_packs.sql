-- 0003: research_packs — metered LLM research results per (claim_key, source_revision_id).
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
