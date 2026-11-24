import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import type { Person } from "./people.ts";
import { inSidebar } from "./regions.ts";
import { logInWithStream } from "./login.ts";

interface Watching {
  readonly poster: Person;
  readonly reader: Person;
  readonly row: Locator;
}

async function watchList(page: Page, channel: string): Promise<Watching> {
  await adminClient().createChannel({ name: channel });
  const poster = await newIdentity({ kind: "agent", name: `${channel}-poster` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await reader.client.subscribe(channel);
  await logInWithStream({ page, token: reader.token });
  const row = inSidebar(page).getByRole("link", { name: new RegExp(`^#${channel}(?![a-z-])`, "u") });

  await expect(row).toBeVisible();

  return { poster, reader, row };
}

async function rowInSecondTab(page: Page, channel: string): Promise<Locator> {
  const other = await page.context().newPage();
  const streamOpen = other.waitForResponse((response) => response.url().includes("/v1/events"));
  await other.goto("/");
  await streamOpen;
  return inSidebar(other).getByRole("link", { name: new RegExp(`^#${channel}(?![a-z-])`, "u") });
}

async function openChannel(page: Page, row: Locator, newest: string): Promise<void> {
  await row.click();

  await expect(page.getByRole("feed", { name: "Messages" })).toContainText(newest);
}

async function openAndGoBack(page: Page, row: Locator, newest: string): Promise<void> {
  await openChannel(page, row, newest);
  await inSidebar(page)
    .getByRole("link", { name: /^Inbox/u })
    .click();
}

test("a channel's unread count goes up when another identity posts, then to zero once it is opened", async ({
  page,
}) => {
  const channel = "browser-unread";
  const { poster, row } = await watchList(page, channel);

  await expect(row).toHaveAccessibleName(`#${channel}`);

  await poster.client.createMessage({ channel, text: "Deploy at noon?" });

  await expect(row).toHaveAccessibleName(`#${channel} 1 unread`);

  await poster.client.createMessage({ channel, text: "Or at one?" });

  await expect(row).toHaveAccessibleName(`#${channel} 2 unread`);

  await openAndGoBack(page, row, "Or at one?");

  await expect(row).toHaveAccessibleName(`#${channel}`);
});

test("a message that mentions the reader shows in the channel's count for you, apart from its unread count", async ({
  page,
}) => {
  const channel = "browser-unread-mention";
  const { poster, row } = await watchList(page, channel);

  await poster.client.createMessage({ channel, text: "Deploy at noon?" });
  await poster.client.createMessage({ channel, text: `@${channel}-reader can you check the rollout?` });

  await expect(row).toHaveAccessibleName(`#${channel} 1 unread 1 for you`);
  await expect(row.getByText("1", { exact: true })).toBeVisible();
});

test("a message that arrives in a channel the reader has open counts as read, in every tab", async ({ page }) => {
  const channel = "browser-unread-open";
  const { poster, reader, row } = await watchList(page, channel);
  const otherRow = await rowInSecondTab(page, channel);
  await poster.client.createMessage({ channel, text: "Deploy at noon?" });

  await expect(otherRow).toHaveAccessibleName(`#${channel} 1 unread`);

  await openChannel(page, row, "Deploy at noon?");

  await expect(otherRow).toHaveAccessibleName(`#${channel}`);

  await poster.client.createMessage({ channel, text: "Or at one?" });

  await expect
    .poll(async () => {
      const { items } = await reader.client.inbox();
      return items;
    })
    .toStrictEqual([]);
  await expect(otherRow).toHaveAccessibleName(`#${channel}`);
});
