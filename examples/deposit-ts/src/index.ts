import {createPublicClient, createWalletClient, http, parseAbi} from "viem";
import { readFile } from "fs/promises";
import chalk from "chalk";
import glmAbi from "./contracts/glmAbi.json" with { type: "json" };
import lockAbi from "./contracts/lockAbi.json" with { type: "json" };
import { holesky } from "viem/chains";

import { GolemNetwork, GolemPaymentError } from "@golem-sdk/golem-js";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";
import * as fs from "node:fs";
import {readJsonFile} from "./utils.js";

import config from "./config.json" with { type: "json" };

// publicClient for readContract functions
const publicClient = createPublicClient({
    chain: holesky,
    transport: http(config.rpcUrl),
});

const context = {
    requestorAddress: null
};

const getTransactions = async () => {
    //@ts-ignore
    const block = await publicClient.getBlock({ blockNumber: 2210406n });
    //console.log(block);

    const transaction = await publicClient.getTransaction({
        hash: "0x473f9c32da5e46ec7945c754dd780026a7fe0c34e007542f3b4586aa4e6955fa",
    });

    //console.log(transaction);

    const context = { unwatch: () => {} };

    //@ts-ignore
    const mapTransaction = (input) => {
        let code = input.slice(2, 10);
        let output = ["Other transaction", 0];
        switch (code) {
            case "ac658a48": // extend deposit
                output = ["extend deposit", 0];
                break;
            case "519f5dad": // create deposit
                output = ["createDeposit", 0];
                break;
            case "ee7b7ad8": //deposit single transfer
                output = ["depositSingleTransfer", 0];
                break;
            case "83b24c52": // close deposit
                output = ["closeDeposit", 1];
                break;
            case "ee7b7ad8": // deposit transfer
                output = ["deposit transfer", 0];
                break;
            case "fbe1e331": // deposit single transfer and close
                output = ["depositSingleTransferAndClose", 1];
                break;
            case "d61a0956": // deposit transfer and close
                output = ["depositTransferAndClose", 1];
                break;
            case "841dbca6": // terminate deposit
                output = ["terminateDeposit", 2];
                break;
        }
        return output;
    };

    //@ts-ignore
    const logProcessor = async (logs) => {
        for (const log of logs) {
            const txHash = log.transactionHash;
            const transaction = await publicClient.getTransaction({ hash: txHash });
            const [eventName, close] = mapTransaction(transaction.input);
            console.log(chalk.magenta("\ncall:"), eventName);
            console.log(chalk.magenta("event:"), log.eventName);
            console.log(chalk.magenta("from:"), transaction.from);
            console.log(chalk.magenta("hash:"), transaction.hash, "\n");

            if (
                // if deposit is closed by our requestor, stop observing
                close == 1 &&
                transaction.from == "0x7459dbaf9b1b1b19197eadcd3f66a3ec93504589"
            ) {
                context.unwatch();
            }

            if (
                // if deposit is terminated by our requestor, stop observing
                close == 2 &&
                transaction.from == config.funder.address
            ) {
                context.unwatch();
            }
        }
    };

    context.unwatch = publicClient.watchEvent({
        onLogs: (logs) => logProcessor(logs),
        //event: parseAbi("event DepositClosed(uint256 indexed id, address spender)"),

        events: parseAbi([
            "event DepositCreated(uint256 indexed id, address spender)",
            "event DepositClosed(uint256 indexed id, address spender)",
            "event DepositExtended(uint256 indexed id, address spender)",
            "event DepositFeeTransfer(uint256 indexed id, address spender, uint128 amount)",
            "event DepositTerminated(uint256 indexed id, address spender)",
            "event DepositTransfer(uint256 indexed id, address spender, address recipient,uint128 amount)",
        ]),

        //@ts-ignore
        address: config.LockPaymentContract.holeskyAddress,
    });
};

//@ts-ignore
const observeTransactions = async (requestorAddress) => {
    console.log(
        chalk.magenta("Start observing Events on contract"),
        config.LockPaymentContract.holeskyAddress
    );

    //@ts-ignore
    getTransactions(requestorAddress);
};


async function main() {
    console.log("Hello, world!");

    console.log("config:", config);


}

main()
    .then(() => console.log("done"))
    .catch((e) => console.error(e));
