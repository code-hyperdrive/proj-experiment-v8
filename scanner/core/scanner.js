/**
 * Core scanning logic — shared by CLI (scan.js) and web server (server.js).
 *
 * Station status model (3 states):
 *   active    probe succeeded
 *   inactive  soft error OR fewer than 3 consecutive failures → grey dot on map
 *   dead      hard error AND 3+ consecutive failures → hidden from map
 *
 * Key rule: first 1–2 failures are ALWAYS inactive regardless of error type.
 * Only after 3 consecutive hard-error failures does a station become dead.
 *
 * Regular scan rules — include a station if ALL true:
 *   1. NOT already scanned today (UTC calendar day)
 *   2. consecutive_failures < 3
 *   3. Never scanned (not in DB)  OR  last_online within past 7 days
 *
 * Deep scan — probe every station, ignore all history.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Status helpers (mirror of backend computeStatus — used for display only)
// ---------------------------------------------------------------------------

/** Soft errors → inactive (keep on map as grey) */
const INACTIVE_ERRORS = new Set([
  'timeout', 'bad_content', 'stopped',
  'http_500', 'http_502', 'http_503', 'http_504', 'http_429',
]);

/**
 * Map an errorType + consecutiveFailures to the 3-state status value.
 * Mirrors backend computeStatus — used for scan summary display only
 * (the authoritative value is computed and stored by the backend).
 *
 * @param {string|null} errorType
 * @param {number} consecutiveFailures  how many failures in a row (after this probe)
 */
export function errorToStatus(errorType, consecutiveFailures = 1) {
  if (!errorType)                          return 'inactive';
  if (consecutiveFailures < 3)             return 'inactive'; // first 1–2 always grey
  if (INACTIVE_ERRORS.has(errorType))      return 'inactive';
  if (/^http_5/.test(errorType))           return 'inactive';
  if (errorType === 'http_429')            return 'inactive';
  return 'dead';
}

// ---------------------------------------------------------------------------
// Regular scan partition
// ---------------------------------------------------------------------------

/** Return the UTC calendar day string 'YYYY-MM-DD' for a timestamp (ms) */
function utcDay(tsMs) {
  return new Date(tsMs).toISOString().slice(0, 10);
}

/**
 * Partition stations into { toScan, skipped } for a regular scan.
 *
 * Include if ALL true:
 *   ① NOT already scanned today (UTC)
 *   ② consecutive_failures < 3
 *   ③ Never in DB  OR  last_online within 7 days
 *
 * @param {object[]} stations   Enabled stations array
 * @param {object}   statusMap  Map of stationId → backend status object
 * @returns {{ toScan: object[], skipped: object[], reasons: object }}
 */
export function partitionForRegularScan(stations, statusMap) {
  const toScan  = [];
  const skipped = [];
  const reasons = { neverScanned: 0, recentlyOnline: 0,
                    alreadyToday: 0, tooManyFailures: 0, stale: 0 };

  const todayUtc      = utcDay(Date.now());
  const sevenDaysAgo  = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const station of stations) {
    const s = statusMap[station.id];

    // ① Never in the DB → always include
    if (!s) {
      toScan.push(station);
      reasons.neverScanned++;
      continue;
    }

    // ② Already scanned today (UTC) → skip
    if (s.lastChecked && utcDay(s.lastChecked) === todayUtc) {
      skipped.push(station);
      reasons.alreadyToday++;
      continue;
    }

    // ③ 3+ consecutive failures → skip until deep scan
    if ((s.consecutiveFailures || 0) >= 3) {
      skipped.push(station);
      reasons.tooManyFailures++;
      continue;
    }

    // ④ Last online within 7 days → include (worth retrying)
    if (s.lastOnline && s.lastOnline > sevenDaysAgo) {
      toScan.push(station);
      reasons.recentlyOnline++;
      continue;
    }

    // ⑤ Never been found online (lastOnline = null) but < 3 failures → include
    if (!s.lastOnline) {
      toScan.push(station);
      reasons.neverScanned++;
      continue;
    }

    // ⑥ Was online but > 7 days ago → stale, skip (wait for deep scan)
    skipped.push(station);
    reasons.stale++;
  }

  return { toScan, skipped, reasons };
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
export function loadConfig() {
  const file = resolve(ROOT, 'config.json');
  if (!existsSync(file))
    throw new Error('config.json not found — copy config.example.json to config.json');
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    return {
      apiKey:       raw.apiKey         || '',
      apiBase:      (raw.apiBaseUrl    || 'https://radio-explorer-api.ramsharans-rathore.workers.dev').replace(/\/$/, ''),
      stationsFile: resolve(ROOT, raw.stationsFile  || '../frontend/data/stations.json'),
      concurrency:  raw.concurrency    || 50,
      timeoutMs:    raw.probeTimeoutMs || 8000,
      batchSize:    raw.uploadBatchSize || 200,
      logFile:      resolve(ROOT, raw.logFile || './logs/scan.log'),
    };
  } catch (e) {
    throw new Error(`Failed to parse config.json: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Load stations
// ---------------------------------------------------------------------------
export function loadStations(stationsFile) {
  const raw = JSON.parse(readFileSync(stationsFile, 'utf8'));
  return Array.isArray(raw) ? raw : (raw.stations || []);
}

// ---------------------------------------------------------------------------
// Probe one stream URL
// ---------------------------------------------------------------------------
export async function probeStream(url, timeoutMs, stopSignal = null) {
  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => timeoutCtrl.abort(), timeoutMs);

  // Wire stop signal → immediately abort this fetch
  let stopListener = null;
  if (stopSignal) {
    stopListener = () => timeoutCtrl.abort();
    stopSignal.addEventListener('abort', stopListener, { once: true });
  }

  try {
    const isHls = /\.m3u8|chunklist|playlist/i.test(url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RadioScanner/1.0)',
        'Accept': isHls ? 'application/vnd.apple.mpegurl, */*' : 'audio/*, */*',
        ...(isHls ? {} : { 'Range': 'bytes=0-4095' }),
      },
      signal: timeoutCtrl.signal,
      redirect: 'follow',
    });

    if (isHls) {
      if (!response.ok)
        return { isOnline: false, errorType: `http_${response.status}`, detail: `HTTP ${response.status}` };
      const text = await response.text();
      if (!text.includes('#EXTM3U') && !text.includes('#EXT-X-'))
        return { isOnline: false, errorType: 'bad_content', detail: `no #EXTM3U (got: ${text.slice(0, 60).replace(/\n/g, '↵')})` };
      return { isOnline: true, errorType: null, detail: 'HLS OK' };
    }

    if (response.status !== 200 && response.status !== 206)
      return { isOnline: false, errorType: `http_${response.status}`, detail: `HTTP ${response.status}` };

    const ct        = (response.headers.get('content-type') || '').toLowerCase();
    const isAudioCT = /audio\/|mpeg|ogg|flac|aac|octet-stream/.test(ct);

    if (!isAudioCT) {
      const buf   = await response.arrayBuffer();
      const bytes = new Uint8Array(buf.slice(0, 4));
      const ok    =
        (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || // ID3
        (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0)              || // MP3
        (bytes[0] === 0x4F && bytes[1] === 0x67)                       || // OGG
        (bytes[0] === 0x66 && bytes[1] === 0x4C);                         // FLAC
      if (!ok)
        return { isOnline: false, errorType: 'bad_content', detail: `content-type: ${ct || 'none'}, no audio magic bytes` };
      return { isOnline: true, errorType: null, detail: 'audio bytes OK' };
    }

    await response.arrayBuffer();
    return { isOnline: true, errorType: null, detail: `OK (${ct})` };

  } catch (err) {
    if (err.name === 'AbortError') {
      if (stopSignal?.aborted)
        return { isOnline: false, errorType: 'stopped', detail: 'scan stopped by user' };
      return { isOnline: false, errorType: 'timeout', detail: `timed out after ${timeoutMs}ms` };
    }
    const msg = (err.message || '').toLowerCase();
    if (/ssl|cert|tls/.test(msg))
      return { isOnline: false, errorType: 'ssl_error', detail: err.message };
    if (/econnrefused|enotfound|econnreset/.test(msg))
      return { isOnline: false, errorType: 'connection_refused', detail: err.message };
    return { isOnline: false, errorType: 'network_error', detail: err.message };
  } finally {
    clearTimeout(timer);
    if (stopListener) stopSignal?.removeEventListener('abort', stopListener);
  }
}

// ---------------------------------------------------------------------------
// Probe one station — tries each stream URL; online if ANY works
// ---------------------------------------------------------------------------
export async function probeStation(station, timeoutMs, stopSignal = null) {
  const streams = station.streams || [];

  if (streams.length === 0)
    return { stationId: station.id, name: station.name, country: station.country,
             genre: station.genre, isOnline: false, errorType: 'no_streams', streamResults: [] };

  if (streams[0]?.type === 'web-player')
    return { stationId: station.id, name: station.name, country: station.country,
             genre: station.genre, isOnline: true, errorType: null, skipped: true, streamResults: [] };

  const streamResults = [];
  for (const stream of streams) {
    if (!stream.url) continue;
    if (stopSignal?.aborted) break;
    const result = await probeStream(stream.url, timeoutMs, stopSignal);
    streamResults.push({ url: stream.url, ...result });
    if (result.isOnline)
      return { stationId: station.id, name: station.name, country: station.country,
               genre: station.genre, isOnline: true, errorType: null, streamResults };
  }

  const lastError = streamResults.at(-1)?.errorType || 'unknown';
  return { stationId: station.id, name: station.name, country: station.country,
           genre: station.genre, isOnline: false, errorType: lastError, streamResults };
}

// ---------------------------------------------------------------------------
// Run a scan — returns { emitter, stop() }
//
// Emits:
//   result    { result, completed, total, online, offline, elapsed }
//   progress  { completed, total, online, offline, elapsed }  (every 500ms)
//   done      { results, online, offline, elapsed }
//   stopped   {}
//   error     Error
// ---------------------------------------------------------------------------
export function runScan(stations, cfg) {
  const emitter  = new EventEmitter();
  const stopCtrl = new AbortController();
  let stopped    = false;

  const run = async () => {
    const total    = stations.length;
    const results  = new Array(total);
    let index      = 0;
    let completed  = 0;
    const t0       = Date.now();
    let lastProgAt = Date.now();

    async function worker() {
      while (index < stations.length && !stopped) {
        const i      = index++;
        const result = await probeStation(stations[i], cfg.timeoutMs, stopCtrl.signal);
        if (stopped) break;

        results[i] = result;
        completed++;

        const online  = results.filter(r => r?.isOnline).length;
        const offline = completed - online;
        const elapsed = Date.now() - t0;

        emitter.emit('result', { result, completed, total, online, offline, elapsed });

        if (Date.now() - lastProgAt >= 500) {
          lastProgAt = Date.now();
          emitter.emit('progress', { completed, total, online, offline, elapsed });
        }
      }
    }

    try {
      await Promise.all(
        Array.from({ length: Math.min(cfg.concurrency, stations.length) }, worker)
      );
      if (stopped) {
        emitter.emit('stopped', {});
      } else {
        const online  = results.filter(r => r?.isOnline).length;
        const offline = results.filter(r => !r?.isOnline).length;
        emitter.emit('done', { results: results.filter(Boolean), online, offline, elapsed: Date.now() - t0 });
      }
    } catch (err) {
      emitter.emit('error', err);
    }
  };

  run();
  return {
    emitter,
    stop: () => { stopped = true; stopCtrl.abort(); },
  };
}

// ---------------------------------------------------------------------------
// Upload results to backend API
// ---------------------------------------------------------------------------
export async function uploadResults(results, cfg, onBatch) {
  const uploadable = results.filter(r => !r?.skipped);
  const batches    = [];
  for (let i = 0; i < uploadable.length; i += cfg.batchSize)
    batches.push(uploadable.slice(i, i + cfg.batchSize));

  for (let i = 0; i < batches.length; i++) {
    const res = await fetch(`${cfg.apiBase}/api/v1/stations/status/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ results: batches[i] }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${res.status}: ${text}`);
    }
    const json = await res.json();
    if (onBatch) onBatch(i + 1, batches.length, json.processed);
  }
}

// ---------------------------------------------------------------------------
// Fetch current status from backend
// ---------------------------------------------------------------------------
export async function fetchCurrentStatus(cfg) {
  const res = await fetch(`${cfg.apiBase}/api/v1/stations/status`);
  if (!res.ok) throw new Error(`Failed to fetch status: ${res.status}`);
  return res.json();
}
