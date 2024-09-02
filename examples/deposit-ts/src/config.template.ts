const config = {
    funder: {
        address: "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
        privateKey: "0x0000000000000000000000000000000000000000000000000000000000000001",
        nonceSpace: 1000000,
        depositDurationHours: 1,
    },
    yagnaAppKey: "myAppKey",
    yagnaSubnet: "public",
    spender: {
        address: "0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF",
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
    },
    depositFileName: "depositData.json",
};
export default config;
