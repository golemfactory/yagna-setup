import { Address } from "viem";
import chalk from "chalk";

import { GolemNetwork, GolemPaymentError } from "@golem-sdk/golem-js";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";
import { runUserActions } from "./user.js";
import config from "./config.js";
import { readJsonFile } from "./utils.js";
import { ObserveTransactionsContext, spawnContractObserver } from "./observer.js";

/*
const LOCK_CONTRACT = getContract({
    address: <Address>config.lockPaymentContract.holeskyAddress,
    abi: abiLock,
    //@ts-expect-error I don't now how to satisfy this crazy types
    client: publicClient,
})
*/

async function runOperator(observerContext: ObserveTransactionsContext) {
    const depositData = await readJsonFile("./depositData.json");

    // do the test
    const glm = new GolemNetwork({
        logger: pinoPrettyLogger({
            level: "info",
        }),
        api: { key: config.yagnaAppKey },
        payment: {
            //driver: "erc20",
            //network: "polygon",
        },
    });

    try {
        await glm.connect();

        const deposit = {
            contract: config.lockPaymentContract.holeskyAddress,
            id: BigInt(depositData.id).toString(16),
        };

        const allocation = await glm.payment.createAllocation({
            budget: depositData.amount,
            deposit: deposit,
            expirationSec: 3600,
            // paymentPlatform: 'erc20-holesky-tglm'
        });

        observerContext.observedAddress = <Address>allocation.address;

        const order1 = {
            demand: {
                workload: { imageTag: "golem/alpine:latest" },
                subnetTag: config.yagnaSubnet,
            },
            market: {
                rentHours: 0.5,
                pricing: {
                    model: "burn-rate",
                    avgGlmPerHour: 0.5,
                },
            },
            payment: {
                allocation,
            },
        };

        const order2 = {
            demand: {
                workload: { imageTag: "golem/alpine:latest" },
            },
            market: {
                rentHours: 0.5,
                pricing: {
                    model: "burn-rate",
                    avgGlmPerHour: 0.5,
                },
            },
            payment: {
                allocation: allocation.id, // alternative is to pass allocation ID
            },
        };

        //@ts-expect-error - some weird type check to resolve
        const rental1 = await glm.oneOf({ order: order1 });

        await rental1
            .getExeUnit()
            .then((exe) => exe.run(`echo Task 1 running on ${exe.provider.id}`))
            .then((res) => console.log(chalk.inverse("\n", res.stdout)));
        // do some more work
        await rental1.stopAndFinalize();
        //@ts-expect-error - some weird type check to resolve
        const rental2 = await glm.oneOf({ order: order2 });

        await rental2
            .getExeUnit()
            .then((exe) => exe.run(`echo Task 2 Running on ${exe.provider.id}`))
            .then((res) => console.log(chalk.inverse("\n", res.stdout)));

        await rental2.stopAndFinalize();

        // when we release allocation, we will close deposit
        // you cannot reuse closed deposit or released allocation
        await glm.payment.releaseAllocation(allocation);
    } catch (err) {
        if (err instanceof GolemPaymentError) {
            console.log(
                "Cannot create allocation, most probably your allocation was released or your deposit is closed.",
            );
        } else {
            console.error("Failed to run the example", err);
        }
        throw err;
    } finally {
        await glm.disconnect();
    }
}

/* step 1 - run observer on contract */
const obs = await spawnContractObserver();

/* step 2 - run user actions (actions performed by the funder) */
await runUserActions();

/* step 3 - run operator actions (actions performed by the spender) */
await runOperator(obs.context);

console.log(chalk.magenta("All actions completed - waiting until observer stops"));
/* step 4 - wait for observer to finish listening for deposit close, which ends example */
await obs.observerFuture;

console.log(chalk.magenta("Observer stopped - example finished"));
