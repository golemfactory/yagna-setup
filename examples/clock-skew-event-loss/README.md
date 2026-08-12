# Clock-skew event-loss test

Regression test for [golemfactory/yagna#3569](https://github.com/golemfactory/yagna/pull/3569):
a backwards step of the provider daemon's wall clock (NTP correction, VM
suspend/resume) makes the activity-event timestamp watermark skip events that
were inserted after an already-delivered, later-stamped event. The lost
`CreateActivity` leaves the activity in state `["New", null]` forever: no
ExeUnit is spawned, and the requestor fails with
`Unable to create activity: ... 408`.

Observed in the field on a provider processing bursts of short agreements: a
~14 s NTP step orphaned 12 of 40 activities.

## What the test does

1. Starts a private `ya-sb-router`, a provider (daemon + `ya-provider`) and a
   requestor, all local, using the release binaries from `golem/downloaded`.
2. A golem-js driver runs 8 short task cycles (one agreement + one activity +
   two commands each).
3. After cycle 3 the driver injects one `DestroyActivity` event row stamped
   **25 s in the future** into the provider's live `activity.db` — exactly the
   row a daemon whose clock was about to step backwards would have written.
   (The release binaries are statically linked, so the clock itself cannot be
   faked with `LD_PRELOAD`/libfaketime; injecting the row the skewed clock
   would have produced exercises the very same delivery code paths. The extra
   destroy for an already-destroyed activity is harmless — the agent logs
   `Can't destroy not existing activity`, as seen in the field logs.)
4. On affected yagna the delivered future event advances the agent's
   `afterTimestamp` watermark 25 s ahead, so the next cycles' `CreateActivity`
   events (stamped with real time) are filtered out forever. On fixed yagna
   the daemon stamps every later event above the injected one (monotonic
   clamp), so nothing is lost.
5. Verdict from the provider's `activity.db`: any activity stuck in `["New"]`
   means the bug is present.

## Running

```bash
./download_binaries.sh          # once, from the repo root
cd examples/clock-skew-event-loss
./run_test.sh
```

Exit codes: `0` pass (fixed yagna), `1` bug reproduced, `3` inconclusive
(environment problem — inspect `run/`), `2` missing prerequisite.

**This test is expected to FAIL (exit 1)** until the yagna release pinned in
`download_binaries.sh` contains the fix.

Requires: node + npm, sqlite3, `/dev/kvm` access (vm runtime), internet
access (task image registry). Ports 7011, 7540/7541, 7552/7553 must be free
(override with `ROUTER_PORT`, or edit `env/*.env`).

## Typical failing output

```
activities in db               : 8
ExeUnits actually spawned      : 7
activities stuck in ["New"]   : 1
id/event_date inversions in db : 3

id  aid  ev       event_date                  state
...
6   3    DESTROY  2026-08-12 12:22:51.441979  ["Terminated",null]
7   3    DESTROY  2026-08-12 12:23:16.441979  ["Terminated",null]  <- injected (+25s)
8   4    CREATE   2026-08-12 12:22:59.637909  ["New",null]         <- stamped below the
9   4    DESTROY  2026-08-12 12:23:04.640619  ["New",null]            delivered watermark,
                                                                      never delivered
>>> FAIL: 1 activities orphaned in state New ...
```
