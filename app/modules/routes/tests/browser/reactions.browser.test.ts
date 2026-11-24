import type { Browser, Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import { inPane } from "./regions.ts";
import { logInWithStream } from "./login.ts";

const channel = "browser-reactions";
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

function messageOn(page: Page): Locator {
  return inPane(page).getByRole("feed", { name: "Messages" }).getByRole("article");
}

async function posted(): Promise<Tokens> {
  await adminClient().createChannel({ name: channel });
  const author = await newIdentity({ kind: "human", name: ann });
  const reactor = await newIdentity({ kind: "human", name: bob });
  await author.client.createMessage({ channel, text: "Ship it?" });
  return { ann: author.token, bob: reactor.token };
}

test("a 👍 left from the hover actions in one tab shows as a chip in another, and its click there adds a second", async ({
  browser,
}) => {
  const tokens = await posted();
  const annPage = await openAs({ browser, token: tokens.ann });
  const bobMessage = messageOn(await openAs({ browser, token: tokens.bob }));
  await bobMessage.hover();
  await bobMessage.getByRole("button", { name: "React with 👍" }).click();

  await expect(bobMessage.getByRole("button", { name: "👍 1", pressed: true })).toBeVisible();

  const annChip = messageOn(annPage).getByRole("button", { name: "👍 1", pressed: false });

  await expect(annChip).toHaveAttribute("title", bob);

  await annChip.click();

  await expect(bobMessage.getByRole("button", { name: "👍 2", pressed: true })).toHaveAttribute(
    "title",
    `${bob}, ${ann}`,
  );
});
