// Requestor churn driver for the lost-CreateActivity test.
//
// Reproduces the field pattern: many short agreements, one activity each,
// a couple of quick commands, terminate, next agreement. After FLIP_AFTER
// completed cycles it simulates a backwards step of the provider daemon's
// clock by injecting one future-dated DestroyActivity event row into the
// provider's live activity.db - byte-for-byte the state such a step leaves
// behind (an event stamped STEP seconds ahead of every later insert).
// The official release binaries are statically linked, so LD_PRELOAD
// tricks like libfaketime cannot fake their clock; writing the row the
// skewed clock would have written tests the very same code paths.
//
// On an affected provider the injected event advances the agent's
// event_date watermark STEP seconds into the future, so the next cycles'
// CreateActivity events (stamped with real time, below the watermark) are
// never delivered: the agreement is approved but no ExeUnit is ever
// spawned, this driver times out with "Unable to create activity ... 408",
// and activity.db keeps the activity in state ["New",null] forever.
// On a fixed provider the daemon stamps every later event above the
// injected one (monotonic clamp), so every cycle runs.
//
// Env:
//   ACTIVITY_DB    - path to the provider's activity.db (required)
//   CYCLES         - total agreement cycles (default 8)
//   FLIP_AFTER     - inject after this many completed cycles (default 3)
//   STEP_BACK_SECS - how far ahead the injected event is stamped (default 25)

import { TaskExecutor, pinoPrettyLogger } from "@golem-sdk/task-executor";
import { writeFileSync } from "fs";
import { execFileSync } from "child_process";
import "dotenv/config";

const ACTIVITY_DB = process.env.ACTIVITY_DB;
const CYCLES = parseInt(process.env.CYCLES || "8");
const FLIP_AFTER = parseInt(process.env.FLIP_AFTER || "3");
const STEP_BACK_SECS = parseInt(process.env.STEP_BACK_SECS || "25");

if (!ACTIVITY_DB) {
    console.error("ACTIVITY_DB env is required");
    process.exit(2);
}

// One event row stamped STEP_BACK_SECS in the future, cloned from the newest
// real event so identity_id / app_session_id match what the agent polls for.
// The extra DestroyActivity for an already-destroyed activity is harmless on
// the agent side (logged "Can't destroy not existing activity", same as the
// field logs) - its only effect is moving the timestamp watermark forward.
const INJECT_SQL = `
INSERT INTO activity_event
    (activity_id, identity_id, event_date, event_type_id, requestor_pub_key, app_session_id)
SELECT activity_id, identity_id,
       strftime('%Y-%m-%d %H:%M:%f', 'now', '+${STEP_BACK_SECS} seconds') || '000',
       2, NULL, app_session_id
FROM activity_event ORDER BY id DESC LIMIT 1;`;

const results = [];

async function oneCycle(i) {
    const executor = await TaskExecutor.create({
        subnetTag: process.env.YAGNA_SUBNET || "public",
        package:
            process.env.IMAGE_HASH ||
            "1cb8a95736cd4417bfe68e8d48849cf1341641c24dbd1d2b9823e8f9",
        logger: pinoPrettyLogger({ level: "warn" }),
        yagnaOptions: {
            apiKey: process.env.YAGNA_APPKEY,
            basePath: process.env.YAGNA_API_URL || "http://127.0.0.1:7553",
        },
        payment: {
            driver: "erc20",
            network: process.env.YA_PAYMENT_NETWORK || "holesky",
        },
        maxTaskRetries: 0,
        taskTimeout: 1000 * 60,
        expirationSec: 60 * 10,
    });

    try {
        const out = await executor.run(async (ctx) =>
            (await ctx.run("echo cycle-" + i + " && nproc")).stdout,
        );
        console.log(`[driver] cycle ${i}: OK -> ${String(out).trim().replace(/\n/g, " | ")}`);
        return "OK";
    } finally {
        await executor.shutdown();
    }
}

for (let i = 1; i <= CYCLES; i++) {
    const started = new Date().toISOString();
    try {
        results.push({ i, started, result: await oneCycle(i) });
    } catch (e) {
        console.log(`[driver] cycle ${i}: FAILED -> ${e.message || e}`);
        results.push({ i, started, result: "FAILED" });
    }

    if (i === FLIP_AFTER) {
        execFileSync("sqlite3", ["-cmd", ".timeout 15000", ACTIVITY_DB, INJECT_SQL]);
        console.log(
            `[driver] === injected event stamped +${STEP_BACK_SECS}s (simulated backwards clock step) after cycle ${i} ===`,
        );
    }
}

const failed = results.filter((r) => r.result !== "OK").length;
console.log(`[driver] done: ${results.length - failed}/${results.length} cycles OK`);
writeFileSync(
    new URL("./results.json", import.meta.url),
    JSON.stringify(results, null, 2),
);
