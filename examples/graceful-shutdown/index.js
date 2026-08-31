// Long-running task used by the `golemsp stop --graceful` end-to-end test.
//
// The task itself is trivial - it sleeps for TASK_DURATION_SEC inside the
// container. What matters is the timing: the driver script (run_test.sh)
// requests a graceful provider shutdown while this task is running and then
// checks that the task still finishes normally.
//
// Two markers are written next to this file so the driver doesn't have to
// parse logs:
//   started.marker  - written when the activity is ready and the sleep begins
//   finished.marker - written when the task returned its result
//
// Exit code 0 means the task completed, 1 means it didn't. The second
// invocation of this script (after the stop was requested) is expected to fail:
// the provider should no longer be reachable through the market.

import { TaskExecutor, pinoPrettyLogger } from "@golem-sdk/task-executor";
import { fileURLToPath } from "url";
import { writeFileSync, existsSync, rmSync } from "fs";
import "dotenv/config";

const DIR_NAME = fileURLToPath(new URL(".", import.meta.url));

const MARKER_PREFIX = process.env.MARKER_PREFIX || "task";
const STARTED_MARKER = `${DIR_NAME}/${MARKER_PREFIX}.started.marker`;
const FINISHED_MARKER = `${DIR_NAME}/${MARKER_PREFIX}.finished.marker`;

const TASK_DURATION_SEC = Number(process.env.TASK_DURATION_SEC || 120);
// How long the executor is allowed to look for a provider and run the task.
const EXECUTOR_TIMEOUT_SEC = Number(process.env.EXECUTOR_TIMEOUT_SEC || 600);
// How long we let the executor wind down before leaving anyway.
const SHUTDOWN_TIMEOUT_SEC = Number(process.env.SHUTDOWN_TIMEOUT_SEC || 60);

const stamp = () => new Date().toISOString();

async function main() {
    const subnetTag = process.env.YAGNA_SUBNET || "public";
    const appKey = process.env.YAGNA_APPKEY || "66iiOdkvV29";

    for (const marker of [STARTED_MARKER, FINISHED_MARKER]) {
        if (existsSync(marker)) rmSync(marker);
    }

    const executor = await TaskExecutor.create({
        subnetTag,
        // Same pinned Alpine image the transfer test uses.
        package:
            process.env.IMAGE_HASH ||
            "1cb8a95736cd4417bfe68e8d48849cf1341641c24dbd1d2b9823e8f9",
        logger: pinoPrettyLogger(),
        yagnaOptions: { apiKey: appKey },
        payment: {
            driver: "erc20",
            network: process.env.YA_PAYMENT_NETWORK || "hoodi",
        },
        activityExeBatchResultPollIntervalSeconds: 5,
        taskTimeout: EXECUTOR_TIMEOUT_SEC * 1000,
        expirationSec: EXECUTOR_TIMEOUT_SEC + 300,
        activityExeBatchResultMaxRetries: 20,
    });

    let ok = false;
    try {
        await executor.run(async (ctx) => {
            console.log("%s provider: %s", stamp(), ctx.provider.name);
            writeFileSync(STARTED_MARKER, `${stamp()} ${ctx.provider.name}\n`);

            console.log("%s sleeping for %ds", stamp(), TASK_DURATION_SEC);
            const result = await ctx.run(
                `sleep ${TASK_DURATION_SEC} && echo task-done`
            );

            const stdout = (result?.stdout || "").toString().trim();
            if (stdout !== "task-done") {
                throw new Error(`unexpected task output: ${stdout}`);
            }

            console.log("%s task finished on the provider", stamp());
            writeFileSync(FINISHED_MARKER, `${stamp()}\n`);
            ok = true;
        });
    } catch (error) {
        console.error("%s task failed: %s", stamp(), error);
    }

    // The provider is expected to be gone (or on its way out) by now, so the
    // executor's shutdown - terminating the agreement, settling the invoice -
    // can hang for good. It has nothing to do with what this test checks, so
    // give it a bounded amount of time and leave either way.
    await Promise.race([
        executor.shutdown().catch((e) => console.error("shutdown: %s", e)),
        new Promise((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_SEC * 1000)),
    ]);

    console.log("%s exiting with %d", stamp(), ok ? 0 : 1);
    process.exit(ok ? 0 : 1);
}

main();
