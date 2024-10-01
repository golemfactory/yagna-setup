import {get_payments} from "./common/payments.js";
import BigNumber from "bignumber.js";

function listPayments() {
    let rows = get_payments();
    let sumAmount = BigNumber(0);
    let payment_ids = {}
    rows.forEach(row => {
        console.log(row);
        let amount = BigNumber(row.amount);
        sumAmount = sumAmount.plus(amount);
        payment_ids[row.payment_id] = true;
    });
    console.log("Summary of payments:");
    console.log("Number of payment documents: ", rows.length);
    console.log("Number of physical payments: ", Object.keys(payment_ids).length)
    console.log("Total payment amount: ", sumAmount.toString());
}

listPayments()
