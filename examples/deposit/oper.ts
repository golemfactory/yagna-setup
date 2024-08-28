import { GolemNetwork, GolemPaymentError } from "@golem-sdk/golem-js";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";

import { userActions } from "./user.ts";
import { observeTransactions } from "./client.ts";

import chalk from "chalk";
import config from "./config.json";
import depositData from "./depositData.json";

async function main() {

  // @ts-ignore
  await createAllowance();

  const context = { requestorAddress: null };

  const _observeTransactionFuture = observeTransactions(context.requestorAddress);
  await userActions();

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
            "Cannot create allocation, most probably your allocation was released or your deposit is closed."
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


