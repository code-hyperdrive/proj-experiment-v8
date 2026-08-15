# Station Health Check (dev tool — not deployed)

This folder lives under `automation/` (consolidated here from a former
top-level `station-tests/`) and is never part of the deployed static site
(everything Cloudflare Pages serves lives under `../../frontend/`). It's a
standalone Node script for auditing the stream URLs in
`../../frontend/data/stations.json`.

## Usage

Requires Node 18+ (uses the built-in `fetch`).

```bash
cd automation/station-health
node check-stations.js
```

Options:
- `--concurrency=40` — number of parallel checks (default 40)
- `--timeout=8000` — per-request timeout in ms (default 8000)
- `--only-enabled` — skip stations already marked `enabled: false`

## How it works

For each station, streams are tried in the same order the app itself uses
(`js/audio.js` falls back to the next stream on failure). A station is
"working" if at least one of its stream URLs responds with a 200/206 and an
audio-like content type within the timeout.

## Output

- `report.json` — full per-station, per-stream results
- `report.md` — summary table + list of broken-but-enabled stations (the ones
  that actually affect users right now)
