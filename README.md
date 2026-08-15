# Radio Explorer 🌍📻

Interactive map and 3D globe internet radio player. Explore ~3,000 stations worldwide — **pure HTML, CSS, and JavaScript**, no build step, deployed as a static site.

> **Disclaimer**: Educational project inspired by Radio Garden. Not affiliated with Radio Garden.

## Quick start (local)

Two terminals, two commands:

```bash
# Terminal 1: Backend (Cloudflare Worker + D1)
cd backend && npm run dev

# Terminal 2: Frontend (static site)
cd frontend && python3 -m http.server 8080
```

Then open **http://localhost:8080** — you'll see the globe with ~2,990 stations, and all your favorites will sync to the real local D1 database.

**Full walkthrough:** [`docs/RUNNING_LOCALLY.md`](docs/RUNNING_LOCALLY.md) — keyboard shortcuts, features to try, troubleshooting.

## Testing locally

```bash
./test-local.sh            # everything: backend tests + real local boot + frontend smoke check
./test-local.sh --backend  # backend only
./test-local.sh --frontend # frontend only
```

This never touches any real Cloudflare resource or deployed instance — see the script's own header comment. Run it before considering any change done; deploying (`backend/`, see its own README) is a separate, explicit, ask-first step.

**Full setup/testing/deployment reference:** [`docs/SETUP_AND_DEPLOYMENT.md`](docs/SETUP_AND_DEPLOYMENT.md) — every test layer (backend unit/integration, frontend smoke, the `automation/` e2e/data/station-health suites, the manual browser harness) plus exactly what deployment involves and what's already live.

## Deployment

The live site (**https://radio.rathore.club/**) is served by **Cloudflare Pages**, auto-deploying from this repo's `main` branch — there is no GitHub Actions workflow and no GitHub Pages site configured for this repo. Pages' **Root directory** project setting points at `frontend/` — that's the only part of this repo Pages ever serves; `backend/`, `automation/`, and `docs/` are outside it entirely and don't need any redirect rules to stay private. `frontend/_headers` sets no-cache rules for `/`, `/index.html`, `/service-worker.js`, and `/version.json`; `frontend/_redirects` blocks the handful of dev-only files that still live inside `frontend/radios/nirkam/` (its embedded player ships some markdown/test pages alongside the real one).

Every deploy that changes any cached `.js`/`.css`/`.html` file needs its `?v=N` query string bumped in `frontend/index.html` (and `frontend/service-worker.js`'s `STATIC_CACHE`, and `frontend/version.json`'s `version` field, to the same release number) — see `docs/PROJECT_REFERENCE.md` §9 for why, and what breaks if you forget.

## Project structure

```
proj-02-radio/
├── frontend/               # Everything Cloudflare Pages serves (Root directory = frontend/)
│   ├── index.html          # Main app
│   ├── js/                 # Application JavaScript
│   ├── assets/              # Styles, images
│   ├── data/
│   │   ├── stations.json   # Station database (~3,000 entries)
│   │   └── station-exceptions.json
│   ├── radios/nirkam/       # Embedded synchronized "web-player" station
│   ├── manifest.json        # PWA manifest
│   ├── service-worker.js    # Offline caching
│   ├── version.json          # Deployed release version, polled by index.html to
│   │                         # auto-refresh stale clients (see docs/PROJECT_REFERENCE.md §9)
│   └── _headers / _redirects # Cloudflare Pages caching + access rules
├── backend/                 # Cloudflare Worker + D1 — API, auth, database migrations (own deploy, own README)
├── automation/               # Dev-only test harness (e2e/unit/integration/data + station-health/)
├── docs/                      # Architecture reference, changelog, planning notes — never served
│   ├── PROJECT_REFERENCE.md  # Full architecture reference - start here for deep changes
│   └── CHANGES.md
└── LICENSE
```

## Features

- **2D map + 3D globe** with click-to-play
- **Search & filters** (country, genre, language, region)
- **Favorites & history** (localStorage)
- **Themes, i18n, visualizer, PWA**
- **HTTP stream proxy** on HTTPS via Cloudflare Worker (see `frontend/js/audio.js`)

## Tips

- **Few stations on map?** Turn off **HTTPS Stations Only** in Profile settings to show more of the catalogue. Note: a majority of enabled stations only have `http://` streams, which are blocked as mixed content on this HTTPS site regardless of this setting for many of them — the proxy fallback helps but isn't 100% reliable (see `docs/PROJECT_REFERENCE.md`).
- **HTTP streams in production**: The app uses a Cloudflare Worker proxy for HTTP streams when served over HTTPS.
- **Do not use `file://`**: Browsers block loading `data/stations.json` (under `frontend/`) from disk; always use a local HTTP server.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| Space / K | Play / pause |
| F | Toggle favorite |
| R | Toggle globe auto-rotate |
| M | Mute |
| ↑ / ↓ | Volume ±10% |

## License

See [LICENSE](./LICENSE).
