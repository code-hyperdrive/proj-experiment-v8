-- Station health-check status, populated by the external scanner CLI.
-- No foreign-key to stations (station catalog lives in a static JSON file,
-- not in D1) — station_id is just the string id from stations.json.
CREATE TABLE IF NOT EXISTS station_status (
  station_id   TEXT    PRIMARY KEY,
  is_online    INTEGER NOT NULL DEFAULT 0,  -- 1 = reachable, 0 = unreachable
  last_checked INTEGER NOT NULL,            -- unix epoch ms
  last_online  INTEGER,                     -- last ms it was confirmed alive (NULL = never seen online)
  error_type   TEXT,                        -- 'timeout' | 'http_error' | 'ssl_error' | 'empty_reply' | 'bad_content'
  check_count  INTEGER NOT NULL DEFAULT 0,  -- total probes ever submitted for this station
  online_count INTEGER NOT NULL DEFAULT 0   -- probes that came back online (useful for reliability %)
);

CREATE INDEX IF NOT EXISTS idx_station_status_online     ON station_status(is_online);
CREATE INDEX IF NOT EXISTS idx_station_status_last_check ON station_status(last_checked DESC);
