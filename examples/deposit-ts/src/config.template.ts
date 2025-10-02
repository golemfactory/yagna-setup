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
    rpcUrl: "https://hoodi.rpc-node.dev.golem.network",
    lockPaymentContract: {
        hoodiAddress: "0x472ef33B51f65FB2aDa50ffeB0e4A72e9ac22f52",
    },
    glmContract: {
        hoodiAddress: "0x55555555555556AcFf9C332Ed151758858bd7a26",
    },
    budget: {
        amount: 1.0,
        flatFeeAmount: 1.0,
    },
    depositFileName: "depositData.json",
};
export default config;
