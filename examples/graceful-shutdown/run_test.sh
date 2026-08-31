#!/bin/bash
# End-to-end test for `golemsp stop --graceful`.
#
# Expects a running local setup: ya-sb-router, a requestor yagna and a provider
# node (yagna + ya-provider) started with the DEFAULT data directories, because
# `golemsp stop` looks the pids up in ~/.local/share/{yagna,ya-provider} and
# ignores YAGNA_DATADIR / DATA_DIR.
#
# What it checks:
#   1. a task that is already running is NOT killed by the graceful stop
#   2. the provider stops accepting new work as soon as the stop is requested
#   3. the provider is stopped only after the running task finished
#   4. `golemsp stop --graceful` exits once both processes are gone
#   5. the shutdown request is reset when the provider starts again
#
# Usage: examples/graceful-shutdown/run_test.sh

set -uo pipefail

cd "$(dirname "$0")"

PROVIDER_DATA_DIR="${PROVIDER_DATA_DIR:-$HOME/.local/share/ya-provider}"
YAGNA_DATA_DIR="${YAGNA_DATA_DIR:-$HOME/.local/share/yagna}"
SHUTDOWN_FILE="$PROVIDER_DATA_DIR/shutdown-status.json"
# Directory holding the provider node's .env, used for the restart check.
# Leave empty to skip that part.
PROVIDER_RUN_DIR="${PROVIDER_RUN_DIR:-}"

# The two nodes are told apart by their REST API, not by the ambient env: the
# requestor runs the task, the provider node is the one being stopped.
REQUESTOR_API_URL="${REQUESTOR_API_URL:-http://127.0.0.1:7465}"
REQUESTOR_APPKEY="${REQUESTOR_APPKEY:-66iiOdkvV29}"
PROVIDER_API_URL="${PROVIDER_API_URL:-http://127.0.0.1:7541}"
PROVIDER_APPKEY="${PROVIDER_APPKEY:-provider111}"

# The task has to outlive the "provider refuses new work" probe below.
export TASK_DURATION_SEC="${TASK_DURATION_SEC:-180}"
# How long we wait for the first task to reach the provider.
START_TIMEOUT="${START_TIMEOUT:-420}"
# How long we wait for the stop to complete after the task finished.
STOP_TIMEOUT="${STOP_TIMEOUT:-300}"

failed=0

pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*"; failed=1; }
info() { echo "---- $*"; }

alive() { kill -0 "$1" 2>/dev/null; }

wait_for_file() {
    local file="$1" timeout="$2" waited=0
    while [ ! -f "$file" ]; do
        if [ "$waited" -ge "$timeout" ]; then
            return 1
        fi
        sleep 2
        waited=$((waited + 2))
    done
    return 0
}

read_pid() {
    local file="$1"
    [ -f "$file" ] && cat "$file"
}

info "installing test dependencies"
npm install --silent || exit 1

# Markers left by an earlier run would make the wait below return immediately.
rm -f task.started.marker task.finished.marker late.started.marker late.finished.marker

info "starting the long task (${TASK_DURATION_SEC}s on the provider)"
MARKER_PREFIX=task YAGNA_API_URL="$REQUESTOR_API_URL" YAGNA_APPKEY="$REQUESTOR_APPKEY" \
    timeout $((TASK_DURATION_SEC + 900)) node index.js >task.log 2>&1 &
task_pid=$!

if ! wait_for_file task.started.marker "$START_TIMEOUT"; then
    fail "task did not start on a provider within ${START_TIMEOUT}s"
    kill "$task_pid" 2>/dev/null
    tail -50 task.log
    exit 1
fi
pass "task started on the provider: $(cat task.started.marker)"

provider_pid=$(read_pid "$PROVIDER_DATA_DIR/ya-provider.pid")
yagna_pid=$(read_pid "$YAGNA_DATA_DIR/yagna.pid")
if [ -z "${provider_pid:-}" ] || [ -z "${yagna_pid:-}" ]; then
    fail "no pid files in $PROVIDER_DATA_DIR / $YAGNA_DATA_DIR - was the node started with the default data dirs?"
    kill "$task_pid" 2>/dev/null
    exit 1
fi
info "provider pid $provider_pid, yagna pid $yagna_pid"

info "requesting graceful stop while the task is running"
stop_requested=$(date +%s)
YAGNA_API_URL="$PROVIDER_API_URL" YAGNA_APPKEY="$PROVIDER_APPKEY" \
    golemsp stop --graceful >stop.log 2>&1 &
stop_pid=$!

sleep 20

if grep -q '"gracefulShutdownRequested": *true' "$SHUTDOWN_FILE" 2>/dev/null; then
    pass "shutdown request written to $SHUTDOWN_FILE"
else
    fail "$SHUTDOWN_FILE does not hold a shutdown request: $(cat "$SHUTDOWN_FILE" 2>/dev/null)"
fi

if alive "$provider_pid"; then
    pass "provider is still running while the task computes"
else
    fail "provider died while a task was still running"
fi

if alive "$task_pid"; then
    pass "task was not interrupted by the shutdown request"
else
    fail "task ended as soon as the shutdown was requested"
    tail -50 task.log
fi

# The provider must not take on anything new while shutting down. Its offer is
# still published, so the second requestor finds it and gets rejected.
info "checking that no new work is accepted while shutting down"
MARKER_PREFIX=late TASK_DURATION_SEC=5 EXECUTOR_TIMEOUT_SEC=90 \
    YAGNA_API_URL="$REQUESTOR_API_URL" YAGNA_APPKEY="$REQUESTOR_APPKEY" \
    timeout 300 node index.js >late_task.log 2>&1
late_status=$?
if [ "$late_status" -ne 0 ] && [ ! -f late.started.marker ]; then
    pass "second task never got an agreement (exit $late_status)"
else
    fail "provider accepted new work while shutting down (exit $late_status)"
    tail -30 late_task.log
fi

info "waiting for the first task to finish"
wait "$task_pid"
task_status=$?
# When the task ended, not when the requestor process got around to exiting:
# tearing the executor down after the provider is gone takes its own time.
task_finished=$(stat -c %Y task.finished.marker 2>/dev/null || date +%s)

if [ "$task_status" -eq 0 ] && [ -f task.finished.marker ]; then
    pass "task completed normally while the node was shutting down (exit 0)"
else
    fail "task did not complete (exit $task_status)"
    tail -50 task.log
fi

compute_duration=$((task_finished - stop_requested))
if [ "$compute_duration" -ge 30 ]; then
    pass "provider kept computing for ${compute_duration}s after the stop request"
else
    fail "task finished only ${compute_duration}s after the stop request - too fast to prove anything"
fi

info "waiting for golemsp stop to return"
waited=0
while alive "$stop_pid"; do
    if [ "$waited" -ge "$STOP_TIMEOUT" ]; then
        fail "golemsp stop --graceful did not return within ${STOP_TIMEOUT}s"
        kill "$stop_pid" 2>/dev/null
        break
    fi
    sleep 2
    waited=$((waited + 2))
done

if wait "$stop_pid"; then
    pass "golemsp stop --graceful exited successfully"
else
    fail "golemsp stop --graceful failed"
fi
cat stop.log

if alive "$provider_pid"; then
    fail "ya-provider ($provider_pid) is still running after the stop"
else
    pass "ya-provider stopped"
fi

if alive "$yagna_pid"; then
    fail "yagna ($yagna_pid) is still running after the stop"
else
    pass "yagna stopped"
fi

if grep -qr "Graceful shutdown requested" "$PROVIDER_DATA_DIR"/*.log 2>/dev/null; then
    pass "provider log confirms it saw the shutdown request"
else
    fail "no 'Graceful shutdown requested' in the provider log - did it notice the request?"
fi

if grep -qr "due to graceful shutdown" "$PROVIDER_DATA_DIR"/*.log 2>/dev/null; then
    pass "provider log confirms proposals were rejected while shutting down"
else
    fail "no rejected proposals in the provider log - was the second task refused for another reason?"
fi

# The request file is reset on start, so a stale request can't silence a fresh run.
if [ -n "$PROVIDER_RUN_DIR" ]; then
    info "restarting the provider node to check the request is reset"
    # The requestor's appkey is in the environment for the task above; passing
    # the node's own credentials keeps the restarted provider from
    # authenticating against its yagna with the wrong key and dying on startup.
    log_dir="$PWD"
    (
        cd "$PROVIDER_RUN_DIR" || exit 1
        export YAGNA_APPKEY="$PROVIDER_APPKEY" YAGNA_API_URL="$PROVIDER_API_URL"
        yagna service run >"$log_dir/restart_yagna.log" 2>&1 &
        sleep "${RESTART_YAGNA_WAIT:-25}"
        ya-provider run >"$log_dir/restart_provider.log" 2>&1 &
        sleep "${RESTART_PROVIDER_WAIT:-30}"
    )
    if grep -q '"gracefulShutdownRequested": *false' "$SHUTDOWN_FILE" 2>/dev/null; then
        pass "shutdown request was reset on provider start"
    else
        fail "stale shutdown request after restart: $(cat "$SHUTDOWN_FILE" 2>/dev/null)"
        tail -20 restart_provider.log 2>/dev/null
    fi

    # A plain stop takes the restarted node down again, without waiting.
    info "checking a plain stop takes the restarted node down"
    restarted_provider_pid=$(read_pid "$PROVIDER_DATA_DIR/ya-provider.pid")
    restarted_yagna_pid=$(read_pid "$YAGNA_DATA_DIR/yagna.pid")

    golemsp stop >restart_stop.log 2>&1
    restart_stop_status=$?
    cat restart_stop.log

    if [ "$restart_stop_status" -eq 0 ] &&
        [ -n "${restarted_provider_pid:-}" ] && ! alive "$restarted_provider_pid" &&
        [ -n "${restarted_yagna_pid:-}" ] && ! alive "$restarted_yagna_pid"; then
        pass "plain stop took down the restarted node"
    else
        fail "restarted node survived a plain stop (exit $restart_stop_status)"
    fi
fi

if [ "$failed" -eq 0 ]; then
    echo "graceful shutdown test: OK"
else
    echo "graceful shutdown test: FAILED"
fi
exit "$failed"
