import { expect, test } from "@playwright/test";
import type { CookoutClient } from "../../../sdk/index.ts";
import type { Page } from "@playwright/test";
import { createCookoutClient } from "../../../sdk/index.ts";
import { inPane } from "./regions.ts";
import { logIn } from "./login.ts";
import { newIdentity } from "./people.ts";
import { unique } from "./names.ts";

interface Shot {
  readonly page: Page;
  readonly theme: "dark" | "light";
}

interface Opening {
  readonly baseURL: string | undefined;
  readonly page: Page;
}

interface Opened {
  readonly anonymous: CookoutClient;
  readonly started: Awaited<ReturnType<CookoutClient["startLogin"]>>;
}

async function screenshotIn({ page, theme }: Shot): Promise<void> {
  await page.evaluate((chosen) => {
    globalThis.localStorage.setItem("cookout-theme", chosen);
  }, theme);
  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect(page.getByLabel("Code")).toBeVisible();

  await page.screenshot({ path: test.info().outputPath(`approval-page-${theme}.png`) });
}

async function openApproval({ baseURL, page }: Opening): Promise<Opened> {
  const anonymous = createCookoutClient({ env: {}, url: baseURL ?? "" });
  const { token } = await newIdentity({ kind: "human", name: unique("browser-approver") });
  const started = await anonymous.startLogin({ host: "browser-laptop" });
  await logIn({ page, token });
  await page.goto(started.approvalPath);
  return { anonymous, started };
}

test("a human opens a login request's approval link, checks the code, and approves it", async ({ baseURL, page }) => {
  const { anonymous, started } = await openApproval({ baseURL, page });

  await expect(page.getByLabel("Code")).toHaveText(started.userCode);
  await expect(page.getByText(/^Requested by browser-laptop/u)).toBeVisible();

  await screenshotIn({ page, theme: "dark" });
  await screenshotIn({ page, theme: "light" });
  await inPane(page).getByRole("button", { name: "Approve" }).click();

  await expect(page.getByText(/^Approved\./u)).toBeVisible();
  await expect(anonymous.collectLogin(started.requestId)).resolves.toMatchObject({
    identity: { name: unique("browser-approver") },
    status: "approved",
  });
});
