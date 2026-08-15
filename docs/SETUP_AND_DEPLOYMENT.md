# Radio Explorer — Local Setup, Testing & Deployment

One consolidated, practical doc: how to get this running on your machine,
every way to test it locally, and what deployment actually involves. For
*why* things are built the way they are, see `PROJECT_REFERENCE.md`
(same folder). For repo layout, see that doc's §4 or the root `README.md`.

**Standing rule, unconditional:** nothing in this doc runs
`wrangler deploy` / `wrangler d1 create` / `wrangler kv namespace create` /
`wrangler secret put` automatically. Every real-Cloudflare-resource action
is called out explicitly in §5 and requires your explicit go-ahead, every
time — even if you approved a deploy earlier in the same session.

---

## 1. Prerequisites

- **Node.js 18+** (backend + automation tooling)
- **Python 3** (just for `python3 -m http.server` — the frontend has no
  build step and no npm dependency of its own)
- A real Chrome/Chromium install if you want the Playwright-based checks
  (`automation/e2e/`) — not required for the other test layers

## 2. Repo layout (recap)

```
frontend/     ← the whole static site (what Cloudflare Pages serves)
backend/      ← Cloudflare Worker (Hono) + D1 — API, auth, migrations
automation/   ← e2e/unit/integration/data test suites + station-health/
docs/         ← this file, PROJECT_REFERENCE.md, changelog, planning notes
test-local.sh ← root-level entrypoint that runs backend + frontend checks together
```

## 3. Local setup

### 3.1 Frontend — no install step

```bash
cd frontend
python3 -m http.server 8080
```
Open **http://localhost:8080**. Do not open `index.html` via `file://` —
browsers block `fetch()`-ing `data/stations.json` from disk, and CORS to
the backend requires a real `Origin` header, which `file://` doesn't send.

### 3.2 Backend — one-time install + migrate

```bash
cd backend
npm install --legacy-peer-deps   # --legacy-peer-deps needed: wrangler v4 vs.
                                  # @cloudflare/vitest-pool-workers' nested
                                  # wrangler v3 — safe to ignore, dev-tooling only
npm run db:migrate:local          # applies migrations/*.sql to a local SQLite
                                  # file under .wrangler/state — never touches
                                  # the real Cloudflare account/database
npm run dev                       # wrangler dev --local → http://localhost:8787
```
`.dev.vars` (gitignored) needs a `GOOGLE_CLIENT_SECRET` line for Google
sign-in to work past the redirect — see backend/README.md's "Google
sign-in" section if you need to set that up fresh. Everything else
(anonymous accounts, favorites, history, stats) works with zero secrets.

### 3.3 Automation suite — optional, only if running that layer

```bash
cd automation
npm install
```

---

## 4. Testing locally

### 4.1 Fastest path — the one command to run before considering any change done

```bash
./test-local.sh            # backend typecheck+tests, real wrangler dev --local
                            # boot + smoke curl flow, frontend static-site check
./test-local.sh --backend  # backend only
./test-local.sh --frontend # frontend only
```
Never touches a real Cloudflare resource — every backend step is
explicitly `--local`. See the script's own header comment.

### 4.2 Backend tests, in detail

```bash
cd backend
npm run typecheck   # tsc --noEmit
npm test            # vitest, inside Miniflare — fully offline, no real network calls
```
**217/217 passing** as of the last full run — split into
`test/unit/*.test.ts` (one file per `src/lib/*.ts` module, calling
exported functions directly) and `test/integration/*.test.ts` (real HTTP
requests through the actual Hono app, including a full Google-sign-in
flow with a stubbed token exchange — no real Google credentials needed).

Manual poke-around, once `npm run dev` is up:
```bash
curl -X POST http://localhost:8787/api/v1/auth/anonymous
# -> {"userId":"...","sessionToken":"...","expiresAt":...}

curl -H "Authorization: Bearer <sessionToken from above>" \
     http://localhost:8787/api/v1/profile
```

Or the browser-based harness, `backend/test/manual/auth-test.html` —
buttons for every route plus a log panel. Must be served over HTTP (same
`file://` CORS problem as above):
```bash
cd backend/test/manual
python3 -m http.server 8080
```
Open **http://localhost:8080/auth-test.html**, point "API base URL" at
`http://localhost:8787`, click through: create account → profile →
favorites → history → stats → the two negative-auth buttons → logout.

### 4.3 Frontend — static-site smoke check

Covered by `./test-local.sh --frontend` (starts `frontend/` on :8080,
confirms `index.html` and `data/stations.json` load with a sane station
count). For anything beyond that, open http://localhost:8080 yourself and
click around, or use the automation e2e suite below for a scripted pass.

### 4.4 Full stack together — the real end-to-end setup

Run backend and frontend at the same time (two terminals, or two
background processes) to exercise real sync between them:
```bash
# terminal 1
cd backend && npm run dev

# terminal 2
cd frontend && python3 -m http.server 8080
```
Open http://localhost:8080 — on first load the app creates an anonymous
backend session automatically (`js/api-client.js`), favorites/history
sync to the local D1 in the background, and "Sign in with Google" (if
you set up `.dev.vars` per §3.2) redirects through the real Google
consent screen and back.

### 4.5 Automation suite (`automation/`)

```bash
cd automation
npm test               # everything: data validation, unit, integration, e2e
npm run test:data       # stations.json / manifest.json validation only
npm run test:unit       # JS module syntax/size checks (frontend/js, frontend/assets)
npm run test:e2e        # Playwright, boots its own http.server against frontend/
npm run test:stations   # station-health/ — real connectivity check against every
                         # station's stream URL(s) (slow — hits ~3,000 real URLs)
npm run report           # regenerate the HTML/JSON report from the last run
```
`test:e2e` and `test:stations` make real outbound network calls (to the
app's own assets and to every station's stream server, respectively) —
expect them to take longer and be more failure-prone than the other
layers, which are fully offline.

---

## 5. Deployment

**Current state, as of this writing: the backend was deployed once
(2026-08-13) to prove Milestone 1 end-to-end; the frontend has never been
deployed with today's `frontend/`-nested structure — the live site at
`radio.rathore.club` is still being served from the pre-reorg layout.**
Nothing below has been run since the reorg. Don't run any of it without
asking first, every time — this section is reference for *when* that
happens, not a queue of pending actions.

### 5.1 Frontend (Cloudflare Pages)

The live site auto-deploys from this repo's `main` branch via Cloudflare
Pages — no GitHub Actions workflow, no build step. **One required change
before the next deploy actually works:** Pages' **Root directory**
project setting must be pointed at `frontend/` (Cloudflare dashboard →
this Pages project → Settings → Builds → Root directory). Before the
reorg the repo root itself was the served root; now everything Pages
should serve lives one level down.

Every deploy that changes any cached `.js`/`.css`/`.html` file needs its
`?v=N` bumped in `frontend/index.html`, plus `frontend/service-worker.js`'s
`STATIC_CACHE` and `frontend/version.json`'s `version` field to the same
number — see `PROJECT_REFERENCE.md` §9 for why.

### 5.2 Backend (Cloudflare Worker + D1)

Real resources already exist (created 2026-08-13, see `backend/wrangler.toml`):
- D1 database `radio_db` (id `0afc2d4a-12bc-492e-8dea-05a165956a94`)
- KV namespace `radio_rate_limit` (id `782d76e8f61341e2a86a0f33230eb8a7`)
- Worker deployed at `https://radio-explorer-api.ramsharans-rathore.workers.dev`

To redeploy (only with explicit go-ahead):
```bash
cd backend
npm run typecheck && npm test         # don't deploy on a red build
wrangler d1 migrations apply radio_db --remote   # apply any NEW migrations to the real database
wrangler secret put GOOGLE_CLIENT_SECRET          # only if not already set remotely, or rotating it
wrangler deploy
```
**Before redeploying, check `wrangler.toml`'s `FRONTEND_ORIGIN`** — it's
currently `http://localhost:8080` (set for local dev). If the frontend is
also being redeployed to `https://radio.rathore.club`, this needs to
change to that, or Google sign-in will redirect users to localhost after
a real deploy.

### 5.3 What NOT to run without asking

`wrangler deploy`, `wrangler d1 create`, `wrangler d1 migrations apply
--remote`, `wrangler kv namespace create`, `wrangler secret put`, and any
Cloudflare Pages dashboard setting change (like §5.1's Root directory) —
all of these touch a real account or a real, already-deployed resource.
`./test-local.sh` and everything in §4 never do any of this; that's the
whole point of the split.

---

## 6. Known gotchas

- **Miniflare's local D1 storage is keyed by `wrangler.toml`'s exact
  `database_id`.** If that id ever changes, local dev silently starts
  serving a brand-new, unmigrated database (`no such table: users`) —
  no error otherwise. `./test-local.sh` always re-runs
  `db:migrate:local` (idempotent) specifically so this can't bite
  unnoticed; if you see this error running things by hand, just run
  `npm run db:migrate:local` again.
- **`file://` breaks both halves of the app** — the frontend can't
  `fetch()` `data/stations.json` from disk, and any backend call sends
  `Origin: null`, which the CORS allow-list correctly rejects. Always use
  a local HTTP server (§3.1/§4.2's manual-harness note).
- **Cache-busting is fully manual** — editing any `.js`/`.css` file
  without bumping its `?v=N` in `index.html` means browsers (and the
  service worker) keep serving the stale cached copy. See
  `PROJECT_REFERENCE.md` §9 for the full mechanism and the reliable
  "hard reset" snippet for testing in a browser that's visited the site
  before.
