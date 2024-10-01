import BigNumber from "bignumber.js";
import {open_payments_db} from "../common/utils.js";


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




