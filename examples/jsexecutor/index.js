import {
    TaskExecutor,
    pinoPrettyLogger,
} from "@golem-sdk/task-executor";
import {program} from "commander";
import {fileURLToPath} from "url";
import 'dotenv/config'

const DIR_NAME = fileURLToPath(new URL(".", import.meta.url));

const getTimeStamp = () => {
    return (
        "[" + new Date().toISOString().split("T").pop().split("Z").shift() + "]"
    );
};

const parseDebitNote = (dn) => {
    return (
        dn.id +
        " " +
        dn.activityId +
        " " +
        dn.agreementId +
        " " +
        dn.totalAmountDue +
        " " +
        dn.usageCounterVector[0] +
        " " +
        dn.usageCounterVector[1]
    );
};

const blenderParams = (frame) => ({
    scene_file: "/golem/resource/scene.blend",
    resolution: [400 * 2, 300 * 2],
    use_compositing: false,
    crops: [
        {
            outfilebasename: "out",
            borders_x: [0.0, 1.0],
            borders_y: [0.0, 1.0],
        },
    ],
    samples: 100,
    frames: [frame],
    output_format: "PNG",
    RESOURCES_DIR: "/golem/resources",
    WORK_DIR: "/golem/work",
    OUTPUT_DIR: "/golem/output",
});

const myDebitNoteFilter = async (dbnote) => {
    console.log(getTimeStamp(), "debitnote-data", parseDebitNote(dbnote));
    return true;
};

async function main() {
    const subnetTag = process.env.YAGNA_SUBNET || "public";
    const appKey = process.env.YAGNA_APPKEY || "66iiOdkvV29";
    console.log("Using subnet tag:", subnetTag);
    console.log("Using app key:", appKey);
    const executor = await TaskExecutor.create({
        subnetTag: subnetTag,
        //payment: { driver: "erc20", network: "goerli" },
        package: "golem/blender:latest",
        //maxParallelTasks,
        logger: pinoPrettyLogger(),
        yagnaOptions: {apiKey: appKey},
        debitNotesFilter: myDebitNoteFilter,
        activityExeBatchResultPollIntervalSeconds: 5,
        taskTimeout: 1000 * 60 * 60,
        expirationSec: 60 * 60 * 2,
        activityExeBatchResultMaxRetries: 20,
    });

    try {
        executor.onActivityReady(async (ctx) => {
            console.log("Uploading the scene to the provider %s", ctx.provider.name);
            await ctx.uploadFile(
                `${DIR_NAME}/cubes.blend`,
                "/golem/resource/scene.blend"
            );
            console.log(
                "Upload of the scene to the provider %s finished",
                ctx.provider.name
            );
        });

        const futureResults = [0].map(async (frame) =>
            executor.run(async (ctx) => {
                console.log(
                    "Started rendering of frame %d on provider %s",
                    frame,
                    ctx.provider.name
                );

                const result = await ctx
                    .beginBatch()
                    .uploadJson(blenderParams(frame), "/golem/work/params.json")
                    .run("/golem/entrypoints/run-blender.sh")
                    .downloadFile(
                        `/golem/output/out${frame?.toString().padStart(4, "0")}.png`,
                        `${DIR_NAME}/output_${frame}.png`
                    )
                    .end();

                console.log(
                    "Finished rendering of frame %d on provider %s",
                    frame,
                    ctx.provider.name
                );

                return result?.length ? `output_${frame}.png` : "";
            })
        );

        console.log("Scheduling all tasks");
        const results = await Promise.all(futureResults);
        console.log("Completed all tasks");

        results.forEach((result) => console.log(result));
    } catch (error) {
        console.error("Computation failed:", error);
    } finally {
        await executor.shutdown();
    }
}

program
    .option("--subnet-tag <subnet>", "set subnet name, for example 'public'")
    .option(
        "--payment-driver, --driver <driver>",
        "payment driver name, for example 'erc20'"
    )
    .option(
        "--payment-network, --network <network>",
        "network name, for example 'holesky'"
    )
    .option("-t, --max-parallel-tasks <maxParallelTasks>", "max parallel tasks");
program.parse();
const options = program.opts();
main(
    options.subnetTag,
    options.driver,
    options.network,
    options.maxParallelTasks
);
