// Simple, legitimate file-transfer round-trip test.
//
// It verifies that the exe-unit `transfer` command works end to end:
//   1. upload a local file to the provider  (container `to` path)
//   2. copy it inside the container          (proves the bytes really arrived)
//   3. download the copy back to the requestor (container `from` path)
//   4. assert the downloaded bytes match what we uploaded
//
// Exit code 0 on success, 1 on any mismatch/failure so CI can gate on it.

import { TaskExecutor, pinoPrettyLogger } from "@golem-sdk/task-executor";
import { program } from "commander";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync, existsSync, rmSync } from "fs";
import "dotenv/config";

const DIR_NAME = fileURLToPath(new URL(".", import.meta.url));

const LOCAL_INPUT = `${DIR_NAME}/payload.txt`;
const LOCAL_OUTPUT = `${DIR_NAME}/payload.roundtrip.txt`;

// Deterministic payload with a recognizable marker so a partial/garbled
// transfer is easy to spot in logs.
const PAYLOAD = [
    "golem-transfer-test",
    "line-1: the quick brown fox",
    "line-2: 0123456789",
    "line-3: unicode ok — ąćęł 世界 🚀",
    "end",
    "",
].join("\n");

async function main(subnetTag) {
    subnetTag = subnetTag || process.env.YAGNA_SUBNET || "public";
    const appKey = process.env.YAGNA_APPKEY || "66iiOdkvV29";

    // Fresh local files for this run.
    writeFileSync(LOCAL_INPUT, PAYLOAD, "utf8");
    if (existsSync(LOCAL_OUTPUT)) rmSync(LOCAL_OUTPUT);

    const executor = await TaskExecutor.create({
        subnetTag,
        package: "golem/blender:latest",
        logger: pinoPrettyLogger(),
        yagnaOptions: { apiKey: appKey },
        payment: {
            driver: "erc20",
            network: process.env.YA_PAYMENT_NETWORK || "hoodi",
        },
        activityExeBatchResultPollIntervalSeconds: 5,
        taskTimeout: 1000 * 60 * 10,
        expirationSec: 60 * 30,
        activityExeBatchResultMaxRetries: 20,
    });

    let ok = false;
    try {
        await executor.run(async (ctx) => {
            console.log("Provider: %s", ctx.provider.name);

            const result = await ctx
                .beginBatch()
                .uploadFile(LOCAL_INPUT, "/golem/work/payload.txt")
                .run("cp /golem/work/payload.txt /golem/output/payload.txt")
                .downloadFile("/golem/output/payload.txt", LOCAL_OUTPUT)
                .end();

            // Surface the copy command's exit status for debugging.
            const cp = result?.[1];
            if (cp && cp.result !== "Ok") {
                throw new Error(
                    `in-container copy failed: ${cp.stderr || cp.result}`
                );
            }

            if (!existsSync(LOCAL_OUTPUT)) {
                throw new Error("downloaded file is missing");
            }

            const sent = readFileSync(LOCAL_INPUT, "utf8");
            const got = readFileSync(LOCAL_OUTPUT, "utf8");
            if (sent !== got) {
                throw new Error(
                    `round-trip mismatch: sent ${sent.length} bytes, got ${got.length} bytes`
                );
            }

            console.log("Transfer round-trip OK (%d bytes)", got.length);
            ok = true;
        });
    } catch (error) {
        console.error("Transfer test failed:", error);
    } finally {
        await executor.shutdown();
    }

    if (!ok) {
        process.exitCode = 1;
    }
}

program.option("--subnet-tag <subnet>", "set subnet name, for example 'public'");
program.parse();
const options = program.opts();
main(options.subnetTag);
