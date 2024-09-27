import BigNumber from "bignumber.js";
import {open_payments_db} from "../common/utils.js";

function payments() {
    const db = open_payments_db();
    let is_paid = false;
    db.transaction(() => {
        let query = `
            SELECT pp.timestamp,
                pp.payee_addr,
                ppd.payment_id,
                ppd.owner_id,
                ppd.peer_id,
                ppd.agreement_id,
                ppd.invoice_id,
                ppd.activity_id,
                ppd.debit_note_id,
                ppd.amount
            FROM pay_payment_document ppd
            JOIN pay_payment pp ON ppd.owner_id = pp.owner_id AND ppd.peer_id = pp.peer_id AND ppd.payment_id = pp.id
            ORDER BY pp.timestamp desc
            `;
        let rows = db.prepare(query).all();
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
    })();
}


export function get_order_item_documents() {
    const db = open_payments_db();
    let is_paid = false;
    let rows = null;
    db.transaction(() => {
        let query = `
            SELECT pboid.order_id,
                   pbo.owner_id,
                   pbo.payer_addr,
                   pbo.platform,
                   pboid.payee_addr,
                   pboid.allocation_id,
                   pboi.amount as pboi_amount,
                   pboi.paid,
                   pboid.amount,
                   pboid.agreement_id,
                   pboid.activity_id
            FROM pay_batch_order_item pboi
                     JOIN pay_batch_order_item_document pboid
                          ON pboid.order_id = pboi.order_id
                              AND pboid.owner_id = pboi.owner_id
                              AND pboid.payee_addr = pboi.payee_addr
                              AND pboid.allocation_id = pboi.allocation_id
                     JOIN pay_batch_order pbo ON pbo.owner_id = pboi.owner_id AND pbo.id = pboi.order_id
            `;
        rows = db.prepare(query).all();
    })();
    return rows;
}




