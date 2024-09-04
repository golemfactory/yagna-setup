import { createPublicClient, decodeFunctionData, http, parseAbi } from "viem";
import { holesky } from "viem/chains";
import { readFileSync } from "fs";
import config from "./config.js";
import chalk from "chalk";

const abiLock = await JSON.parse(readFileSync("./contracts/lockAbi.json", "utf-8"));
// publicClient for readContract functions
const publicClient = createPublicClient({
    chain: holesky,
    transport: http(config.rpcUrl),
});

async function processLogs(spenderAddress, funderAddress, logs) {
    const transactions = {};

    for (const log of logs) {
        if (!(log.transactionHash in transactions)) {
            transactions[log.transactionHash] = [];
        }
        transactions[log.transactionHash].push(log);
    }
    let isResolved = false;
    for (const txHash in transactions) {
        const transaction = await publicClient.getTransaction({ hash: txHash });

        const parsedMethod = decodeFunctionData({
            abi: abiLock,
            data: transaction.input,
        });

        const logs = transactions[txHash];

        for (const log of logs) {
            const functionNamePlusArgs = `${parsedMethod.functionName}(${parsedMethod.args.join(", ")})`;
            console.log(chalk.magenta("\ncall:", functionNamePlusArgs));
            console.log(chalk.magenta("event:"), log.eventName);
            console.log(chalk.magenta("from:"), transaction.from);
            console.log(chalk.magenta("hash:"), transaction.hash, "\n");

            if (
                // if deposit is closed by our requestor, stop observing
                parsedMethod.functionName.toLowerCase().includes("close") &&
                transaction.from == spenderAddress
            ) {
                isResolved = true;
            }

            if (
                // if deposit is terminated by our requestor, stop observing
                parsedMethod.functionName == "terminateDeposit" &&
                transaction.from == funderAddress
            ) {
                isResolved = true;
            }
        }
    }
    return isResolved;
}

export function observeTransactionEvents(context) {
    return new Promise((resolve) => {
        context.unwatch = publicClient.watchEvent({
            onLogs: async (logs) => {
                const isResolved = await processLogs(context.spenderAddress, context.funderAddress, logs);

                if (isResolved) {
                    context.unwatch();
                    resolve();
                }
            },
            events: parseAbi([
                "event DepositCreated(uint256 indexed id, address spender)",
                "event DepositClosed(uint256 indexed id, address spender)",
                "event DepositExtended(uint256 indexed id, address spender)",
                "event DepositFeeTransfer(uint256 indexed id, address spender, uint128 amount)",
                "event DepositTerminated(uint256 indexed id, address spender)",
                "event DepositTransfer(uint256 indexed id, address spender, address recipient, uint128 amount)",
            ]),
            address: context.observedAddress,
        });
    });
}

export async function spawnContractObserver() {
    const context = {
        observedAddress: config.lockPaymentContract.holeskyAddress,
        funderAddress: config.funder.address,
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
