import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import { inPane } from "./regions.ts";
import { logIn } from "./login.ts";

const nowhere = "http://127.0.0.1:9/command";
const schema = { properties: { branch: { type: "string" } }, type: "object" } as const;

async function messageBoxIn(page: Page, channel: string): Promise<Locator> {
  await adminClient().createChannel({ name: channel });
  const { token } = await newIdentity({ kind: "human", name: `${channel}-writer` });
  await logIn({ page, token, url: `/#/channels/${channel}` });
  return inPane(page).getByLabel("Message", { exact: true });
}

async function activeOption(box: Locator): Promise<string | null> {
  const id = await box.getAttribute("aria-activedescendant");
  if (id === null) {
    return null;
  }
  return box.page().locator(`[id="${id}"]`).textContent();
}

async function twoCommands(prefix: string): Promise<void> {
  const admin = adminClient();
  await Promise.all(
    [`${prefix}-first`, `${prefix}-second`].map(async (name) => {
      await admin.createIdentity({ kind: "agent", name, owner: "admin" });
      await admin.addCommand({ name, schema, url: nowhere });
    }),
  );
}

function listIn(page: Page, name: string): Locator {
  return inPane(page).getByRole("listbox", { name });
}

test("typing @gr shows the mention list as a combobox's listbox, and Tab writes @grace", async ({ page }) => {
  await newIdentity({ kind: "human", name: "grace" });
  const box = await messageBoxIn(page, "browser-combobox-tab");
  await box.pressSequentially("@gr");

  await expect(inPane(page).getByRole("combobox", { name: "Message" })).toHaveAttribute("aria-expanded", "true");
  await expect(listIn(page, "Mention suggestions").getByRole("option", { selected: true })).toHaveText("@grace");
  await expect
    .poll(async () => {
      const active = await activeOption(box);
      return active;
    })
    .toBe("@grace");

  await page.keyboard.press("Tab");

  await expect(box).toHaveValue("@grace ");
  await expect(box).toBeFocused();
});

test("Escape closes the mention list and keeps the text, with focus still in the box", async ({ page }) => {
  await newIdentity({ kind: "human", name: "browser-combobox-escape-reader" });
  const box = await messageBoxIn(page, "browser-combobox-escape");
  await box.pressSequentially("Ping @browser-combobox-escape-r");

  await expect(listIn(page, "Mention suggestions")).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(listIn(page, "Mention suggestions")).toBeHidden();
  await expect(box).toHaveValue("Ping @browser-combobox-escape-r");
  await expect(box).toBeFocused();
});

test("typing / lists commands with the same roles, and the arrows move the active option", async ({ page }) => {
  await twoCommands("browser-combobox");
  const box = await messageBoxIn(page, "browser-combobox-command");
  await box.pressSequentially("/");

  await expect(listIn(page, "Command suggestions")).toBeVisible();

  await box.pressSequentially("browser-combobox-");

  await expect(listIn(page, "Command suggestions").getByRole("option")).toHaveText([
    "/browser-combobox-first",
    "/browser-combobox-second",
  ]);
  await expect
    .poll(async () => {
      const active = await activeOption(box);
      return active;
    })
    .toBe("/browser-combobox-first");

  await page.keyboard.press("ArrowDown");

  await expect(listIn(page, "Command suggestions").getByRole("option", { selected: true })).toHaveText(
    "/browser-combobox-second",
  );
  await expect
    .poll(async () => {
      const active = await activeOption(box);
      return active;
    })
    .toBe("/browser-combobox-second");
});

test("Escape closes the command list keeping the text, and Tab picks a command", async ({ page }) => {
  await twoCommands("browser-combo-keys");
  const box = await messageBoxIn(page, "browser-combobox-command-keys");
  await box.pressSequentially("/browser-combo-keys-");

  await expect(listIn(page, "Command suggestions").getByRole("option")).toHaveText([
    "/browser-combo-keys-first",
    "/browser-combo-keys-second",
  ]);

  await page.keyboard.press("Escape");

  await expect(listIn(page, "Command suggestions")).toBeHidden();
  await expect(box).toHaveValue("/browser-combo-keys-");

  await box.pressSequentially("s");
  await page.keyboard.press("Tab");

  await expect(page.getByRole("form", { name: "Call /browser-combo-keys-second" })).toBeVisible();
});
