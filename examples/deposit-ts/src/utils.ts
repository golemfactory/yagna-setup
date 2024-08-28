import {readFile} from "fs/promises";

export async function readJsonFile(path) {
    const file = await readFile(path, "utf8");
    return JSON.parse(file);
}
