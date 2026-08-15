# Radio Explorer — Change Log (Session Summary)

**Project:** [code-hyperdrive/proj-02-radio](https://github.com/code-hyperdrive/proj-02-radio.git)  
**Date:** June 2026  
**Scope:** Map display fixes, stream protocol indicators, HTTPS filtering, login-required station blocking, caching, and deployment notes.

---

## Executive Summary

This session addressed why the map showed only a few stations locally, explained stream marker colors, fixed HTTPS deployment playback issues, added HTTP/HTTPS visibility controls, blocked RadioKing stations that trigger browser login dialogs, and set **HTTPS-only as the default** user preference.

| Metric | Before (typical) | After |
|---|---|---|
| Stations in `stations.json` | 2,989 | 2,989 |
| Enabled stations | 2,636 | **2,624** |
| Visible with HTTPS-only default | — | **~1,033** |
| Map dots (unique locations) | ~9 (file:// fallback) / ~422 (full load) | Same, minus blocked stations |
| Login-prompt stations | 13 RadioKing URLs | **0** (blocked) |

---

## 1. Map Only Showed 9 Stations

### Problem
Opening `index.html` directly (`file://`) caused `fetch('data/stations.json')` to fail. The app fell back to **17 embedded demo stations** at only **9 unique map coordinates**.

### Solution
Run a local HTTP server:

```bash
cd proj-02-radio-main
python3 -m http.server 8080
```

Open **http://localhost:8080** (not the file path).

### How to verify
- Console: `Loaded 2624 stations from stations.json` (not `Loaded 17 stations from embedded data`)
- Bottom stats bar shows `2624•...` not `17•...`

---

## 2. Why Map Dots Are Green or Orange

Marker colors indicate **stream type and status**, not country:

| Color | Meaning |
|---|---|
| **Green** | Active station with HTTPS stream |
| **Bright green** | Currently playing |
| **Orange** | HTTP-only stream (no HTTPS URL) |
| **Yellow-orange** | Inactive / unverified |
| **Red** | Down / offline |

**Files:** `js/globe.js`, `js/ui.js`, `js/search.js`

---

## 3. Stations Work Locally but Fail on HTTPS Deploy

### Problem
HTTP streams (e.g. `http://167.114.11.79:5730/...`) work on `http://localhost` but fail on deployed HTTPS sites. The Cloudflare proxy (`proxy.ramsharans-rathore.workers.dev`) returns **403 / error 1003** for raw IP URLs.

### Affected example
**Balla Radio** (Cameroon) — HTTP-only, no login, but unreliable on HTTPS production.

### Not changed in this session
Proxy server configuration (requires separate Cloudflare Worker or VPS proxy update).

---

## 4. HTTP-Only Indicators (All Stations)

### Added
- **Orange `HTTP` badge** on every HTTP-only station card (including active stations)
- **Map tooltips** show `🔶 HTTP` for HTTP-only markers
- **Now Playing** panel shows **HTTP Only** or **HTTPS** stream protocol row

### Files changed
- `js/ui.js` — station cards, Now Playing view
- `js/globe.js` — map tooltips
- `js/search.js` — directory card fallback renderer
- `assets/styles.css` — existing `.badge-http` styles reused

---

## 5. HTTPS Stations Only — User Setting

### Added
Profile → **Appearance** → **HTTPS Stations Only** toggle.

| Setting | Behavior |
|---|---|
| **ON** (default) | Only ~1,033 HTTPS stations visible on map and in lists |
| **OFF** | All ~2,624 enabled stations visible |

### Default changed
`httpsOnly` preference default is **`true`** (HTTPS-only on first visit).

### Files changed
- `js/user.js` — preference default + toggle UI
- `js/app.js` — `applyHttpsFilter()`, `onHttpsOnlyChanged()`
- `js/search.js` — `applyStationPool()` respects preference
- `js/i18n.js` — `httpsOnly`, `httpsOnlyDesc`, `httpOnly`, `streamProtocol` strings

---

## 6. Login-Required Station Exception List

### Problem
**Equinoxe Radio** (Cameroon) and other **RadioKing** streams return HTTP **401** with `WWW-Authenticate: Basic`, causing the browser to show a **username/password dialog**.

### Solution
Created a block list applied on **every** station load and API refresh.

### New files

#### `data/station-exceptions.json`
- **13 station IDs** (all RadioKing stations in database)
- **URL patterns:** `listen.radioking.com`, `www.radioking.com/play/`
- Documented station names and reason (`auth_required`)

#### `js/stations-utils.js`
Shared helpers:
- `loadStationExceptions()` — loads JSON with built-in fallback
- `isStationExcepted()` — match by ID or stream URL pattern
- `filterExceptedStations()` — remove blocked stations
- `filterLoadableStations()` — enabled + not excepted
- `isHttpOnlyStation()` — HTTP vs HTTPS detection

### Integration points
| File | Change |
|---|---|
| `js/app.js` | `setStationData()` always runs exception filter; blocks playback in `handleStationSelected()` |
| `js/search.js` | `applyStationPool()` filters exceptions |
| `js/globe.js` | `init()` and `updateDisplayedStations()` filter exceptions |
| `js/audio.js` | `loadStation()` rejects excepted stations before setting `audio.src` |
| `data/stations.json` | 13 RadioKing stations set to `"enabled": false`, `"status": "inactive"` |

### Blocked stations (13)

| Station | Country / notes |
|---|---|
| Equinoxe Radio | Cameroon — triggered login prompt |
| Antinea Radio | RadioKing auth |
| A ntinea Radio | Duplicate entry, same stream |
| A2Z RADIO | RadioKing auth |
| Alternative Radio | Web player URL, not a stream |
| Radio Manarat | RadioKing auth |
| Tropiques FM | RadioKing auth |
| The Independent FM | RadioKing auth |
| Radio Choco | RadioKing auth |
| Gritty Rock Radio | RadioKing auth |
| Reggae.fr | RadioKing auth |
| Kurd1 FM | RadioKing auth |
| FM 80 Funky Music | RadioKing auth (was already disabled) |

### Adding future exceptions
Edit `data/station-exceptions.json`:

```json
{
  "stationIds": ["uuid-here"],
  "streamUrlPatterns": ["problematic-host.com"]
}
```

---

## 7. Bug Fix — Exception Filter Not Applied

### Problem
`setStationData()` originally only applied the HTTPS filter, not the exception filter. Blocked stations could still appear on the map after reload.

### Fix
```javascript
setStationData(stations) {
    this.allStations = filterLoadableStations(stations);
    this.stations = this.applyHttpsFilter(this.allStations);
}
```

All load paths now pass **raw** station arrays; filtering is centralized.

---

## 8. Service Worker & Cache Updates

### Problem
Old JavaScript was served from service worker cache; new features did not appear until hard refresh.

### Changes (`service-worker.js`)
- Cache version bumped to **v4**
- Added `js/stations-utils.js` to static cache list
- **Network-first** strategy for `.js` and `.css` files (so updates load faster)
- `station-exceptions.json` included in data cache path

### Changes (`index.html`)
- Script cache bust: **`?v=9`**
- Added `<script src="js/stations-utils.js?v=9">`
- Service worker register: `service-worker.js?v=4`

### After deploy — users should
1. Hard refresh: **Cmd+Shift+R** (Mac) / **Ctrl+Shift+R** (Windows)
2. Or: DevTools → Application → Service Workers → **Unregister** → reload

---

## 9. Git / GitHub Setup (Local)

### Configured
```text
origin  https://github.com/code-hyperdrive/proj-02-radio.git
branch  main
```

### Note
Repository is **private**. GitHub CLI login required to fetch/push:

```bash
gh auth login
git fetch origin
git diff origin/main --stat
```

---

## Complete File Change List

### New files
| File | Description |
|---|---|
| `data/station-exceptions.json` | Block list for login-required stations |
| `js/stations-utils.js` | Shared station filtering utilities |
| `CHANGES.md` | This document |

### Modified files
| File | Summary of changes |
|---|---|
| `js/app.js` | Exception + HTTPS filtering, `setStationData()`, event handlers, init loads exceptions |
| `js/user.js` | HTTPS-only toggle UI; default `httpsOnly: true` |
| `js/search.js` | Exception filter in station pool; shared HTTP helper |
| `js/ui.js` | HTTP badge on all cards; protocol in Now Playing |
| `js/globe.js` | Exception filter on map; HTTP in tooltips |
| `js/audio.js` | Block excepted stations; auth-required error message |
| `js/i18n.js` | New translation keys (English) |
| `data/stations.json` | 13 RadioKing stations disabled |
| `index.html` | New script tag, cache bust v9 |
| `service-worker.js` | Cache v4, network-first JS/CSS |
| `assets/styles.css` | Profile toggle help text styles |

### Unchanged (reference)
| File | Notes |
|---|---|
| `js/favorites.js` | Uses `allStations` from app (already filtered) |
| `js/firebase-sync.js` | Syncs `httpsOnly` preference via user profile |
| `README.md` | Still says "open index.html directly" — consider updating to require local server |

---

## Testing Checklist

- [ ] Open **http://localhost:8080** — map shows hundreds of dots, not 9
- [ ] Console shows `🚫 Loaded station exception list`
- [ ] **Equinoxe Radio** not on map; no browser login dialog
- [ ] HTTP-only stations show orange **HTTP** badge in lists
- [ ] Profile → Appearance → **HTTPS Stations Only** is **ON** by default
- [ ] With HTTPS-only ON: ~1,033 stations in stats bar
- [ ] Toggle HTTPS-only OFF: ~2,624 stations visible
- [ ] Hard refresh after deploy loads v9 scripts

---

## Known Remaining Items

1. **README** — Should state local server is required for full station database
2. **GitHub** — Push pending; requires `gh auth login` for private repo
3. **HTTP streams on HTTPS deploy** — Still need working proxy for IP-based URLs (e.g. Balla Radio)
4. **RadioKing pattern block** — New RadioKing stations from API refresh are blocked by URL pattern even if not in ID list

---

## Quick Reference — Key Functions

```text
loadStationExceptions()     Load data/station-exceptions.json
filterLoadableStations()    enabled !== false + not excepted
filterExceptedStations()    Remove block-list stations
isHttpOnlyStation()         true if no https:// stream URL
isStationExcepted()         true if ID or URL matches block list
setStationData()            Apply all filters to station arrays
applyHttpsFilter()          Apply user httpsOnly preference
```

---

## 12. React + Python Migration (June 2026) — Reverted

A full-stack migration to React + FastAPI was attempted and briefly documented here, but it was **reverted** (see commit `be5f766`, "Remove backend and React stack; static HTML/JS only for GitHub Pages"). The `frontend/`, `backend/`, and `deploy/` directories described below no longer exist in this repo.

**Current architecture (as of this commit):** plain static HTML/CSS/JS, no build step, no backend — `index.html`, `js/*.js`, `assets/styles.css`, served directly from the repo root (GitHub Pages compatible). Cloud sync (Firebase) and PWA support (service worker/manifest) remain client-side only. See `README.md` for the current file layout.

---

*Updated after reverting the React/FastAPI migration back to static JS — July 2026*
