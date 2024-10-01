import {open_payments_db} from "./utils.js";


export function get_expenditures() {
    const db = open_payments_db();
    let rows = null;
    let allocationArray = null;
    db.transaction(() => {
        let query = `
            SELECT pae.allocation_id,
                   pa.payment_platform,
                   pa.address,
                   pae.owner_id,
                   pae.activity_id,
                   pae.agreement_id,
                   pae.accepted_amount,
                   pae.scheduled_amount,
                   pa.avail_amount,
                   pa.spent_amount,
                   pa.created_ts,
                   pa.updated_ts,
                   pa.timeout,
                   pa.released,
                   pa.deposit,
                   pa.deposit_status
            FROM pay_allocation_expenditure as pae
                     JOIN pay_allocation as pa
                          ON pa.id = pae.allocation_id and pa.owner_id = pae.owner_id
        `;

        rows = db.prepare(query).all();

        let expenditures = [];
        const decoder = new TextDecoder();
        rows.forEach(row => {
            let el = {
                allocation_id: row.allocation_id,
                payment_platform: row.payment_platform,
                address: row.address,
                owner_id: row.owner_id,
                activity_id: row.activity_id,
                agreement_id: row.agreement_id,
                accepted_amount: row.accepted_amount,
                scheduled_amount: row.scheduled_amount,
                avail_amount: row.avail_amount,
                spent_amount: row.spent_amount,
                created_ts: row.created_ts,
                updated_ts: row.updated_ts,
                timeout: row.timeout,
                released: row.released,
                deposit: row.deposit,
                deposit_status: row.deposit_status
            }
            expenditures.push(el);
        });

        let allocations = {}
        for (let expenditure of expenditures) {
            allocations[expenditure.allocation_id] = {
                "allocation_id": expenditure.allocation_id,
                "payment_platform": expenditure.payment_platform,
                "address": expenditure.address,
                "owner_id": expenditure.owner_id,
                "activity_id": expenditure.activity_id,
                "agreement_id": expenditure.agreement_id,
                "avail_amount": expenditure.avail_amount,
                "spent_amount": expenditure.spent_amount,
                "created_ts": expenditure.created_ts,
                "updated_ts": expenditure.updated_ts,
                "timeout": expenditure.timeout,
                "released": expenditure.released,
                "deposit": expenditure.deposit,
                "deposit_status": expenditure.deposit_status
            }
        }

        allocationArray = Object.values(allocations);
        rows = expenditures;
    })();
    return {
        "expenditures": rows,
        "allocations": allocationArray
    }
}
