-- 0004: users — OAuth identity for the metered research layer (single-admin fallback keys to a fixed user_id).
CREATE TABLE users (
  user_id           TEXT NOT NULL,   -- opaque app identity (hashed; never the raw OAuth subject)
  identity_provider TEXT NOT NULL,   -- e.g. 'google'; 'admin' for the single-admin fallback user
  identity_subject  TEXT NOT NULL,   -- provider 'sub' claim (admin → a fixed sentinel)
  email             TEXT NOT NULL,
  created_at        TEXT NOT NULL,   -- ISO 8601 UTC
  PRIMARY KEY (user_id)
) WITHOUT ROWID;
CREATE UNIQUE INDEX users_identity_unique ON users (identity_provider, identity_subject);
