import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import { inPane, inSidebar } from "./regions.ts";
import type { CookoutClient } from "../../../sdk/index.ts";
import type { Page } from "@playwright/test";
import { logInWithStream } from "./login.ts";

async function postWithMention(page: Page): Promise<void> {
  await inSidebar(page).getByRole("link", { name: "#browser-post" }).click();
  await page.getByLabel("Message", { exact: true }).pressSequentially("Can @browser-post-r");
  await page
    .getByRole("listbox", { name: "Mention suggestions" })
    .getByRole("option", { name: "@browser-post-reviewer" })
    .click();
  await page.keyboard.type("look?");
  await inPane(page).getByRole("button", { name: "Send" }).click();
}

async function inboxesOf(mentioned: CookoutClient, poster: CookoutClient): Promise<readonly unknown[]> {
  const [theirs, mine] = await Promise.all([mentioned.inbox(), poster.inbox()]);
  return [theirs.items.map((item) => [item.message.text, item.reasons]), mine.items];
}

test("a human posts a top-level message with an @ mention from the channel view, and the mentioned identity's inbox has it", async ({
  page,
}) => {
  const poster = await newIdentity({ kind: "human", name: "browser-poster" });
  const mentioned = await newIdentity({ kind: "agent", name: "browser-post-reviewer" });
  await adminClient().createChannel({ name: "browser-post" });
  await logInWithStream({ page, token: poster.token });
  await postWithMention(page);

  await expect(page.getByRole("feed", { name: "Messages" }).getByRole("article")).toContainText([
    "Can @browser-post-reviewer look?",
  ]);
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("");
  await expect
    .poll(async () => {
      const inboxes = await inboxesOf(mentioned.client, poster.client);
      return inboxes;
    })
    .toStrictEqual([[["Can @browser-post-reviewer look?", ["mention"]]], []]);
});
