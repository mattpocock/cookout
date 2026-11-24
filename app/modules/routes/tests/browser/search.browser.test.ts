import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { inPane } from "./regions.ts";
import { logInToChannels } from "./login.ts";
import { pressedPrevented } from "./prevented.ts";

const RESULTS = { name: "Search results" } as const;
const BOX = { name: "Search" } as const;

interface Opened {
  readonly thread: number;
  readonly reply: number;
}

async function openedOn(page: Page, channel: string): Promise<Opened> {
  const admin = adminClient();
  await admin.createChannel({ name: channel });
  const { message } = await admin.createMessage({ channel, text: `Pangolinkey deploy ${channel}` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await reader.client.follow(message.id);
  const { message: reply } = await admin.createMessage({
    channel,
    replyTo: message.id,
    text: `Pangolinkey noon ${channel}`,
  });
  await logInToChannels({ page, token: reader.token });
  return { reply: reply.id, thread: message.id };
}

const SHORTCUT = { ctrlKey: true, key: "k" } as const;
const BOTH = 2;

async function searched(page: Page, query: string): Promise<void> {
  await page.keyboard.press("Control+k");
  await page.keyboard.type(query);
}

async function pressed(page: Page, keys: readonly string[]): Promise<void> {
  const [key, ...rest] = keys;
  if (typeof key === "string") {
    await page.keyboard.press(key);
    await pressed(page, rest);
  }
}

async function selectedInInbox(page: Page, channel: string): Promise<string> {
  await openedOn(page, channel);
  await page.goto("/#/inbox");

  await expect(inPane(page).getByText(`Pangolinkey noon ${channel}`)).toBeVisible();

  await page.keyboard.press("j");

  await expect(page).toHaveURL(/#\/inbox\/.+/u);

  return page.url();
}

test("ctrl+K focuses the search box from a message box, with the browser's own shortcut prevented", async ({
  page,
}) => {
  const channel = "browser-search-ctrl";
  const opened = await openedOn(page, channel);
  await page.goto(`/#/channels/${channel}/threads/${String(opened.thread)}`);
  await page.getByRole("textbox", { exact: true, name: "Reply" }).click();
  const prevented = await pressedPrevented({ ...SHORTCUT, page });

  await expect(page.getByRole("combobox", BOX)).toBeFocused();
  expect(prevented).toBe(true);
});

test("Inbox keys typed in the search box change nothing in the Inbox", async ({ page }) => {
  const selected = await selectedInInbox(page, "browser-search-letters");
  await searched(page, "jkeu");

  await expect(page.getByRole("combobox", BOX)).toHaveValue("jkeu");
  await expect(page.getByRole("combobox", BOX)).toBeFocused();

  expect(page.url()).toBe(selected);
});

test("Escape closes the list, gives focus back, and the Inbox's selected row stays selected", async ({ page }) => {
  const channel = "browser-search-escape";
  const selected = await selectedInInbox(page, channel);
  await searched(page, `pangolinkey ${channel}`);

  await expect(page.getByRole("listbox", RESULTS)).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(page.getByRole("listbox", RESULTS)).toBeHidden();
  await expect(inPane(page).locator(`a[data-feed-row][href="${new URL(selected).hash}"]`)).toBeFocused();

  expect(page.url()).toBe(selected);
});

test("Down, Up and Enter open the highlighted result", async ({ page }) => {
  const channel = "browser-search-arrows";
  const opened = await openedOn(page, channel);
  await page.goto("/#/inbox");
  await searched(page, `pangolinkey ${channel}`);

  await expect(
    page.getByRole("listbox", RESULTS).getByRole("group", { name: "Messages" }).getByRole("option"),
  ).toHaveCount(BOTH);

  await pressed(page, ["ArrowDown", "ArrowDown", "ArrowUp", "Enter"]);

  await expect(page).toHaveURL(
    new RegExp(`#/channels/${channel}/threads/${String(opened.thread)}/messages/${String(opened.reply)}$`, "u"),
  );
  await expect(page.getByRole("listbox", RESULTS)).toBeHidden();
});
