import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import { inPane, inProfile } from "./regions.ts";
import type { Identity } from "../../../sdk/index.ts";
import type { Page } from "@playwright/test";
import { logIn } from "./login.ts";
import { unique } from "./names.ts";

async function offeredOn(page: Page, identity: Identity): Promise<void> {
  const text = `@${identity.name} has had no activity for 30 days. Deactivate it?`;
  const offer = { cleared: false, id: 1, identity, quietDays: 30, raisedAt: identity.createdAt, text };
  await page.route("**/v1/inbox", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({
      body: body.replace('"deactivationOffers":[]', `"deactivationOffers":[${JSON.stringify(offer)}]`),
      response,
    });
  });
}

test("an offer row's name opens the identity's profile panel", async ({ page }) => {
  const ownerName = unique("browser-offers-owner");
  const agent = `${ownerName}/scout`;
  const owner = await newIdentity({ kind: "human", name: ownerName });
  const { identity } = await adminClient().createIdentity({ kind: "agent", name: agent, owner: ownerName });
  await offeredOn(page, identity);
  await logIn({ page, token: owner.token, url: "/#/inbox" });

  await inPane(page).getByRole("list", { name: "For you" }).getByRole("link", { name: agent }).click();

  await expect(page).toHaveURL(new RegExp(`#/inbox\\?profile=${ownerName}/scout$`, "u"));
  await expect(inProfile(page).getByRole("heading", { name: new RegExp(agent, "u") })).toBeVisible();
});
