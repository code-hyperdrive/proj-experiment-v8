# Radio Explorer — Project Reference

**Purpose of this document:** a complete, self-contained reference to this application — what it is, how it's built, why it's built that way, what's been fixed, and what's known to still be rough. Written so that any future AI assistant (or human) can pick up work on this project by reading this file alone, without needing the history re-explained.

Last updated: 2026-08-14. If you (the AI reading this) make a significant change, **update this document in the same session** — see "Keeping this doc current" at the bottom.

**2026-08-14 — repo reorganized into `frontend/` / `backend/` / `automation/` / `docs/`.** Every path mentioned anywhere below this line that starts with `js/`, `data/`, `assets/`, or bare `index.html`/`service-worker.js` now lives under `frontend/` (e.g. `js/audio.js` → `frontend/js/audio.js`) unless the surrounding sentence already says otherwise — this is a structural move only, no logic changed. `station-tests/` is now `automation/station-health/`. This doc, `CHANGES.md`, `IMPROVEMENTS.md`, and `IMPROVEMENT_PLAN.md` moved from repo root into `docs/`. `firestore.rules` was deleted (dead since Firebase was fully dropped — see §17). See §4 for the full current tree and the root `README.md` for why (Cloudflare Pages' Root directory setting now points at `frontend/`). None of the historical narrative below was rewritten to match — treat any old path you read below this point as accurate *for its own dated entry*, not necessarily current.

**What changed since the last update (2026-07-25 → 2026-08-08), briefly** — this doc had drifted 24 commits stale before this pass; the highlights that most change how you should think about the project:
- **`radios/nirkam/` — a whole new subsystem**: an embedded, synchronized "web-player" station (a separate mini-app, not a stream URL), integrated via an iframe + `syncRadioAPI` contract. See §4's file tree and the new `js/audio.js` `loadWebPlayer()`/`setupWebPlayerAPI()` methods. Had several real bugs (fake sync epoch, a crash-causing method call, a prayer-interruption timing bug) found and fixed during a full-project audit — see git history around commit `2a0e7d6` and later fixes.
- **`version.json` + the app-update mechanism**: `index.html`'s `checkAppVersion()` polls `version.json` on load and force-clears all caches/SW registration if the deployed version differs from what's stored locally. This is now the authoritative "did my deploy actually reach users" mechanism — **you must bump `version.json`'s `version` field and `service-worker.js`'s `STATIC_CACHE` (both to the same value) on every deploy that changes cached files**, or your changes silently never reach returning visitors. (This was missed for two consecutive commits during this session and had to be caught in a later audit — it's an easy step to forget.)
- **Media Session API + a background-stall recovery watchdog** in `js/audio.js` — registers with the OS/browser as an active media session (lock-screen controls, less aggressive background suspension) and periodically checks whether the stream has silently stalled/been paused by the browser, auto-recovering if so. Gated by an `intendedToPlay` flag (distinct from `isPlaying`) and a load/buffering-state check + retry cap, to avoid looping forever against a station that's just slow to start.
- **Two new visualizer styles** ("Kids Dancing", "Shiva Tandava") and a **profile-modal UI redesign**, plus a **reset-view fix**: the map/globe "reset view" button now re-centers on the currently-playing station instead of always snapping to the default zoomed-out position.
- **A comprehensive project audit** (bugs, XSS/security, dead code, doc staleness) was run and its highest-priority findings fixed in the same session: attribute-injection XSS sites consolidated onto shared `escapeHtml`/`escapeAttr`/`isSafeUrl` helpers in `js/stations-utils.js`; a Firestore `firestore.rules` file added (not yet deployed — see that file's own header comment); a dead ~550-line CSS chunk removed that was silently breaking 5 live styles including making the active-filter-count number invisible; search pagination and a duplicate event-subscription bug fixed; a data-loss bug in `js/favorites.js` fixed. Full findings list from that audit is not preserved in this file (see the session's plan/conversation if you need the exhaustive list) — only what's fixed and what remains are reflected in §13 below.

---

## 1. What this is

**Radio Explorer** is a free, global internet radio player. Users explore an interactive 2D map or 3D globe covered in ~2,600–3,000 radio station markers, click one, and it streams live in the browser. No sign-up required (though an optional local profile with cloud sync exists).

- **Live site:** https://radio.rathore.club/
- **Repo:** https://github.com/code-hyperdrive/proj-02-radio (private)
- **Owner / author:** Ram Sharan Singh ([ramsharans.com](https://ramsharans.com))
- **License:** see `LICENSE`
- **Inspiration:** conceptually similar to Radio Garden. Not affiliated with it (disclaimer in README).

**It is a pure static site** — plain HTML, CSS, and vanilla JavaScript. No build step, no bundler, no framework, no package.json, no npm dependencies installed locally. Every third-party library is either loaded from a CDN via a `<script>` tag or vendored directly into `js/vendor/`.

### Why static / no build step (important context)
An earlier version of this project (see git history) was migrated to a React + FastAPI full stack, then **that migration was reverted**. The commit `be5f766` ("Remove backend and React stack; static HTML/JS only for GitHub Pages") returned the project to plain HTML/JS. `CHANGES.md` originally described the React/FastAPI stack as current and was corrected in a later commit to reflect the revert. **Do not re-introduce a build step or backend without the user explicitly asking for it** — this was a deliberate, considered decision, not an oversight.

---

## 2. Hosting & deployment — read this before assuming anything about "GitHub Pages"

This is the single most important piece of "gotcha" context in this project:

- **`README.md` says to deploy via GitHub Pages using a GitHub Actions workflow** (`.github/workflows/deploy-pages.yml`). **This workflow file does not exist in the repo.** This documentation is stale/aspirational, not accurate.
- **The actual live site (`radio.rathore.club`) is served by Cloudflare Pages** (confirmed via response headers: `server: cloudflare`, Cloudflare-specific headers like `cf-ray`, `cf-cache-status`). It is presumably connected to auto-deploy from this repo's `main` branch, though the exact CI/CD hookup was never inspected directly.
- **The GitHub repo itself is private**, and `gh api repos/code-hyperdrive/proj-02-radio/pages` returns 404 — **no GitHub Pages site is configured on GitHub's side at all.**
- `robots.txt` and `sitemap.xml` (added for SEO) both reference `https://radio.rathore.club/` as the canonical domain — this is correct and intentional.
- The custom domain is `radio.rathore.club` — a subdomain of the owner's personal domain `rathore.club` (explains the "Rathore Club" branding/theme/crest logo throughout the app — this is the owner's own brand, not a generic placeholder).

**Practical implication:** if a future task involves "publish this" / "check if it's live" / "why isn't my change showing" — check `radio.rathore.club` directly (e.g. `curl -sI https://radio.rathore.club/`), don't assume GitHub Pages is involved. Also see §9 (caching) — a very common failure mode in this project's history is confusing "my fix isn't visible" with "the browser cached the old JS," when the fix was actually deployed correctly.

**README.md is stale** (GitHub Pages instructions) and should probably be corrected at some point — flagged here, not yet fixed as of this writing.

**Since the 2026-08-14 reorg (§4):** whatever the CI/CD hookup turns out to be, it needs Cloudflare Pages' **Root directory** project setting pointed at `frontend/` — before this reorg the repo root itself was the served root. This is a one-time dashboard setting, not something changed by any deploy/push; it only matters the next time an actual deploy happens, and hasn't been touched as of this writing (nothing has been deployed since the reorg).

---

## 3. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Markup/logic | Plain HTML5 + vanilla ES6+ JS (classes, no modules/bundler) | All `js/*.js` loaded via `<script>` tags in a specific order in `index.html` |
| Styling | Plain CSS (`assets/styles.css`, ~830 rules) | CSS custom properties (`--spacing-*`, `--font-size-*`, `--accent-primary`, etc.) for theming |
| 3D globe | [three.js](https://threejs.org) r160 + [three-globe](https://github.com/vasturiano/three-globe) 2.30 | Loaded from `unpkg.com` CDN, no SRI hashes |
| Cloud sync (optional) | Firebase v9 (compat mode) — Firestore only | Loaded from `gstatic.com` CDN. Project ID: `proj-radio` |
| QR codes | `qrcodejs` (davidshimjs), **vendored** at `js/vendor/qrcode.min.js` | See §11 for why it's vendored instead of CDN-loaded |
| Fonts | Google Fonts "Outfit" | `fonts.googleapis.com` |
| PWA | `manifest.json` + `service-worker.js` | Cache-first for static assets, network-first for `data/*.json` |
| HTTP stream proxying | Personal Cloudflare Worker: `https://proxy.ramsharans-rathore.workers.dev` | Used to play `http://` streams when the site itself is served over HTTPS (mixed-content workaround) — see §8 |
| Testing | Ad-hoc, browser-driven manual verification (Claude Browser tool) + a standalone Node script (`station-tests/`, gitignored) | No unit test framework/runner |

No `package.json` exists. No `node_modules`. Nothing to `npm install`. To run locally: `python3 -m http.server 8080` from the repo root, then open `http://localhost:8080`.

---

## 4. File/directory map

**Reorganized 2026-08-14** into four top-level buckets — `frontend/` /
`backend/` / `automation/` / `docs/` — specifically so the repo's structure
maps directly onto how the app is actually deployed: Cloudflare Pages'
**Root directory** project setting points at `frontend/`, so that's the
literal boundary of what's ever publicly servable; `backend/` is a
separate Cloudflare Worker + D1 deploy; `automation/` and `docs/` are
dev-only and never served. (Everything below reflects the current state —
older sections/changelog entries elsewhere in this doc that mention a
top-level `js/`, `data/`, `station-tests/`, etc. are historical and were
accurate *at the time*; they weren't rewritten, since this is a changelog
as much as a reference.)

```
proj-02-radio/
├── frontend/                     # Everything Cloudflare Pages serves (Root directory = frontend/)
│   ├── index.html                # The entire app shell — all modals, panels, tabs live here as hidden/templated HTML
│   ├── manifest.json             # PWA manifest (icons, shortcuts, start_url)
│   ├── service-worker.js         # Cache-first (static) / network-first (data) service worker
│   ├── version.json              # Deployed release version, polled by index.html (§9)
│   ├── robots.txt                # Allow-all + sitemap reference (added for SEO)
│   ├── sitemap.xml               # Single-URL sitemap (added for SEO)
│   ├── logo.png                  # Duplicate of assets/images/logo.png (legacy?)
│   ├── _headers / _redirects     # Cloudflare Pages caching + access rules
│   ├── assets/
│   │   ├── styles.css            # ALL styling, ~830+ CSS rules, one file, no preprocessor
│   │   └── images/logo.png       # The Rathore Club crest — app icon, favicon, loading screen, QR code overlay
│   ├── data/
│   │   ├── stations.json         # The station database — ~2,989 entries (see §5 for schema)
│   │   └── station-exceptions.json  # Block-list: station IDs / stream-URL patterns to exclude (legal/ToS reasons)
│   ├── js/
│   │   ├── app.js                # 2000+ lines. The central orchestrator/controller. See §6.1
│   │   ├── audio.js              # HTML5 <audio> wrapper, stream fallback logic, HLS.js, proxy detection. §6.2
│   │   ├── globe.js              # 3D globe (three.js) AND 2D map (canvas) rendering + interaction. §6.3
│   │   ├── ui.js                 # DOM rendering helpers for station cards, Now Playing, toasts, modals. §6.4
│   │   ├── search.js             # Search/filter UI + logic, its own escaping helpers (partially duplicated from ui.js)
│   │   ├── favorites.js          # Favorites (localStorage, sole source of truth) + backend sync. §17
│   │   ├── user.js               # User profile, setup/profile/language modals, api-client.js glue. §17
│   │   ├── api-client.js         # Backend HTTP client — sessions, Google sign-in redirect, CRUD wrappers. §17
│   │   ├── i18n.js               # 10-language translation dictionaries + `t()` helper
│   │   ├── mobile.js             # Mobile-specific nav/gesture/panel-state handling
│   │   ├── visualizer.js         # Canvas audio visualizer — **simulated**, not real Web Audio API analysis (see §12)
│   │   ├── stations-utils.js     # Shared station-filtering helpers (exceptions, HTTPS-only filter) — loaded standalone
│   │   ├── logger.js             # Lightweight event/analytics logger (console-based, not wired to any external service)
│   │   └── vendor/
│   │       ├── qrcode.min.js     # Vendored qrcodejs library (~20KB) — see §11
│   │       └── hls.min.js        # Vendored hls.js — MediaSource-based HLS (.m3u8) playback on non-Safari browsers
│   └── radios/nirkam/            # Embedded synchronized "web-player" station (separate mini-app, iframed in)
├── backend/                      # Cloudflare Worker (Hono) + D1 — API, auth, database migrations. §17
│   ├── src/{routes,lib}/         # Route handlers + auth/db/oauth/session/validate/ratelimit/cors libs
│   ├── migrations/               # D1 schema (users, sessions, favorites, history, stats_global)
│   ├── test/{unit,integration}/  # vitest + @cloudflare/vitest-pool-workers
│   └── wrangler.toml             # Own deploy, own README — never served by Pages
├── automation/                   # Dev-only test harness (e2e/unit/integration/data), never deployed. §10
│   └── station-health/           # Standalone station connectivity checker (absorbed from former station-tests/)
├── docs/                         # Architecture reference, changelog, planning notes — outside frontend/, never served
│   ├── PROJECT_REFERENCE.md      # This file
│   ├── CHANGES.md                # Historical changelog; corrected once to remove a stale "React is current" claim
│   ├── IMPROVEMENTS.md / IMPROVEMENT_PLAN.md
│   ├── BUFFERING_STRATEGY.md / PERFORMANCE.md
├── test-local.sh                 # Standard local-testing entrypoint — backend tests + real local boot + frontend smoke check
├── README.md
├── LICENSE
└── .claude/
    └── launch.json                # Local dev server config for the Claude Code browser-preview tool (python3 -m http.server 8080, run from frontend/)
```

---

## 5. Data model — `data/stations.json`

A flat JSON array (not wrapped in an object) of ~2,989 station objects. Approximate schema per station:

```json
{
  "id": "uuid-or-legacy-id-string",
  "name": "Station Name",
  "city": "City",
  "country": "Country Name",
  "countryCode": "XX",
  "lat": 12.34,
  "lng": 56.78,
  "streams": [
    { "url": "https://...", "type": "audio/mpeg" }
  ],
  "website": "https://...",
  "genre": "comma,separated,tags or single string",
  "language": "comma,separated",
  "tags": ["array", "of", "strings"],
  "votes": 1234,
  "bitrate": 128,
  "codec": "MP3",
  "status": "active | offline | inactive | down",
  "enabled": true,
  "favicon": "https://... (station logo/icon, may be empty string)",
  "lastChecked": "ISO-8601 timestamp",
  "coordsPrecision": "precise | approximate",
  "coordsSource": "e.g. 'Capital: Berlin' when lat/lng is a country-capital fallback",
  "disabledReason": "present only on disabled entries — human-readable reason (added during this project's cleanup work)"
}
```

Key facts about the current data:
- **Total: 2,989 stations. Enabled: 2,402. Disabled: 587.**
- `enabled: false` entries are filtered out entirely by `filterLoadableStations()` in `stations-utils.js` before the app ever sees them.
- A large batch of disabled entries were disabled **during this project's work session** after a systematic connectivity audit found broken stream URLs (see §13 for the full story — this is important history, not just data trivia).
- `streams` is an **array**, and `audio.js` tries each entry in order, falling back to the next on failure (see §6.2). A station can have multiple stream URLs.
- Some stations have `lat`/`lng` derived from their country's capital city as a fallback when precise coordinates weren't available (`coordsSource` explains this; `coordsPrecision` flags it).
- **106 stream URLs are duplicated across more than one station entry** in the dataset (some legitimately — e.g. multiple Qur'an-recitation "stations" sharing one broadcast feed — others are data-entry mistakes). Not fully audited/cleaned; flagged as tech debt.

`data/station-exceptions.json` — a small block-list (station IDs + stream-URL substring patterns) for stations that must never be offered, e.g. for ToS/legal reasons (the one hardcoded example pattern in `stations-utils.js`'s fallback default references `radioking.com` stream URLs specifically). `stations-utils.js` has an embedded `DEFAULT_STATION_EXCEPTIONS` fallback in case the JSON file fails to load.

---

## 6. Core modules — deep dive

### 6.1 `js/app.js` — the orchestrator

A single large `GlobeRadioApp` class (2000+ lines), instantiated once at the bottom of the file:
```js
document.addEventListener('DOMContentLoaded', () => {
    window.app = new GlobeRadioApp();
    window.app.init();
});
```
(There's a guard for the case `DOMContentLoaded` already fired.)

Responsibilities:
- **`init()`** — the entire startup sequence: load user profile → load `data/stations.json` → init audio/search/favorites/globe controllers → apply saved view mode → `focusOnDefaultRegion()` (see §6.3) → wire up every button/modal on the page → hide loading screen → `checkAutoResume()` (offers a "Continue listening?" banner, **never auto-plays** — this matters, see below) → `checkSharedData()` (handles `?station=<id>` and `?share=<blob>` deep links).
- **State**: `this.state = { currentStation, isPlaying, volume }` plus `this.stations` (HTTPS-filtered subset) and `this.allStations` (everything loadable).
- **`handleStationSelected(station)`** — the single entry point for "play this station." Calls `audio.loadStation()`, updates state, calls `globe.focusOnStation()` (pans/zooms to it), updates all the UI surfaces (bottom bar, Now Playing tab, mobile mini-player).
- **`handleFavoriteToggle(stationId)`** — the single entry point for favoriting, used by station-card stars, the Now Playing star, and the bottom-bar star. All three UI surfaces stay in sync via this shared method plus the `favorites:favoritesChanged` window event (see `favorites.js`).
- **Share feature**: `showShareStationModal(station)` builds a `?station=<id>` link, renders a QR code (see §11), and wires WhatsApp share. Reachable from 3 places: Now Playing panel, desktop header cluster, mobile header cluster.
- **`playNextStation()` / `playPreviousStation()`** — "next" picks a station sharing genre/country; "previous" replays from listening history.
- Lots of `setupXBtn()` methods, one per feature area (`setupShareFeatures`, `setupUserProfile`, `setupVisualizer`, `setupBottomPlayer`, `setupKeyboardShortcuts`, etc.) — all called once from `init()`.

**Important behavioral note:** auto-resume (`checkAutoResume`) only ever shows a dismissible banner offering to resume the last station — it **never plays audio automatically on page load** (browsers block unrequested autoplay anyway, and the app respects that intentionally). This is why `focusOnDefaultRegion()` can be called unconditionally during init — nothing is ever already playing at that point.

### 6.2 `js/audio.js` — playback

Wraps a single `<audio id="radioPlayer">` element (`preload="auto" crossorigin="anonymous"` — corrected here; an earlier pass of this doc said `preload="none"`, which doesn't match `index.html`).

- **`loadStation(station)`** → **`tryNextStream()`**: iterates `station.streams[]` in order; on failure (native `error` event or rejected `play()`), increments `currentStreamIndex` and retries the next one. Exhausting all streams surfaces a user-facing error toast ("Station Unavailable" → "Stream Not Supported" is the typical two-step error the user sees, mapped from `MediaError` codes).
- **Load-generation guard**: `this.loadGeneration` is incremented on every `loadStation()` call. Any async retry chain (a stale `tryNextStream()` continuation, or a delayed `handleError()` retry) checks its captured generation against the current one before acting, and bails if superseded. **This exists specifically because of a real bug**: rapidly switching stations while a previous one was still buffering used to let the old retry chain "win" and overwrite the new selection's UI state. Fixed by this generation counter — **do not remove it**, it's load-bearing (pun intended).
- **`stop()` is intentionally non-async and does not await any pending `play()` promise** — clearing `audio.src` naturally interrupts a pending play with a harmless `AbortError`, which is caught and ignored. An earlier version awaited the pending promise first, which caused station-switching to visibly hang while the old stream was still trying to connect. **Do not re-add that await.**
- **HTTP stream proxying**: if the page is HTTPS and a stream URL is `http://`, the browser blocks it as mixed content. `detectProxyUrl()` checks for a configured proxy (default: the hardcoded personal Cloudflare Worker `https://proxy.ramsharans-rathore.workers.dev`, overridable via `localStorage.globeRadio_proxyUrl`). When enabled, HTTP stream URLs get rewritten to go through the proxy.
- Debug mode: `?debug=true` or `?error=true` in the URL shows raw technical error details in toasts instead of the generic user-facing message.
- **HLS (.m3u8) stream support via vendored `hls.js`, fixed 2026-08-13.** `canPlayType()` alone reports every HLS mime type as unsupported on every browser except Safari (no native decoder) — this was silently breaking **~150 of 2,989 stations** (e.g. "MBC Kool FM"), which only ever played in Safari and failed with "Unsupported Format" → "Station Unavailable" everywhere else. Confirmed via a real browser test (not just no-console-errors — `audio.currentTime` genuinely advancing) before and after. Fixed by vendoring `hls.js` (self-hosted at `js/vendor/hls.min.js`, pinned v1.5.17, same rationale as the QR library in §11 — no CDN dependency) and branching in `tryNextStream()`: `isHlsStream(stream)` detects HLS by mime type or `.m3u8` extension; if the browser lacks native support, a `Hls` instance is created, attached to the same `<audio>` element via MediaSource, and awaited via a `MANIFEST_PARSED`/fatal-`ERROR` promise that feeds into the *same* existing catch block used for native `play()` failures (no duplicated fallback logic). `destroyHls()` tears down the instance in `stop()` and before each new attempt, so a stale instance never keeps feeding a superseded `loadStation()` call. `handleError()` (the native `<audio>` `error` handler) explicitly no-ops while `this.hls` is set — hls.js owns error recovery for MediaSource-fed playback; letting both react to the same failure would double up the "move to next stream" logic. A **separate, persistent** `Hls.Events.ERROR` listener (distinct from the one-shot initial-load promise) handles fatal errors that occur *after* successful playback started, mirroring `handleError()`'s own "try next stream, else show final error" tail.

### 6.3 `js/globe.js` — the map and the globe (both views live here)

The largest file (2000+ lines). One `GlobeController` class handles **both** the 3D globe (three.js) and the 2D flat map (plain `<canvas>` 2D context) — `this.viewMode` is `'globe'` or `'map'`, default `'map'`.

**2D map rendering (`renderMap()`), the part most heavily reworked this session:**
- The world map background is a single image (`this.mapImage`), naturally ~2:1 equirectangular aspect ratio.
- **`getMapLayout(width, height)`** is the single source of truth for the map's draw rectangle — used by both the drawing code and the click/tap hit-testing, so markers and taps always agree on where things are. It computes a **cover-fit** (like CSS `background-size: cover`) instead of stretching the image to exactly fill the container — stretching used to badly distort continents on tall/narrow phone screens.
- **Horizontal wraparound**: the map pans infinitely left/right (like real longitude) instead of running out of image at an edge. `latLngToMapPosition()` shifts each marker to whichever repeated copy of the map is nearest the visible canvas; `renderMap()` draws three side-by-side copies of the background to avoid a seam; `mapClientToLatLng()` normalizes the resulting longitude into ±180° regardless of which repeated copy was actually clicked.
- **Zoom/pan clamping**: `minZoom` is `1` (the cover-fit size) — you cannot zoom out far enough to reveal blank space above/below the map. Vertical panning is clamped to the image's real top/bottom edges (the poles) inside `getMapLayout()` (it mutates `this.mapOffset.y` as a side effect during layout computation — a deliberate, if slightly unusual, pattern to keep drag state from drifting past the clamp).
- **Cluster picker**: clicking a marker where multiple stations sit close together (very common — real-world station density in Europe/India/US is high) doesn't pick one arbitrarily; it opens a small popup list (`ui.showStationPicker()`) to disambiguate. This popup used to be completely invisible (missing CSS `position: fixed`, so it rendered off-screen at the bottom of the document, clipped by `overflow: hidden` on `<body>`) — **this was a real, high-impact bug**, fixed by adding proper CSS.
- **`focusOnStation(station)`**: pans/zooms the map (or rotates the globe) to center on a station. In map mode this used to be a no-op ("don't pan, just highlight" — a deliberate but user-unfriendly choice to avoid jumpiness); now it does an eased pan/zoom animation (`animateMapTo()`).
- **`focusOnDefaultRegion()`**: called once on app init when nothing is playing yet. Guesses the user's region from `Intl.DateTimeFormat().resolvedOptions().timeZone` against a ~45-entry hardcoded timezone→lat/lng table (`getApproxLocationFromTimezone()`), falling back to deriving a rough longitude from the raw UTC offset (~15°/hour) if the timezone isn't in the table. **No permission prompt, no network call** — deliberately chosen over `navigator.geolocation` (intrusive prompt) or IP-geolocation APIs (third-party network dependency, privacy).

**3D globe:**
- Uses `three-globe`'s `getCoords(lat, lng)` plus a manual quaternion-slerp animation to rotate the globe so a target point faces the camera (`rotateGlobeTo()`).
- **`autoRotate` defaults to `true`** and increments `globe.rotation.y` every animation frame. This was fighting the focus-rotation animation (auto-rotate kept nudging the globe throughout and after the slerp, so the target never actually settled centered) — fixed by setting `this.autoRotate = false` at the start of `rotateGlobeTo()`, same as manual drag already did.
- **Known remaining imprecision**: even after the auto-rotate fix, the globe-view target doesn't land *perfectly* dead-center (it's close, verified visually, but not pixel-exact like the 2D map is). Not fixed — flagged as acceptable since map view is the default and is exact.

**Zoom controls layout bug (fixed):** on very short viewports (phone landscape, ≤480px tall), the vertically-stacked zoom buttons (+/−/reset) used to overflow past the top of their container and visually collide with the theme/language/rotate icon row above them. Root cause was partly that `.globe-container`'s mobile `top`/`bottom` CSS offsets don't actually resize it (it's `position: relative`, not `absolute`, so those properties are no-ops for sizing) — fixed by laying the zoom controls out horizontally and anchoring with `position: fixed` directly to the viewport for that breakpoint, sidestepping the container-height mismatch entirely.

### 6.4 `js/ui.js` — rendering + XSS-safety helpers

Pure rendering functions: `renderStationList()`, `renderNowPlaying()`, `showToast()`, `showStationPicker()`, plus escaping helpers.

**Security note (fixed, but worth understanding for future changes):** two distinct XSS-shaped bugs existed and were fixed:
1. `search.js`'s typeahead highlighting escaped the *search query* before wrapping matches in `<strong>`, but not the *station name/city/country text* itself — a station with HTML-special characters in its name could have injected markup. Fixed by escaping both sides consistently.
2. Station favicon URLs, tooltips, and website links were interpolated into `src=`/`href=`/`title=` attributes using an HTML-escaping function (`escapeHtml`) that only escapes `&`/`<`/`>` — **not quotes** — which is unsafe inside an attribute (a `"` in a station's favicon URL could break out of the attribute). Fixed by adding a separate `escapeAttr()` that also escapes `"`/`'`, used specifically for anything landing inside an attribute. Also added `isSafeUrl()` (only allows `http:`/`https:`) before ever putting a station-supplied URL into `href`/`src`, blocking `javascript:` URI injection.

**If you add any new place that interpolates station data (name, city, country, favicon, website, genre, etc.) into HTML: use `escapeHtml()` for text content and `escapeAttr()` + `isSafeUrl()` for anything going into an attribute.** This pattern is duplicated (not shared) between `ui.js` and `search.js` — keep both in sync if you touch one.

### 6.5 `js/user.js` — profile, preferences, modals

**SUPERSEDED 2026-08-14 — see §17.** Everything below describes the
pre-backend, Firestore-based design and is kept only as history; `user.js`
no longer has `this.firebaseSync`, a second favorites store, or the
"restore by ID" flow this section describes. The stale-`favoritesCount`
bug noted below is specifically **fixed** as a side effect of deleting
the duplicate store (it now reads live from `favorites.js`) — not still
present.

`UserProfile` class. Stores a per-browser profile in `localStorage` (`globeRadio_user` key): display name, a generated short ID (or user-customized one), preferences (theme, language, volume, `httpsOnly` filter, `autoResume`, `panelCollapsed`, `viewMode`, idle-visualizer timeout, etc.), favorites list (a *second*, separate favorites store from `favorites.js` — see below), and listening stats (time listened, stations played, top genre).

Renders three modals: welcome/setup (first-visit), profile (stats + settings tabs), language picker.

**Note on two favorites stores:** `favorites.js`'s `FavoritesController` is the "live" favorites list the UI actually reads/toggles from (`isFavorite()`, `toggle()`, emits `favorites:favoritesChanged`). `user.js` *also* tracks `addFavorite()`/`removeFavorite()` on the profile object, kept in sync by `handleFavoriteToggle()` calling both. The profile's copy feeds `user.getStats().favoritesCount` shown in the Favorites tab's stat header — **this stat has been observed to show stale/`0` values** even when the actual favorites list is correct and working (confirmed during testing; not fixed — flagged as minor pre-existing tech debt, the core favoriting functionality itself is correct).

**Welcome/setup modal — fixed mobile overflow bug:** on short/older phone screens, the modal's content (icon + language selector + tabs + full form) was taller than the viewport, and since `html, body` disable page scroll globally, the modal had no way to scroll internally either — the submit button ("Get Started") was clipped below the fold with no way to reach it. Fixed with `overflow-y: auto` on `.modal-content` plus a genuinely more compact mobile layout (smaller icon/spacing, and the icon+subtitle drop entirely below 700px viewport height).

### 6.6 `js/firebase-sync.js` — optional cloud profile sync

**SUPERSEDED 2026-08-14 — this file was deleted; see §17.** Kept below
only as history of the fabricated-stats fix (the ethics lesson still
applies — see §14's conventions — even though the specific file is gone).
Cloud sync and cross-device recovery are now handled by `js/api-client.js`
talking to `backend/`, with real Google sign-in instead of an ID-based
recovery flow.

Firestore-backed cross-device profile sync (Firebase project `proj-radio`). Lets a user recover their profile on another device via their unique ID.

**Fixed: fabricated "connected/active users" stats.** This file used to seed and grow a global Firestore-backed "connected users" / "active users" counter with **fabricated random padding** — every new visitor added a random 5–9 (not 1) to both counts, and the initial seed was a random number in the 100–150 range rather than 0. This was presented to users as real social-proof numbers. **Fixed**: counts now start at 0 and increment by 1 per real event; the display widget hides itself entirely when the count is 0 rather than showing a fake number or a bare "0". This was a deliberate ethics/trust fix, not a bug fix — if asked to add similar "social proof" features in the future, don't fabricate numbers.

### 6.7 `js/search.js`, `js/favorites.js`, `js/mobile.js`, `js/i18n.js`, `js/visualizer.js`, `js/logger.js`, `js/stations-utils.js`

- **`search.js`**: search box + typeahead, filter dropdowns (country/genre/language/region), grid/list view toggle, sort order. Has its own copy of station-card rendering and escaping helpers (see §6.4 security note — duplicated logic, keep in sync).
- **`favorites.js`**: localStorage-backed favorites list (`globeRadio_favorites` key), and (as of 2026-08-14) the **sole** source of truth — see §17 — with best-effort backend sync on every mutation plus a one-time `reconcileWithBackend()` on load. `emit(event, data)` dispatches `window.dispatchEvent(new CustomEvent('favorites:${event}', ...))` — this is how `app.js` knows to re-render the Favorites tab, Explore tab, and Search tab's favorite-star indicators whenever *any* favorite is toggled from *anywhere*.
- **`mobile.js`**: detects mobile viewport (`window.innerWidth <= 768`), manages the mobile bottom nav, side-panel open/close, edge-swipe gesture, and mobile header button bindings. **Fixed a major bug here**: `body.panel-collapsed` (a *desktop* collapse-state class, persisted from a saved preference) was never cleared when entering mobile mode, and it has its own CSS rule (`body.panel-collapsed .side-panel { transform: translateX(100%) }`) that's independent of and fights the mobile `open`/`closed` classes — this silently kept the mobile Search/Favorites/Map side panel permanently off-screen for any returning user who had previously used the desktop collapsed layout. Fixed by explicitly stripping `panel-collapsed` whenever mobile mode is entered or the panel is opened.
- **`i18n.js`**: 10 languages (en, fr, de, es, ru, zh, ja, pt, ar, hi), each a flat key→string dictionary, ~1600 lines total. `t(key)` looks up the current language, falling back to English. **Fixed**: this file (and a separate spot in `index.html`) used to overwrite the page's `<title>` and the visible `<h1>` with `window.APP_NAME` (which resolves to the raw hostname, e.g. "localhost" or "radio.rathore.club") every time the language changed or on load — actively harmful for SEO since Google indexes the rendered title/h1, not a generic keyword-rich one. Fixed by leaving `<title>`/`<h1>` as fixed, keyword-optimized static text and never touching them from JS (the hostname-as-branding behavior elsewhere, e.g. the mobile header's small title text, was intentionally left alone — only the primary `<title>`/`<h1>` were changed).
- **`visualizer.js`**: the audio-reactive visual effects (bars/particles/etc.) behind the globe when idle. **It is 100% simulated** (`setInterval`-driven fake waveform data), not real Web Audio API frequency analysis, despite variable names like `audioContext`/`analyser` suggesting otherwise — most radio streams don't support the CORS headers needed for real `AnalyserNode` access anyway, so this was a deliberate fallback, but it's misleading if you go looking for "real" audio analysis. **Fixed a minor leak**: the simulation's `setInterval` used to run continuously in the background even when the visualizer was stopped/hidden; now it starts/stops together with the visualizer.
- **`logger.js`**: lightweight event logging, currently console-only (not wired to any analytics backend as of this writing).
- **`stations-utils.js`**: shared, dependency-free helpers loaded standalone (not a class) — `filterLoadableStations()`, `isStationExcepted()`, `isHttpOnlyStation()`, `applyHttpsFilter()`, `filterExceptedStations()`. Used by `app.js`, `globe.js`, and `search.js` alike.

---

## 7. UI structure quick-reference

- **Layout**: a full-bleed map/globe canvas behind a collapsible side panel (desktop) or full-screen overlay panel (mobile), plus a persistent bottom player bar.
- **Side panel tabs**: Popular, Search, Favorites, Now Playing.
- **Bottom player bar controls**: prev, play/pause, next, **favorite (star)**, mute, volume slider, visualizer toggle. Always visible once any station has ever played this session.
- **Now Playing tab controls**: play/pause, **favorite (star)**, **share**, volume, mute, plus a stream-info block (protocol/format/genre/website).
- **Header icon clusters** (theme, language, share, profile) — duplicated in two places by design: the desktop floating `.globe-controls` overlay (top-left, over the map) and the mobile-only `.mobile-header` (top bar). Both exist simultaneously at mobile widths — this is pre-existing, intentional (if slightly redundant) layout, not a bug.
- **Modals**: welcome/setup, profile, language picker, share-favorites, share-station (with QR), station picker (cluster disambiguation).
- **Themes** (8): `rathore` (default/branded), `light`, `midnight`, `forest`, `ocean`, `purple`, `sunset`, `rosegold`. Applied via a `body.theme-X` class.
- **Keyboard shortcuts**: Space/K play-pause, F favorite, R toggle globe auto-rotate, M mute, ↑/↓ volume ±10%.

---

## 8. External network dependencies

| What | URL | Why |
|---|---|---|
| three.js | `unpkg.com/three@0.160.0` | 3D globe rendering |
| three-globe | `unpkg.com/three-globe@2.30.0` | Globe geometry/markers, also its bundled Earth texture images |
| Firebase (app + firestore, compat) | `gstatic.com/firebasejs/9.23.0/` | Optional cross-device profile sync |
| Google Fonts | `fonts.googleapis.com`, `fonts.gstatic.com` | "Outfit" typeface |
| HTTP→HTTPS stream proxy | `proxy.ramsharans-rathore.workers.dev` | Personal Cloudflare Worker; routes `http://` station streams through it when the page itself is HTTPS, to avoid mixed-content blocking. **Also routes that portion of users' listening activity through this third-party proxy** — a privacy/trust tradeoff worth knowing about, not currently disclosed to users anywhere in the UI. |

**None of these have Subresource Integrity (SRI) hashes** — if `unpkg.com` or `gstatic.com` ever served something unexpected, the page would run it with no integrity check. Flagged as tech debt, not fixed.

The QR code library was deliberately **not** loaded from a CDN (see §11) — everything else above still is.

---

## 9. Caching, cache-busting, and the single most common "why isn't my fix showing" trap

**This has bitten every single feature session in this project's history. Read this before debugging "it works locally but not live" or "the browser shows old behavior."**

- Every `<script src="js/X.js?v=N">` and `<link href="assets/styles.css?v=N">` in `index.html` carries a manually-maintained version query string.
- **Whenever you edit any `.js` or `.css` file, you must bump its `?v=N` in `index.html`, or browsers (and the service worker) will keep serving the stale cached copy.** This project does not use content-hashed filenames or a build step to automate this — it's fully manual. Different files can be at different version numbers; they don't need to stay in sync with each other, just be higher than whatever a returning browser already cached.
- `service-worker.js` additionally has its own `RELEASE` constant (which derives `STATIC_CACHE`) — bump this, **and** `version.json`'s `version` field to the same value, after any change that should force existing installed/cached clients to fully refresh. `index.html`'s `checkAppVersion()` polls `version.json` on load and force-clears all caches + unregisters the service worker if the deployed version differs from what's stored locally — this is the actual mechanism that gets a fix in front of a returning visitor; forgetting either half of the bump (as happened for two consecutive commits before being caught) means the fix silently never reaches them. (There used to be a second, separate, never-read `CACHE_NAME` constant here that looked like the thing to bump instead — it was removed specifically because it was a trap for exactly this mistake.)
- **When testing changes in a browser that has visited the site before** (including the Claude Browser preview tool, which persists a service worker across reloads within a session), a plain reload is often not enough. The reliable pattern used throughout this project's development:
  ```js
  navigator.serviceWorker.getRegistrations().then(rs => {
      rs.forEach(r => r.unregister());
      return caches.keys();
  }).then(keys => Promise.all(keys.map(k => caches.delete(k))))
    .then(() => { location.href = 'http://localhost:8080/?fresh=' + Date.now(); });
  ```
  Run this (via the browser tool's JS-eval capability) before verifying any fix, every time.
- Both `service-worker.js` and `index.html`'s inline scripts use relative paths (`./`) rather than absolute (`/`) — this was itself a fix (absolute paths broke when the site was hypothetically served from a GitHub Pages *project* subpath like `/proj-02-radio/` rather than a domain root; moot now since the real deployment is Cloudflare Pages at a root domain, but the relative-path fix is harmless and still correct either way).

---

## 10. Dev tooling — `automation/station-health/` (never deployed — moved here from a former top-level `station-tests/` in the 2026-08-14 reorg, §4)

A standalone Node.js script (no dependencies beyond Node 18+'s built-in `fetch`) that tests every station's stream URL(s) for reachability, mirroring the app's own stream-fallback order.

```bash
cd automation/station-health
node check-stations.js [--concurrency=40] [--timeout=8000] [--only-enabled]
```
Outputs `report.json` (full detail) and `report.md` (summary + list of broken-but-enabled stations — the ones actually affecting users).

**This tool found and directly led to fixing real bugs**, most notably:
- **The "Free FM Tokyo" bug**: a station's stream URL pointed to a completely unrelated Spanish station (data-entry error) — disabled.
- **7 stations using Zeno.fm stream URLs with a signed JWT token that expired 60 seconds after being scraped** (`iat`→`exp` was `+60s`) — by the time any real user clicked play, the token was long dead. Fixed by rewriting those 7 URLs to Zeno.fm's stable public embed format (`https://stream.zeno.fm/{key}`, no token) instead of disabling them.
- A broader sweep disabled **221 additional stations** confirmed dead across **two independent test runs** with different concurrency/timeout settings (to filter out transient network flakiness — 46 stations that looked broken on a fast/aggressive first pass turned out to be fine on a slower retry and were left alone). Failure breakdown: 84 connection failures, 81 returning an HTML error page instead of audio, 30× HTTP 404, 12× HTTP 403, 13 other.
- A follow-up full-catalog scan (2,989 stations, ~3 min) found **106 stream URLs shared by more than one station** — only spot-checked, not fully resolved; flagged as remaining tech debt (§13).

**This folder must stay in `.gitignore`** (currently is, via `/station-tests/`) — it was deliberately excluded from the deployed static site since it's a dev-only Node script with no purpose in production. If you regenerate it after a `station-tests/` was accidentally deleted, the script content is straightforward to recreate from this description, or check git history for `data/stations.json` around the "disable 221 stations" commit for the report methodology.

---

## 11. Why the QR library is vendored, not CDN-loaded

When the share-with-QR-code feature was built, the first attempt loaded the `qrcode` npm package from jsDelivr (`cdn.jsdelivr.net/npm/qrcode@1.5.3/...`). Two problems, discovered in order:
1. That package **doesn't actually ship a real browser-ready bundle** for that version/path — the "browser" entry point is raw CommonJS source using `require(...)`, which throws in a plain `<script>` tag with no module system.
2. Separately, a jsDelivr URL for a *different* (correct) path got **blocked by Chrome's ORB (Opaque Response Blocking)** security feature during testing.

Given both issues, the library was swapped for `qrcodejs` (davidshimjs) — small (~20KB), dependency-free, built specifically for `<script>`-tag use, global `QRCode` — and **self-hosted** at `js/vendor/qrcode.min.js` rather than pointed at any CDN. If you ever need to regenerate/update it, fetch `https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js` and re-vendor it the same way; don't switch back to the `qrcode` npm package without verifying it ships an actual browser bundle first.

**API note**: `qrcodejs` renders by instantiating `new QRCode(containerElement, options)` into a DOM container (it injects its own canvas/table), **not** by calling a static `.toCanvas()` method — that's the `qrcode` npm package's API, a different library with a similar name. `app.js`'s `showShareStationModal()` reuses one `QRCode` instance across repeated modal opens (`.clear()` + `.makeCode(newText)`) rather than re-instantiating, to avoid stacking duplicate QR images inside the container.

The QR is generated with `correctLevel: QRCode.CorrectLevel.H` (highest error-correction tier, tolerates ~30% damage/obstruction) because the Rathore Club crest logo is overlaid centered on top of it (covering ~3% of the code's area) — comfortably within that tolerance.

**The crest overlay required precise CSS math**, worth knowing if it ever needs adjusting: `assets/images/logo.png` is a 1024×1024 PNG with **large transparent margins** around the actual crest artwork (the visible content only occupies roughly x:[258,764], y:[84,802] of the full canvas — not centered, and much smaller than the full image). A naive `object-fit: contain` on the raw image renders mostly empty space. The fix crops into the actual content region using a scaled `<img>` inside an `overflow: hidden` container, with the scale/offset computed as: magnification `m = containerSize / cropSide`; rendered image size `= 1024 * m`; image offset `= containerSize/2 - contentCenter * m`. (An earlier attempt at this math mixed up two different scale factors and put the crop window on a blank area — if you touch this again, re-derive from the formula above rather than eyeballing pixel offsets.)

---

## 12. SEO & branding work done

- `<title>`/`<h1>` fixed to stop being overwritten by the raw hostname (see §6.7 i18n note) — now fixed, keyword-optimized text: *"Radio Explorer — Listen to Global Radio Stations Online Free"*.
- Meta description rewritten with target keywords: radio, global radio, world radio, internet radio, live radio stations.
- Added: `meta[name=keywords]`, `meta[name=author]` (Ram Sharan Singh), `link[rel=author]` → ramsharans.com, canonical URL, Open Graph tags, Twitter Card tags.
- Added JSON-LD structured data: a `WebApplication` schema for the app itself, with a `Person` (Ram Sharan Singh, `sameAs: ["https://ramsharans.com"]`) as both `author` and `creator` — the mechanism for associating the app with the owner's name/brand in search engines' eyes over time.
- Added `robots.txt` (allow-all + sitemap reference) and `sitemap.xml`.
- **Realistic expectations set with the user**: ranking for broad single-word terms like "radio" is not realistically achievable against entrenched competitors (Radio Garden, TuneIn, iHeartRadio); long-tail phrases matching what the app actually does ("interactive world radio map", "3D globe radio player") are far more winnable. Ranking for the owner's personal name ("Ram Sharan Singh") is a much lower-competition target and the one most directly helped by the structured-data work above — but that still depends on off-page signals (backlinks, consistent name/link usage across other profiles) more than anything on-page, and takes weeks/months to move, not days.
- Google Search Console verification was discussed but **not set up** — if the user provides a verification meta tag/file in the future, that's the next concrete SEO step (sitemap submission, indexing status, query performance).

---

## 13. Known issues / tech debt — not fixed, worth knowing about

- **106 duplicate stream URLs** across different station entries in `stations.json` — some legitimate (shared broadcast feeds), some likely data errors. Only the most obviously-wrong ones (Free FM Tokyo, the 7 expired Zeno.fm tokens) were fixed; a full audit was not completed.
- **59% of enabled stations are `http://`-only on this HTTPS-only origin** — the actual largest reason most of the catalogue is invisible by default (the app's HTTPS-only preference exists because of this). The `http→https` upgrade attempt and the Cloudflare Worker proxy fallback both have known reliability gaps for a meaningful subset of these (see §8's proxy row). Not something a client-side fix can fully solve — the real fix is auditing/re-sourcing the affected station entries.
- **No SRI hashes** on any CDN-loaded script (three.js, three-globe, Firebase, Google Fonts).
- **3D globe view's focus-rotation lands close to center but not pixel-perfect** (unlike the 2D map, which is exact) — low priority since map is the default view. (Re-verified as still true after the reset-view behavior change — that change affects *what* gets focused on reset, not the underlying rotation precision.)
- ~~`user.getStats().favoritesCount` stale/`0` count bug~~ — **fixed 2026-08-14** as a side effect of deleting the second favorites store entirely (see §17); it now reads live from `favorites.js`, so there's nothing left to drift out of sync.
- **The HTTP-stream proxy is a personal, undisclosed third party** (`proxy.ramsharans-rathore.workers.dev`) that a portion of users' listening traffic is silently routed through — not a bug, but a transparency/privacy consideration if this app ever gets meaningfully public.
- **`automation/` is a real but partially-broken/orphaned test suite** — Playwright + unit + data-validation + integration harness with defined npm scripts, but not wired into any CI (no `.github/` directory exists), some of its own assertions are stale against the current codebase (e.g. a regex checking for an unversioned script tag that no longer exists), and it references a port (3000) that doesn't match the actual dev server (8080). It is real, unlike a prior version of this doc's claim that "no automated test suite" exists at all — but it needs repair before it's trustworthy. Manual browser-driven verification (as this doc has always recommended) remains the reliable path for now.
- **`logger.js` isn't wired to any real analytics backend** — currently console-only. If real usage analytics are ever wanted, this is the file to extend, not to replace.
- **No authentication on Firestore profile reads/writes** (`js/firebase-sync.js`) — anyone who obtains (or brute-forces/enumerates) a user's 8-character ID can read or overwrite that profile; the app has no auth layer and the ID is a bare document key, not a secret verified server-side. A `firestore.rules` file now exists at the repo root that closes the two most concretely-exploitable issues this allowed (custom-ID hijacking, arbitrary stats/global tampering) — **but it is not deployed automatically; see that file's own header comment for the manual `firebase deploy --only firestore:rules` step required.** True per-user ownership (preventing anyone who knows/guesses an ID from touching that profile at all) still requires migrating to Firebase Anonymous Auth, which is a real feature, not a rules tweak — deliberately not done in this pass.
- **`radios/nirkam/`'s `getRadioPosition()` has two independently-maintained implementations** (`js/app.js` and `embed.html`) that agree today but have no shared source — a future change to one won't automatically reach the other (this is exactly how the fixed-epoch sync bug and the playlist-file-mapping bug both happened before).

---

## 14. Conventions for making future changes

1. **No build step.** Don't add a bundler, a framework, TypeScript, or a `package.json` with dependencies unless explicitly asked — this was a deliberate reversion from a prior React/FastAPI attempt.
2. **Bump `?v=N` on every `.js`/`.css` file you edit**, and bump `service-worker.js`'s `RELEASE` constant + `version.json`'s `version` field (to the same value as each other) for anything significant. See §9 — this is not optional, it's the difference between your fix actually reaching a browser or not.
3. **When verifying UI changes, hard-clear the service worker + caches** (see the JS snippet in §9) before trusting what you see in a browser that's visited the site before this session.
4. **Escape everything station-supplied before it touches the DOM** — `escapeHtml()` for text, `escapeAttr()` + `isSafeUrl()` for anything in an attribute (`href`/`src`). Do this in both `ui.js` and `search.js` if you touch rendering in either.
5. **Don't fabricate numbers presented as real data to users** (see the "connected users" stat history in §6.6) — if a metric can't be computed for real, show nothing rather than a plausible-looking fake.
6. **Favoriting must go through `app.js`'s `handleFavoriteToggle(stationId)`** so all three surfaces (station cards, Now Playing star, bottom-bar star) stay in sync via the `favorites:favoritesChanged` event — don't call `favorites.toggle()` directly from a new UI location.
7. **Playing a station must go through `handleStationSelected(station)`** — don't call `audio.loadStation()` directly from new code, or you'll bypass the UI-sync, focus-pan, and favorites/history-tracking side effects it triggers.
8. **Test at multiple breakpoints**, not just one phone size — this project has repeatedly had bugs that only appeared at very narrow (320px) or very short (landscape phone, ≤480px tall) viewports while looking fine at "normal" 375×812.
9. **The map/globe math is fragile — re-derive, don't eyeball.** Both the cover-fit projection (§6.3) and the QR logo crop (§11) previously had real bugs from mixed-up scale factors that visually looked plausible enough to almost ship. If you touch coordinate math, write out the formula and check units/frames of reference explicitly.

---

## 15. Ideas for future work (not committed to, just flagged as plausible next steps)

- Fix `README.md` to describe the actual (Cloudflare Pages) deployment instead of the stale GitHub Pages instructions.
- Full audit + cleanup of the 106 duplicate stream URLs.
- Add SRI hashes to CDN scripts, or vendor three.js/three-globe locally too (consistent with the QR library decision).
- ~~Reconcile the two separate favorites stores~~ — done 2026-08-14 (see §17): the second store was deleted, not reconciled.
- Set up Google Search Console (needs the user to generate a verification token).
- Consider disclosing the third-party HTTP-stream proxy to users somewhere (privacy/about page), if the app grows a meaningfully public audience.
- Add a real (non-simulated) Web Audio API visualizer path for the subset of streams that do support CORS, falling back to the simulated one otherwise.

---

## 16. Keeping this doc current

If you're an AI assistant picking up work on this project: **after any substantive change, update the relevant section of this file in the same turn/session**, especially:
- New features → add to §6 (module deep-dive) and §7 (UI quick-reference).
- New bugs found & fixed → add to the relevant module's subsection in §6, following the existing pattern of "what was wrong → why → what the fix was → what not to re-break."
- New tech debt discovered but not fixed → §13.
- New conventions established → §14.
- Anything that changes deployment, hosting, or third-party dependencies → §2, §8, §9.

Don't let this document drift into being aspirational/inaccurate the way `README.md` and (at one point) `CHANGES.md` did — that's the exact failure mode this document exists to prevent.

---

## 17. `backend/` — a real backend now exists (added 2026-08-13), separate from everything above

Everything in §1–16 above describes the static frontend, which is still exactly what it was: no build step, no framework. **A genuinely separate Cloudflare Worker + D1 backend now exists in `backend/`**, added specifically to fix a real security gap this doc used to describe as accepted risk (§13's old note on `js/firebase-sync.js` having no real per-user ownership — a client-generated ID with no proof of possession). That gap is what the backend replaces, not extends.

- **Stack**: TypeScript, Hono, Cloudflare D1, deployed once to `https://radio-explorer-api.ramsharans-rathore.workers.dev` (free tier). **Full details, setup, and the local-testing workflow live in `backend/README.md` — read that, not this section, for anything beyond orientation.**
- **Auth is backend-owned** (opaque bearer sessions, D1-verified — no JWT, no signing key) with **real Google sign-in** layered on top as an alternative to anonymous. Signing in with Google while an anonymous session is active converts that same account row in place (same id) rather than merging two rows — so favorites/history carry over with zero data migration.
- **Now connected to the frontend (2026-08-14) — §6's description of `js/firebase-sync.js`/`js/user.js`/`js/favorites.js` is superseded, not just extended.** `js/firebase-sync.js` is **deleted**; `js/api-client.js` (new) is the backend HTTP client. `js/user.js`'s `this.firebaseSync` is gone — replaced by `this.apiClient`, with a `mergeServerProfile()` reconciliation step (server wins for preferences only once it actually has any; the backend's real `id` becomes the profile's canonical id going forward). `js/favorites.js`'s `FavoritesController` is now the **sole** source of truth for favorites (the old second copy on `UserProfile.data.favorites` was deleted, not synchronized) and does its own best-effort backend sync on every mutation, plus a one-time `reconcileWithBackend()` that seeds the backend from local data on first contact — **never the reverse**, specifically to avoid repeating this project's past favorites data-loss bug. The old "type your ID to restore on another device" flow (present in *two* places — the setup modal and the profile modal's "Import Profile" form) is **removed entirely**, replaced by real Google sign-in; `customId` is now purely a cosmetic nickname. Verified with real browser tests (Playwright): fresh setup, favorite round-tripping through actual D1 (not just localStorage), pre-existing local favorites migrating up on first contact without loss, and full app functionality with the backend entirely unreachable (network-failure tolerance was a hard requirement, not an afterthought).
- **The old Firestore project (`proj-radio`) is now fully unused by the frontend** — nothing in `js/` talks to Firestore anymore. It's still not deleted server-side (per Phase 1's ground rules), just orphaned.
- **Deploys require asking first, every single time** — this is a standing rule for this project now (not just a style preference), including for changes that only touch the backend, and now the frontend too. See `backend/README.md`'s own warning and the project's saved memory on this. Nothing from this frontend-wiring work has been deployed or pushed anywhere.
- Do not duplicate `backend/README.md`'s content into this file as the backend evolves — extend that doc instead.
