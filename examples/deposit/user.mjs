import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { holesky } from "viem/chains";
import { writeFileSync } from "fs";
import chalk from "chalk";

const config = (await import("./config.json", { with: { type: "json" } }))
  .default;

const abiGLM = (
  await import(config.GLMContract.abiPath, {
    with: { type: "json" },
  })
).default;

const abiLOCK = (
  await import(config.LockPaymentContract.abiPath, {
    with: { type: "json" },
  })
).default;

const cryptoMultiplier = Math.pow(10, 18);
const funderAccount = privateKeyToAccount(config.funder.privateKey);
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
  abi: JSON.parse(abiLOCK.result),
};
const GLMCOntract = {
  address: config.GLMContract.holeskyAddress,
  abi: JSON.parse(abiGLM.result),
};

const nonce = Math.floor(Math.random() * config.funder.nonceSpace);
let validToTimestamp =
  new Date().getTime() + config.funder.depositDurationHours * 60 * 60 * 1000;

const createAllowance = async () => {
  let allowanceBudget = budget.amount + budget.flatFeeAmount;

  const args = [
    LOCKContract.address,
    BigInt(allowanceBudget * cryptoMultiplier),
  ];

  console.log(
    chalk.blue(
      `\nCreating allowance of ${(parseInt(args[1]) / cryptoMultiplier).toFixed(
        2
      )} GLM for ${args[0]} contract ...`
    )
  );

  const hash = await walletClient.writeContract({
    abi: GLMCOntract.abi,
    functionName: "increaseAllowance",
    address: GLMCOntract.address,
    args,
  });

  await publicClient.waitForTransactionReceipt({
    hash,
  });

  console.log(chalk.blue(`Allowance successfully created with Tx ${hash}.`));
};
await createAllowance();

const checkAllowance = async () => {
  const args = [config.funder.address, LOCKContract.address];

  console.log(chalk.blue(`\nChecking allowance for ${args[1]} contract ...`));

  const allowance = await publicClient.readContract({
    abi: GLMCOntract.abi,
    functionName: "allowance",
    address: GLMCOntract.address,
    args,
  });

  console.log(
    chalk.blue(
      `Allowance of ${(parseInt(allowance) / cryptoMultiplier).toFixed(
        2
      )} GLM is set.`
    )
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
      `\nCreating deposit of amount: ${(
        parseInt(args[2]) / cryptoMultiplier
      ).toFixed(2)} GLM, flatFeeAmount: ${(
        parseInt(args[2]) / cryptoMultiplier
      ).toFixed(2)} GLM, for  ${(
        (validToTimestamp - new Date().getTime()) /
        60 /
        60 /
        1000
      ).toFixed(2)} hours.`
    )
  );
  console.log(
    chalk.grey(`Using contract at address: ${LOCKContract.address}.`)
  );

  const hash = await walletClient.writeContract({
    abi: LOCKContract.abi,
    functionName: "createDeposit",
    address: LOCKContract.address,
    args,
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
      `\nExtending deposit of additional amount: ${(
        parseInt(args[2]) / cryptoMultiplier
      ).toFixed(2)} GLM, flatFeeAmount: ${(
        parseInt(args[2]) / cryptoMultiplier
      ).toFixed(2)} GLM, for ${(
        (validToTimestamp - new Date().getTime()) /
        60 /
        60 /
        1000
      ).toFixed(2)} hours.`
    )
  );
  console.log(
    chalk.grey(`Using contract at address: ${LOCKContract.address}.`)
  );

  const hash = await walletClient.writeContract({
    abi: LOCKContract.abi,
    functionName: "extendDeposit",
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
    address: LOCKContract.address,
    abi: LOCKContract.abi,
    functionName: "idFromNonceAndFunder",
    args: [BigInt(nonce), config.funder.address],
  });

  console.log(
    chalk.grey(
      `\nDepositID: ${depositID} available on contract at address: ${LOCKContract.address}.`
    )
  );
};

const getDepositDetails = async () => {
  const deposit = await publicClient.readContract({
    address: LOCKContract.address,
    abi: LOCKContract.abi,
    functionName: "getDepositByNonce",
    args: [BigInt(nonce), config.funder.address],
  });

  console.log(
    chalk.grey(`\nDeposit of `),
    deposit,
    chalk.grey(` available on contract ${LOCKContract.address}.`)
  );

  const depositData = {
    amount: parseInt(deposit.amount) / cryptoMultiplier,
    id: deposit.id.toString(),
  };

  writeFileSync(config.depositFileName, JSON.stringify(depositData));
};

const clearAllowance = async () => {
  const args = [LOCKContract.address, BigInt(0 * cryptoMultiplier)];

  console.log(chalk.yellow(`\nClearing allowance for ${args[0]} contract ...`));

  const hash = await walletClient.writeContract({
    abi: GLMCOntract.abi,
    functionName: "approve",
    address: GLMCOntract.address,
    args,
  });

  await publicClient.waitForTransactionReceipt({
    hash,
  });

  console.log(chalk.yellow(`Allowance cleared with Tx ${hash}.\n`));
};

export const userActions = async () => {
  await checkAllowance();
  await createDeposit();
  await extendDeposit();
  await getDepositID();
  await getDepositDetails();
  await clearAllowance();
};
