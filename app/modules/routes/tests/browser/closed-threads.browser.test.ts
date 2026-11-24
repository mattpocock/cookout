import type { Browser, Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import { inPane } from "./regions.ts";
import { logInWithStream } from "./login.ts";

const channel = "browser-closed-threads";
const ann = `${channel}-ann`;
const bob = `${channel}-bob`;
const hash = `#/channels/${channel}`;

interface Opening {
  readonly browser: Browser;
  readonly token: string;
}

interface Tokens {
  readonly ann: string;
  readonly bob: string;
}

async function openAs({ browser, token }: Opening): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await logInWithStream({ page, token });
  await page.goto(`/${hash}`);
  return page;
}

function messagesOn(page: Page): Locator {
  return inPane(page).getByRole("feed", { name: "Messages" });
}

async function posted(): Promise<Tokens> {
  await adminClient().createChannel({ name: channel });
  const author = await newIdentity({ kind: "human", name: ann });
  const closer = await newIdentity({ kind: "human", name: bob });
  await author.client.createMessage({ channel, text: "Before." });
  await author.client.createMessage({ channel, text: "Ship it?" });
  await author.client.createMessage({ channel, text: "After." });
  return { ann: author.token, bob: closer.token };
}

test("a thread one person closes from its menu folds in another person's feed with no reload", async ({ browser }) => {
  const tokens = await posted();
  const annMessages = messagesOn(await openAs({ browser, token: tokens.ann }));
  const bobMessages = messagesOn(await openAs({ browser, token: tokens.bob }));

  await expect(annMessages.getByText("Ship it?")).toBeVisible();

  await bobMessages.getByText("Ship it?").click({ button: "right" });
  await bobMessages.page().getByRole("menuitem", { name: "Close" }).click();

  await expect(bobMessages.getByRole("button", { name: "1 closed thread" })).toBeVisible();
  await expect(annMessages.getByRole("button", { name: "1 closed thread" })).toBeVisible();
  await expect(annMessages.getByText("Ship it?")).toBeHidden();
});
