# Radio Station Scanner

Probes every station in `stations.json`, checks whether its stream is reachable, and uploads the results to the `radio-explorer-api` backend via a single authenticated REST call. The frontend then reads those statuses and hides or badges dead stations — no redeployment needed.

## Quick start

```bash
cd scanner
npm install
cp .env.example .env
# Edit .env — set SCANNER_API_KEY to the value you set via wrangler secret put
node scan.js
```

## Commands

| Command | What it does |
|---|---|
| `node scan.js` | Full scan of all enabled stations + upload results |
| `node scan.js --dry-run` | Scan only — print results, don't upload (safe for testing) |
| `node scan.js --limit 50` | Probe only the first 50 stations (quick test) |
| `node scan.js --id <stationId>` | Probe a single station by its id |
| `node scan.js --offline-only` | Re-probe only stations currently marked offline in the API |

## Configuration (`.env`)

| Variable | Default | Description |
|---|---|---|
| `SCANNER_API_KEY` | *(required)* | The secret you set via `wrangler secret put SCANNER_API_KEY` |
| `API_BASE_URL` | `https://radio-explorer-api.ramsharans-rathore.workers.dev` | Backend URL |
| `STATIONS_FILE` | `../frontend/data/stations.json` | Path to the stations file |
| `CONCURRENCY` | `50` | Simultaneous probes (higher = faster, more network load) |
| `PROBE_TIMEOUT_MS` | `8000` | Per-stream timeout |
| `UPLOAD_BATCH_SIZE` | `200` | Records per API call (max 500) |

## How it works

1. Reads `stations.json` and filters to `enabled: true` stations
2. For each station, probes its stream URL(s):
   - **HLS (`.m3u8`)** — fetches the playlist, checks for `#EXTM3U` in the body
   - **Direct stream (mp3/aac/ogg)** — `GET bytes=0-4095`, checks HTTP 200/206 + audio content-type or audio magic bytes
   - Station is **online** if any one of its streams responds correctly
3. Uploads all results to `POST /api/v1/stations/status/bulk` with the API key
4. The backend upserts each row in the `station_status` D1 table (idempotent — running twice is safe)

## Checking results

```bash
# See the full status map
curl https://radio-explorer-api.ramsharans-rathore.workers.dev/api/v1/stations/status

# Check a single station
curl https://radio-explorer-api.ramsharans-rathore.workers.dev/api/v1/stations/status/<stationId>
```

## Running on a schedule (cron)

```bash
# macOS launchd or a simple crontab entry — run full scan every 6 hours
0 */6 * * * cd /path/to/proj-experiment-complete/scanner && node scan.js >> scan.log 2>&1
```

## Resetting the scanner API key

```bash
cd backend
npx wrangler secret put SCANNER_API_KEY
# Enter your new key at the prompt
# Then update .env in scanner/ to match
```
