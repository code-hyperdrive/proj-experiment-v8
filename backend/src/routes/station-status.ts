/**
 * Station-status routes
 *
 * Public  GET  /api/v1/stations/status          – full status map (frontend polls this)
 * Public  GET  /api/v1/stations/status/:id      – single station
 * Auth    POST /api/v1/stations/status/bulk     – scanner uploads results
 *
 * Station status model (3 states):
 *   active    probe succeeded — stream reachable
 *   inactive  soft/transient error (timeout, bad_content, http_5xx) → grey on map
 *   dead      hard/permanent error (ssl, dns, http_4xx, no streams)  → hidden from map
 *   unscanned never probed
 */

import { Hono } from 'hono';
import type { Env, Vars } from '../types';
import { ValidationError } from '../lib/errors';

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------
function requireScannerKey(env: Env, authHeader: string | undefined): void {
  if (!env.SCANNER_API_KEY)
    throw new ValidationError('SCANNER_API_KEY is not configured on this Worker');
  if (!authHeader || !authHeader.startsWith('Bearer '))
    throw new ValidationError('Missing Authorization header');
  if (authHeader.slice('Bearer '.length).trim() !== env.SCANNER_API_KEY)
    throw new ValidationError('Invalid scanner API key');
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

/**
 * Map probe errorType + consecutiveFailures → station status.
 *
 * Rule: first 1–2 failures are always inactive (grey on map) regardless of
 * error type — the station gets a chance to recover.  Only after 3+ consecutive
 * failures with a hard error does it become dead (hidden from map).
 *
 * Soft errors (timeout, server errors, rate-limit) stay inactive indefinitely.
 * Hard errors (network gone, SSL, connection refused, 4xx, no streams) become
 * dead after 3+ consecutive failures.
 */
function computeStatus(
  isOnline: boolean,
  errorType: string | null,
  consecutiveFailures: number,
): string {
  if (isOnline) return 'active';
  // First two failures: always inactive — give the station a chance
  if (consecutiveFailures < 3) return 'inactive';
  // 3+ consecutive failures: soft errors stay inactive, hard errors → dead
  if (!errorType)                          return 'inactive';
  if (errorType === 'timeout')             return 'inactive';
  if (errorType === 'bad_content')         return 'inactive';
  if (errorType === 'stopped')             return 'inactive';
  if (errorType.startsWith('http_5'))      return 'inactive';
  if (errorType === 'http_429')            return 'inactive';
  return 'dead';
}

// ---------------------------------------------------------------------------
// GET /  — full status map
// ---------------------------------------------------------------------------
app.get('/', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT station_id, is_online, last_checked, last_online, error_type,
            check_count, online_count, status, consecutive_failures
     FROM station_status
     ORDER BY station_id`
  ).all<{
    station_id:           string;
    is_online:            number;
    last_checked:         number;
    last_online:          number | null;
    error_type:           string | null;
    check_count:          number;
    online_count:         number;
    status:               string;
    consecutive_failures: number;
  }>();

  const result: Record<string, object> = {};
  for (const r of rows.results) {
    result[r.station_id] = {
      isOnline:            r.is_online === 1,
      lastChecked:         r.last_checked,
      lastOnline:          r.last_online ?? null,
      errorType:           r.error_type ?? null,
      status:              r.status ?? 'unscanned',
      consecutiveFailures: r.consecutive_failures ?? 0,
      reliability:         r.check_count > 0
        ? Math.round((r.online_count / r.check_count) * 100) : null,
    };
  }

  return c.json({ status: result, count: rows.results.length, generatedAt: Date.now() });
});

// ---------------------------------------------------------------------------
// GET /:id
// ---------------------------------------------------------------------------
app.get('/:id', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT station_id, is_online, last_checked, last_online, error_type,
            check_count, online_count, status, consecutive_failures
     FROM station_status WHERE station_id = ?`
  ).bind(c.req.param('id')).first<{
    station_id:           string;
    is_online:            number;
    last_checked:         number;
    last_online:          number | null;
    error_type:           string | null;
    check_count:          number;
    online_count:         number;
    status:               string;
    consecutive_failures: number;
  }>();

  if (!row) return c.json({ error: 'Station not found in status table' }, 404);

  return c.json({
    stationId:           row.station_id,
    isOnline:            row.is_online === 1,
    lastChecked:         row.last_checked,
    lastOnline:          row.last_online ?? null,
    errorType:           row.error_type ?? null,
    status:              row.status ?? 'unscanned',
    consecutiveFailures: row.consecutive_failures ?? 0,
    reliability:         row.check_count > 0
      ? Math.round((row.online_count / row.check_count) * 100) : null,
  });
});

// ---------------------------------------------------------------------------
// POST /bulk  — scanner uploads results
//
// Body: { results: Array<{ stationId, isOnline, errorType? }> }
// Max 500 per batch.
// ---------------------------------------------------------------------------
app.post('/bulk', async (c) => {
  requireScannerKey(c.env, c.req.header('Authorization'));

  let body: { results?: unknown[] };
  try { body = await c.req.json(); }
  catch { throw new ValidationError('Invalid JSON body'); }

  if (!Array.isArray(body.results) || body.results.length === 0)
    throw new ValidationError('body.results must be a non-empty array');
  if (body.results.length > 500)
    throw new ValidationError('Maximum 500 results per batch');

  const now = Date.now();
  const statements: D1PreparedStatement[] = [];

  for (const item of body.results) {
    if (
      typeof item !== 'object' || item === null ||
      !('stationId' in item) || typeof (item as any).stationId !== 'string' ||
      !('isOnline'  in item) || typeof (item as any).isOnline  !== 'boolean'
    ) throw new ValidationError('Each result needs { stationId: string, isOnline: boolean }');

    const { stationId, isOnline, errorType = null } = item as {
      stationId: string; isOnline: boolean; errorType?: string | null;
    };

    const effectiveError = isOnline ? null : (errorType ?? 'unknown');
    // INSERT path: first-ever probe — consecutive_failures starts at 0 (online) or 1 (offline)
    const initialConsec  = isOnline ? 0 : 1;
    const initialStatus  = computeStatus(isOnline, effectiveError, initialConsec);

    statements.push(
      c.env.DB.prepare(`
        INSERT INTO station_status
          (station_id, is_online, last_checked, last_online, error_type,
           check_count, online_count, status, consecutive_failures)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
        ON CONFLICT(station_id) DO UPDATE SET
          is_online            = excluded.is_online,
          last_checked         = excluded.last_checked,
          last_online          = CASE WHEN excluded.is_online = 1
                                      THEN excluded.last_checked
                                      ELSE station_status.last_online END,
          error_type           = excluded.error_type,
          check_count          = station_status.check_count + 1,
          online_count         = station_status.online_count + excluded.online_count,
          consecutive_failures = CASE WHEN excluded.is_online = 1
                                      THEN 0
                                      ELSE station_status.consecutive_failures + 1 END,
          -- Recompute status using the NEW consecutive_failures value:
          --   online           → active
          --   failures < 3     → inactive (always, regardless of error type)
          --   failures >= 3, soft error → inactive
          --   failures >= 3, hard error → dead
          status = CASE
            WHEN excluded.is_online = 1 THEN 'active'
            WHEN (CASE WHEN excluded.is_online = 1 THEN 0
                       ELSE station_status.consecutive_failures + 1 END) < 3
              THEN 'inactive'
            WHEN excluded.error_type IN ('timeout','bad_content','stopped','http_429')
              THEN 'inactive'
            WHEN excluded.error_type LIKE 'http_5%'
              THEN 'inactive'
            ELSE 'dead'
          END
      `).bind(
        stationId,
        isOnline ? 1 : 0,
        now,
        isOnline ? now : null,
        effectiveError,
        isOnline ? 1 : 0,   // online_count initial
        initialStatus,
        initialConsec,      // consecutive_failures initial
      )
    );
  }

  await c.env.DB.batch(statements);

  return c.json({ ok: true, processed: body.results.length, timestamp: now });
});

// ---------------------------------------------------------------------------
// POST /:id/report-failure  — user-reported playback failure (public, no auth)
//
// Called by the frontend when ALL streams for a station fail in the browser.
// Immediately marks the station inactive so the dot turns grey for everyone.
// Rate-limited: each IP can only report a given station once per hour.
// A subsequent scanner probe can restore it to active if it recovers.
// ---------------------------------------------------------------------------
app.post('/:id/report-failure', async (c) => {
  const stationId = c.req.param('id');
  if (!stationId || stationId.length > 64)
    return c.json({ error: 'Invalid station ID' }, 400);

  // IP-based rate limit: 1 report per stationId per IP per hour
  const ip        = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
  const rlKey     = `report:${ip}:${stationId}`;
  const existing  = await c.env.RATE_LIMIT_KV.get(rlKey);
  if (existing) {
    return c.json({ ok: true, rateLimited: true, message: 'Already recorded your report for this station' });
  }
  // Store for 1 hour
  await c.env.RATE_LIMIT_KV.put(rlKey, '1', { expirationTtl: 3600 });

  const now = Date.now();

  // Upsert: mark offline with error_type='user_reported', increment consecutive_failures.
  // Never downgrades a 'dead' station (already hidden — leave it alone).
  // Never touches an 'active' station that was scanned in the last 30 minutes
  // (fresh scanner data is more reliable than a single browser report).
  await c.env.DB.prepare(`
    INSERT INTO station_status
      (station_id, is_online, last_checked, last_online, error_type,
       check_count, online_count, status, consecutive_failures)
    VALUES (?, 0, ?, NULL, 'user_reported', 1, 0, 'inactive', 1)
    ON CONFLICT(station_id) DO UPDATE SET
      -- Don't touch stations the scanner confirmed active in the last 30 min
      is_online            = CASE WHEN station_status.is_online = 1
                                    AND (? - station_status.last_checked) < 1800000
                                  THEN 1
                                  ELSE 0 END,
      error_type           = CASE WHEN station_status.is_online = 1
                                    AND (? - station_status.last_checked) < 1800000
                                  THEN station_status.error_type
                                  ELSE 'user_reported' END,
      last_checked         = CASE WHEN station_status.is_online = 1
                                    AND (? - station_status.last_checked) < 1800000
                                  THEN station_status.last_checked
                                  ELSE ? END,
      consecutive_failures = CASE WHEN station_status.is_online = 1
                                    AND (? - station_status.last_checked) < 1800000
                                  THEN station_status.consecutive_failures
                                  ELSE station_status.consecutive_failures + 1 END,
      status               = CASE
                               WHEN station_status.status = 'dead' THEN 'dead'
                               WHEN station_status.is_online = 1
                                AND (? - station_status.last_checked) < 1800000
                               THEN station_status.status
                               ELSE 'inactive'
                             END,
      check_count          = station_status.check_count + 1
  `).bind(
    stationId,
    now,
    now, now, now, now, now, now,  // 8× now for the CASE expressions above
  ).run();

  // Return the updated row so the frontend can immediately reflect it
  const row = await c.env.DB.prepare(
    `SELECT status, consecutive_failures FROM station_status WHERE station_id = ?`
  ).bind(stationId).first<{ status: string; consecutive_failures: number }>();

  return c.json({
    ok:                  true,
    stationId,
    status:              row?.status              ?? 'inactive',
    consecutiveFailures: row?.consecutive_failures ?? 1,
  });
});

export default app;
