-- Backend-owned session store, replacing Firebase Auth. Opaque bearer
-- tokens — only their SHA-256 hash is ever stored here (see lib/session.ts).
-- No signing key/secret is needed anywhere: verification is a lookup by
-- hash, not a cryptographic signature check.

CREATE TABLE sessions (
  token_hash    TEXT PRIMARY KEY,   -- SHA-256 hex digest of the raw session token
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
