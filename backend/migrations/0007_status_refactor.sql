-- Introduce cleaner 3-state status model and consecutive_failures counter.
--
-- status values:
--   active    probe succeeded — stream is reachable
--   inactive  soft/transient error (timeout, bad_content, http_5xx) — may recover
--   dead      hard/permanent error (ssl, dns, connection_refused, http_4xx) — hide from map
--   unscanned never probed (default)
--
-- consecutive_failures: incremented on every failed probe, reset to 0 on success.
-- Regular scan skips stations with consecutive_failures >= 3.

ALTER TABLE station_status ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE station_status ADD COLUMN status TEXT NOT NULL DEFAULT 'unscanned';

-- Back-fill from existing data
UPDATE station_status SET status = 'active'   WHERE is_online = 1;
UPDATE station_status SET status = 'inactive' WHERE is_online = 0
  AND scan_category = 'transient';
UPDATE station_status SET status = 'dead'     WHERE is_online = 0
  AND scan_category IN ('dead_network','dead_ssl','dead_http','dead_content');

-- Approximate consecutive_failures from existing offline rows
-- (we don't have per-scan history, so seed with 1 for any offline row)
UPDATE station_status SET consecutive_failures = 1
  WHERE is_online = 0 AND consecutive_failures = 0;

CREATE INDEX IF NOT EXISTS idx_station_status_status ON station_status(status);
CREATE INDEX IF NOT EXISTS idx_station_status_consec  ON station_status(consecutive_failures);
