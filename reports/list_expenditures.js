

import {get_expenditures} from "./common/expenditures.js";
import BigNumber from "bignumber.js";

function expenditures() {
    let dns = get_expenditures();

    for (const exp of dns.expenditures) {
        console.log("Expenditure:", exp);
    }
    for (const all of dns.allocations) {
        console.log("Allocation:", all);
    }

    console.log("Number of expenditures: ", dns.length);

    let sumAcceptedAmount = dns.expenditures.reduce((acc, dn) => acc.plus(dn.accepted_amount), BigNumber(0));
    let sumScheduledAmount = dns.expenditures.reduce((acc, dn) => acc.plus(dn.scheduled_amount), BigNumber(0));
    let sumAvailAmount = dns.allocations.reduce((acc, dn) => acc.plus(dn.avail_amount), BigNumber(0));
    let sumSpentAmount = dns.allocations.reduce((acc, dn) => acc.plus(dn.spent_amount), BigNumber(0));
    console.log("Total expenditures amount: ", sumAcceptedAmount.toString());
    console.log("Total scheduled amount: ", sumScheduledAmount.toString());
    console.log("Total avail amount: ", sumAvailAmount.toString());
    console.log("Total spent amount: ", sumSpentAmount.toString());
}


expenditures();