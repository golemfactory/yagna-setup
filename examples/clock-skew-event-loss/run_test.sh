#!/usr/bin/env bash
# Clock-skew event-loss test (yagna PR #3569 regression test).
#
# Provider activity events are cursored by `event_date > afterTimestamp` and
# stamped from wall-clock `Utc::now()`. If the provider daemon's clock steps
# backwards between two event inserts (NTP correction, VM suspend/resume), an
# already-delivered later-stamped event hides the earlier-stamped ones forever:
# the CreateActivity is never delivered to ya-provider, no ExeUnit is spawned,
# and the activity stays in state ["New",null] while the requestor times out
# ("Unable to create activity ... 408").
#
# This test reproduces that deterministically. The release binaries are
# statically linked, so their clock cannot be faked with LD_PRELOAD tricks;
# instead, after FLIP_AFTER completed task cycles the driver injects one
# event row stamped STEP seconds in the future into the provider's live
# activity.db - exactly the row a daemon whose clock was about to step back
# would have written. On affected yagna versions the next cycle's
# CreateActivity is stamped below the (now future) watermark and is lost.
#
# Exit code: 0 = no orphaned activities (fixed yagna), 1 = orphans (bug).
# EXPECTED TO FAIL until the yagna release pinned by download_binaries.sh
# contains the fix from https://github.com/golemfactory/yagna/pull/3569.
#
# Prerequisites: ./download_binaries.sh was run (golem/downloaded), node+npm,
# sqlite3, /dev/kvm access, internet (task image registry).
#
# Env overrides: BIN_DIR, ROUTER_PORT (default 7011), STEP (25), CYCLES (8),
# FLIP_AFTER (3).
set -euo pipefail

TESTDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETUP="$(cd "$TESTDIR/../.." && pwd)"
BIN_DIR="${BIN_DIR:-$SETUP/golem/downloaded}"
PLUGINS="$BIN_DIR/plugins"
ROUTER_PORT="${ROUTER_PORT:-7011}"
STEP="${STEP:-25}"
CYCLES="${CYCLES:-8}"
FLIP_AFTER="${FLIP_AFTER:-3}"
RUN="$TESTDIR/run"

for b in yagna ya-provider ya-sb-router; do
    [ -x "$BIN_DIR/$b" ] || { echo "missing $BIN_DIR/$b - run ./download_binaries.sh first"; exit 2; }
done
command -v sqlite3 >/dev/null || { echo "sqlite3 is required"; exit 2; }
command -v node >/dev/null || { echo "node is required"; exit 2; }

# --- driver deps --------------------------------------------------------------
if [ ! -d "$TESTDIR/driver/node_modules" ]; then
    echo "==> installing driver dependencies"
    (cd "$TESTDIR/driver" && npm install --no-audit --no-fund)
fi

# --- fresh run dirs -----------------------------------------------------------
echo "==> preparing fresh run dir $RUN"
rm -rf "$RUN"
mkdir -p "$RUN/provider/providerdir" "$RUN/requestor"
cp "$TESTDIR/env/provider.env"  "$RUN/provider/.env"
cp "$TESTDIR/env/requestor.env" "$RUN/requestor/.env"
cp "$TESTDIR/env/presets.json" "$TESTDIR/env/globals.json" "$RUN/provider/providerdir/"
sed -i "s|^CENTRAL_NET_HOST=.*|CENTRAL_NET_HOST=127.0.0.1:$ROUTER_PORT|" \
    "$RUN/provider/.env" "$RUN/requestor/.env"
echo "EXE_UNIT_PATH=$PLUGINS/ya-*.json" >> "$RUN/provider/.env"

PIDS=()
cleanup() {
    for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
    sleep 2
    for pid in "${PIDS[@]:-}"; do kill -9 "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT

wait_api() { # url name
    for _ in $(seq 1 90); do
        curl -sf "$1/version/get" >/dev/null 2>&1 && { echo "    $2 API ready"; return 0; }
        sleep 1
    done
    echo "    $2 API did not come up"; return 1
}

echo "==> starting ya-sb-router :$ROUTER_PORT"
"$BIN_DIR/ya-sb-router" -l "tcp://127.0.0.1:$ROUTER_PORT" > "$RUN/router.log" 2>&1 &
PIDS+=($!)
# The daemons' central-net client must not race the router's socket: a missed
# initial connect leaves market broadcasts silently dead on slow CI runners.
for _ in $(seq 1 30); do
    (exec 3<>"/dev/tcp/127.0.0.1/$ROUTER_PORT") 2>/dev/null && { exec 3>&- 2>/dev/null; echo "    router accepting connections"; break; }
    sleep 1
done

echo "==> starting provider yagna daemon"
(
    cd "$RUN/provider"
    "$BIN_DIR/yagna" service run > yagna.log 2>&1 &
    echo $! > yagna.pid
)
PIDS+=("$(cat "$RUN/provider/yagna.pid")")
wait_api "http://127.0.0.1:7541" "provider"

echo "==> starting ya-provider agent (real clock)"
(
    cd "$RUN/provider"
    "$BIN_DIR/ya-provider" run > provider.log 2>&1 &
    echo $! > provider.pid
)
PIDS+=("$(cat "$RUN/provider/provider.pid")")

echo "==> starting requestor yagna daemon (real clock)"
(
    cd "$RUN/requestor"
    "$BIN_DIR/yagna" service run > yagna.log 2>&1 &
    echo $! > yagna.pid
)
PIDS+=("$(cat "$RUN/requestor/yagna.pid")")
wait_api "http://127.0.0.1:7553" "requestor"

echo "==> waiting for provider offer subscription"
SUBSCRIBED=0
for _ in $(seq 1 60); do
    grep -q "Subscribed offer" "$RUN/provider/provider.log" 2>/dev/null && { SUBSCRIBED=1; break; }
    if ! kill -0 "$(cat "$RUN/provider/provider.pid")" 2>/dev/null; then
        echo "!! ya-provider exited during startup:"
        tail -5 "$RUN/provider/provider.log"
        echo ">>> INCONCLUSIVE: provider agent failed to start (missing runtime plugins? run ./download_binaries.sh)."
        exit 3
    fi
    sleep 1
done
if [ "$SUBSCRIBED" -ne 1 ]; then
    echo ">>> INCONCLUSIVE: provider never subscribed an offer. Check $RUN/provider/provider.log"
    exit 3
fi
sleep 3

echo "==> driver: $CYCLES task cycles, +${STEP}s event injected after cycle $FLIP_AFTER"
(
    cd "$TESTDIR/driver"
    ACTIVITY_DB="$RUN/provider/yagnadir/activity.db" \
    CYCLES="$CYCLES" FLIP_AFTER="$FLIP_AFTER" STEP_BACK_SECS="$STEP" \
    YAGNA_APPKEY="clockskewReqKey" \
    YAGNA_API_URL="http://127.0.0.1:7553" \
    YA_PAYMENT_NETWORK="hoodi" \
    node driver.js 2>&1 | tee "$RUN/driver.log"
)

sleep 5
cleanup
trap - EXIT
sleep 2

# --- verdict ------------------------------------------------------------------
DB="$RUN/provider/yagnadir/activity.db"
echo
echo "================ VERDICT ================"
sqlite3 "$DB" "PRAGMA wal_checkpoint(TRUNCATE);" >/dev/null 2>&1 || true

TOTAL=$(sqlite3 "$DB" "SELECT COUNT(*) FROM activity;")
ORPHANS=$(sqlite3 "$DB" "SELECT COUNT(*) FROM activity a JOIN activity_state s ON s.id=a.state_id WHERE s.name LIKE '%\"New\"%';")
INVERSIONS=$(sqlite3 "$DB" "SELECT COUNT(*) FROM activity_event e WHERE e.event_date < (SELECT MAX(e2.event_date) FROM activity_event e2 WHERE e2.id < e.id);")
SPAWNED=$(grep -c "Creating task" "$RUN/provider/provider.log" 2>/dev/null || echo 0)

echo "activities in db               : $TOTAL"
echo "ExeUnits actually spawned      : $SPAWNED"
echo "activities stuck in [\"New\"]   : $ORPHANS"
echo "id/event_date inversions in db : $INVERSIONS"
echo
sqlite3 -header -column "$DB" \
  "SELECT e.id, e.activity_id aid, CASE e.event_type_id WHEN 1 THEN 'CREATE' ELSE 'DESTROY' END ev, e.event_date, s.name state
   FROM activity_event e JOIN activity a ON a.id=e.activity_id JOIN activity_state s ON s.id=a.state_id ORDER BY e.id;"
echo
if [ "$ORPHANS" -eq 0 ] && [ "$TOTAL" -ge "$CYCLES" ]; then
    echo ">>> PASS: all $TOTAL activities delivered despite the ${STEP}s backwards clock step."
    exit 0
elif [ "$ORPHANS" -gt 0 ]; then
    echo ">>> FAIL: $ORPHANS activities orphaned in state New - CreateActivity events lost behind the timestamp watermark."
    echo ">>> This is the bug fixed by https://github.com/golemfactory/yagna/pull/3569 (expected failure until the pinned yagna release contains it)."
    exit 1
else
    echo ">>> INCONCLUSIVE: only $TOTAL activities were created (expected >= $CYCLES). Check $RUN logs."
    exit 3
fi
