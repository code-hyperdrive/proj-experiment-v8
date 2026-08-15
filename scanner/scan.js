#!/usr/bin/env node
/**
 * Radio Station Scanner — CLI
 *
 * For a visual dashboard, run: node server.js
 *
 * Usage:
 *   node scan.js                  # regular scan — skips stations with permanent errors
 *   node scan.js --deep           # deep scan — probes every station regardless of history
 *   node scan.js --dry-run        # scan only, don't upload
 *   node scan.js --verbose        # log every station (default: failures only)
 *   node scan.js --limit 100      # probe only first N stations
 *   node scan.js --id <stationId> # probe a single station
 */

import { readFileSync, appendFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig, loadStations, runScan, uploadResults, fetchCurrentStatus, partitionForRegularScan, errorToStatus } from './core/scanner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------
const args      = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const DEEP      = args.includes('--deep');          // deep scan — ignore previous status
const VERBOSE   = args.includes('--verbose');
const limitIdx  = args.indexOf('--limit');
const LIMIT     = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;
const idIdx     = args.indexOf('--id');
const SINGLE_ID = idIdx !== -1 ? args[idIdx + 1] : null;

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------
let logFile;
mkdirSync(resolve(__dirname, 'logs'), { recursive: true });

function ts() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }
function log(msg = '') {
  const line = `[${ts()}] ${msg}`;
  console.log(line);
  if (logFile) appendFileSync(logFile, line + '\n');
}
function logRaw(msg = '') {
  console.log(msg);
  if (logFile) appendFileSync(logFile, msg + '\n');
}

const IS_TTY = process.stdout.isTTY;
let _progressLen = 0;

function updateProgressLine(msg) {
  if (IS_TTY) {
    const line = `  ${msg}`;
    process.stdout.write('\r' + line.padEnd(_progressLen));
    _progressLen = line.length;
  }
  if (logFile) appendFileSync(logFile, `[${ts()}] ${msg}\n`);
}

function clearProgressLine() {
  if (IS_TTY && _progressLen > 0) {
    process.stdout.write('\r' + ' '.repeat(_progressLen) + '\r');
    _progressLen = 0;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  let cfg;
  try { cfg = loadConfig(); }
  catch (e) { console.error(`❌  ${e.message}`); process.exit(1); }

  logFile = cfg.logFile;

  logRaw('');
  logRaw('════════════════════════════════════════════════════');
  log('🔍  Radio Station Scanner — CLI');
  logRaw('════════════════════════════════════════════════════');
  log(`Config  : ${resolve(__dirname, 'config.json')}`);
  log(`API     : ${cfg.apiBase}`);
  log(`Stations: ${cfg.stationsFile}`);
  log(`Options : concurrency=${cfg.concurrency}  timeout=${cfg.timeoutMs}ms  batch=${cfg.batchSize}`);
  if (DRY_RUN) log('Mode    : DRY RUN — no upload');
  if (DEEP)    log('Scan    : DEEP — probing all stations regardless of history');
  else         log('Scan    : REGULAR — skipping stations with permanent errors (use --deep to rescan all)');
  if (VERBOSE) log('Verbose : logging every station');
  logRaw('');

  if (!DRY_RUN && !cfg.apiKey) {
    log('❌  apiKey is empty in config.json — cannot upload. Use --dry-run or set apiKey.');
    process.exit(1);
  }

  // Load stations
  log('Loading stations...');
  let all, stations;
  try {
    all      = loadStations(cfg.stationsFile);
    stations = all.filter(s => s.enabled !== false);
    log(`Total: ${all.length}  |  Enabled: ${stations.length}  |  Disabled: ${all.length - stations.length}`);
  } catch (e) {
    log(`❌  Cannot read stations: ${e.message}`); process.exit(1);
  }

  if (SINGLE_ID) {
    stations = stations.filter(s => s.id === SINGLE_ID);
    if (!stations.length) { log(`❌  Station not found: ${SINGLE_ID}`); process.exit(1); }
    log(`Single station: ${stations[0].name}`);
  } else if (!DEEP) {
    // Regular scan: apply 3-rule filter
    log('Fetching current status for regular scan filtering...');
    try {
      const { status } = await fetchCurrentStatus(cfg);
      const { toScan, skipped, reasons } = partitionForRegularScan(stations, status);
      log(`Skipping ${skipped.length} stations:`);
      log(`  Already scanned today (UTC) : ${reasons.alreadyToday}`);
      log(`  3+ consecutive failures      : ${reasons.tooManyFailures}`);
      log(`  Stale (last online > 7 days) : ${reasons.stale}`);
      log(`Probing ${toScan.length} stations:`);
      log(`  Never scanned before         : ${reasons.neverScanned}`);
      log(`  Online within last 7 days    : ${reasons.recentlyOnline}`);
      stations = toScan;
      if (stations.length === 0) {
        log('Nothing to scan — all stations already covered today. Use --deep to force.');
        process.exit(0);
      }
    } catch (e) {
      log(`⚠  Could not fetch status (${e.message}) — probing all stations`);
    }
  }

  if (LIMIT) {
    stations = stations.slice(0, LIMIT);
    log(`--limit: ${stations.length} stations`);
  }

  logRaw('');
  log(`Starting probes for ${stations.length} stations...`);
  if (!VERBOSE) log('(Failures only. Use --verbose for all.)');
  logRaw('');

  const t0       = Date.now();
  const results  = [];
  let lastLogMs  = Date.now();

  const { emitter } = runScan(stations, cfg);

  await new Promise((resolve, reject) => {
    emitter.on('result', ({ result, completed, total, online, offline, elapsed }) => {
      results.push(result);

      if (VERBOSE || !result.isOnline) {
        clearProgressLine();
        const icon   = result.isOnline ? '✅' : '❌';
        const status = result.isOnline ? 'ONLINE' : `OFFLINE (${result.errorType})`;
        log(`${icon} [${completed}/${total}] ${result.name}  →  ${status}`);
        result.streamResults?.forEach(s => {
          log(`   ${s.isOnline ? '✅' : '❌'}  ${s.url}`);
          log(`        ${s.detail}`);
        });
      }

      if (Date.now() - lastLogMs >= 10_000) {
        lastLogMs = Date.now();
        updateProgressLine(`${completed}/${total} (${Math.round(completed/total*100)}%) | online: ${online} | offline: ${offline} | ${Math.floor(elapsed/1000)}s`);
      } else if (IS_TTY) {
        const line = `  ${completed}/${total} (${Math.round(completed/total*100)}%) | online: ${online} | offline: ${offline} | ${Math.floor(elapsed/1000)}s`;
        process.stdout.write('\r' + line.padEnd(_progressLen));
        _progressLen = line.length;
      }
    });

    emitter.on('done', () => resolve());
    emitter.on('error', reject);
  });

  if (IS_TTY) { process.stdout.write('\n'); }

  const online  = results.filter(r => r?.isOnline).length;
  const offline = results.filter(r => !r?.isOnline).length;
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  logRaw('');
  const inactive = results.filter(r => !r?.isOnline && errorToStatus(r?.errorType) === 'inactive').length;
  const dead     = results.filter(r => !r?.isOnline && errorToStatus(r?.errorType) === 'dead').length;

  logRaw('════════════════════════════════════════════════════');
  log(`📊 Scan complete in ${elapsed}s`);
  log(`   ✅ Active   : ${online}`);
  log(`   🔘 Inactive : ${inactive}  (grey on map — may recover)`);
  log(`   💀 Dead     : ${dead}  (hidden from map — hard error)`);
  log(`   📈 Availability: ${Math.round(online / (online + offline) * 100)}%`);

  // Error breakdown
  const errCounts = {};
  results.filter(r => !r?.isOnline).forEach(r => { errCounts[r.errorType] = (errCounts[r.errorType]||0)+1; });
  if (Object.keys(errCounts).length) {
    logRaw('');
    log('Error breakdown:');
    Object.entries(errCounts).sort((a,b) => b[1]-a[1]).forEach(([t,n]) => log(`   ${t.padEnd(28)} ${n}`));
  }

  if (DRY_RUN) {
    logRaw('');
    log('DRY RUN — skipping upload. Sample offline:');
    results.filter(r => !r?.isOnline).slice(0, 20).forEach((r, i) => {
      log(`  ${String(i+1).padStart(2)}. ${r.name} — ${r.errorType}`);
    });
    logRaw('════════════════════════════════════════════════════');
    return;
  }

  // Upload
  logRaw('');
  log(`Uploading ${results.filter(r => !r?.skipped).length} results...`);
  try {
    await uploadResults(results, cfg, (bNum, total, processed) => {
      log(`  ✓ Batch ${bNum}/${total} — ${processed} records`);
    });
    log('✅ Upload complete.');
    log(`View: ${cfg.apiBase}/api/v1/stations/status`);
  } catch (e) {
    log(`❌ Upload failed: ${e.message}`);
  }
  logRaw('════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error(`\n❌  Fatal: ${err.message}`);
  process.exit(1);
});
