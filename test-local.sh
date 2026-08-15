#!/usr/bin/env bash
#
# test-local.sh — the standard way to test the whole application locally.
#
# SAFETY INVARIANT: this script NEVER touches a real Cloudflare resource.
# It never runs `wrangler deploy`, `wrangler d1 create`,
# `wrangler kv namespace create`, or `wrangler secret put`. Every backend
# command below is explicitly `--local` (Miniflare emulation only). If
# you're ever tempted to add a step that ships something live, don't —
# that requires the user's explicit go-ahead, every time (see project
# memory: "no-deploy-without-permission").
#
# Run this before considering any change to backend/ or the frontend
# done. Exit code 0 = everything passed; non-zero = something failed,
# details are in the output above.
#
# Usage:
#   ./test-local.sh            # run everything (backend + frontend)
#   ./test-local.sh --backend  # backend only (typecheck + unit + integration tests)
#   ./test-local.sh --frontend # frontend static-site smoke check only

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

MODE="${1:---all}"
FAILED=0

# ---------------------------------------------------------------------------
say() { echo; echo "=== $1 ==="; }

run_backend_tests() {
    say "Backend: typecheck + unit + integration tests"
    (
        cd backend
        if [ ! -d node_modules ]; then
            echo "Installing backend dependencies (first run)..."
            npm install --legacy-peer-deps --silent
        fi
        npm run typecheck
        npm test
    ) || { echo "❌ Backend tests FAILED"; FAILED=1; return; }
    echo "✅ Backend tests passed"
}

run_backend_boot_smoke() {
    say "Backend: real wrangler dev --local boot smoke test"
    (
        cd backend

        # Miniflare's local D1 emulation is keyed by wrangler.toml's exact
        # database_id — if that id ever changes (e.g. it did, the day this
        # was first deployed and the placeholder got swapped for the real
        # one), local storage silently starts over as a fresh, unmigrated
        # database with no tables at all. Re-running this every time is
        # idempotent (already-applied migrations are skipped) and makes
        # that failure mode impossible to hit again unnoticed.
        npm run db:migrate:local

        # Free the port from any stale previous run before starting.
        lsof -ti:8787 -sTCP:LISTEN | xargs -r kill 2>/dev/null || true

        npm run dev > /tmp/radio-backend-dev.log 2>&1 &
        DEV_PID=$!
        trap 'kill "$DEV_PID" 2>/dev/null || true' EXIT

        READY=0
        for _ in $(seq 1 30); do
            if curl -sf http://localhost:8787/api/v1/health >/dev/null 2>&1; then
                READY=1
                break
            fi
            sleep 1
        done

        if [ "$READY" != "1" ]; then
            echo "❌ wrangler dev --local never became ready — log:"
            cat /tmp/radio-backend-dev.log
            exit 1
        fi

        # Exercise one real end-to-end flow against the LOCAL emulation
        # (not any deployed instance). Each curl's exit status is checked
        # explicitly — `X=$(cmd)` does NOT trip `set -e` on its own even
        # if `cmd` fails, so relying on that alone previously let a real
        # 500 error through as a false pass.
        if ! CREATE_RESP=$(curl -sf -X POST http://localhost:8787/api/v1/auth/anonymous); then
            echo "❌ POST /auth/anonymous failed — dev server log:"
            cat /tmp/radio-backend-dev.log
            exit 1
        fi

        TOKEN=$(echo "$CREATE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['sessionToken'])")
        if [ -z "$TOKEN" ]; then
            echo "❌ Could not extract sessionToken from: $CREATE_RESP"
            exit 1
        fi

        if ! curl -sf -H "Authorization: Bearer $TOKEN" http://localhost:8787/api/v1/profile >/dev/null; then
            echo "❌ GET /profile with a fresh session failed"
            exit 1
        fi

        if ! curl -sf http://localhost:8787/api/v1/stats >/dev/null; then
            echo "❌ GET /stats (public) failed"
            exit 1
        fi

        kill "$DEV_PID" 2>/dev/null || true
        trap - EXIT
    ) || { echo "❌ Backend boot smoke test FAILED"; FAILED=1; return; }
    echo "✅ Backend boots and serves real requests locally"
}

run_frontend_smoke() {
    say "Frontend: static site smoke check"
    (
        cd frontend
        lsof -ti:8080 -sTCP:LISTEN | xargs -r kill 2>/dev/null || true

        python3 -m http.server 8080 > /tmp/radio-frontend-http.log 2>&1 &
        HTTP_PID=$!
        trap 'kill "$HTTP_PID" 2>/dev/null || true' EXIT

        READY=0
        for _ in $(seq 1 15); do
            if curl -sf http://localhost:8080/index.html >/dev/null 2>&1; then
                READY=1
                break
            fi
            sleep 1
        done

        if [ "$READY" != "1" ]; then
            echo "❌ Static server never became ready"
            exit 1
        fi

        if ! curl -sf http://localhost:8080/data/stations.json -o /tmp/radio-stations-check.json; then
            echo "❌ data/stations.json failed to load"
            exit 1
        fi
        STATION_COUNT=$(python3 -c "import json; print(len(json.load(open('/tmp/radio-stations-check.json'))))")
        if [ -z "$STATION_COUNT" ] || [ "$STATION_COUNT" -lt 100 ]; then
            echo "❌ data/stations.json loaded but station count looks wrong: '$STATION_COUNT'"
            exit 1
        fi
        echo "stations.json OK ($STATION_COUNT stations)"

        kill "$HTTP_PID" 2>/dev/null || true
        trap - EXIT
    ) || { echo "❌ Frontend smoke check FAILED"; FAILED=1; return; }
    echo "✅ Frontend serves correctly locally"
}

case "$MODE" in
    --backend)
        run_backend_tests
        run_backend_boot_smoke
        ;;
    --frontend)
        run_frontend_smoke
        ;;
    --all)
        run_backend_tests
        run_backend_boot_smoke
        run_frontend_smoke
        ;;
    *)
        echo "Unknown mode: $MODE (expected --all, --backend, or --frontend)"
        exit 2
        ;;
esac

echo
if [ "$FAILED" -ne 0 ]; then
    echo "❌ One or more local checks failed — see above."
    exit 1
fi
echo "✅ All local checks passed. Nothing was deployed."
