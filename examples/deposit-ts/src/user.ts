import { createPublicClient, createWalletClient, formatEther, Hex, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { holesky } from "viem/chains";
import { writeFileSync } from "fs";
import chalk from "chalk";
import abiGlm from "./contracts/glmAbi.json" with { type: "json" };
import abiLock from "./contracts/lockAbi.json" with { type: "json" };
import config from "./config.json" with { type: "json" };

const cryptoMultiplier = Math.pow(10, 18);

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

    const allowance = await publicClient.readContract({
        abi: GLMContract.abi,
        functionName: "allowance",
        address: <Hex>GLMContract.address,
        args,
    });

    console.log(
        chalk.blue(
            // @ts-ignore
            `Allowance of ${(parseInt(allowance) / cryptoMultiplier).toFixed(2)} GLM is set.`,
        ),
    );
};

const createDeposit = async () => {
    const args = [
        BigInt(nonce),
        config.spender.address,
        BigInt(budget.amount * cryptoMultiplier),
        BigInt(budget.flatFeeAmount * cryptoMultiplier),
        BigInt(validToTimestamp),
    ];

    console.log(
        chalk.grey(
            `\nCreating deposit of amount: ${
                // @ts-ignore
                (parseInt(args[2]) / cryptoMultiplier).toFixed(2)
            } GLM, flatFeeAmount: ${
                // @ts-ignore
                (parseInt(args[2]) / cryptoMultiplier).toFixed(2)
            } GLM, for  ${((validToTimestamp - new Date().getTime()) / 60 / 60 / 1000).toFixed(2)} hours.`,
        ),
    );
    console.log(chalk.grey(`Using contract at address: ${LOCKContract.address}.`));

    const hash = await walletClient.writeContract({
        address: <Hex>LOCKContract.address,
        abi: LOCKContract.abi,
        functionName: "createDeposit",
        args,
        chain: holesky,
        account: funderAccount,
    });

    await publicClient.waitForTransactionReceipt({
        hash,
    });

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
            `\nExtending deposit of additional amount: ${
                // @ts-ignore
                (parseInt(args[2]) / cryptoMultiplier).toFixed(2)
            } GLM, flatFeeAmount: ${
                // @ts-ignore
                (parseInt(args[2]) / cryptoMultiplier).toFixed(2)
            } GLM, for ${((validToTimestamp - new Date().getTime()) / 60 / 60 / 1000).toFixed(2)} hours.`,
        ),
    );
    console.log(chalk.grey(`Using contract at address: ${LOCKContract.address}.`));

    const hash = await walletClient.writeContract({
        abi: LOCKContract.abi,
        functionName: "extendDeposit",
        // @ts-ignore
        address: LOCKContract.address,
        args,
    });

    await publicClient.waitForTransactionReceipt({
        hash,
    });

    console.log(chalk.grey(`Deposit successfully extended with Tx ${hash}.`));
};

const getDepositID = async () => {
    const depositID = await publicClient.readContract({
        // @ts-ignore
        address: LOCKContract.address,
        abi: LOCKContract.abi,
        functionName: "idFromNonceAndFunder",
        args: [BigInt(nonce), config.funder.address],
    });

    console.log(chalk.grey(`\nDepositID: ${depositID} available on contract at address: ${LOCKContract.address}.`));
};

const getDepositDetails = async () => {
    const deposit = await publicClient.readContract({
        // @ts-ignore
        address: LOCKContract.address,
        abi: LOCKContract.abi,
        functionName: "getDepositByNonce",
        args: [BigInt(nonce), config.funder.address],
    });

    console.log(chalk.grey(`\nDeposit of `), deposit, chalk.grey(` available on contract ${LOCKContract.address}.`));
    // @ts-ignore
    const depositData = {
        // @ts-ignore
        amount: parseInt(deposit.amount) / cryptoMultiplier,
        // @ts-ignore
        id: deposit.id.toString(),
    };

    writeFileSync(config.depositFileName, JSON.stringify(depositData));
};

const clearAllowance = async () => {
    const args = [LOCKContract.address, BigInt(0)];

    console.log(chalk.yellow(`\nClearing allowance for ${args[0]} contract ...`));

    const hash = await walletClient.writeContract({
        abi: GLMContract.abi,
        functionName: "approve",
        // @ts-ignore
        address: GLMContract.address,
        args,
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
    await getDepositDetails();
    await clearAllowance();
};
