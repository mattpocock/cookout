import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import { inPane, inThread } from "./regions.ts";
import type { Page } from "@playwright/test";
import { logInToChannels } from "./login.ts";
import { unique } from "./names.ts";

const WIDE = { height: 900, width: 1400 };
const TEXT = "An untitled thread";

async function channelOpen(page: Page): Promise<void> {
  const name = unique("browser-menu-title");
  const { token } = await newIdentity({ kind: "human", name });
  await adminClient().createChannel({ name });
  await adminClient().createMessage({ channel: name, text: TEXT });
  await page.setViewportSize(WIDE);
  await logInToChannels({ page, token });
  await page.goto(`/#/channels/${name}`);
}

async function savedAs(page: Page, title: string): Promise<void> {
  const box = inThread(page).getByRole("textbox", { exact: true, name: "Title" });

  await expect(box).toBeFocused();

  await box.fill(title);
  await box.press("Enter");

  await expect(inThread(page).getByRole("heading", { exact: true, level: 2, name: title })).toBeVisible();
}

async function addedByRightClick(page: Page, title: string): Promise<void> {
  await inPane(page).getByText(TEXT, { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { exact: true, name: "Add title" }).click();
  await savedAs(page, title);

  await expect(inPane(page).getByRole("heading", { exact: true, level: 3, name: title })).toBeVisible();
}

async function editedFromMenuKey(page: Page, title: string): Promise<string> {
  await page.getByRole("feed", { exact: true, name: "Messages" }).getByRole("article").focus();
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { exact: true, name: "Edit title" }).click();
  const box = inThread(page).getByRole("textbox", { exact: true, name: "Title" });

  await expect(box).toBeFocused();

  const held = await box.inputValue();
  await savedAs(page, title);
  return held;
}

test("a channel message's menu adds its thread's title by right-click, and edits it from Shift+F10", async ({
  page,
}) => {
  await channelOpen(page);
  await addedByRightClick(page, "Set from the menu");

  await expect(editedFromMenuKey(page, "Changed from the keyboard")).resolves.toBe("Set from the menu");
});
