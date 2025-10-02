import {privateKeyToAddress} from "viem/accounts";

const config = {
  funder: {
    address: privateKeyToAddress(process.env.FUNDER_PRIVATE_KEY),
    privateKey: process.env.FUNDER_PRIVATE_KEY,
    nonceSpace: 1000000,
    depositDurationHours: 1,
  },
  yagnaAppKey: process.env.YAGNA_REQUESTOR_APPKEY,
  spender: {
    address: process.env.SPENDER_ADDRESS,
  },
  rpcUrl: "https://hoodi.rpc-node.dev.golem.network",
  lockPaymentContract: {
    hoodiAddress: "0x472ef33B51f65FB2aDa50ffeB0e4A72e9ac22f52",
  },
  glmContract: {
    hoodiAddress: "0x55555555555556AcFf9C332Ed151758858bd7a26",
  },
  budget: {
    amount: 23.0,
    flatFeeAmount: 1.0,
    numberOfDeposits: 2,
  },
  depositFileName: "depositData.json",
};
export default config;
