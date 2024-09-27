import BigNumber from "bignumber.js";
import {get_order_item_documents} from "./common/order_items.js";
import {get_activities_and_agreements, sum_of_accepted, sum_of_paid, sum_of_scheduled} from "./common/activities.js";


let loop_no = 0;
while (true) {
    if (loop_no > 0) {
        console.log("Waiting for 5 seconds before checking again");
        await new Promise(r => setTimeout(r, 5000));
    }
    loop_no++;

    let docs = get_order_item_documents();
    let res = get_activities_and_agreements();

    let agreement_sum_accepted = sum_of_accepted(res.agreements);
    let agreement_sum_scheduled = sum_of_scheduled(res.agreements);
    let agreement_sum_paid = sum_of_paid(res.agreements);

    if (agreement_sum_accepted.eq(0)) {
        console.log("No agreements yet");
        continue;
    }

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
    console.log("Total agreement scheduled amount: ", agreement_sum_scheduled.toString());
    console.log("Total agreement accepted amount: ", agreement_sum_accepted.toString());
    console.log("Total agreement paid amount: ", agreement_sum_paid.toString());

    if (!total_sum.eq(paid_sum)) {
        console.log("Items are not paid yet");
        continue;
    }
    if (!agreement_sum_accepted.eq(agreement_sum_paid)) {
        console.log("Agreements are not yet paid");
        continue;
    }
    if (!total_sum.eq(agreement_sum_accepted)) {
        console.log("Total sum of items is not equal to total sum of agreements");
        continue;
    }
    console.log("All conditions are met, exiting");
    break;

}