import {open_payments_db} from "./utils.js";
import BigNumber from "bignumber.js";

export function get_payments() {
    const db = open_payments_db();
    let is_paid = false;
    let payments = null;
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
                     JOIN pay_payment pp
                          ON ppd.owner_id = pp.owner_id AND ppd.peer_id = pp.peer_id AND ppd.payment_id = pp.id
            ORDER BY pp.timestamp desc
        `;
        const rows = db.prepare(query).all();

        payments = [];
        rows.forEach(row => {
            let el = {
                timestamp: row.timestamp,
                payee_addr: row.payee_addr,
                payment_id: row.payment_id,
                owner_id: row.owner_id,
                peer_id: row.peer_id,
                agreement_id: row.agreement_id,
                invoice_id: row.invoice_id,
                activity_id: row.activity_id,
                debit_note_id: row.debit_note_id,
                amount: BigNumber(row.amount)
            }
            payments.push(el);
        });
    })();
    return payments;
}

export function sumOfPayments(rows) {
    let sumAmount = BigNumber(0);
    rows.forEach(row => {
        let amount = BigNumber(row.amount);
        sumAmount = sumAmount.plus(amount);
    });
    return sumAmount;
}