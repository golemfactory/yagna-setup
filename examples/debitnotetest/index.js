import { GolemNetwork } from "@golem-sdk/golem-js";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";
import "dotenv/config";

let proposalDisplayed = false;
let nodeID = "";

const debitNotesReceived = [];

const history = [];

const lostDebitNotes = [];
const debitNotesLost = process.env.DEBIT_NOTES_LOST || "-1";
let expectedScriptResults = (
  process.env.EXPECTED_SCRIPT_RESULT || "success"
).split(";");

debitNotesLost.split(";").forEach((item) => {
  lostDebitNotes.push(parseInt(item));
});
console.log(`Lost debit notes used in example: ${lostDebitNotes}`);
console.log(
  `Expected script results array: [${expectedScriptResults.join(" ")}]`
);

import { PaymentModuleImpl } from "@golem-sdk/golem-js";

let debitNo = 0;
class MyPaymentModule extends PaymentModuleImpl {
  async acceptDebitNote(debitNote, allocation, amount) {
    debitNo += 1;
    if (lostDebitNotes.includes(debitNo)) {
      console.log(`ignoring debit note no ${debitNo}`);
      history.push({
        time: new Date(),
        info: "delayingDebitNote",
        extra: `Delaying debit note no ${debitNo}`,
      });
      //ignore debit note
      return debitNote;
    }
    return super.acceptDebitNote(debitNote, allocation, amount);
  }
}

function convertTimeStamp(date) {
  return "[" + date.toISOString().split("T").pop().split("Z").shift() + "]";
}

function getTimeStamp() {
  return convertTimeStamp(new Date());
}

const myProposalFilter = (proposal) =>
  Boolean(proposal.provider.name.indexOf("testnet") === -1);

const subnetTag = process.env.YAGNA_SUBNET || "change_me";
const appKey = process.env.YAGNA_APPKEY || "66iiOdkvV29";

const debitNoteTimeout = parseInt(process.env.DEBIT_NOTE_TIMEOUT || "10");
const debitNoteInterval = parseInt(process.env.DEBIT_NOTE_INTERVAL || "15");

async function connectAndRun(glm) {
    await glm.connect();

    const allocation = await glm.payment.createAllocation( {
        budget: 80.0,
        paymentPlatform: "erc20-holesky-tglm",
        expirationSec: 3600
    });


    const order = {
        demand: {
            workload: {imageTag: "golem/alpine:latest"},
            payment: {
                debitNotesAcceptanceTimeoutSec: debitNoteTimeout,
                midAgreementDebitNoteIntervalSec: debitNoteInterval,
                midAgreementPaymentTimeoutSec: 1200,
            },
            subnetTag: subnetTag,
        },
        market: {
            rentHours: 0.1,
            pricing: {
                model: "linear",
                maxStartPrice: 0.5,
                maxCpuPerHourPrice: 3000.0,
                maxEnvPerHourPrice: 3000.0,
            },
            offerProposalFilter: myProposalFilter,
        },
        payment: {
            allocation: allocation,
        },
        activity: {
            activityExeBatchResultPollIntervalSeconds: 10,
            activityExeBatchResultMaxRetries: 20,
        },
    };


    history.push({
      time: new Date(),
      info: "agreementApproved",
      extra: `Approved agreement ${event.agreement.id}`,
    });
    console.log(
      "agreementApproved",
      "AT:",
      event.agreement.model.offer.properties[
        "golem.com.payment.debit-notes.accept-timeout?"
      ],
      "DNI:",
      event.agreement.model.offer.properties[
        "golem.com.scheme.payu.debit-note.interval-sec?"
      ],
      "PT:",
      event.agreement.model.offer.properties[
        "golem.com.scheme.payu.payment-timeout-sec?"
      ]
    );
  });
  glm.market.events.on("agreementTerminated", (event) => {
    history.push({
      time: new Date(),
      info: "agreementTerminated",
      extra: `Terminated agreement ${event.agreement.id}`,
    });
    console.log("agreementTerminated", event.agreement.id);
  });
  glm.market.events.on("offerProposalReceived", (event) => {
    if (!proposalDisplayed || nodeID === event.offerProposal.provider.id)
      console.log(
        "offerProposalReceived",
        "AT:",
        event.offerProposal.properties[
          "golem.com.payment.debit-notes.accept-timeout?"
        ],
        "DNI:",
        event.offerProposal.properties[
          "golem.com.scheme.payu.debit-note.interval-sec?"
        ],
        "PT:",
        event.offerProposal.properties[
          "golem.com.scheme.payu.payment-timeout-sec?"
        ]
      );
    nodeID = event.offerProposal.provider.id;
    //.log(nodeID);

    proposalDisplayed = true;
  });

  glm.payment.events.on("debitNoteReceived", (event) => {
    history.push({
      time: new Date(),
      info: "debitNoteReceived",
      extra: `Received debit note ${event.debitNote.id.slice(0, 8)}...`,
    });

    console.log(
      "debitNoteReceived",
      event.debitNote.id.slice(0, 8),
      event.debitNote.model.timestamp,
      event.debitNote.model.paymentDueDate,
      event.debitNote.model.totalAmountDue,
      event.debitNote.model.usageCounterVector
    );
  });
  glm.payment.events.on("debitNoteAccepted", (event) => {
    history.push({
      time: new Date(),
      info: "debitNoteAccepted",
      extra: `Accepted debit note ${event.debitNote.id.slice(0, 8)}`,
    });

    console.log(
      "debitNoteAccepted",
      event.debitNote.id.slice(0, 8),
      event.debitNote.model.timestamp,
      event.debitNote.model.paymentDueDate,
      event.debitNote.model.totalAmountDue,
      event.debitNote.model.usageCounterVector
    );
  });
  glm.payment.events.on("debitNoteRejected", (event) => {
    history.push({
      time: new Date(),
      info: "debitNoteRejected",
      extra: `Rejected debit note ${event.debitNote.id.slice(0, 8)}`,
    });

    console.log("debitNoteRejected", event);
  });
  glm.payment.events.on("errorAcceptingDebitNote", (event) => {
    console.log("errorAcceptingDebitNote", event);
  });
  glm.payment.events.on("errorRejectingDebitNote", (event) => {
    console.log(
      "errorRejectingDebitNote",
      event.debitNote.id.slice(0, 8),
      event.debitNote.model.timestamp,
      event.debitNote.model.paymentDueDate,
      event.debitNote.model.totalAmountDue,
      event.debitNote.model.usageCounterVector
    );
  });

  const rental = await glm.oneOf({ order });

  const exe = await rental.getExeUnit();
  console.log(`Got exeUnit: ${getTimeStamp()}`);

  await exe.run("echo Hello, Golem!");

  console.log("Started testing provider %s", exe.provider.name);

  let stepNo = 0;
  let numberOfRuns = 10;
  while (stepNo < numberOfRuns) {
    await exe.run("sleep 30");
    console.log(`Step ${stepNo} finished`);
    history.push({
      time: new Date(),
      info: "stepFinished",
      extra: `Step ${stepNo} finished`,
    });
    stepNo += 1;
  }

  console.log("Finished testing on provider %s", exe.provider.name);
  await rental.stopAndFinalize();
}

function displayHistorySummary() {
  console.log("History (summary):");
  let startDate = history[0].time;
  for (let i = 0; i < history.length; i++) {
    let elapsed = history[i].time - startDate;
    let elapsedSeconds = elapsed / 1000.0;
    console.log(
      `${i}: ${elapsedSeconds}s ${convertTimeStamp(history[i].time)} - ${
        history[i].info
      } - ${history[i].extra}`
    );
  }
}

function checkResults(jobFinishedSuccessfully) {
  if (expectedScriptResults.includes("terminated-early")) {
    let indexOfAgreementTerminated = history.findIndex(
      (item) => item.info === "agreementTerminated"
    );
    let indexOfScriptError = history.findIndex((item) => item.info === "error");

    console.log(
      `indexOfAgreementTerminated: ${indexOfAgreementTerminated}, indexOfScriptError: ${indexOfScriptError}`
    );
    if (indexOfAgreementTerminated === -1) {
      console.error("Expected agreement termination not found in history");
      throw "Expected agreement termination not found in history";
    }
    if (indexOfScriptError === -1) {
      console.error("Expected script error not found in history");
      throw "Expected script error not found in history";
    }
    if (indexOfAgreementTerminated > indexOfScriptError) {
      console.error("Agreement was terminated before script error");
      throw "Agreement was terminated before script error";
    }
    console.log(
      "OK - Agreement was terminated before script error - that is expected"
    );
  }
  if (jobFinishedSuccessfully) {
    if (!expectedScriptResults.includes("success")) {
      throw "Job succeeded but it was expected to fail";
    }
  } else {
    if (!expectedScriptResults.includes("failure")) {
      throw "Job failed but it was expected to succeed";
    }
  }
}

async function main() {
  const glm = new GolemNetwork({
    logger: pinoPrettyLogger({
      level: "info",
    }),
    api: { key: appKey },
    override: {
      payment: MyPaymentModule,
    },
  });

  let jobFinishedSuccessfully;
  try {
    await connectAndRun(glm);
    jobFinishedSuccessfully = true;
  } catch (err) {
    jobFinishedSuccessfully = false;
    history.push({
      time: new Date(),
      info: "error",
      extra: `Script error: ${err}`,
    });
    console.error("Failed to run the example", err);
  }

  history.push({
    time: new Date(),
    info: "glmDisconnecting",
    extra: `Disconnecting from yagna`,
  });
  await glm.disconnect();
  history.push({
    time: new Date(),
    info: "glmDisconnected",
    extra: `Disconnected from yagna`,
  });

  displayHistorySummary();
  checkResults(jobFinishedSuccessfully);
}

main()
  .then(() => {
    console.log("Example finished");
  })
  .catch((err) => {
    console.error("Example failed", err);
    process.exit(1);
  });
