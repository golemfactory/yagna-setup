import {get_debit_notes} from "./common/debit_notes.js";

function debit_notes() {
    let dns = get_debit_notes();

    for (const dn of dns) {
        console.log(dn);
    }

    let number_of_settled_debit_notes = dns.filter(dn => dn.status === "SETTLED").length;
    let number_of_received_debit_notes = dns.filter(dn => dn.status === "RECEIVED").length;
    let number_of_accepted_debit_notes = dns.filter(dn => dn.status === "ACCEPTED").length;

    console.log("Number of debit notes: ", dns.length);
    console.log("Number of settled debit notes: ", number_of_settled_debit_notes);
    console.log("Number of received debit notes: ", number_of_received_debit_notes);
    console.log("Number of accepted debit notes: ", number_of_accepted_debit_notes);

}


debit_notes();