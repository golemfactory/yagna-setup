import "dotenv/config";
import chalk from "chalk";

import { GolemNetwork, GolemPaymentError } from "@golem-sdk/golem-js";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";
import { spawnContractObserver } from "./observer.mjs";
import { runUserActions } from "./user.mjs";
import { readFileSync } from "fs";
import { filter, map, switchMap, take } from "rxjs";
//add dotenv
import config from "./config.mjs";
const debitNoteTimeout = parseInt(process.env.DEBIT_NOTE_TIMEOUT || "20");
const debitNoteInterval = parseInt(process.env.DEBIT_NOTE_INTERVAL || "15");

async function runOperator(observerContext, depositsData) {
  /*const depositData = await JSON.parse(
    readFileSync("./depositData.json", "utf-8")
  );*/

  const noOfDeposits = depositData.length;

  // run the computations on the Golem Network
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

    let allocations = [];
    for (const depositData of depositsData) {
      // will create apair of allocations for each deposit,
      // one using the requestor wallet and one based on the deposit

      const deposit = {
        contract: config.lockPaymentContract.hoodiAddress,
        id: BigInt(depositData.id).toString(16),
      };

      const allocationD = await glm.payment.createAllocation({
        budget: depositData.amount,
        deposit: deposit,
        expirationSec: 3600,
      });

      const allocationW = await glm.payment.createAllocation({
        budget: depositData.amount, // allocation budget from wallet same as from a deposit
        expirationSec: 3600,
        paymentPlatform: "erc20-hoodi-tglm",
      });

      allocations.push(allocationD);
      allocations.push(allocationW);
    }

    // each allocation will have the same requestor nodeID, so anyone is good to get it
    observerContext.spenderAddress = allocations[0].address;

    const order1 = {
      demand: {
        workload: { imageTag: "golem/alpine:latest" },
        payment: {
          debitNotesAcceptanceTimeoutSec: debitNoteTimeout,
          midAgreementDebitNoteIntervalSec: debitNoteInterval,
          midAgreementPaymentTimeoutSec: 1200,
        },
      },
      market: {
        rentHours: 0.1,
        pricing: {
          model: "linear",
          maxStartPrice: 0.5,
          maxCpuPerHourPrice: 3000.0,
          maxEnvPerHourPrice: 3000.0,
        },
      },
      payment: {
        allocation: allocations[0], // orders will use deposit allocations
      },
    };

    const rental1 = await glm.oneOf({ order: order1 });
    let agreement = rental1.agreement;

    const debitNoteSubscription = glm.payment
      .observeDebitNotes()
      .pipe(
        // make sure we only process invoices related to our agreement
        filter((debitNote) => debitNote.agreementId === agreement.id)
      )
      .subscribe((debitNote) => {
        console.log(
          "Received debit note for ",
          debitNote.getPreciseAmount().toFixed(4),
          "GLM"
        );
        const randomAllocation =
          allocations[Math.floor(Math.random() * noOfDeposits * 2)]; // 2x as we have double number of allocations
        console.log("will accept using allocation", randomAllocation.id);
        glm.payment
          .acceptDebitNote(
            debitNote,
            randomAllocation,
            debitNote.totalAmountDue
          )
          .catch(console.error);
      });

    const invoiceSubscription = glm.payment
      .observeInvoices()
      .pipe(
        // make sure we only process invoices related to our agreement
        filter((invoice) => invoice.agreementId === agreement.id),
        // end the stream after we receive an invoice
        take(1)
      )
      .subscribe((invoice) => {
        console.log(
          "Received invoice for ",
          invoice.getPreciseAmount().toFixed(4),
          "GLM"
        );
        const randomAllocation =
          allocations[Math.floor(Math.random() * noOfDeposits * 2)]; // 2x as we have double number of allocations
        console.log("will accept using allocation", randomAllocation.id);
        rental1.paymentProcess.invoice = invoice;
        glm.payment
          .acceptInvoice(invoice, randomAllocation, invoice.amount)
          .catch(console.error);
      });

    rental1.paymentProcess.cleanupSubscriptions(); // clean built in subscriptions to avoid error when accepting invoices
    //console.log(rental1.paymentProcess);

    let exe = await rental1.getExeUnit();
    console.log(
      chalk.inverse(
        "\n",
        (
          await exe.run(
            `echo Task 1 running on ${exe.provider.id}, activity id: ${exe.activity.id}`
          )
        ).stdout
      )
    );

    // wait a little to generate some debit notes
    await new Promise((res) => setTimeout(res, 240 * 1000));

    // destroy existing activity and replace with a new one
    exe = await rental1.getExeUnit();
    let activity = exe.activity;

    //console.log(exe, activity, agreement);

    await glm.activity.destroyActivity(activity);

    // create another activity on the same provider
    activity = await glm.activity.createActivity(agreement);
    exe = await glm.activity.createExeUnit(activity);

    console.log(
      chalk.inverse(
        "\n",
        (
          await exe.run(
            `echo Task 2 running on ${exe.provider.id}, activity id: ${exe.activity.id}`
          )
        ).stdout
      )
    );

    await new Promise((res) => setTimeout(res, 10 * 1000));
    // cleaning up

    await glm.activity.destroyActivity(activity);
    await glm.market.terminateAgreement(agreement);

    //console.log(rental1.paymentProcess.invoice);
    /* this is not needed, as we await rental
    while (!invoiceSubscription.closed) {
      console.log("Waiting for the invoice to be settled...");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    */

    await rental1.stopAndFinalize();
    invoiceSubscription.unsubscribe();
    debitNoteSubscription.unsubscribe();

    // when we release allocation, we will close deposit
    // you cannot reuse closed deposit or released allocation
    for (const allocation of allocations) {
      await glm.payment.releaseAllocation(allocation);
    }
  } catch (err) {
    if (err instanceof GolemPaymentError) {
      console.log(
        "Cannot create allocation, most probably your allocation was released or your deposit is closed."
      );
    } else {
      console.error("Failed to run the example", err);
    }
    throw err;
  } finally {
    console.log("will disconnect");
    await glm.disconnect();
  }
}

/* step 1 - run observer on contract */
//const obs = await spawnContractObserver();

const obs = { context: {} };
/* step 2 - run user actions (actions performed by the funder) */
const depositData = await runUserActions();
console.log(depositData);

/* step 3 - run operator actions (actions performed by the spender) */
await runOperator(obs.context, depositData);

console.log(
  chalk.magenta("All actions completed - waiting until observer stops")
);
/* step 4 - wait for observer to finish listening for deposit close, which ends example */
//await obs.observerFuture;

console.log(chalk.magenta("Observer stopped - example finished"));
