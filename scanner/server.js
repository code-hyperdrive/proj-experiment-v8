/**
 * Radio Station Scanner — local web dashboard
 * Run: node server.js
 * Opens: http://localhost:3000
 */

import express from 'express';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig, loadStations, runScan, uploadResults, fetchCurrentStatus, partitionForRegularScan, errorToStatus } from './core/scanner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let activeScan   = null;   // { emitter, stop, startedAt, options }
let lastScanInfo = null;   // { completedAt, online, offline, total, elapsed, dryRun }
let lastResults  = [];     // array of probe results from last scan
let sseClients   = [];     // active SSE connections

// ---------------------------------------------------------------------------
// Logger (same as CLI)
// ---------------------------------------------------------------------------
function ts() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }

function ensureLogDir(logFile) {
  const dir = resolve(dirname(logFile));
  mkdirSync(dir, { recursive: true });
}

function log(msg, logFile) {
  const line = `[${ts()}] ${msg}`;
  console.log(line);
  if (logFile) {
    ensureLogDir(logFile);
    appendFileSync(logFile, line + '\n');
  }
}

// ---------------------------------------------------------------------------
// SSE broadcast
// ---------------------------------------------------------------------------
function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients = sseClients.filter(res => {
    try { res.write(payload); return true; }
    catch { return false; }
  });
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use(express.static(resolve(__dirname, 'public')));

// GET /api/config
app.get('/api/config', (req, res) => {
  try {
    const cfg = JSON.parse(readFileSync(resolve(__dirname, 'config.json'), 'utf8'));
    res.json(cfg);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/config — save config.json
app.post('/api/config', (req, res) => {
  try {
    const current = JSON.parse(readFileSync(resolve(__dirname, 'config.json'), 'utf8'));
    const updated = { ...current, ...req.body };
    writeFileSync(resolve(__dirname, 'config.json'), JSON.stringify(updated, null, 2));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/scan/state
app.get('/api/scan/state', (req, res) => {
  res.json({
    running:  !!activeScan,
    lastScan: lastScanInfo,
  });
});

// GET /api/scan/results — results from last scan
app.get('/api/scan/results', (req, res) => {
  const filter = req.query.filter || 'all'; // all | online | offline
  let list = lastResults;
  if (filter === 'online')  list = list.filter(r => r.isOnline);
  if (filter === 'offline') list = list.filter(r => !r.isOnline);
  const search = (req.query.q || '').toLowerCase();
  if (search) list = list.filter(r =>
    r.name?.toLowerCase().includes(search) ||
    r.country?.toLowerCase().includes(search) ||
    r.genre?.toLowerCase().includes(search)
  );
  res.json({ results: list, total: lastResults.length });
});

// GET /api/report — full station status report (all stations merged with backend data)
app.get('/api/report', async (req, res) => {
  try {
    const cfg = loadConfig();
    const all = loadStations(cfg.stationsFile);
    const enabled = all.filter(s => s.enabled !== false);

    let statusMap = {};
    try {
      const { status } = await fetchCurrentStatus(cfg);
      statusMap = status || {};
    } catch { /* non-fatal — still return stations with null status */ }

    const now          = Date.now();
    const todayUtc     = new Date(now).toISOString().slice(0, 10);
    const sevenDaysMs  = 7 * 24 * 60 * 60 * 1000;

    const stations = enabled.map(s => {
      const st = statusMap[s.id] || null;

      // Compute next-regular-scan eligibility
      let skipReason = null;
      if (st) {
        const lastCheckedDay = st.lastChecked
          ? new Date(st.lastChecked).toISOString().slice(0, 10) : null;
        if (lastCheckedDay === todayUtc) {
          skipReason = 'already_today';
        } else if ((st.consecutiveFailures || 0) >= 3) {
          skipReason = 'failures_3plus';
        } else if (st.lastOnline && (now - st.lastOnline) > sevenDaysMs) {
          skipReason = 'stale_7days';
        }
      }

      return {
        id:                  s.id,
        name:                s.name,
        country:             s.country  || '',
        genre:               s.genre    || '',
        streamCount:         s.streams?.length || 0,
        // backend status fields
        status:              st?.status              ?? 'unscanned',
        isOnline:            st?.isOnline            ?? null,
        errorType:           st?.errorType           ?? null,
        consecutiveFailures: st?.consecutiveFailures ?? null,
        reliability:         st?.reliability         ?? null,
        lastChecked:         st?.lastChecked         ?? null,
        lastOnline:          st?.lastOnline          ?? null,
        // derived
        daysSinceChecked:    st?.lastChecked ? Math.floor((now - st.lastChecked) / 86400000) : null,
        daysSinceOnline:     st?.lastOnline  ? Math.floor((now - st.lastOnline)  / 86400000) : null,
        nextRegularScan:     skipReason ? `skip:${skipReason}` : 'include',
      };
    });

    // Summary counts
    const summary = {
      total:    stations.length,
      active:   stations.filter(s => s.status === 'active').length,
      inactive: stations.filter(s => s.status === 'inactive').length,
      dead:     stations.filter(s => s.status === 'dead').length,
      unscanned:stations.filter(s => s.status === 'unscanned').length,
      scannedToday: stations.filter(s => s.nextRegularScan === 'skip:already_today').length,
      skippedFailures: stations.filter(s => s.nextRegularScan === 'skip:failures_3plus').length,
      skippedStale:    stations.filter(s => s.nextRegularScan === 'skip:stale_7days').length,
      willScan: stations.filter(s => s.nextRegularScan === 'include').length,
    };

    res.json({ stations, summary, generatedAt: now });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stations — load stations.json with current backend status overlay
app.get('/api/stations', async (req, res) => {
  try {
    const cfg      = loadConfig();
    const all      = loadStations(cfg.stationsFile);
    const enabled  = all.filter(s => s.enabled !== false);

    // Overlay backend status
    let statusMap = {};
    try {
      const { status } = await fetchCurrentStatus(cfg);
      statusMap = status || {};
    } catch { /* non-fatal */ }

    const stations = enabled.map(s => ({
      id:      s.id,
      name:    s.name,
      country: s.country,
      genre:   s.genre,
      status:  s.status,
      streams: s.streams?.length || 0,
      backendStatus: statusMap[s.id] || null,
    }));

    res.json({ stations, total: stations.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/logs — last N lines of scan.log
app.get('/api/logs', (req, res) => {
  try {
    const cfg     = loadConfig();
    const n       = parseInt(req.query.n || '200', 10);
    if (!existsSync(cfg.logFile)) return res.json({ lines: [] });
    const content = readFileSync(cfg.logFile, 'utf8');
    const lines   = content.split('\n').filter(Boolean).slice(-n);
    res.json({ lines });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/scan/start
app.post('/api/scan/start', async (req, res) => {
  if (activeScan) return res.status(409).json({ error: 'A scan is already running. Stop it first.' });

  let cfg;
  try { cfg = loadConfig(); }
  catch (e) { return res.status(500).json({ error: e.message }); }

  const {
    dryRun      = false,
    scanType    = 'regular',   // 'regular' | 'deep'
    limit       = null,
    concurrency = cfg.concurrency,
    timeoutMs   = cfg.timeoutMs,
  } = req.body || {};

  const effectiveCfg = { ...cfg, concurrency, timeoutMs };
  const isDeep = scanType === 'deep';

  let stations;
  let skippedCount = 0;
  try {
    const all = loadStations(cfg.stationsFile);
    stations  = all.filter(s => s.enabled !== false);
    log(`${isDeep ? 'Deep' : 'Regular'} scan started — ${stations.length} enabled stations`, cfg.logFile);

    if (!isDeep) {
      // Regular scan: apply rules — skip already-scanned-today, 3+ failures, stale
      try {
        const { status } = await fetchCurrentStatus(cfg);
        const { toScan, skipped, reasons } = partitionForRegularScan(stations, status);
        skippedCount = skipped.length;
        stations = toScan;
        log(`Regular scan: ${stations.length} to probe, ${skippedCount} skipped`, cfg.logFile);
        log(`  Skipped: already today=${reasons.alreadyToday}, failures≥3=${reasons.tooManyFailures}, stale=${reasons.stale}`, cfg.logFile);
        log(`  To scan: never scanned=${reasons.neverScanned}, recently online=${reasons.recentlyOnline}`, cfg.logFile);
      } catch (e) {
        log(`Warning: could not fetch status for regular scan filter — probing all: ${e.message}`, cfg.logFile);
      }
    }

    if (limit) {
      stations = stations.slice(0, limit);
      log(`Limit applied: ${stations.length} stations`, cfg.logFile);
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  lastResults = [];
  const { emitter, stop } = runScan(stations, effectiveCfg);
  activeScan = { stop, startedAt: Date.now(), options: { dryRun, scanType, limit, concurrency, timeoutMs, skippedCount } };

  emitter.on('result', ({ result, completed, total, online, offline, elapsed }) => {
    lastResults.push(result);
    broadcast('result', { result, completed, total, online, offline, elapsed });
    if (!result.isOnline || result.skipped === false) {
      log(
        `${result.isOnline ? '✅' : '❌'} [${completed}/${total}] ${result.name} — ${result.isOnline ? 'ONLINE' : `OFFLINE (${result.errorType})`}`,
        cfg.logFile
      );
    }
  });

  emitter.on('progress', data => broadcast('progress', data));

  emitter.on('done', async ({ results, online, offline, elapsed }) => {
    lastResults = results;
    lastScanInfo = {
      completedAt: new Date().toISOString(),
      online,
      offline,
      total: results.length,
      elapsed,
      dryRun,
      scanType,
      skipped: skippedCount,
    };
    activeScan = null;

    log(`Scan complete — online: ${online}, offline: ${offline}, elapsed: ${(elapsed/1000).toFixed(1)}s`, cfg.logFile);

    if (!dryRun) {
      try {
        log(`Uploading ${results.filter(r => !r.skipped).length} results to API...`, cfg.logFile);
        await uploadResults(results, effectiveCfg, (batchNum, total, processed) => {
          log(`  Batch ${batchNum}/${total} uploaded (${processed} records)`, cfg.logFile);
          broadcast('upload', { batchNum, total, processed });
        });
        log('Upload complete.', cfg.logFile);
        broadcast('done', { ...lastScanInfo, uploaded: true });
      } catch (e) {
        log(`Upload failed: ${e.message}`, cfg.logFile);
        broadcast('done', { ...lastScanInfo, uploaded: false, uploadError: e.message });
      }
    } else {
      log('Dry run — skipping upload.', cfg.logFile);
      broadcast('done', { ...lastScanInfo, uploaded: false, dryRun: true });
    }
  });

  emitter.on('stopped', () => {
    const online  = lastResults.filter(r => r.isOnline).length;
    const offline = lastResults.filter(r => !r.isOnline).length;
    lastScanInfo  = {
      completedAt: new Date().toISOString(),
      online, offline, total: lastResults.length,
      elapsed: Date.now() - activeScan?.startedAt,
      stopped: true, dryRun, scanType,
      skipped: skippedCount,
    };
    activeScan = null;
    log(`Scan stopped by user — ${lastResults.length} probed so far`, cfg.logFile);
    broadcast('stopped', lastScanInfo);
  });

  emitter.on('error', err => {
    activeScan = null;
    log(`Scan error: ${err.message}`, cfg.logFile);
    broadcast('error', { message: err.message });
  });

  res.json({ ok: true, total: stations.length, options: activeScan.options });
});

// POST /api/scan/stop
app.post('/api/scan/stop', (req, res) => {
  if (!activeScan) return res.status(400).json({ error: 'No scan running' });
  activeScan.stop();
  res.json({ ok: true });
});

// GET /api/scan/events  — SSE stream
app.get('/api/scan/events', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  // Send current state immediately on connect
  res.write(`event: state\ndata: ${JSON.stringify({
    running:  !!activeScan,
    lastScan: lastScanInfo,
  })}\n\n`);

  sseClients.push(res);
  req.on('close', () => { sseClients = sseClients.filter(c => c !== res); });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, async () => {
  const url = `http://localhost:${PORT}`;
  console.log('');
  console.log('════════════════════════════════════════');
  console.log('  📡  Radio Station Scanner');
  console.log(`  🌐  ${url}`);
  console.log('  Press Ctrl+C to stop');
  console.log('════════════════════════════════════════');
  console.log('');

  // Auto-open browser
  try {
    const { default: open } = await import('open');
    await open(url);
  } catch { /* non-fatal */ }
});
