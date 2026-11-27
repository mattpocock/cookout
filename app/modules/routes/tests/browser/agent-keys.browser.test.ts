import type { Locator, Page } from "@playwright/test";
import { test as base, expect } from "@playwright/test";
import { copiesRecorded, tokenCopied } from "./walk.ts";
import { createTestAgent } from "../../../testing/index.ts";
import { inPane } from "./regions.ts";
import { logIn } from "./login.ts";
import { newIdentity } from "./people.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const NARROW = { height: 800, width: 360 };
const NO_OVERFLOW = 0;

async function agentCard(page: Page, prefix: string): Promise<Locator> {
  const human = unique(`${prefix}-human`);
  const agent = unique(`${prefix}-bot`);
  const me = await newIdentity({ kind: "human", name: human });
  await createTestAgent({ by: me.client, name: agent });
  await logIn({ page, token: me.token, url: "/#/settings/agents" });
  const card = inPane(page).getByRole("group", { exact: true, name: `@${agent}` });

  await expect(card.getByRole("region", { exact: true, name: "Keys" })).toBeVisible();

  return card;
}

async function sidewaysScroll(page: Page): Promise<number> {
  const overflow = await page.evaluate(
    () => globalThis.document.documentElement.scrollWidth - globalThis.document.documentElement.clientWidth,
  );
  return overflow;
}

async function madeByKeys(page: Page, card: Locator): Promise<void> {
  await card.getByRole("textbox", { exact: true, name: "Key name" }).focus();
  await page.keyboard.type("narrow-ci");
  await page.keyboard.press("Tab");
  await page.keyboard.type("7d");
  await page.keyboard.press("Enter");

  await expect(card.getByRole("button", { exact: true, name: "Copy key" })).toBeFocused();
}

async function fullyShown(target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();

  await expect(target).toBeInViewport({ ratio: 1 });
}

test("on a narrow screen the Keys section, a key's Revoke, Make key and the new key's secret fit, with no sideways scroll", async ({
  page,
}) => {
  await copiesRecorded(page);
  await page.setViewportSize(NARROW);
  const card = await agentCard(page, "browser-keys-narrow");
  await madeByKeys(page, card);
  await page.keyboard.press("Enter");

  await expect(tokenCopied(page)).toBeAttached();

  await fullyShown(card.getByLabel("New agent key", { exact: true }));
  const revoke = card.getByRole("group", { exact: true, name: "narrow-ci" }).getByRole("button", {
    exact: true,
    name: "Revoke",
  });
  await fullyShown(revoke);

  await expect(sidewaysScroll(page)).resolves.toBe(NO_OVERFLOW);
});
