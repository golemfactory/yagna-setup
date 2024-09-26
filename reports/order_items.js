import Database from 'better-sqlite3';
import BigNumber from "bignumber.js";

// Get command-line arguments
const args = process.argv.slice(2); // Skip the first two elements

// Simple command-line argument parsing
let fileLocation = '';

for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
        case '--file':
        case '-f':
            fileLocation = args[i + 1];
            i++; // Skip next argument since it's the value of --file
            break;
        default:
            console.log(`Unknown argument: ${args[i]}`);
    }
}

if (fileLocation) {
    console.log(`File Location: ${fileLocation}`);
} else {
    console.log('No file location provided. Use --file or -f to specify.');
}

function order_item_documents() {
    const db = new Database(fileLocation);
    db.transaction(() => {
        let query = `
            SELECT pboid.order_id,
                   pbo.owner_id,
                   pbo.payer_addr,
                   pbo.platform,
                   pboid.payee_addr,
                   pboid.allocation_id,
                   pboi.amount as pboi_amount,
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
        let rows = db.prepare(query).all();
        let sumAmount = BigNumber(0);
        let order = {}
        let order_item = {}
        let payee_addr = {}
        rows.forEach(row => {
            payee_addr[row.payee_addr] = true;
            order[row.order_id] = true;
            order_item[row.order_id + "_" + row.payee_addr + "_" + row.allocation_id] = row.pboi_amount;
            let amount = BigNumber(row.amount);
            sumAmount = sumAmount.plus(amount);

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
        console.log("Total order item amount: ", sumOrderItemAmount.toString());
        console.log("Total order item documents amount: ", sumAmount.toString());
    })();
}

order_item_documents()
