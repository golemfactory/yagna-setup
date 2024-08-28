import { userActions } from "./user.js";

async function main() {
    await userActions();
}

main().then(() => {
    console.log("Done");
});
