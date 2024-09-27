import {get_order_item_documents} from "./common/order_items.js";
import BigNumber from "bignumber.js";

function order_item_documents() {
    let is_paid = false;

    let rows = get_order_item_documents()
    let sumAmount = BigNumber(0);
    let sumAmountPaid = BigNumber(0);
    let order = {}
    let order_item = {}
    let payee_addr = {}
    rows.forEach(row => {
        payee_addr[row.payee_addr] = true;
        order[row.order_id] = true;
        order_item[row.order_id + "_" + row.payee_addr + "_" + row.allocation_id] = row.pboi_amount;
        let amount = BigNumber(row.amount);
        sumAmount = sumAmount.plus(amount);
        if (row.paid) {
            sumAmountPaid = sumAmountPaid.plus(amount);
        }
    });

    let sumOrderItemAmount = BigNumber(0);
    for (const order_value of Object.values(order_item)) {
        sumOrderItemAmount = sumOrderItemAmount.plus(order_value);
    }


    console.log("Summary of orders:");
    console.log("Number of orders: ", Object.keys(order).length);
    console.log("Number of order items: ", Object.keys(order_item).length);
    console.log("Number of order item documents: ", rows.length);
    console.log("Number of payee addresses: ", Object.keys(payee_addr).length);
    console.log("Total order item paid amount: ", sumAmountPaid.toString());
    console.log("Total order item amount: ", sumOrderItemAmount.toString());
    console.log("Total order item documents amount: ", sumAmount.toString());
    if (sumAmountPaid.eq(sumAmount)) {
        console.log("All items are paid");
        is_paid = true;
    } else {
        console.log("Not all order items are paid");
    }
    return is_paid;
}

order_item_documents();