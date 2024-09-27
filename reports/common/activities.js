import {open_payments_db} from '../common/utils.js';
import BigNumber from "bignumber.js";


export function get_activities_and_agreements() {
    const db = open_payments_db();

    let agreements = {};
    let activities = {};
    db.transaction(() => {
        let query = `
            SELECT pc.id                     as activity_id,
                   pg.id                     as agreement_id,
                   pg.owner_id,
                   pg.payment_platform,
                   pg.role,
                   pc.total_amount_due,
                   pc.total_amount_accepted,
                   pc.total_amount_scheduled,
                   pc.total_amount_paid,
                   pc.created_ts,
                   pc.updated_ts,
                   pg.peer_id,
                   pg.payee_addr,
                   pg.payer_addr,
                   pg.total_amount_due       as agreement_total_amount_due,
                   pg.total_amount_accepted  as agreement_total_amount_accepted,
                   pg.total_amount_scheduled as agreement_total_amount_scheduled,
                   pg.total_amount_paid      as agreement_total_amount_paid,
                   pg.app_session_id,
                   pg.created_ts             as agreement_created_ts,
                   pg.updated_ts             as agreement_updated_ts
            FROM pay_activity as pc
                     JOIN pay_agreement as pg
                          ON pc.agreement_id = pg.id and pc.role = pg.role and pc.owner_id = pg.owner_id;
        `;
        let rows = db.prepare(query).all();

        rows.forEach(row => {
            let el = {
                activity_id: row.activity_id,
                agreement_id: row.agreement_id,
                owner_id: row.owner_id,
                payment_platform: row.payment_platform,
                role: row.role,
                total_amount_due: row.total_amount_due,
                total_amount_accepted: row.total_amount_accepted,
                total_amount_scheduled: row.total_amount_scheduled,
                total_amount_paid: row.total_amount_paid,
                created_ts: row.created_ts,
                updated_ts: row.updated_ts,
                peer_id: row.peer_id,
                payee_addr: row.payee_addr,
                payer_addr: row.payer_addr,
                agreement_total_amount_due: row.agreement_total_amount_due,
                agreement_total_amount_accepted: row.agreement_total_amount_accepted,
                agreement_total_amount_scheduled: row.agreement_total_amount_scheduled,
                agreement_total_amount_paid: row.agreement_total_amount_paid,
                app_session_id: row.app_session_id,
                agreement_created_ts: row.agreement_created_ts,
                agreement_updated_ts: row.agreement_updated_ts
            };
            activities[row.activity_id] = el;

            let agreement = {
                id: row.agreement_id,
                owner_id: row.owner_id,
                role: row.role,
                peer_id: row.peer_id,
                payee_addr: row.payee_addr,
                payer_addr: row.payer_addr,
                payment_platform: row.payment_platform,
                total_amount_due: row.agreement_total_amount_due,
                total_amount_accepted: row.agreement_total_amount_accepted,
                total_amount_scheduled: row.agreement_total_amount_scheduled,
                total_amount_paid: row.agreement_total_amount_paid,
                app_session_id: row.app_session_id,
                created_ts: row.agreement_created_ts,
                updated_ts: row.agreement_updated_ts
            }
            agreements[row.agreement_id] = agreement;
        });
    })();
    return {
        "activities": Object.values(activities),
        "agreements": Object.values(agreements)
    }
}

export function sum_of_accepted(activities) {
    let sum = BigNumber(0);
    for (let activity of activities) {
        sum = sum.plus(activity.total_amount_accepted);
    }
    return sum;
}

export function sum_of_scheduled(activities) {
    let sum = BigNumber(0);
    for (let activity of activities) {
        sum = sum.plus(activity.total_amount_accepted);
    }
    return sum;
}

export function sum_of_paid(activities) {
    let sum = BigNumber(0);
    for (let activity of activities) {
        sum = sum.plus(activity.total_amount_paid);
    }
    return sum;
}


