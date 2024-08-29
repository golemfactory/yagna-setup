import {
    Address,
    createPublicClient, decodeFunctionData,
    Hex,
    http,
    parseAbi,
    WatchEventReturnType
} from "viem";
import chalk from "chalk";
import { holesky } from "viem/chains";

import { GolemNetwork, GolemPaymentError } from "@golem-sdk/golem-js";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";
import { runUserActions } from "./user.js";
import config from "./config.js";
import { readJsonFile } from "./utils.js";
const abiLock = await readJsonFile("./contracts/lockAbi.json");
// publicClient for readContract functions
const publicClient = createPublicClient({
    chain: holesky,
    transport: http(config.rpcUrl),
});

interface ObserveTransactionsContext {
    observedAddress: Address;
    spenderAddress: Address | null;
    unwatch: WatchEventReturnType;
}

/*
const LOCK_CONTRACT = getContract({
    address: <Address>config.LockPaymentContract.holeskyAddress,
    abi: abiLock,
    //@ts-expect-error I don't now how to satisfy this crazy types
    client: publicClient,
})
*/

async function observeTransactionEvents(context: ObserveTransactionsContext) {
    context.unwatch = publicClient.watchEvent({
        onLogs: async (logs) => {

            for (const log of logs) {
                const txHash = log.transactionHash;
                const transaction = await publicClient.getTransaction({ hash: txHash });

                const parsedMethod = decodeFunctionData({
                    abi: abiLock,
                    data: transaction.input
                });


                const functionNamePlusArgs = `${parsedMethod.functionName}(${parsedMethod.args.join(", ")})`;
                console.log(chalk.magenta("\ncall:", functionNamePlusArgs));
                console.log(chalk.magenta("event:"), log.eventName);
                console.log(chalk.magenta("from:"), transaction.from);
                console.log(chalk.magenta("hash:"), transaction.hash, "\n");

                if (
                    // if deposit is closed by our requestor, stop observing
                    parsedMethod.functionName.toLowerCase().includes("close") &&
                    transaction.from == context.observedAddress
                ) {
                    console.log(chalk.magenta("Stop observing events\n"));
                    context.unwatch();
                }

                if (
                    // if deposit is terminated by our requestor, stop observing
                    parsedMethod.functionName == "terminateDeposit" &&
                    transaction.from == config.funder.address
                ) {
                    context.unwatch();
                }
            }
        },
        //event: parseAbi("event DepositClosed(uint256 indexed id, address spender)"),

        events: parseAbi([
            "event DepositCreated(uint256 indexed id, address spender)",
            "event DepositClosed(uint256 indexed id, address spender)",
            "event DepositExtended(uint256 indexed id, address spender)",
            "event DepositFeeTransfer(uint256 indexed id, address spender, uint128 amount)",
            "event DepositTerminated(uint256 indexed id, address spender)",
            "event DepositTransfer(uint256 indexed id, address spender, address recipient,uint128 amount)",
        ]),

        address: <Hex>config.LockPaymentContract.holeskyAddress,
    });
}

async function spawnContractObserver() {
    const context = {
        observedAddress: <Address>config.LockPaymentContract.holeskyAddress,
        spenderAddress: null,
        unwatch: () => {
            throw new Error("Cannot call unwatch before watch");
        },
    };

    console.log(chalk.magenta(`Start observing Events on contract: ${context.observedAddress}`));
    const observerFuture = observeTransactionEvents(context);
    return {
        context,
        observerFuture,
    };
}

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
            contract: config.LockPaymentContract.holeskyAddress,
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

/* step 4 - wait for observer to finish listening for deposit close, which ends example */
await obs.observerFuture;
