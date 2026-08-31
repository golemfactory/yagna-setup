# Graceful shutdown test

End-to-end test for `golemsp stop --graceful`: the provider must stop offering
and stop accepting agreements immediately, keep computing whatever it already
agreed to, and only then shut down.

## What it checks

1. A task that is already running is not killed by the graceful stop.
2. No new work is accepted while draining (a second requestor run finds nobody).
3. The provider exits only after the running task finished.
4. `golemsp stop --graceful` returns once ya-provider and yagna are both gone.
5. The shutdown request in `shutdown-status.json` is reset when the provider
   starts again, so a stale request can't drain a fresh run.
6. `--provider-only` stops the agent and leaves that node's yagna running, and a
   plain `golemsp stop` afterwards still cleans the leftover yagna up.

Checks 5 and 6 need `PROVIDER_RUN_DIR` set (the workflow does).

## Running it

The test drives an already running local setup - `ya-sb-router`, a requestor
yagna and a provider node (yagna + ya-provider), same as the other examples.
See `.github/workflows/graceful_shutdown.yml` for the full provisioning.

```bash
examples/graceful-shutdown/run_test.sh
```

One thing is different from the other tests: the provider node has to run with
the **default data directories**. `golemsp stop` reads the pid files from
`~/.local/share/{yagna,ya-provider}` and ignores `YAGNA_DATADIR` / `DATA_DIR`,
so the workflow strips those two variables from the generated provider `.env`.
The requestor keeps its own data dir; the nodes are separated by GSB/API ports.

Useful knobs (all optional):

| variable | default | meaning |
| --- | --- | --- |
| `TASK_DURATION_SEC` | 180 | how long the task computes on the provider |
| `PROVIDER_DATA_DIR` | `~/.local/share/ya-provider` | where `shutdown-status.json` and the pid file live |
| `YAGNA_DATA_DIR` | `~/.local/share/yagna` | provider node's yagna data dir |
| `REQUESTOR_API_URL` | `http://127.0.0.1:7465` | REST API used to run the task |
| `PROVIDER_API_URL` | `http://127.0.0.1:7541` | REST API of the node being stopped |
| `PROVIDER_RUN_DIR` | *(empty)* | directory with the provider `.env`; set it to enable the restart check |

The test needs a yagna build that has `golemsp stop --graceful`. Until the
feature lands in an official release, the workflow installs a pre-release bundle
attached to a release in *this* repository (`yagna-binaries-graceful-stop2`,
copied from the yagna release `pre-rel-v0.18.0-graceful-stop2`). It lives here
because golemfactory/yagna is private - CI's `GITHUB_TOKEN` cannot read releases
there - and the CDN `download_binaries.sh` uses only mirrors official releases.

To test a newer build, attach its `golem-provider-linux-*.tar.gz` to a new
release here and pass that release through the `binaries_release` input. The
workflow checks both flags exist before provisioning anything, so an older
bundle fails immediately instead of halfway through the run.
