import {get_activities_and_agreements} from "./common/activities.js";

function activities() {
    let res = get_activities_and_agreements();

    for (let activity of res.activities) {
        console.log("Activity: ", activity);
    }
    for (let agreement of res.agreements) {
        console.log("Agreement: ", agreement);
    }
}


activities();