import { expect, test } from "@playwright/test";
import { inPane, inSidebar } from "./regions.ts";
import type { Page } from "@playwright/test";
import { adminClient } from "./people.ts";
import { logIn } from "./login.ts";
import { unique } from "./names.ts";

interface Mentioning {
  readonly reviewers: string;
  readonly token: string;
}

async function threadIn(channel: string): Promise<void> {
  const admin = adminClient();
  await admin.createChannel({ name: channel });
  await admin.createMessage({ channel, text: "Who can review this?" });
}

async function openThread(page: Page, token: string, channel: string): Promise<void> {
  await logIn({ page, token });
  await inSidebar(page)
    .getByRole("link", { name: `#${channel}` })
    .click();
  await page.getByRole("article").hover();
  await inPane(page).getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Reply" }).click();
}

async function mentionerAndReviewers(): Promise<Mentioning> {
  const admin = adminClient();
  const reviewers = unique("browser-reviewer");
  const { token } = await admin.createIdentity({ kind: "human", name: unique("browser-mentioner") });
  await admin.createIdentity({ kind: "agent", name: `${reviewers}-bot` });
  await admin.createIdentity({ kind: "human", name: `${reviewers}-ada` });
  await threadIn(unique("browser-composer"));
  return { reviewers, token };
}

test("typing @ and a prefix in the reply box suggests the matching identities, and choosing one inserts the mention", async ({
  page,
}) => {
  const { reviewers, token } = await mentionerAndReviewers();

  await openThread(page, token, unique("browser-composer"));
  const box = page.getByRole("textbox", { exact: true, name: "Reply" });
  await box.pressSequentially(`Could @${reviewers}`);
  const suggestions = page.getByRole("listbox", { name: "Mention suggestions" });

  await expect(suggestions.getByRole("option")).toHaveText([`@${reviewers}-ada`, `@${reviewers}-bot`]);

  await suggestions.getByRole("option", { name: `@${reviewers}-bot` }).click();
  await page.keyboard.type("look?");

  await expect(box).toHaveValue(`Could @${reviewers}-bot look?`);
  await expect(suggestions).toBeHidden();
});
