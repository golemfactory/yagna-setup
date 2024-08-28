import { createPublicClient, http, parseAbi } from "viem";
import chalk from "chalk";
import { holesky } from "viem/chains";

import { GolemNetwork, GolemPaymentError } from "@golem-sdk/golem-js";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";
import { createAllowance } from "./user.js";
import config from "./config.json" with { type: "json" };

// publicClient for readContract functions
const publicClient = createPublicClient({
  chain: holesky,
  transport: http(config.rpcUrl),
});

const context = {
  requestorAddress: null,
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
import depositData from "./depositData.json" with { type: "json" };

//@ts-ignore
const observeTransactions = async (requestorAddress) => {
  console.log(
    chalk.magenta("Start observing Events on contract"),
    config.LockPaymentContract.holeskyAddress,
  );

  //@ts-ignore
  getTransactions(requestorAddress);
};

async function main() {
  await createAllowance();

  const context = { requestorAddress: null };

  const _observeTransactionFuture = observeTransactions(
    context.requestorAddress,
  );
  //await userActions();

  // do the test
  (async () => {
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

      context.requestorAddress = allocation.address;

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

      //@ts-ignore
      const rental1 = await glm.oneOf({ order: order1 });

      await rental1
        .getExeUnit()
        .then((exe) => exe.run(`echo Task 1 running on ${exe.provider.id}`))
        .then((res) => console.log(chalk.inverse("\n", res.stdout)));
      // do some more work
      await rental1.stopAndFinalize();
      //@ts-ignore
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
    } finally {
      await glm.disconnect();
    }
  })().catch(console.error);
}

main().then();

main()
  .then(() => console.log("done"))
  .catch((e) => console.error(e));
