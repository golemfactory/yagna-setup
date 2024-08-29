/* eslint-disable @typescript-eslint/no-unused-vars */

import { Address, createPublicClient, createWalletClient, formatEther, Hex, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { holesky } from "viem/chains";
import chalk from "chalk";
const abiGlm = await readJsonFile("./contracts/glmAbi.json");
const abiLock = await readJsonFile("./contracts/lockAbi.json");
import config from "./config.js";
import { writeFile } from "fs/promises";
import { readJsonFile } from "./utils.js";

const funderAccount = privateKeyToAccount(<Hex>config.funder.privateKey);
const budget = config.budget;

// walletClient for writeContract functions
const walletClient = createWalletClient({
    account: funderAccount,
    chain: holesky,
    transport: http(config.rpcUrl),
});

// publicClient for readContract functions
const publicClient = createPublicClient({
    chain: holesky,
    transport: http(config.rpcUrl),
});

const LOCK_CONTRACT = {
    address: config.lockPaymentContract.holeskyAddress,
    abi: abiLock,
};
const GLM_CONTRACT = {
    address: config.glmContract.holeskyAddress,
    abi: abiGlm,
};

const nonce = Math.floor(Math.random() * config.funder.nonceSpace);
let validToTimestamp = new Date().getTime() + config.funder.depositDurationHours * 60 * 60 * 1000;

async function createAllowance() {
    const amountWei = parseEther(`${budget.amount}`);
    const flatFeeAmountWei = parseEther(`${budget.flatFeeAmount}`);
    const allowanceBudget = amountWei + flatFeeAmountWei;

    console.log(
        chalk.blue(
            `\nCreating allowance of ${formatEther(allowanceBudget)} GLM for ${LOCK_CONTRACT.address} contract ...`,
        ),
    );

    const hash = await walletClient.writeContract({
        address: <Hex>GLM_CONTRACT.address,
        abi: GLM_CONTRACT.abi,
        functionName: "increaseAllowance",
        args: [LOCK_CONTRACT.address, allowanceBudget],
        chain: walletClient.chain,
        account: walletClient.account,
    });

    const receipt = await publicClient.waitForTransactionReceipt({
        hash,
    });

    console.log(chalk.blue(`Allowance successfully created with Tx ${receipt.transactionHash}.`));
}

const checkAllowance = async () => {
    const args = [config.funder.address, LOCK_CONTRACT.address];

    console.log(chalk.blue(`\nChecking allowance for ${args[1]} contract ...`));

    const allowance = <bigint>await publicClient.readContract({
        abi: GLM_CONTRACT.abi,
        functionName: "allowance",
        address: <Hex>GLM_CONTRACT.address,
        args,
    });

    console.log(chalk.blue(`Allowance of ${formatEther(allowance)} GLM is set.`));
};

const createDeposit = async () => {
    const args = [
        BigInt(nonce),
        <Address>config.spender.address,
        parseEther(`${budget.amount}`),
        parseEther(`${budget.flatFeeAmount}`),
        BigInt(validToTimestamp),
    ];

    console.log(
        chalk.grey(
            `\nCreating deposit of amount: ${formatEther(<bigint>args[2])} GLM, \
            flatFeeAmount: ${formatEther(<bigint>args[3])} GLM, for  ${((validToTimestamp - new Date().getTime()) / 60 / 60 / 1000).toFixed(2)} hours.`,
        ),
    );
    console.log(chalk.grey(`Using contract at address: ${LOCK_CONTRACT.address}.`));

    const hash = await walletClient.writeContract({
        address: <Hex>LOCK_CONTRACT.address,
        abi: LOCK_CONTRACT.abi,
        functionName: "createDeposit",
        args,
        chain: walletClient.chain,
        account: walletClient.account,
    });

    await publicClient.waitForTransactionReceipt({
        hash,
    });

    const depositId = await getDepositID();

    const depositData = {
        id: "0x" + depositId.toString(16),
        amount: formatEther(<bigint>args[2]),
        feeAmount: formatEther(<bigint>args[3]),
    };
    await writeFile(config.depositFileName, JSON.stringify(depositData, null, 4));

    console.log(chalk.grey(`Deposit successfully created with Tx ${hash}.`));
};

const extendDeposit = async () => {
    validToTimestamp = validToTimestamp + 5 * 60 * 1000;
    const args = [
        BigInt(nonce),
        BigInt(0), // no additional amount
        BigInt(0), // no additional fee
        BigInt(validToTimestamp), // deposit valid for additional 5 minutes
    ];

    console.log(
        chalk.grey(
            `\nExtending deposit of additional amount: \
             ${formatEther(<bigint>args[2])}  GLM, \
             flatFeeAmount: ${formatEther(<bigint>args[3])}  GLM, for ${((validToTimestamp - new Date().getTime()) / 60 / 60 / 1000).toFixed(2)} hours.`,
        ),
    );
    console.log(chalk.grey(`Using contract at address: ${LOCK_CONTRACT.address}.`));

    const hash = await walletClient.writeContract({
        abi: LOCK_CONTRACT.abi,
        functionName: "extendDeposit",
        address: <Address>LOCK_CONTRACT.address,
        args,
        chain: walletClient.chain,
        account: walletClient.account,
    });

    await publicClient.waitForTransactionReceipt({
        hash,
    });

    console.log(chalk.grey(`Deposit successfully extended with Tx ${hash}.`));
};

const getDepositID = async () => {
    const depositID = <bigint>await publicClient.readContract({
        address: <Address>LOCK_CONTRACT.address,
        abi: LOCK_CONTRACT.abi,
        functionName: "idFromNonceAndFunder",
        args: [BigInt(nonce), config.funder.address],
    });

    console.log(chalk.grey(`\nDepositID: ${depositID} available on contract at address: ${LOCK_CONTRACT.address}.`));
    return depositID;
};

interface DepositData {
    amount: bigint;
    id: string;
}

async function getDepositDetails() {
    const deposit = <DepositData>await publicClient.readContract({
        address: <Address>LOCK_CONTRACT.address,
        abi: LOCK_CONTRACT.abi,
        functionName: "getDepositByNonce",
        args: [BigInt(nonce), config.funder.address],
    });

    console.log(chalk.grey(`\nDeposit of `), deposit, chalk.grey(` available on contract ${LOCK_CONTRACT.address}.`));
    const depositData = {
        amount: formatEther(deposit.amount),
        id: deposit.id.toString(),
    };
    return depositData;
};

const clearAllowance = async () => {
    const args = [LOCK_CONTRACT.address, BigInt(0)];

    console.log(chalk.yellow(`\nClearing allowance for ${args[0]} contract ...`));

    const hash = await walletClient.writeContract({
        abi: GLM_CONTRACT.abi,
        functionName: "approve",
        address: <Address>GLM_CONTRACT.address,
        args,
        chain: walletClient.chain,
        account: walletClient.account,
    });

    await publicClient.waitForTransactionReceipt({
        hash,
    });

    console.log(chalk.yellow(`Allowance cleared with Tx ${hash}.\n`));
};

export const runUserActions = async () => {
    await createAllowance();
    await checkAllowance();
    await createDeposit();
    await extendDeposit();
    await getDepositID();
    await clearAllowance();
};
