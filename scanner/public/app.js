/* ── Dashboard frontend ──────────────────────────────────── */

const $ = id => document.getElementById(id);
const qs = sel => document.querySelector(sel);

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab, .tab-panel').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');
    $(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'logs')      loadLogs();
    if (btn.dataset.tab === 'settings') loadSettings();
    if (btn.dataset.tab === 'report')   loadReport();
    if (btn.dataset.tab === 'stations') loadStationsTab();
  });
});

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let scanRunning    = false;
let feedFilter     = 'all';
let allFeedResults = []; // holds every result for the current scan
let elapsedTimer   = null;
let scanStartMs    = 0;

// ---------------------------------------------------------------------------
// SSE connection
// ---------------------------------------------------------------------------
let evtSource = null;

function connectSSE() {
  if (evtSource) evtSource.close();
  evtSource = new EventSource('/api/scan/events');

  evtSource.addEventListener('state', e => {
    const { running, lastScan } = JSON.parse(e.data);
    setScanRunning(running);
    if (lastScan) updateLastScanLabel(lastScan);
  });

  evtSource.addEventListener('result', e => {
    const { result, completed, total, online, offline, elapsed } = JSON.parse(e.data);
    appendFeedRow(result);
    updateProgress(completed, total, online, offline, elapsed);
  });

  evtSource.addEventListener('progress', e => {
    const { completed, total, online, offline, elapsed } = JSON.parse(e.data);
    updateProgress(completed, total, online, offline, elapsed);
  });

  evtSource.addEventListener('upload', e => {
    const { batchNum, total } = JSON.parse(e.data);
    $('statusText').textContent = `Uploading batch ${batchNum}/${total}…`;
  });

  evtSource.addEventListener('done', e => {
    const data = JSON.parse(e.data);
    setScanRunning(false);
    updateLastScanLabel(data);
    updateStats(data.online, data.offline, data.total, data.skipped);
    $('statusText').textContent = data.dryRun ? 'Dry run complete' : 'Scan complete';
    $('statusDot').className = 'status-dot done';
    const skipNote = data.skipped > 0 ? `, ${data.skipped} skipped` : '';
    const mode = data.scanType === 'deep' ? 'Deep' : 'Regular';
    showToast(data.dryRun
      ? `${mode} dry run done — ${data.online} online, ${data.offline} offline${skipNote}`
      : `${mode} scan complete — ${data.online} online, ${data.offline} offline${skipNote} — uploaded`
    );
  });

  evtSource.addEventListener('stopped', e => {
    setScanRunning(false);
    $('statusText').textContent = 'Stopped';
    $('statusDot').className = 'status-dot';
  });

  evtSource.addEventListener('error', () => {
    // SSE connection dropped — retry in 3s
    setTimeout(connectSSE, 3000);
  });
}
connectSSE();

// ---------------------------------------------------------------------------
// Scan controls
// ---------------------------------------------------------------------------
async function startScan(scanType) {
  const limit       = parseInt($('optLimit').value || '0', 10);
  const concurrency = parseInt($('optConcurrency').value || '50', 10);
  const timeoutMs   = parseInt($('optTimeout').value || '8000', 10);
  const dryRun      = $('optDryRun').checked;
  const isDeep      = scanType === 'deep';

  allFeedResults = [];
  renderFeed();
  $('pSkipped').textContent = '0';
  $('statSkipped').textContent = '—';

  try {
    const res = await api('POST', '/api/scan/start', {
      dryRun,
      scanType,
      limit: limit > 0 ? limit : null,
      concurrency,
      timeoutMs,
    });
    setScanRunning(true);
    scanStartMs = Date.now();
    $('progressBar').style.width = '0%';
    $('progressPct').textContent = '0%';
    $('progressLabel').textContent = `${isDeep ? 'Deep' : 'Regular'} scan${dryRun ? ' (dry run)' : ''}…`;
    $('progressCard').style.display = '';
    $('pSkipped').textContent = (res.options?.skippedCount || 0).toLocaleString();
    updateProgress(0, res.total, 0, 0, 0);
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

$('btnRegular').addEventListener('click', () => startScan('regular'));
$('btnDeep').addEventListener('click',    () => startScan('deep'));

$('btnStop').addEventListener('click', async () => {
  try {
    await api('POST', '/api/scan/stop');
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
});

// ---------------------------------------------------------------------------
// Feed filter chips
// ---------------------------------------------------------------------------
document.querySelectorAll('[data-feed-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-feed-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    feedFilter = btn.dataset.feedFilter;
    renderFeed();
  });
});

// ---------------------------------------------------------------------------
// Progress helpers
// ---------------------------------------------------------------------------
function updateProgress(completed, total, online, offline, elapsed) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  $('progressBar').style.width = `${pct}%`;
  $('progressPct').textContent = `${pct}%`;
  $('pOnline').textContent  = online;
  $('pOffline').textContent = offline;
  $('pElapsed').textContent = fmtElapsed(elapsed);
  $('pAvail').textContent   = completed > 0 ? `${Math.round(online / completed * 100)}%` : '—';
  $('progressLabel').textContent = `${completed.toLocaleString()} / ${total.toLocaleString()} stations`;
}

function updateStats(online, offline, total, skipped) {
  $('statTotal').textContent   = total?.toLocaleString()   ?? '—';
  $('statOnline').textContent  = online?.toLocaleString()  ?? '—';
  $('statOffline').textContent = offline?.toLocaleString() ?? '—';
  $('statSkipped').textContent = skipped != null ? skipped.toLocaleString() : '—';
}

function updateLastScanLabel(info) {
  if (!info) return;
  const when    = info.completedAt ? new Date(info.completedAt).toLocaleString() : '';
  const mode    = info.scanType === 'deep' ? 'Deep' : 'Regular';
  const skipped = info.skipped || 0;
  const skipStr = skipped > 0 ? `, ${skipped} skipped` : '';
  $('lastScanLabel').textContent = info.stopped
    ? `${mode} scan stopped at ${when} — ${info.total} probed${skipStr}`
    : `${mode} scan: ${when} — ${info.online} online / ${info.offline} offline${skipStr}`;
  updateStats(info.online, info.offline, info.total, info.skipped);
  $('progressCard').style.display = '';
  if (skipped > 0) $('pSkipped').textContent = skipped.toLocaleString();
  updateProgress(info.total, info.total, info.online, info.offline, info.elapsed || 0);
}

// ---------------------------------------------------------------------------
// Live feed
// ---------------------------------------------------------------------------
function getErrCls(errorType) {
  if (!errorType) return '';
  if (errorType === 'ssl_error')     return 'err-ssl';
  if (errorType === 'bad_content')   return 'err-content';
  if (errorType.startsWith('http_')) return 'err-http';
  return 'err-net'; // timeout, connection_refused, network_error
}

function appendFeedRow(result) {
  allFeedResults.unshift(result); // newest at top
  if (allFeedResults.length > 2000) allFeedResults.length = 2000;
  renderFeed();
}

function renderFeed() {
  const feed = $('liveFeed');
  const rows = feedFilter === 'offline'
    ? allFeedResults.filter(r => !r.isOnline)
    : allFeedResults;

  if (rows.length === 0) {
    feed.innerHTML = '<div class="feed-empty">No results yet.</div>';
    return;
  }

  // Render only top 300 for performance
  feed.innerHTML = rows.slice(0, 300).map(r => {
    const icon    = r.isOnline ? '✅' : '❌';
    const cls     = r.isOnline ? 'online' : 'offline';
    const errCls  = getErrCls(r.errorType);
    const errPart = !r.isOnline ? `<span class="feed-error ${errCls}">${r.errorType || ''}</span>` : '';
    return `<div class="feed-row ${cls}">
      <span class="feed-icon">${icon}</span>
      <span class="feed-name" title="${esc(r.name)}">${esc(r.name)}</span>
      <span class="feed-country">${esc(r.country || '')}</span>
      ${errPart}
    </div>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Stations tab
// ---------------------------------------------------------------------------
let allStations = [];

$('btnLoadStations').addEventListener('click', loadStationsTab);
$('stationSearch').addEventListener('input',  filterStationsTable);
$('stationFilter').addEventListener('change', filterStationsTable);

async function loadStationsTab() {
  $('stationTableBody').innerHTML = '<tr><td colspan="9" class="empty-row">Loading…</td></tr>';
  try {
    const res = await api('GET', '/api/report');
    allStations = res.stations || [];
    $('stationCount').textContent = allStations.length.toLocaleString();
    filterStationsTable();
  } catch (err) {
    console.error('loadStationsTab error:', err);
    $('stationTableBody').innerHTML = `<tr><td colspan="9" class="empty-row" style="color:var(--red)">Error: ${esc(err.message)}</td></tr>`;
  }
}

function filterStationsTable() {
  // guard: called before data loaded (e.g. from search/filter events)
  if (!allStations.length) return;

  const q      = ($('stationSearch').value || '').toLowerCase();
  const filter = $('stationFilter').value;

  let rows = allStations;
  if (q) rows = rows.filter(s =>
    s.name?.toLowerCase().includes(q) ||
    s.country?.toLowerCase().includes(q) ||
    s.genre?.toLowerCase().includes(q) ||
    s.errorType?.toLowerCase().includes(q)
  );
  if (filter === 'online')    rows = rows.filter(s => s.status === 'active');
  if (filter === 'transient') rows = rows.filter(s => s.status === 'inactive');
  if (filter === 'dead')      rows = rows.filter(s => s.status === 'dead');
  if (filter === 'unscanned') rows = rows.filter(s => s.status === 'unscanned');

  $('stationCount').textContent = rows.length.toLocaleString();

  const body = $('stationTableBody');
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="9" class="empty-row">No stations match.</td></tr>';
    return;
  }

  const PILL_MAP = {
    active:    '<span class="status-pill online">✅ Active</span>',
    inactive:  '<span class="status-pill transient">🔘 Inactive</span>',
    dead:      '<span class="status-pill dead">💀 Dead</span>',
    unscanned: '<span class="status-pill unscanned">❓ Unscanned</span>',
  };

  body.innerHTML = rows.map(s => {
    const pill        = PILL_MAP[s.status] || PILL_MAP.unscanned;
    const lastChecked = s.lastChecked ? fmtDateTime(s.lastChecked) : '—';
    const errorType   = s.errorType   || '—';
    const consec      = s.consecutiveFailures != null ? s.consecutiveFailures : '—';
    const consecCls   = (s.consecutiveFailures || 0) >= 3 ? 'color:var(--orange);font-weight:700' : 'color:var(--muted)';
    const reliability = s.reliability != null ? `${s.reliability}%` : '—';

    return `<tr>
      <td>${pill}</td>
      <td title="${esc(s.name)}" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.name)}</td>
      <td>${esc(s.country || '—')}</td>
      <td style="font-size:11px">${esc(s.genre || '—')}</td>
      <td style="text-align:center">${s.streamCount ?? '—'}</td>
      <td style="font-size:11px;color:var(--red);font-family:monospace">${esc(errorType)}</td>
      <td style="text-align:center;${consecCls}">${consec}</td>
      <td style="font-size:11px;color:var(--blue);text-align:center">${reliability}</td>
      <td style="font-size:11px;color:var(--muted)">${lastChecked}</td>
    </tr>`;
  }).join('');
}


// ---------------------------------------------------------------------------
// Logs tab
// ---------------------------------------------------------------------------
async function loadLogs() {
  try {
    const { lines } = await api('GET', '/api/logs?n=300');
    const pre = $('logOutput');
    if (!lines.length) { pre.innerHTML = '<span class="log-empty">No log entries yet.</span>'; return; }
    pre.innerHTML = lines.map(line => {
      let cls = '';
      if (line.includes('❌') || line.includes('OFFLINE') || line.includes('Fatal') || line.includes('Error')) cls = 'log-line-err';
      else if (line.includes('✅') || line.includes('ONLINE') || line.includes('complete') || line.includes('Upload')) cls = 'log-line-ok';
      else if (line.includes('⚠') || line.includes('Warn') || line.includes('stopped')) cls = 'log-line-warn';
      else if (line.includes('Starting') || line.includes('Loading') || line.includes('Scan')) cls = 'log-line-info';
      return `<span class="${cls}">${esc(line)}</span>`;
    }).join('\n');
    if ($('autoScrollLog').checked) pre.scrollTop = pre.scrollHeight;
  } catch (err) {
    $('logOutput').textContent = `Error loading logs: ${err.message}`;
  }
}

$('btnRefreshLogs').addEventListener('click', loadLogs);
$('btnClearLogs').addEventListener('click', () => {
  $('logOutput').innerHTML = '<span class="log-empty">View cleared (log file unchanged).</span>';
});

// ---------------------------------------------------------------------------
// Settings tab
// ---------------------------------------------------------------------------
async function loadSettings() {
  try {
    const cfg = await api('GET', '/api/config');
    $('cfgApiKey').value       = cfg.apiKey        || '';
    $('cfgApiBase').value      = cfg.apiBaseUrl     || '';
    $('cfgStationsFile').value = cfg.stationsFile   || '';
    $('cfgConcurrency').value  = cfg.concurrency    || 50;
    $('cfgTimeout').value      = cfg.probeTimeoutMs || 8000;
    $('cfgBatchSize').value    = cfg.uploadBatchSize|| 200;
    $('cfgLogFile').value      = cfg.logFile        || '';
    // Sync scan option defaults with config
    $('optConcurrency').value  = cfg.concurrency    || 50;
    $('optTimeout').value      = cfg.probeTimeoutMs || 8000;
  } catch (err) {
    showToast(`Failed to load config: ${err.message}`, 'error');
  }
}

$('btnToggleKey').addEventListener('click', () => {
  const input = $('cfgApiKey');
  if (input.type === 'password') { input.type = 'text'; $('btnToggleKey').textContent = 'Hide'; }
  else { input.type = 'password'; $('btnToggleKey').textContent = 'Show'; }
});

$('btnSaveSettings').addEventListener('click', async () => {
  try {
    await api('POST', '/api/config', {
      apiKey:          $('cfgApiKey').value,
      apiBaseUrl:      $('cfgApiBase').value,
      stationsFile:    $('cfgStationsFile').value,
      concurrency:     parseInt($('cfgConcurrency').value, 10),
      probeTimeoutMs:  parseInt($('cfgTimeout').value, 10),
      uploadBatchSize: parseInt($('cfgBatchSize').value, 10),
      logFile:         $('cfgLogFile').value,
    });
    $('saveMsg').textContent = '✓ Saved';
    setTimeout(() => { $('saveMsg').textContent = ''; }, 3000);
  } catch (err) {
    showToast(`Save failed: ${err.message}`, 'error');
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function setScanRunning(running) {
  scanRunning = running;
  $('btnRegular').disabled = running;
  $('btnDeep').disabled    = running;
  $('btnStop').disabled    = !running;
  $('statusDot').className = running ? 'status-dot running' : 'status-dot';
  $('statusText').textContent = running ? 'Scanning…' : 'Idle';
  if (running) $('progressCard').style.display = '';
}

function fmtElapsed(ms) {
  if (!ms) return '0s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let toastTimer;
function showToast(msg, type = 'ok') {
  clearTimeout(toastTimer);
  let el = qs('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
    Object.assign(el.style, {
      position:'fixed', bottom:'24px', right:'24px', maxWidth:'360px',
      background: 'var(--surface)', border:'1px solid var(--border)',
      borderRadius:'8px', padding:'12px 16px', fontSize:'13px',
      boxShadow:'0 8px 24px rgba(0,0,0,0.4)', zIndex:'9999',
      transition:'opacity 0.3s'
    });
  }
  el.style.borderColor = type === 'error' ? 'var(--red)' : 'var(--border)';
  el.textContent = msg;
  el.style.opacity = '1';
  toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 4000);
}

// ---------------------------------------------------------------------------
// Report tab
// ---------------------------------------------------------------------------
let reportData    = [];   // all stations with merged backend status
let reportSummary = {};   // summary counts from /api/report
let reportRaw     = {};   // legacy (unused — kept to avoid any stray refs)

async function loadReport() {
  $('reportUpdated').textContent = 'Loading…';
  try {
    const res = await api('GET', '/api/report');
    reportData    = res.stations || [];
    reportSummary = res.summary  || {};

    renderReportSummary();
    renderReportBreakdowns();
    renderReportTable();

    const gen = res.generatedAt ? new Date(res.generatedAt).toLocaleTimeString() : new Date().toLocaleTimeString();
    $('reportUpdated').textContent = `Updated ${gen} — ${reportData.length.toLocaleString()} stations`;
  } catch (err) {
    $('reportUpdated').textContent = `Error: ${err.message}`;
  }
}

function renderReportSummary() {
  const s       = reportSummary;
  const total    = s.total    || reportData.length;
  const active   = s.active   ?? reportData.filter(r => r.status === 'active').length;
  const inactive = s.inactive ?? reportData.filter(r => r.status === 'inactive').length;
  const dead     = s.dead     ?? reportData.filter(r => r.status === 'dead').length;
  const unscanned= s.unscanned?? reportData.filter(r => r.status === 'unscanned').length;
  const scanned  = total - unscanned;
  const avail    = scanned > 0 ? `${Math.round(active / scanned * 100)}%` : '—';

  $('rTotal').textContent    = total.toLocaleString();
  $('rActive').textContent   = active.toLocaleString();
  $('rInactive').textContent = inactive.toLocaleString();
  $('rDead').textContent     = dead.toLocaleString();
  $('rUnscanned').textContent= unscanned.toLocaleString();
  $('rAvail').textContent    = avail;
  $('reportTableCount').textContent = total.toLocaleString();
}

function renderReportBreakdowns() {
  const now         = Date.now();
  const todayUtc    = new Date(now).toISOString().slice(0, 10);
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  // ── Error type breakdown ──────────────────────────────
  const errCounts = {};
  let totalOffline = 0;
  for (const s of reportData) {
    if (s.isOnline || s.status === 'unscanned') continue;
    const e = s.errorType || 'unknown';
    errCounts[e] = (errCounts[e] || 0) + 1;
    totalOffline++;
  }
  const errRows = Object.entries(errCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([errType, count]) => {
      const status = errorTypeToStatus(errType);
      const pct    = totalOffline > 0 ? `${Math.round(count / totalOffline * 100)}%` : '—';
      const stCls  = status === 'inactive' ? 'color:var(--yellow)' : 'color:var(--orange)';
      return `<tr>
        <td style="font-family:monospace;font-size:12px">${esc(errType)}</td>
        <td><span style="${stCls};font-size:11px;font-weight:600">${status}</span></td>
        <td><strong>${count}</strong></td>
        <td style="color:var(--muted)">${pct}</td>
      </tr>`;
    });
  $('errorBreakdownTable').querySelector('tbody').innerHTML =
    errRows.length ? errRows.join('') : '<tr><td colspan="4" class="empty-row">No offline stations</td></tr>';

  // ── Consecutive failures ──────────────────────────────
  const failBuckets = { 0: 0, 1: 0, 2: 0, '3+': 0 };
  for (const s of reportData) {
    const f = s.consecutiveFailures ?? null;
    if (f === null) continue;
    if      (f === 0) failBuckets[0]++;
    else if (f === 1) failBuckets[1]++;
    else if (f === 2) failBuckets[2]++;
    else              failBuckets['3+']++;
  }
  const failRows = [
    [0,    failBuckets[0],    '✅ Will be scanned'],
    [1,    failBuckets[1],    '✅ Will be scanned'],
    [2,    failBuckets[2],    '✅ Will be scanned'],
    ['3+', failBuckets['3+'], '⏭ Skipped (use deep scan)'],
  ].map(([n, count, note]) => `<tr>
    <td>${n === '3+' ? '<strong style="color:var(--orange)">3+</strong>' : n}</td>
    <td><strong>${count}</strong></td>
    <td style="font-size:11px;color:var(--muted)">${note}</td>
  </tr>`);
  $('failBreakdownTable').querySelector('tbody').innerHTML = failRows.join('');

  // ── Scan coverage ──────────────────────────────────────
  const s = reportSummary;
  if (s.scannedToday != null) {
    const covNever = (s.total||0) - (s.scannedToday||0) - ((s.total||0) - (s.unscanned||0) - (s.scannedToday||0));
    $('coverageTable').querySelector('tbody').innerHTML = [
      ['Scanned today (UTC)',        s.scannedToday,                  'var(--green)'],
      ['Scanned (not today)',        (s.total||0) - (s.unscanned||0) - (s.scannedToday||0), 'var(--blue)'],
      ['Never scanned / unscanned',  s.unscanned||0,                  'var(--muted)'],
    ].map(([label, count, color]) => `<tr>
      <td>${label}</td>
      <td><strong style="color:${color}">${count}</strong></td>
    </tr>`).join('');
  } else {
    let covToday = 0, covWeek = 0, covNever = 0;
    for (const r of reportData) {
      if (!r.lastChecked) { covNever++; continue; }
      const dayStr = new Date(r.lastChecked).toISOString().slice(0, 10);
      if (dayStr === todayUtc)                  covToday++;
      else if (now - r.lastChecked < sevenDaysMs) covWeek++;
      else                                        covNever++;
    }
    $('coverageTable').querySelector('tbody').innerHTML = [
      ['Scanned today (UTC)',     covToday, 'var(--green)'],
      ['Scanned this week',       covWeek,  'var(--blue)'],
      ['Never / over a week ago', covNever, 'var(--muted)'],
    ].map(([label, count, color]) => `<tr>
      <td>${label}</td>
      <td><strong style="color:${color}">${count}</strong></td>
    </tr>`).join('');
  }
}

// Map errorType → display status label (mirrors backend computeStatus)
function errorTypeToStatus(et) {
  if (!et) return 'inactive';
  if (['timeout','bad_content','stopped','http_429'].includes(et)) return 'inactive';
  if (/^http_5/.test(et)) return 'inactive';
  return 'dead';
}

// Filters for report table
$('reportSearch').addEventListener('input',       renderReportTable);
$('reportStatusFilter').addEventListener('change', renderReportTable);
$('reportFailFilter').addEventListener('change',   renderReportTable);

function renderReportTable() {
  const q          = ($('reportSearch').value || '').toLowerCase();
  const statusFilt = $('reportStatusFilter').value;
  const failFilt   = $('reportFailFilter').value;

  let rows = reportData;

  if (q) rows = rows.filter(s =>
    s.name?.toLowerCase().includes(q) ||
    s.country?.toLowerCase().includes(q) ||
    s.genre?.toLowerCase().includes(q) ||
    s.errorType?.toLowerCase().includes(q)
  );

  if (statusFilt !== 'all') rows = rows.filter(s => s.status === statusFilt);

  if (failFilt !== 'all') {
    if (failFilt === '3plus') rows = rows.filter(s => (s.consecutiveFailures || 0) >= 3);
    else rows = rows.filter(s => (s.consecutiveFailures || 0) === parseInt(failFilt));
  }

  $('reportTableCount').textContent = rows.length.toLocaleString();

  const PILL = {
    active:    '<span class="status-pill online">✅ Active</span>',
    inactive:  '<span class="status-pill transient">🔘 Inactive</span>',
    dead:      '<span class="status-pill dead">💀 Dead</span>',
    unscanned: '<span class="status-pill unscanned">❓ Unscanned</span>',
  };

  // next-regular-scan badge
  const SCAN_BADGE = {
    'include':              '<span style="color:var(--green);font-size:11px">✅ yes</span>',
    'skip:already_today':   '<span style="color:var(--muted);font-size:11px">⏭ today</span>',
    'skip:failures_3plus':  '<span style="color:var(--orange);font-size:11px">⏭ 3+ fails</span>',
    'skip:stale_7days':     '<span style="color:var(--muted);font-size:11px">⏭ stale</span>',
  };

  const tbody = $('reportTableBody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty-row">No stations match.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(s => {
    const statusKey   = s.status || 'unscanned';
    const pill        = PILL[statusKey] || PILL.unscanned;
    const errType     = s.errorType || '—';
    const consec      = s.consecutiveFailures ?? '—';
    const consecCls   = (s.consecutiveFailures || 0) >= 3 ? 'color:var(--orange);font-weight:700' : '';
    const reliability = s.reliability != null ? `${s.reliability}%` : '—';
    const lastCheck   = s.lastChecked  ? fmtDateTime(s.lastChecked)  : '—';
    const lastOnline  = s.lastOnline   ? fmtDateTime(s.lastOnline)   : (s.status !== 'unscanned' ? '<span style="color:var(--muted)">Never</span>' : '—');
    const daysScan    = s.daysSinceChecked != null ? `${s.daysSinceChecked}d ago` : '—';
    const daysOnline  = s.daysSinceOnline  != null ? `${s.daysSinceOnline}d ago`  : '—';
    const scanBadge   = SCAN_BADGE[s.nextRegularScan] || '—';

    return `<tr>
      <td>${pill}</td>
      <td title="${esc(s.name)}" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.name)}</td>
      <td>${esc(s.country || '—')}</td>
      <td style="font-size:11px">${esc(s.genre || '—')}</td>
      <td style="font-family:monospace;font-size:11px;color:var(--red)">${esc(errType)}</td>
      <td style="text-align:center;${consecCls}">${consec}</td>
      <td style="text-align:center;color:var(--blue)">${reliability}</td>
      <td style="font-size:11px;color:var(--muted)" title="${lastCheck}">${daysScan}</td>
      <td style="font-size:11px" title="${typeof lastOnline === 'string' && lastOnline.includes('UTC') ? lastOnline : ''}">${daysOnline}</td>
      <td style="font-size:11px;color:var(--muted)">${lastCheck}</td>
      <td style="text-align:center">${scanBadge}</td>
    </tr>`;
  }).join('');
}

function fmtDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

$('btnRefreshReport').addEventListener('click', loadReport);

$('btnExportReport').addEventListener('click', () => {
  const headers = ['Status','Name','Country','Genre','Streams','Error Type','Consecutive Failures','Reliability','Days Since Checked','Days Since Online','Last Checked','Last Online','Next Regular Scan'];
  const csvRows = [headers.join(',')];
  for (const s of reportData) {
    csvRows.push([
      s.status || 'unscanned',
      `"${(s.name    || '').replace(/"/g, '""')}"`,
      `"${(s.country || '').replace(/"/g, '""')}"`,
      `"${(s.genre   || '').replace(/"/g, '""')}"`,
      s.streamCount ?? '',
      s.errorType || '',
      s.consecutiveFailures ?? '',
      s.reliability != null ? s.reliability + '%' : '',
      s.daysSinceChecked ?? '',
      s.daysSinceOnline  ?? '',
      s.lastChecked  ? new Date(s.lastChecked).toISOString()  : '',
      s.lastOnline   ? new Date(s.lastOnline).toISOString()   : '',
      s.nextRegularScan || '',
    ].join(','));
  }
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `station-report-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// ---------------------------------------------------------------------------
// Init — load settings defaults on page load
// ---------------------------------------------------------------------------
loadSettings();
