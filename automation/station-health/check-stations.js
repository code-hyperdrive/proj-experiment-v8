#!/usr/bin/env node
/**
 * Station connectivity checker — NOT part of the deployed static site.
 *
 * Tests every station in ../../frontend/data/stations.json by attempting to connect to
 * each of its stream URLs (in the same order the app itself tries them),
 * and reports which stations are reachable and which are not.
 *
 * Usage:
 *   node check-stations.js [--concurrency=40] [--timeout=8000] [--only-enabled]
 *
 * Output:
 *   report.json  — full machine-readable results
 *   report.md    — human-readable summary + failing station list
 */

const fs = require('fs');
const path = require('path');

const STATIONS_PATH = process.env.STATIONS_PATH || path.join(__dirname, '..', '..', 'frontend', 'data', 'stations.json');
const OUT_JSON = path.join(__dirname, 'report.json');
const OUT_MD = path.join(__dirname, 'report.md');

const args = Object.fromEntries(
    process.argv.slice(2).map(arg => {
        const [k, v] = arg.replace(/^--/, '').split('=');
        return [k, v === undefined ? true : v];
    })
);

const CONCURRENCY = parseInt(args.concurrency || '40', 10);
const TIMEOUT_MS = parseInt(args.timeout || '8000', 10);
const ONLY_ENABLED = !!args['only-enabled'];

const USER_AGENT = 'Mozilla/5.0 (compatible; RadioExplorerStationChecker/1.0)';

/**
 * Try a single stream URL. Resolves with { ok, status, contentType, error, ms }.
 */
async function checkStreamUrl(url) {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const res = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            signal: controller.signal,
            headers: {
                'User-Agent': USER_AGENT,
                'Icy-MetaData': '1'
            }
        });

        // We only need headers to judge reachability — stop downloading the stream body.
        const contentType = res.headers.get('content-type') || '';
        const icyName = res.headers.get('icy-name');
        clearTimeout(timer);
        controller.abort();
        try { await res.body?.cancel(); } catch { /* ignore */ }

        const ms = Date.now() - start;
        const looksLikeAudio = /audio|ogg|mpeg|aac|stream|octet-stream/i.test(contentType) || !!icyName;
        const okStatus = res.status === 200 || res.status === 206;

        if (okStatus && (looksLikeAudio || contentType === '')) {
            return { ok: true, status: res.status, contentType, ms };
        }
        return { ok: false, status: res.status, contentType, error: `Unexpected response (status ${res.status}, type "${contentType}")`, ms };
    } catch (err) {
        clearTimeout(timer);
        const ms = Date.now() - start;
        const isTimeout = err.name === 'AbortError';
        return { ok: false, status: null, contentType: null, error: isTimeout ? `Timed out after ${TIMEOUT_MS}ms` : (err.message || String(err)), ms };
    }
}

/**
 * Try each stream for a station in order (mirrors js/audio.js fallback behavior).
 * Station is "working" if any stream succeeds.
 *
 * Web-player streams (type: 'web-player') are not tested for stream connectivity
 * because they don't serve audio streams — they serve embedded player pages.
 * These streams are considered "working" by default if they have a valid type field.
 */
async function checkStation(station) {
    const streams = station.streams || [];
    const attempts = [];

    for (let i = 0; i < streams.length; i++) {
        const stream = streams[i];
        const url = stream.url;
        const isWebPlayer = stream.type === 'web-player';

        // Skip connectivity testing for web-player type streams (e.g., Nirkam)
        // These serve embedded player pages, not audio streams
        if (isWebPlayer) {
            attempts.push({
                index: i,
                url,
                ok: true,
                status: 'N/A',
                contentType: 'application/web-player',
                note: 'Skipped web-player stream (not an audio stream)'
            });
            return { id: station.id, name: station.name, country: station.country, enabled: station.enabled !== false, working: true, workingStreamIndex: i, attempts };
        }

        const result = await checkStreamUrl(url);
        attempts.push({ index: i, url, ...result });
        if (result.ok) {
            return { id: station.id, name: station.name, country: station.country, enabled: station.enabled !== false, working: true, workingStreamIndex: i, attempts };
        }
    }

    return { id: station.id, name: station.name, country: station.country, enabled: station.enabled !== false, working: false, workingStreamIndex: null, attempts };
}

/**
 * Run tasks with a concurrency cap.
 */
async function runPool(items, worker, concurrency) {
    const results = new Array(items.length);
    let nextIndex = 0;
    let completed = 0;

    async function runNext() {
        const i = nextIndex++;
        if (i >= items.length) return;
        results[i] = await worker(items[i], i);
        completed++;
        if (completed % 50 === 0 || completed === items.length) {
            process.stderr.write(`\rChecked ${completed}/${items.length} stations...`);
        }
        return runNext();
    }

    const runners = Array.from({ length: Math.min(concurrency, items.length) }, runNext);
    await Promise.all(runners);
    process.stderr.write('\n');
    return results;
}

async function main() {
    const raw = JSON.parse(fs.readFileSync(STATIONS_PATH, 'utf8'));
    const allStations = Array.isArray(raw) ? raw : (raw.stations || []);
    const stations = ONLY_ENABLED ? allStations.filter(s => s.enabled !== false) : allStations;

    console.log(`Testing ${stations.length} stations (concurrency=${CONCURRENCY}, timeout=${TIMEOUT_MS}ms, onlyEnabled=${ONLY_ENABLED})...`);

    const startedAt = Date.now();
    const results = await runPool(stations, checkStation, CONCURRENCY);
    const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);

    const working = results.filter(r => r.working);
    const broken = results.filter(r => !r.working);
    const brokenButEnabled = broken.filter(r => r.enabled);
    const brokenAndDisabled = broken.filter(r => !r.enabled);

    const summary = {
        totalTested: results.length,
        working: working.length,
        broken: broken.length,
        brokenButMarkedEnabled: brokenButEnabled.length,
        brokenAndAlreadyDisabled: brokenAndDisabled.length,
        durationSeconds: parseFloat(durationSec),
        generatedAt: new Date().toISOString()
    };

    fs.writeFileSync(OUT_JSON, JSON.stringify({ summary, results }, null, 2));

    const md = [];
    md.push('# Station Health Check Report');
    md.push('');
    md.push(`Generated: ${summary.generatedAt}`);
    md.push('');
    md.push(`| Metric | Count |`);
    md.push(`|---|---|`);
    md.push(`| Total stations tested | ${summary.totalTested} |`);
    md.push(`| Working | ${summary.working} |`);
    md.push(`| Broken | ${summary.broken} |`);
    md.push(`| Broken but marked \`enabled: true\` (user-facing impact) | ${summary.brokenButMarkedEnabled} |`);
    md.push(`| Broken and already disabled | ${summary.brokenAndAlreadyDisabled} |`);
    md.push(`| Duration | ${summary.durationSeconds}s |`);
    md.push('');
    md.push('## Broken stations still marked enabled (fix priority)');
    md.push('');
    md.push('| Name | Country | ID | Last error |');
    md.push('|---|---|---|---|');
    for (const r of brokenButEnabled) {
        const lastAttempt = r.attempts[r.attempts.length - 1];
        md.push(`| ${(r.name || '').replace(/\|/g, '\\|')} | ${r.country || ''} | ${r.id} | ${(lastAttempt?.error || '').replace(/\|/g, '\\|')} |`);
    }
    md.push('');
    md.push('## Broken stations already disabled (no user-facing impact)');
    md.push('');
    md.push(`${brokenAndDisabled.length} stations — see report.json for details.`);
    md.push('');
    fs.writeFileSync(OUT_MD, md.join('\n'));

    console.log('\n=== Summary ===');
    console.log(summary);
    console.log(`\nFull report: ${OUT_JSON}`);
    console.log(`Markdown report: ${OUT_MD}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
