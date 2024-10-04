import { GolemNetwork } from "@golem-sdk/golem-js";
import { pinoPrettyLogger } from "@golem-sdk/pino-logger";
import "dotenv/config";

const debitNoteTimeout = parseInt(process.env.DEBIT_NOTE_TIMEOUT || "20");
const debitNoteInterval = parseInt(process.env.DEBIT_NOTE_INTERVAL || "15");

const myProposalFilter = (proposal) => {
  /*
// This filter can be used to engage a provider we used previously.
// It should have the image cached so the deployment will be faster.
 if (proposal.provider.name == "<enter provider name here>") return true;
 else return false;
*/
  //console.log(proposal.provider.name);
  return true;
};

const params1 = {
  logger: pinoPrettyLogger({
    level: "info",
  }),
  api: { key: process.env.YAGNA_REQUESTOR_APPKEY },
  payment: {
    //driver: "erc20",
  },
};

const params2 = {
  logger: pinoPrettyLogger({
    level: "info",
  }),
  api: { key: process.env.YAGNA_REQUESTOR_APPKEY },
  payment: {
    //driver: "erc20",
  },
};

const glm1 = new GolemNetwork(params1);
const glm2 = new GolemNetwork(params2);

try {
  // Establish a link with the Golem Network
  await glm1.connect();
  await glm2.connect();

  const MarketEvents = ["demandSubscriptionStarted"];

  for (const evt of MarketEvents) {
    glm1.market.events.on(evt, (...event) => {
      console.log(event[0].demand.details.prototype.properties[8].value);
    });
    glm2.market.events.on(evt, (...event) => {
      console.log(event[0].demand.details.prototype.properties[8].value);
    });
  }
  const order = {
    demand: {
      workload: {
        imageTag: "golem/node:latest",
      },
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
        maxStartPrice: 2.0,
        maxCpuPerHourPrice: 10.0,
        maxEnvPerHourPrice: 450.0,
      },
      offerProposalFilter: myProposalFilter,
    },
    //network,
  };

  const rental1 = await glm1.oneOf({ order });
  const rental2 = await glm2.oneOf({ order });

  const exe1 = await rental1.getExeUnit();
  const exe2 = await rental2.getExeUnit();

  console.log((await exe1.run(`echo ${exe1.provider.id}`)).stdout);
  console.log((await exe2.run(`echo ${exe2.provider.id}`)).stdout);

  await new Promise((res) => setTimeout(res, 120 * 1000));

  await rental1.stopAndFinalize();
  await rental2.stopAndFinalize();
} catch (err) {
  console.error("Failed to run the example", err);
} finally {
  await glm1.disconnect();
  await glm2.disconnect();
}
