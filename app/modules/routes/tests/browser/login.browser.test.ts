import { adminClient, newIdentity } from "./people.ts";
import { alertSaying, inSidebar } from "./regions.ts";
import { expect, test } from "@playwright/test";
import { logIn } from "./login.ts";
import { unique } from "./names.ts";

test("a human logs in with their token, sees the channel list and opens a channel", async ({ page }) => {
  await adminClient().createChannel({ description: "Where the browser test lands.", name: unique("browser-lobby") });
  await adminClient().createMessage({ channel: unique("browser-lobby"), text: "Welcome in" });

  const { token } = await newIdentity({ kind: "human", name: unique("browser-human") });
  await logIn({ page, token });
  await inSidebar(page)
    .getByRole("link", { name: `#${unique("browser-lobby")}` })
    .click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`#${unique("browser-lobby")}`);
  await expect(page.getByRole("feed", { name: "Messages" }).getByRole("article")).toContainText(["Welcome in"]);
});

test("the session cookie keeps a human logged in across a reload", async ({ page }) => {
  await adminClient().createChannel({ name: unique("browser-reload") });

  const { token } = await newIdentity({ kind: "human", name: unique("browser-reloader") });
  await logIn({ page, token });

  await expect(inSidebar(page).getByRole("link", { name: `#${unique("browser-reload")}` })).toBeVisible();

  await page.reload();

  await expect(inSidebar(page).getByRole("link", { name: `#${unique("browser-reload")}` })).toBeVisible();
});

test("an agent's token is refused, and the login form stays", async ({ page }) => {
  const { token } = await newIdentity({ kind: "agent", name: unique("browser-agent") });
  await logIn({ page, token });

  await expect(alertSaying({ page, start: "Couldn't log in" })).toHaveText(/^Couldn't log in \(human_only\)/u);
  await expect(page.getByRole("form", { name: "Log in" })).toBeVisible();
});
