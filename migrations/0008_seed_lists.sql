-- ABOUTME: Topic seed-list tables — one seed_lists row per topic, one seed_list_entries row per ranked article.
-- ABOUTME: Pageview-ranked snapshot of category/WikiProject membership; WITHOUT ROWID natural keys (DB-1).
CREATE TABLE seed_lists (
  topic        TEXT    NOT NULL,   -- topic slug: 'military-procurement' | 'infrastructure-megaprojects'
  title        TEXT    NOT NULL,   -- human-readable topic name
  refreshed_at TEXT    NOT NULL,   -- ISO 8601 UTC; staleness check drives the 7-day on-demand refresh
  window_start TEXT    NOT NULL,   -- ISO date (YYYY-MM-DD): first day of the 30-day pageview window
  window_end   TEXT    NOT NULL,   -- ISO date (YYYY-MM-DD): last day of the window
  entry_count  INTEGER NOT NULL,   -- number of seed_list_entries rows for this topic (snapshot size)
  PRIMARY KEY (topic)
) WITHOUT ROWID;

CREATE TABLE seed_list_entries (
  topic          TEXT    NOT NULL REFERENCES seed_lists(topic),
  rank           INTEGER NOT NULL,   -- 1-based rank within the topic by pageview_count DESC
  page_id        INTEGER NOT NULL,   -- Wikipedia pageid (natural id from MediaWiki)
  article_title  TEXT    NOT NULL,
  pageview_count INTEGER NOT NULL,   -- summed views over the window (the ranking key snapshot)
  PRIMARY KEY (topic, rank)
) WITHOUT ROWID;
