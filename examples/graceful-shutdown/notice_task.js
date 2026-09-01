// Cooperative requestor for the shutdown-notice part of the graceful-stop
// end-to-end test.
//
// It rents one provider and keeps feeding it short work items until the
// provider announces a graceful shutdown (golem-js re-emits yagna's
// AgreementTerminationNoticeEvent as `agreementTerminationNoticeReceived`). Then it
// stops scheduling, finishes the item in flight and terminates the agreement,
// which is exactly what lets `golemsp stop --graceful` return early.
//
// Markers written next to this file:
//   notice.started.marker  - first work item ran on the provider
//   notice.notice.marker   - the shutdown notice arrived
//   notice.finished.marker - the rental was finalized
//
// Exit code 0 = notice received and the wind-down completed; 1 otherwise.

import { GolemNetwork } from "@golem-sdk/golem-js";
import { fileURLToPath } from "url";
import { writeFileSync, rmSync } from "fs";
import "dotenv/config";

const DIR_NAME = fileURLToPath(new URL(".", import.meta.url));
const stamp = () => new Date().toISOString();
const mark = (name, extra = "") =>
    writeFileSync(`${DIR_NAME}/notice.${name}.marker`, `${stamp()} ${extra}\n`);

for (const m of ["started", "notice", "finished"]) {
    rmSync(`${DIR_NAME}/notice.${m}.marker`, { force: true });
}

const IMAGE_HASH =
    process.env.IMAGE_HASH ||
    "1cb8a95736cd4417bfe68e8d48849cf1341641c24dbd1d2b9823e8f9";
const WORK_ITEM_SEC = Number(process.env.WORK_ITEM_SEC || 15);
const MAX_WORK_ITEMS = Number(process.env.MAX_WORK_ITEMS || 40);

const glm = new GolemNetwork({
    api: {
        key: process.env.YAGNA_APPKEY || "66iiOdkvV29",
        url: process.env.YAGNA_API_URL || "http://127.0.0.1:7465",
    },
    payment: {
        driver: "erc20",
        network: process.env.YA_PAYMENT_NETWORK || "hoodi",
    },
});

let noticed = false;
glm.market.events.on("agreementTerminationNoticeReceived", (event) => {
    console.log(
        "%s termination notice for agreement %s from %s (deadline: %s, reason: %s)",
        stamp(),
        event.agreement.id,
        event.agreement.provider.name,
        event.terminationDeadline.toISOString(),
        event.reason,
    );
    noticed = true;
    mark(
        "notice",
        `${event.agreement.id} deadline=${event.terminationDeadline.toISOString()} ${event.reason}`,
    );
});

let itemsDone = 0;
try {
    // A freshly started daemon can briefly 500 on the version endpoint.
    for (let attempt = 1; ; attempt++) {
        try {
            await glm.connect();
            break;
        } catch (error) {
            if (attempt >= 6) throw error;
            console.log("%s connect attempt %d failed, retrying: %s", stamp(), attempt, error);
            await new Promise((resolve) => setTimeout(resolve, 10_000));
        }
    }
    const rental = await glm.oneOf({
        order: {
            demand: {
                workload: { imageHash: IMAGE_HASH },
                subnetTag: process.env.YAGNA_SUBNET || "public",
            },
            market: {
                rentHours: 0.5,
                // The test preset's coefficients are per SECOND (cpu=0.016,
                // duration=1.111), i.e. 57.6 and 3999.6 GLM per hour - the
                // caps must cover that or the proposal is silently filtered.
                pricing: {
                    model: "linear",
                    maxStartPrice: 1.0,
                    maxCpuPerHourPrice: 100.0,
                    maxEnvPerHourPrice: 5000.0,
                },
            },
        },
    });
    const exe = await rental.getExeUnit();
    console.log("%s renting from %s", stamp(), exe.provider.name);

    // A queue of short work items; before each one check whether the
    // provider asked us to wind down.
    for (let i = 1; i <= MAX_WORK_ITEMS; i++) {
        if (noticed) {
            console.log("%s provider is shutting down - no more work items", stamp());
            break;
        }
        const res = await exe.run(`sleep ${WORK_ITEM_SEC} && echo item-${i}`);
        console.log("%s %s", stamp(), String(res.stdout).trim());
        itemsDone += 1;
        if (itemsDone === 1) {
            mark("started", exe.provider.name);
        }
    }

    // Terminating the agreement is what the shutting-down provider waits for.
    await rental.stopAndFinalize();
    mark("finished", `items=${itemsDone} noticed=${noticed}`);
} catch (error) {
    console.error("%s failed: %s", stamp(), error);
} finally {
    await Promise.race([
        glm.disconnect().catch((e) => console.error("disconnect: %s", e)),
        new Promise((resolve) => setTimeout(resolve, 30_000)),
    ]);
}

const ok = noticed && itemsDone >= 1;
console.log(
    "%s exiting with %d (items=%d noticed=%s)",
    stamp(),
    ok ? 0 : 1,
    itemsDone,
    noticed,
);
process.exit(ok ? 0 : 1);
