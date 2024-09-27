import {open_payments_db} from "./utils.js";


export function get_debit_notes() {
    const db = open_payments_db();
    let rows = null;
    db.transaction(() => {
        let query = `
            SELECT pdn.id,
                   pg.payment_platform,
                   pdn.owner_id,
                   pdn.role,
                   pdn.activity_id,
                   pdn.debit_nonce,
                   pdn.previous_debit_note_id,
                   pc.agreement_id,
                   pdn.status,
                   pdn.timestamp,
                   pdn.total_amount_due,
                   pdn.usage_counter_vector,
                   pdn.payment_due_date,
                   pdn.send_accept
            FROM pay_debit_note pdn
            JOIN pay_activity pc
                ON pc.id = pdn.activity_id AND pc.owner_id = pdn.owner_id
            JOIN pay_agreement pg
                ON pg.id = pc.agreement_id AND pg.owner_id = pc.owner_id
        `;


        rows = db.prepare(query).all();

        let debitNotes = [];
        const decoder = new TextDecoder();
        rows.forEach(row => {
            let el = {
                id: row.id,
                payment_platform: row.payment_platform,
                owner_id: row.owner_id,
                role: row.role,
                activity_id: row.activity_id,
                debit_nonce: row.debit_nonce,
                previous_debit_note_id: row.previous_debit_note_id,
                agreement_id: row.agreement_id,
                status: row.status,
                timestamp: row.timestamp,
                total_amount_due: row.total_amount_due,
                usage_counter_vector: decoder.decode(row.usage_counter_vector),
                payment_due_date: row.payment_due_date,
                send_accept: row.send_accept
            }
            debitNotes.push(el);
        });

        rows = debitNotes;
    })();
    return rows;
}
