# Running Radio Explorer Locally

**TL;DR:** Two terminal windows, two simple commands.

```bash
# Terminal 1: Backend (Cloudflare Worker + D1)
cd backend
npm run dev

# Terminal 2: Frontend (Static site)
cd frontend
python3 -m http.server 8080
```

Then open **http://localhost:8080** in your browser.

---

## One-time setup

### Backend
```bash
cd backend
npm install --legacy-peer-deps
npm run db:migrate:local
npm run dev
```

You'll see:
```
⎔ Starting local server...
[wrangler:info] Ready on http://localhost:8787
```

### Frontend
```bash
cd frontend
python3 -m http.server 8080
```

Visit **http://localhost:8080** — you should see the globe, a search bar, and ~2,990 stations in the data loaded from `data/stations.json`.

---

## What's running

| Component | Port | Technology | Purpose |
|---|---|---|---|
| **Frontend** | 8080 | Python static server | Serves HTML/CSS/JS to your browser |
| **Backend** | 8787 | Wrangler (local dev) | REST API, user sessions, D1 database |
| **Database** | (local) | D1 (Miniflare) | Session/profile/favorites/history storage |

### The real interaction

1. **You open http://localhost:8080**
2. Browser loads `index.html` (plain HTML, no build step)
3. JavaScript in `frontend/js/app.js` initializes, loads stations from local `data/stations.json`
4. On first visit, `api-client.js` creates an anonymous session via `POST http://localhost:8787/api/v1/auth/anonymous`
5. From then on, every favorite/history action syncs to the local D1 database via the backend
6. If you reload the page, favorites and history are restored from D1, not just localStorage

**All this works 100% locally — no network calls except to the two local servers.**

---

## Quick verification

Confirm everything is wired correctly:

```bash
# Frontend is serving
curl -I http://localhost:8080/index.html
# HTTP/1.0 200 OK

# Backend is running
curl -X POST http://localhost:8787/api/v1/auth/anonymous \
  -H "Content-Type: application/json"
# {"userId":"...", "sessionToken":"...", "expiresAt":...}

# Favorites sync works
# (open DevTools → Network tab, star a station, watch the POST to localhost:8787/api/v1/favorites/...)
```

---

## Features to try

### On the app
- **Click a station** on the globe/map → plays it
- **Search** by country, genre, or language (top search bar)
- **Star a station** (heart icon) → added to favorites, synced to backend
- **Reload the page** → favorites still there (persisted to D1, not just localStorage)
- **Open DevTools (F12)** → Network tab → watch real HTTP requests to `:8787` as you interact

### Keyboard
| Key | Action |
|---|---|
| **Space** / **K** | Play/Pause |
| **F** | Toggle Favorite |
| **R** | Auto-rotate globe |
| **M** | Toggle 2D map ↔ 3D globe |
| **↑** / **↓** | Volume ±10% |

### Backend testing
Open **backend/test/manual/auth-test.html** in another window to manually test every API route without clicking the main app:
```bash
cd backend/test/manual
python3 -m http.server 8081  # on a different port so it doesn't conflict
# Then open http://localhost:8081/auth-test.html
```
This page has buttons for every route: create account, profile GET/PATCH, add/remove favorites, history, stats, logout, etc. Each click shows the raw request/response.

---

## Stopping

```bash
# Both servers: Ctrl+C in their respective terminal windows
# Or kill by port:
lsof -ti:8080 | xargs kill -9
lsof -ti:8787 | xargs kill -9
```

Local state (D1 database, KV cache) is stored in `backend/.wrangler/state/` — it persists across `npm run dev` restarts. To start fresh:
```bash
rm -rf backend/.wrangler/state
npm run db:migrate:local
```

---

## Troubleshooting

**"Cannot find module 'playwright'"** (if running automation tests)
```bash
cd automation
npm install
npm test
```

**"Port 8080 already in use"**
```bash
lsof -ti:8080 | xargs kill -9
```

**"EADDRINUSE: address already in use :::8787"**
```bash
lsof -ti:8787 | xargs kill -9
```

**No console errors but app shows "Cannot reach API"**
```bash
# Confirm backend is running:
curl http://localhost:8787/api/v1/stats
# If this fails, re-run: cd backend && npm run dev
```

**Favorites not syncing**
- Check DevTools Network tab: are POST requests to `localhost:8787` succeeding (200 OK)?
- Check backend logs: any errors in the `npm run dev` window?
- Try reloading and checking again — sync failures are logged but don't block local changes.

---

## Next steps

- **Local testing:** Run `./test-local.sh` from repo root (backend tests + frontend smoke check)
- **Full test suite:** `cd automation && npm test` (data/unit/e2e/integration tests)
- **Deployment docs:** `docs/SETUP_AND_DEPLOYMENT.md` (how to deploy to Cloudflare)
- **Architecture:** `docs/PROJECT_REFERENCE.md` (deep dive into design decisions)
