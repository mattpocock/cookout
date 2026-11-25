import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, inProfile, inSidebar, inThread, sidebarLink } from "./regions.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const PARENT = "The parent.";
const FRIEND = "-friend";
const FRIEND_TYPED = "-fri";

interface Thread {
  readonly channel: string;
  readonly friend: string;
}

async function seeded(channel: string): Promise<number> {
  await adminClient().createChannel({ name: channel });
  await newIdentity({ kind: "human", name: `${channel}${FRIEND}` });
  const { message } = await adminClient().createMessage({ channel, text: PARENT });
  await adminClient().createMessage({ channel, replyTo: message.id, text: "The reply." });
  return message.id;
}

async function threadOpened(page: Page, channel: string): Promise<Thread> {
  const friend = `${channel}${FRIEND}`;
  const parent = await seeded(channel);
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await reader.client.subscribe(channel);
  await logInWithStream({ page, token: reader.token });
  await page.goto(`/#/channels/${channel}/threads/${String(parent)}`);

  await expect(inThread(page).getByText("The reply.", { exact: true })).toBeVisible();

  return { channel, friend };
}

function channelMessage(page: Page): Locator {
  return inPane(page)
    .getByRole("feed", { exact: true, name: "Messages" })
    .getByRole("article")
    .filter({ hasText: PARENT });
}

function rowOf(page: Page, channel: string): Locator {
  return sidebarLink({ label: `#${channel}`, page });
}

async function markedUnread(page: Page, channel: string): Promise<void> {
  await channelMessage(page).focus();
  await page.keyboard.press("Shift+F10");
  await page
    .getByRole("menu", { exact: true, name: "Message actions" })
    .getByRole("menuitem", { exact: true, name: "Mark unread" })
    .click();

  await expect(rowOf(page, channel)).toHaveAccessibleName(new RegExp(`^#${channel} \\d+ unread`, "u"));
}

async function mentionListOpen(page: Page, channel: string): Promise<Locator> {
  const reply = inThread(page)
    .getByRole("form", { exact: true, name: "Reply to the thread" })
    .getByLabel("Reply", { exact: true });
  await inThread(page).getByRole("article").filter({ hasText: "The reply." }).focus();
  await reply.click();
  await reply.pressSequentially(`Hi @${channel}${FRIEND_TYPED}`);

  await expect(page.getByRole("listbox", { exact: true, name: "Mention suggestions" })).toBeVisible();

  return reply;
}

async function menuThenBox(page: Page, reply: Locator): Promise<void> {
  const draft = await reply.inputValue();
  await page.keyboard.press("Escape");

  await expect(page.getByRole("listbox", { exact: true, name: "Mention suggestions" })).toBeHidden();
  await expect(reply).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(reply).not.toBeFocused();
  await expect(inThread(page).getByRole("article").filter({ hasText: "The reply." })).toBeFocused();
  await expect(reply).toHaveValue(draft);
}

test("each Escape goes out one level: the menu, the reply box, the thread panel, then the channel is marked read", async ({
  page,
}) => {
  const { channel } = await threadOpened(page, unique("browser-escape-ladder"));
  await markedUnread(page, channel);
  await menuThenBox(page, await mentionListOpen(page, channel));

  await page.keyboard.press("Escape");

  await expect(inThread(page)).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`#/channels/${channel}$`, "u"));
  await expect(channelMessage(page)).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(rowOf(page, channel)).toHaveAccessibleName(`#${channel}`);
  await expect(
    page.getByRole("status", { exact: true, name: "Announcements" }).filter({ hasText: `#${channel} marked read` }),
  ).toBeAttached();
});

test("Escape on an open identity card closes only the card", async ({ page }) => {
  const { channel } = await threadOpened(page, unique("browser-escape-card"));
  const author = inThread(page)
    .getByRole("article")
    .filter({ hasText: "The reply." })
    .getByRole("link", { exact: true, name: "admin" });
  await author.focus();
  const card = page.getByRole("dialog", { exact: true, name: "admin" });

  await expect(card).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(card).toBeHidden();
  await expect(author).toBeFocused();
  await expect(inThread(page)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`#/channels/${channel}/threads/\\d+$`, "u"));
});

async function newChannelForm(page: Page): Promise<Locator> {
  await inSidebar(page).getByRole("button", { exact: true, name: "New channel" }).click();
  const form = page.getByRole("form", { exact: true, name: "New channel" });

  await expect(form.getByLabel("Name", { exact: true })).toBeFocused();

  return form;
}

test("Escape cancels a prompt form, from its field or its buttons", async ({ page }) => {
  await threadOpened(page, unique("browser-escape-prompt"));
  const form = await newChannelForm(page);
  await page.keyboard.type("half-a-name");
  await page.keyboard.press("Escape");

  await expect(form).toBeHidden();

  await newChannelForm(page);
  await form.getByRole("button", { exact: true, name: "Cancel" }).focus();
  await page.keyboard.press("Escape");

  await expect(form).toBeHidden();
});

test("Escape closes the profile panel and focus goes to the person that opened it", async ({ page }) => {
  const { friend } = await threadOpened(page, unique("browser-escape-profile"));
  await page.goto("/#/people");
  const row = page
    .getByRole("list", { exact: true, name: "Identities" })
    .getByRole("link", { exact: true, name: `${friend}, Offline` });
  await row.focus();
  await page.keyboard.press("Enter");

  await expect(inProfile(page)).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(inProfile(page)).toBeHidden();
  await expect(row).toBeFocused();
});
