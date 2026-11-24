import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import { inPane, inProfile } from "./regions.ts";
import { logInToChannels } from "./login.ts";

const BOX = { name: "Search" } as const;
const RESULTS = { name: "Search results" } as const;
const REPLY = { exact: true, name: "Reply" } as const;
const PLACES = ["Inbox", "People", "Settings"] as const;
const NONE = 0;
const ONE = 1;

interface Opened {
  readonly reader: string;
  readonly thread: number;
}

async function openedOn(page: Page, channel: string): Promise<Opened> {
  const admin = adminClient();
  await admin.createChannel({ name: channel });
  const { message } = await admin.createMessage({ channel, text: `Jump hello ${channel}` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await logInToChannels({ page, token: reader.token });
  return { reader: `${channel}-reader`, thread: message.id };
}

function results(page: Page): Locator {
  return page.getByRole("listbox", RESULTS);
}

async function searched(page: Page, query: string): Promise<void> {
  await page.keyboard.press("Control+k");
  await page.keyboard.type(query);
}

async function pressedDown(page: Page, times: number): Promise<void> {
  if (times > NONE) {
    await page.keyboard.press("ArrowDown");
    await pressedDown(page, times - ONE);
  }
}

test("ctrl+K, part of a channel's name and Enter open that channel", async ({ page }) => {
  await openedOn(page, "browser-jump-zebrachan");
  await page.goto("/#/inbox");
  await searched(page, "ZEBRACH");

  await expect(results(page).getByRole("group", { name: "Channels" }).getByRole("option")).toHaveText([
    "#browser-jump-zebrachan",
  ]);

  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/#\/channels\/browser-jump-zebrachan$/u);
  await expect(results(page)).toBeHidden();
});

test("a person's Display name and Enter open their profile", async ({ page }) => {
  await openedOn(page, "browser-jump-person");
  await newIdentity({ kind: "human", name: "browser-jump-person-target" });
  await adminClient().setDisplayName("browser-jump-person-target", "Quetzal Moonbeam");
  await page.goto("/#/inbox");
  await searched(page, "quetzal moon");

  await expect(
    results(page)
      .getByRole("group", { name: "People" })
      .getByRole("option", { name: /Quetzal Moonbeam/u }),
  ).toBeVisible();

  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/#\/people\/browser-jump-person-target$/u);
  await expect(inProfile(page)).toBeVisible();
});

for (const [at, place] of PLACES.entries()) {
  test(`with nothing typed the box lists Inbox, People and Settings, and Enter opens ${place}`, async ({ page }) => {
    const opened = await openedOn(page, `browser-jump-place-${place.toLowerCase()}`);
    await page.goto(`/#/channels/browser-jump-place-${place.toLowerCase()}/threads/${String(opened.thread)}`);

    await expect(page.getByRole("textbox", REPLY)).toBeFocused();

    await page.keyboard.press("Control+k");

    await expect(page.getByRole("combobox", BOX)).toBeFocused();
    await expect(results(page).getByRole("group", { name: "Places" }).getByRole("option")).toHaveText([...PLACES]);

    await pressedDown(page, at);

    await expect(results(page).getByRole("option", { selected: true })).toHaveText(place);

    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(new RegExp(`#/${place.toLowerCase()}$`, "u"));
  });
}

test("a word from a message still lists the message, and Enter opens it in its thread", async ({ page }) => {
  const opened = await openedOn(page, "browser-jump-message");
  await page.goto("/#/inbox");
  await searched(page, "jump hello browser-jump-message");

  await expect(results(page).getByRole("group", { name: "Messages" }).getByRole("option")).toContainText([
    "Jump hello browser-jump-message",
  ]);

  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(new RegExp(`#/channels/browser-jump-message/threads/${String(opened.thread)}$`, "u"));
  await expect(inPane(page).getByText("Jump hello browser-jump-message").first()).toBeVisible();
});

test("escape closes the box and gives focus back to the reply box", async ({ page }) => {
  const opened = await openedOn(page, "browser-jump-escape");
  await page.goto(`/#/channels/browser-jump-escape/threads/${String(opened.thread)}`);
  const reply = page.getByRole("textbox", REPLY);
  await reply.click();
  await page.keyboard.press("Control+k");

  await expect(page.getByRole("combobox", BOX)).toBeFocused();
  await expect(results(page)).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(results(page)).toBeHidden();
  await expect(reply).toBeFocused();
});
