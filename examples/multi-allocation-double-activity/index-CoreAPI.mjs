import chalk from "chalk";

import { GolemNetwork, GolemPaymentError } from "@golem-sdk/golem-js";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";
import { spawnContractObserver } from "./observer.mjs";
import { runUserActions } from "./user.mjs";
import { readFileSync } from "fs";
import { filter, map, switchMap, take } from "rxjs";

import config from "./config.mjs";

const debitNoteTimeout = parseInt(process.env.DEBIT_NOTE_TIMEOUT || "20");
const debitNoteInterval = parseInt(process.env.DEBIT_NOTE_INTERVAL || "15");

function convertTimeStamp(date) {
  return "[" + date.toISOString().split("T").pop().split("Z").shift() + "]";
}

function getTimeStamp() {
  return convertTimeStamp(new Date());
}

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

    const order = {
      demand: {
        workload: { imageTag: "golem/alpine:latest" },
        payment: {
          debitNotesAcceptanceTimeoutSec: debitNoteTimeout,
          midAgreementDebitNoteIntervalSec: debitNoteInterval,
          midAgreementPaymentTimeoutSec: 1200,
        },
      },
      market: {
        rentHours: 0.5,
        pricing: {
          model: "burn-rate",
          avgGlmPerHour: 0.5,
        },
      },
      payment: {
        allocation: allocations[0], // orders will use deposit allocations
      },
    };

    const debitNoteSubscription = glm.payment
      .observeDebitNotes()
      .pipe(
        // make sure we only process invoices related to our agreement
        //filter((debitNote) => debitNote.agreementId === agreement.id)
        // for the test, we will assume we can accept all debit notes
        filter((debitNote) => true)
      )
      .subscribe((debitNote) => {
        console.log(
          "Received debit note for ",
          debitNote.getPreciseAmount().toFixed(4),
          "GLM"
        );
        const randomAllocation =
          allocations[Math.floor(Math.random() * noOfDeposits * 2)]; // 2x as we have double number of allocations
        console.log(
          getTimeStamp(),
          "will accept using allocation",
          randomAllocation.id
        );
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
        //filter((invoice) => invoice.agreementId === agreement.id),
        filter((invoice) => true),
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
        console.log(
          getTimeStamp(),
          "will accept using allocation",
          randomAllocation.id
        );
        glm.payment
          .acceptInvoice(invoice, randomAllocation, invoice.amount)
          .catch(console.error);
      });

    const demandSpecification = await glm.market.buildDemandDetails(
      order.demand,
      order.market,
      allocations[0]
    );
    // Publish the order on the market
    const demand$ = glm.market.publishAndRefreshDemand(demandSpecification);
    // Now, for each created demand, let's listen to proposals from providers
    const offerProposal$ = demand$.pipe(
      switchMap((demand) => glm.market.collectMarketProposalEvents(demand)),
      // to keep things simple we don't care about any other events
      // related to this demand, only proposals from providers
      filter((event) => event.type === "ProposalReceived"),
      map((event) => event.proposal)
    );

    const draftProposals = [];

    let obs = offerProposal$.subscribe(
      (event) => {}
      //  console.log(event.model.state, event.model.issuerId)
    );

    const offerProposalsSubscription = offerProposal$.subscribe(
      (offerProposal) => {
        // console.log(offerProposal.model.issuerId, offerProposal.model.state);
        if (offerProposal.isInitial()) {
          // here we can define our own counter-offer
          glm.market
            .negotiateProposal(offerProposal, demandSpecification)
            .catch(console.error);
        } else if (offerProposal.isDraft()) {
          draftProposals.push(offerProposal);
        }
      }
    );

    // Let's wait for a couple seconds to receive some proposals
    while (draftProposals.length < 1) {
      console.log("Waiting for proposals...");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Remember that signing the proposal can fail, so in a production environment
    // you should handle the error and retry with a different proposal.
    // To keep this example simple, we will not retry and just crash if the signing fails
    let draftProposal = draftProposals[0];
    let agreement;
    let getAgreement = true;
    let candidate = 0;
    while (getAgreement) {
      try {
        agreement = await glm.market.proposeAgreement(draftProposal);
        getAgreement = false;
      } catch (e) {
        console.log("not signed", e.name);
        candidate++;
        if (candidate > draftProposals.length) throw "Not enough proposals";
        draftProposal = draftProposals[candidate];
      }
    }

    // We have received at least one draft proposal, we can now stop listening for more
    offerProposalsSubscription.unsubscribe();
    obs.unsubscribe();

    console.log("Agreement signed with provider", agreement.provider.name);

    // First lets start the activity - this will deploy our image on the provider's machine
    let activity = await glm.activity.createActivity(agreement);
    // Then let's create a ExeUnit, which is a set of utilities to interact with the
    // providers machine, like running commands, uploading files, etc.
    let exe = await glm.activity.createExeUnit(activity);

    // We're done! Let's cleanup the subscriptions, release the remaining funds and disconnect from the network

    await exe
      .run(`echo Task 1 running on ${exe.provider.id}`)
      .then((res) => console.log(chalk.inverse("\n", res.stdout)));

    await new Promise((res) => setTimeout(res, 30 * 1000));

    await glm.activity.destroyActivity(activity);

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
    // Then let's terminate the agreement
    await glm.market.terminateAgreement(agreement);
    // Before we finish, let's wait for the invoice to be settled
    while (!invoiceSubscription.closed) {
      console.log("Waiting for the invoice to be settled...");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    invoiceSubscription.unsubscribe();
    debitNoteSubscription.unsubscribe();
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
