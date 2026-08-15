# Radio Explorer backend

Cloudflare Worker (Hono) + D1, Phase 1. Auth is backend-owned opaque
sessions (no Firebase, no signing key) plus optional real Google sign-in
layered on top (see "Google sign-in" below — this is the one place a real
secret exists). **Milestone 2 (frontend wiring) is done** — the actual
app (`../frontend/js/api-client.js`, `../frontend/js/user.js`, `../frontend/js/favorites.js`) now
talks to this backend for real; see `../docs/PROJECT_REFERENCE.md` §17 for
what changed there. Deployed once already at
`https://radio-explorer-api.ramsharans-rathore.workers.dev` — **but don't
redeploy without asking first, every time, even after local changes**;
everything in this doc otherwise runs 100% locally. See
`../docs/IMPROVEMENT_PLAN.md` and the plan doc referenced in project history
for the full design.

`FRONTEND_ORIGIN` (`wrangler.toml`) is where `/auth/google/callback`
redirects back to after a sign-in attempt (success or failure) —
`?sessionToken=&userId=&isNewUser=&wasLinked=` on success,
`?authError=<message>` on failure. `../frontend/js/api-client.js`'s
`consumeAuthRedirectParams()` on the frontend reads and strips these,
mirroring `app.js`'s existing `checkSharedData()` pattern.

## One-time setup

```bash
cd backend
npm install --legacy-peer-deps   # peer-dep conflict between wrangler and
                                  # @cloudflare/vitest-pool-workers' nested
                                  # wrangler — safe to ignore, dev-tooling only
npm run db:migrate:local          # applies migrations/*.sql to a local
                                  # SQLite file under .wrangler/state —
                                  # never touches any real Cloudflare account
```

## Automated tests (fastest — do this first)

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest, runs inside Miniflare — fully offline
```

**214/214 passing**, split into two kinds:

- **`test/unit/*.test.ts`** — one file per `src/lib/*.ts` module, calling
  its exported functions directly (not through HTTP), covering every
  function/branch/edge case: `validate.test.ts` (62 cases — every
  validator, every boundary), `session.test.ts` (token format/entropy,
  hash determinism), `oauth.test.ts` (PKCE generation, JWT payload
  decoding, token-exchange with a stubbed `fetch` — never a real network
  call), `ratelimit.test.ts` (window boundaries, independent keys,
  rollover — against Miniflare's real KV, not a hand-rolled mock),
  `db.test.ts` (61 cases — every exported function including the
  Google-auth link/create/race logic, asserting on actual D1 state via
  raw follow-up queries, not just return values), `auth.test.ts` (the
  `requireAuth` middleware in a throwaway Hono app, not the full route
  tree), `cors.test.ts`, `errors.test.ts`.
- **`test/integration/api.test.ts`** + **`test/integration/google-auth.test.ts`**
  — end-to-end tests exercising the full HTTP pipeline (routing,
  middleware order, error mapping) via real requests through the actual
  Hono app. The Google flow test substitutes a fake token exchange (via
  `__setGoogleTokenExchangeForTesting`) so it runs fully offline too — no
  real Google credentials needed to prove the flow works structurally.

This split (added after an initial pass that only had integration tests)
caught two real bugs the integration suite had missed: `addHistoryEntry`
threw a raw D1 foreign-key error instead of a clean `NotFoundError` for a
nonexistent user (insert was ordered before the existence check), and the
200-entry history trim could retain 201+ rows if two entries shared the
same millisecond timestamp (the `DELETE ... NOT IN` was keyed on the
`played_at` value, not the unique row — fixed to use `rowid`). Both are
fixed in `src/lib/db.ts` and covered by regression tests.

## Run it and poke at it manually

```bash
npm run dev   # wrangler dev --local, http://localhost:8787
```

Quick curl check:
```bash
curl -X POST http://localhost:8787/api/v1/auth/anonymous
# -> {"userId":"...","sessionToken":"...","expiresAt":...}

curl -H "Authorization: Bearer <sessionToken from above>" \
     http://localhost:8787/api/v1/profile
```

### Browser-based harness

`test/manual/auth-test.html` — buttons for every route, with a log panel.

**Must be served over HTTP, not opened via `file://`** — a `file://`
page sends `Origin: null`, which the backend's CORS allow-list correctly
rejects (found this the hard way — see plan doc history). From this
directory:

```bash
cd test/manual
python3 -m http.server 8080
```

Then open **http://localhost:8080/auth-test.html** (port 8080 is already
in the local `ALLOWED_ORIGINS` default in `wrangler.toml`, so no backend
config change is needed). Point "API base URL" at `http://localhost:8787`
and click through: create account → profile → favorites → history →
stats → the two negative-auth buttons → logout.

## Google sign-in — what you need to do (I can't do this part)

The automated tests never need real Google credentials (they substitute a
fake token exchange). To actually click through a real Google sign-in
manually via `test/manual/auth-test.html`, you need to create an OAuth
client yourself:

1. [console.cloud.google.com](https://console.cloud.google.com) → **APIs & Services → Credentials**
2. **Create Credentials → OAuth client ID → Application type: Web application**
3. **Authorized redirect URIs** — add both:
   - `http://localhost:8787/api/v1/auth/google/callback` (local dev)
   - `https://radio-explorer-api.ramsharans-rathore.workers.dev/api/v1/auth/google/callback` (deployed — only if/when you redeploy)
4. Copy the **Client ID** into `wrangler.toml`'s `GOOGLE_CLIENT_ID` (replacing the placeholder).
5. Copy the **Client Secret** into `.dev.vars`'s `GOOGLE_CLIENT_SECRET` (replacing the placeholder — this file is gitignored, never commit a real secret here).

Until you do this, `/auth/google/start` still works (it doesn't need
real credentials to redirect to Google), but the redirect will land on a
real Google error page ("invalid_client") rather than a real consent
screen — expected, not a bug in this backend.

**Anonymous sign-in and account linking work today without any of the
above** — `/auth/google/start`/`/callback`'s *logic* (state/PKCE
handling, linking an anonymous account's data onto a new Google-linked
row, deduping repeat sign-ins) is fully covered by the automated tests
regardless.

## Gotcha: database_id changes silently reset local state

Miniflare's local D1 emulation is keyed by `wrangler.toml`'s exact
`database_id` — not by the `database_name`. If that id ever changes (it
did, the day this was first deployed: the placeholder id got replaced
with the real one `wrangler d1 create` printed), `wrangler dev --local`
silently starts serving a **brand-new, unmigrated** local database under
the new id — no error, just `no such table: users` the first time
something tries to use it. `./test-local.sh` at the repo root runs
`db:migrate:local` every time specifically so this can't happen
unnoticed again; if you ever see this error running things by hand,
run `npm run db:migrate:local` and it'll resolve immediately.

## Resetting local state

The local D1/KV data lives under `.wrangler/state/` (gitignored). To
start fresh:
```bash
rm -rf .wrangler/state
npm run db:migrate:local
```

## What NOT to run yet

`wrangler deploy`, `wrangler d1 create`, `wrangler kv namespace create`,
`wrangler secret put` — all of these touch a real Cloudflare account /
create real remote resources. `wrangler.toml` currently has placeholder
resource IDs on purpose. Don't run these until there's an explicit
decision to actually deploy.
