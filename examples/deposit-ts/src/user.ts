import { Address, createPublicClient, createWalletClient, formatEther, Hex, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { holesky } from "viem/chains";
import chalk from "chalk";
const abiGlm = await readJsonFile("./contracts/glmAbi.json");
const abiLock = await readJsonFile("./contracts/lockAbi.json");
import config from "./config.js";
import { writeFile } from "fs/promises";
import {readJsonFile} from "./utils.js";

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

const LOCKContract = {
    address: config.LockPaymentContract.holeskyAddress,
    abi: abiLock,
};
const GLMContract = {
    address: config.GLMContract.holeskyAddress,
    abi: abiGlm,
};

const nonce = Math.floor(Math.random() * config.funder.nonceSpace);
let validToTimestamp = new Date().getTime() + config.funder.depositDurationHours * 60 * 60 * 1000;

async function createAllowance() {
    let amountWei = parseEther(`${budget.amount}`);
    let flatFeeAmountWei = parseEther(`${budget.flatFeeAmount}`);
    let allowanceBudget = amountWei + flatFeeAmountWei;

    console.log(
        chalk.blue(
            `\nCreating allowance of ${formatEther(allowanceBudget)} GLM for ${LOCKContract.address} contract ...`,
        ),
    );

    const hash = await walletClient.writeContract({
        address: <Hex>GLMContract.address,
        abi: GLMContract.abi,
        functionName: "increaseAllowance",
        args: [LOCKContract.address, allowanceBudget],
        chain: walletClient.chain,
        account: walletClient.account,
    });

    const receipt = await publicClient.waitForTransactionReceipt({
        hash,
    });

    console.log(chalk.blue(`Allowance successfully created with Tx ${receipt.transactionHash}.`));
}

const checkAllowance = async () => {
    const args = [config.funder.address, LOCKContract.address];

    console.log(chalk.blue(`\nChecking allowance for ${args[1]} contract ...`));

    const allowance = <BigInt>await publicClient.readContract({
        abi: GLMContract.abi,
        functionName: "allowance",
        address: <Hex>GLMContract.address,
        args,
    });

    console.log(
        chalk.blue(
            `Allowance of ${parseEther(allowance.toString())} GLM is set.`,
        ),
    );
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
            `\nCreating deposit of amount: ${formatEther(<bigint>args[2])} GLM, 
            flatFeeAmount: ${formatEther(<bigint>args[3])} GLM, for  ${((validToTimestamp - new Date().getTime()) / 60 / 60 / 1000).toFixed(2)} hours.`,
        ),
    );
    console.log(chalk.grey(`Using contract at address: ${LOCKContract.address}.`));

    const hash = await walletClient.writeContract({
        address: <Hex>LOCKContract.address,
        abi: LOCKContract.abi,
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
        feeAmount: formatEther(<bigint>args[3])
    }
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
            `\nExtending deposit of additional amount:
             ${formatEther(<bigint>args[2])}  GLM, 
             flatFeeAmount: ${formatEther(<bigint>args[3])}  GLM, for ${((validToTimestamp - new Date().getTime()) / 60 / 60 / 1000).toFixed(2)} hours.`,
        ),
    );
    console.log(chalk.grey(`Using contract at address: ${LOCKContract.address}.`));

    const hash = await walletClient.writeContract({
        abi: LOCKContract.abi,
        functionName: "extendDeposit",
        address: <Address>LOCKContract.address,
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
        address: <Address>LOCKContract.address,
        abi: LOCKContract.abi,
        functionName: "idFromNonceAndFunder",
        args: [BigInt(nonce), config.funder.address],
    });

    console.log(chalk.grey(`\nDepositID: ${depositID} available on contract at address: ${LOCKContract.address}.`));
    return depositID;
};


interface DepositData {
    amount: bigint;
    id: string;
}
const getDepositDetails = async () => {
    const deposit = <DepositData>await publicClient.readContract({
        address: <Address>LOCKContract.address,
        abi: LOCKContract.abi,
        functionName: "getDepositByNonce",
        args: [BigInt(nonce), config.funder.address],
    });

    console.log(chalk.grey(`\nDeposit of `), deposit, chalk.grey(` available on contract ${LOCKContract.address}.`));
    const depositData = {
        amount: formatEther(deposit.amount),
        id: deposit.id.toString(),
    };
};

const clearAllowance = async () => {
    const args = [LOCKContract.address, BigInt(0)];

    console.log(chalk.yellow(`\nClearing allowance for ${args[0]} contract ...`));

    const hash = await walletClient.writeContract({
        abi: GLMContract.abi,
        functionName: "approve",
        address: <Address>GLMContract.address,
        args,
        chain: walletClient.chain,
        account: walletClient.account,
    });

    await publicClient.waitForTransactionReceipt({
        hash,
    });

    console.log(chalk.yellow(`Allowance cleared with Tx ${hash}.\n`));
};

export const userActions = async () => {
    await createAllowance();
    await checkAllowance();
    await createDeposit();
    await extendDeposit();
    await getDepositID();
    await clearAllowance();
};
