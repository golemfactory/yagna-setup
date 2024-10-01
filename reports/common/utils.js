import Database from "better-sqlite3";
import fs from "fs";

const data_dir = process.env.YAGNA_DATADIR || "."

export function open_payments_db() {
    const payments_sql_file = data_dir + '/payment.db'
    if (!fs.existsSync(payments_sql_file)) {
        throw new Error("Payments database does not exist: " + payments_sql_file);
    }
    const db = new Database(payments_sql_file);
    return db;
}