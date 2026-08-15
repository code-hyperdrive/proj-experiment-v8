-- Radio Explorer backend — initial schema (Phase 1, Milestone 1).
-- Replaces Firestore's users/usernames/stats collections. See
-- IMPROVEMENT_PLAN.md and the approved plan doc for the full rationale.

CREATE TABLE users (
  id                    TEXT PRIMARY KEY,           -- Firebase Auth uid (JWT 'sub' claim) — never client-supplied
  custom_id             TEXT UNIQUE,                 -- cosmetic display handle only, NOT a recovery/auth mechanism
  display_name          TEXT,
  is_anonymous          INTEGER NOT NULL DEFAULT 1,  -- 0/1 boolean
  sign_in_provider      TEXT NOT NULL DEFAULT 'anonymous',
  created_at            INTEGER NOT NULL,            -- unix ms
  last_sync_at          INTEGER,
  last_active_date      TEXT,                        -- 'YYYY-MM-DD', server-derived (UTC), never client-supplied
  preferences_json      TEXT NOT NULL DEFAULT '{}',
  genre_stats_json      TEXT NOT NULL DEFAULT '{}',
  country_stats_json    TEXT NOT NULL DEFAULT '{}',
  total_listening_time  INTEGER NOT NULL DEFAULT 0   -- seconds
);

CREATE TABLE favorites (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  station_id  TEXT NOT NULL,
  position    INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, station_id)
);
CREATE INDEX idx_favorites_user_position ON favorites(user_id, position);

CREATE TABLE history (
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  station_id        TEXT NOT NULL,
  genre             TEXT,
  country           TEXT,
  played_at         INTEGER NOT NULL,   -- unix ms
  duration_seconds  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, played_at, station_id)
);
CREATE INDEX idx_history_user_time ON history(user_id, played_at DESC);

-- Singleton row — site-wide "connected/active users" counter (public read).
CREATE TABLE stats_global (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  connected_users INTEGER NOT NULL DEFAULT 0,
  active_users    INTEGER NOT NULL DEFAULT 0,
  last_updated    INTEGER NOT NULL DEFAULT 0
);
INSERT INTO stats_global (id, connected_users, active_users, last_updated) VALUES (1, 0, 0, 0);
