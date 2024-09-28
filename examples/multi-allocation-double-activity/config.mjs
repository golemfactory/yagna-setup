const config = {
  funder: {
    address: "0xc14a990551b3e87215277961d7a45288d0c199b4",
    privateKey: process.env.FUNDER_PRIVATE_KEY,
    nonceSpace: 1000000,
    depositDurationHours: 1,
  },
  yagnaAppKey: process.env.YAGNA_REQUESTOR_APPKEY,
  spender: {
    address: process.env.SPENDER_ADDRESS,
  },
  rpcUrl: "https://holesky.rpc-node.dev.golem.network",
  lockPaymentContract: {
    holeskyAddress: "0x63704675f72A47a7a183112700Cb48d4B0A94332",
  },
  glmContract: {
    holeskyAddress: "0x8888888815bf4DB87e57B609A50f938311EEd068",
  },
  budget: {
    amount: 1.0,
    flatFeeAmount: 1.0,
    numberOfDeposits: 2,
  },
  depositFileName: "depositData.json",
};
export default config;
