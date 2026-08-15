-- Add scan_category to station_status.
-- Computed by the backend on every bulk upload based on the probe result
-- + the station's last_online history.
--
-- Values:
--   online        currently reachable
--   transient     currently failing but was online within the last 7 days (worth retrying)
--   dead_network  timeout / connection refused / generic network error
--   dead_ssl      SSL / certificate error
--   dead_content  server responds but sends non-audio data
--   dead_http     HTTP 4xx / 5xx response
--   unscanned     never probed (default)

ALTER TABLE station_status ADD COLUMN scan_category TEXT NOT NULL DEFAULT 'unscanned';

-- Back-fill existing rows
UPDATE station_status SET scan_category = 'online' WHERE is_online = 1;
UPDATE station_status SET scan_category = 'dead_network'
  WHERE is_online = 0
    AND (error_type IN ('timeout','connection_refused','network_error','empty_reply') OR error_type IS NULL)
    AND (last_online IS NULL OR (unixepoch() * 1000 - last_online) > 7 * 86400 * 1000);
UPDATE station_status SET scan_category = 'dead_ssl'
  WHERE is_online = 0 AND error_type = 'ssl_error'
    AND (last_online IS NULL OR (unixepoch() * 1000 - last_online) > 7 * 86400 * 1000);
UPDATE station_status SET scan_category = 'dead_content'
  WHERE is_online = 0 AND error_type = 'bad_content'
    AND (last_online IS NULL OR (unixepoch() * 1000 - last_online) > 7 * 86400 * 1000);
UPDATE station_status SET scan_category = 'dead_http'
  WHERE is_online = 0 AND error_type LIKE 'http_%'
    AND (last_online IS NULL OR (unixepoch() * 1000 - last_online) > 7 * 86400 * 1000);
-- Anything offline but was online recently → transient
UPDATE station_status SET scan_category = 'transient'
  WHERE is_online = 0
    AND scan_category = 'unscanned'
    AND last_online IS NOT NULL
    AND (unixepoch() * 1000 - last_online) <= 7 * 86400 * 1000;

CREATE INDEX IF NOT EXISTS idx_station_status_category ON station_status(scan_category);
