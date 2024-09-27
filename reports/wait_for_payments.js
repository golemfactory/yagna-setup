import BigNumber from "bignumber.js";
import {get_order_item_documents} from "./order_items.js";
import {get_activities_and_agreements, sum_of_accepted, sum_of_paid} from "./activities.js";


while (true) {
    let docs = get_order_item_documents();
    let res = get_activities_and_agreements();

    let sum_accepted = sum_of_accepted(res.agreements);
    let sum_paid = sum_of_paid(res.agreements);

    if (docs.length > 0) {
        let total_sum = BigNumber(0);
        let paid_sum = BigNumber(0);
        docs.forEach(doc => {
            total_sum = total_sum.plus(doc.amount);
            if (doc.paid) {
                paid_sum = paid_sum.plus(doc.amount);
            }
        })

        console.log("Total order item amount: ", total_sum.toString());
        console.log("Total order item paid amount: ", paid_sum.toString());
        console.log("Total agreement accepted amount: ", sum_accepted.toString());
        console.log("Total agreement paid amount: ", sum_paid.toString());

        if (total_sum.eq(paid_sum)) {
            console.log("All items are paid");
            break;
        }
    }
    await new Promise(r => setTimeout(r, 5000));
}