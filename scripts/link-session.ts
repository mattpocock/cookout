import { argv, exit, stdin, stdout } from "node:process";
import { linkIn, sessionFromLoginLink } from "./lib/login-link-session.ts";
import { text } from "node:stream/consumers";

const EXIT_FAILURE = 1;
const FIRST_ARGUMENT = 2;
const [url = "", name = "admin"] = argv.slice(FIRST_ARGUMENT);
const printed = await text(stdin);
const link = linkIn(printed.split("\n"));
if (url === "" || link === "") {
  console.error(
    "link-session: usage: <a cookout's output> | node scripts/link-session.ts <url> [name]. It redeems the first setupLink (making the first admin <name>, admin by default) or loginLink on stdin at <url> and prints the session.",
  );
  exit(EXIT_FAILURE);
}
const session = await sessionFromLoginLink({ link, name, url });
stdout.write(`${session}\n`);
