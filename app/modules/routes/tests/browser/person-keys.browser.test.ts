import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import { inPane, inProfile } from "./regions.ts";
import { logInToChannels } from "./login.ts";

const BOX = { name: "Message" } as const;
const TWO_PEOPLE = 2;
const NONE = 0;

interface Posted {
  readonly author: string;
  readonly mentioned: string;
}

interface Pair {
  readonly first: string;
  readonly second: string;
}

async function copiesRecorded(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "clipboard", {
      get: (): Pick<Clipboard, "writeText"> => ({
        writeText: async (text: string): Promise<void> => {
          globalThis.document.documentElement.dataset["copied"] = text;
          await Promise.resolve();
        },
      }),
    });
  });
}

async function postedAndOpen(page: Page, channel: string): Promise<Posted> {
  const author = `${channel}-author`;
  const mentioned = `${channel}-friend`;
  await adminClient().createChannel({ name: channel });
  await newIdentity({ kind: "human", name: mentioned });
  const poster = await newIdentity({ kind: "human", name: author });
  await poster.client.createMessage({ channel, text: `Say hi to @${mentioned}` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await logInToChannels({ page, token: reader.token, url: `/#/channels/${channel}` });
  return { author, mentioned };
}

function authorOf(page: Page, author: string): Locator {
  return page.getByRole("list", { name: "Messages" }).getByRole("link", { exact: true, name: author });
}

async function boxHolds(page: Page, name: string): Promise<void> {
  const text = `@${name} `;

  await expect(page.getByRole("textbox", BOX)).toBeFocused();
  await expect(page.getByRole("textbox", BOX)).toHaveValue(text);
  await expect(page.getByRole("textbox", BOX)).toHaveJSProperty("selectionStart", text.length);
}

async function peopleShown(page: Page): Promise<Pair> {
  const prefix = "browser-people-keys";
  const pair = { first: `${prefix}-ada`, second: `${prefix}-bea` };
  const reader = await newIdentity({ kind: "human", name: pair.first });
  await newIdentity({ kind: "human", name: pair.second });
  await logInToChannels({ page, token: reader.token, url: "/#/people" });
  await page.getByRole("textbox", { name: "Filter by name" }).fill(prefix);

  await expect(page.getByRole("list", { name: "Identities" }).getByRole("link")).toHaveCount(TWO_PEOPLE);

  return pair;
}

async function arrowsMove(page: Page, { first, second }: Pair): Promise<void> {
  const people = page.getByRole("list", { name: "Identities" });
  await inPane(page).getByRole("switch", { name: "Show deactivated" }).focus();
  await page.keyboard.press("Tab");

  await expect(people.getByRole("link", { name: first })).toBeFocused();

  await page.keyboard.press("ArrowDown");

  await expect(people.getByRole("link", { name: second })).toBeFocused();

  await page.keyboard.press("ArrowUp");

  await expect(people.getByRole("link", { name: first })).toBeFocused();

  await page.keyboard.press("ArrowDown");

  await expect(people.getByRole("link", { name: second })).toBeFocused();
}

test("one Tab enters the People list, arrows move between people, Tab leaves it, and Enter opens a profile", async ({
  page,
}) => {
  const pair = await peopleShown(page);
  await arrowsMove(page, pair);
  const people = page.getByRole("list", { name: "Identities" });
  await page.keyboard.press("Tab");

  await expect(people.locator(":focus")).toHaveCount(NONE);

  await page.keyboard.press("Shift+Tab");

  await expect(people.getByRole("link", { name: pair.second })).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(new RegExp(`#/people/${pair.second}$`, "u"));
  await expect(inProfile(page).getByRole("heading", { level: 3 })).toHaveText(pair.second);
});

test("m on a focused @name puts it in the message box with the cursor after it, and c copies it and says so", async ({
  page,
}) => {
  await copiesRecorded(page);
  const { mentioned } = await postedAndOpen(page, "browser-person-keys-mention");
  const mention = page.getByRole("list", { name: "Messages" }).getByRole("link", { name: `@${mentioned}` });
  await mention.focus();
  await page.keyboard.press("c");

  await expect(page.getByRole("status").filter({ hasText: `Copied @${mentioned}` })).toBeAttached();
  await expect(page.locator("html")).toHaveAttribute("data-copied", `@${mentioned}`);

  await mention.focus();
  await page.keyboard.press("m");
  await boxHolds(page, mentioned);
});

test("Tab to a message's author, then m, puts @author in the message box", async ({ page }) => {
  const { author } = await postedAndOpen(page, "browser-person-keys-author");
  await page.getByRole("list", { name: "Messages" }).getByRole("article").first().focus();
  await page.keyboard.press("Tab");

  await expect(authorOf(page, author)).toBeFocused();

  await page.keyboard.press("m");
  await boxHolds(page, author);
});

test("the person menu shows Enter, m and c beside View profile, Message and Copy name", async ({ page }) => {
  const { author } = await postedAndOpen(page, "browser-person-keys-menu");
  await authorOf(page, author).click({ button: "right" });
  const menu = page.getByRole("menu", { name: `@${author} actions` });

  await expect(menu.getByRole("menuitem", { name: "View profile" })).toContainText("Enter");
  await expect(menu.getByRole("menuitem", { name: "View profile" })).toHaveAttribute("aria-keyshortcuts", "Enter");
  await expect(menu.getByRole("menuitem", { name: "Message" })).toContainText("m");
  await expect(menu.getByRole("menuitem", { name: "Message" })).toHaveAttribute("aria-keyshortcuts", "m");
  await expect(menu.getByRole("menuitem", { name: "Copy name" })).toContainText("c");
  await expect(menu.getByRole("menuitem", { name: "Copy name" })).toHaveAttribute("aria-keyshortcuts", "c");
});

test("→ in the kind filter chooses Humans", async ({ page }) => {
  const reader = await newIdentity({ kind: "human", name: "browser-person-keys-kinds" });
  await logInToChannels({ page, token: reader.token, url: "/#/people" });
  const kinds = page.getByRole("radiogroup", { name: "Kind" });
  await kinds.getByRole("radio", { name: /^All/u }).focus();
  await page.keyboard.press("ArrowRight");

  await expect(kinds.getByRole("radio", { name: /^Humans/u })).toBeChecked();
  await expect(kinds.getByRole("radio", { name: /^Humans/u })).toBeFocused();
});

test("→ in the theme choice chooses Light", async ({ page }) => {
  const reader = await newIdentity({ kind: "human", name: "browser-person-keys-themes" });
  await logInToChannels({ page, token: reader.token, url: "/#/settings/theme" });
  const themes = page.getByRole("radiogroup", { name: "Theme" });
  await themes.getByRole("radio", { name: "System" }).focus();
  await page.keyboard.press("ArrowRight");

  await expect(themes.getByRole("radio", { name: "Light" })).toBeChecked();
  await expect(themes.getByRole("radio", { name: "Light" })).toBeFocused();
});
