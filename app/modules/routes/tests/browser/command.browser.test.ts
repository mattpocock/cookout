import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import type { CookoutClient } from "../../../sdk/index.ts";
import { createCookoutClient } from "../../../sdk/index.ts";
import { inSidebar } from "./regions.ts";
import { logInToChannels } from "./login.ts";

const schema = {
  properties: { branch: { description: "The branch to ship", minLength: 3, type: "string" } },
  required: ["branch"],
  type: "object",
} as const;
const nowhere = "http://127.0.0.1:9/command";
interface InChannel {
  readonly channel: string;
  readonly command: string;
}

interface Opened {
  readonly page: Page;
  readonly channel: string;
}

async function channelWithCommand({ channel, command }: InChannel): Promise<CookoutClient> {
  const admin = adminClient();
  await admin.createChannel({ name: channel });
  const { token } = await admin.createIdentity({ kind: "agent", name: command, owner: "admin" });
  await admin.addCommand({ description: "Ship a branch", name: command, schema, url: nowhere });
  return createCookoutClient({ token });
}

interface Typing {
  readonly page: Page;
  readonly text: string;
}

async function pickByKeyboard(page: Page): Promise<Locator> {
  await expect(page.getByRole("listbox", { name: "Command suggestions" }).getByRole("option")).toHaveText([
    "/browser-call-boxShip a branch",
  ]);

  await page.keyboard.press("Tab");
  return page.getByRole("form", { name: "Call /browser-call-box" }).getByRole("textbox", { name: "branch" });
}

async function typeAndSend({ page, text }: Typing): Promise<void> {
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}

async function openAsCaller({ channel, page }: Opened): Promise<void> {
  const { token } = await newIdentity({ kind: "human", name: "browser-command-caller" });
  await logInToChannels({ page, token });
  await inSidebar(page)
    .getByRole("link", { name: `#${channel}` })
    .click();
  await page.getByRole("textbox", { name: "Message" }).pressSequentially("/browser-call");
}

test("a command call and its result reply show their data", async ({ page }) => {
  const handler = await channelWithCommand({ channel: "browser-command-shows", command: "browser-show-call" });
  const { threadId } = await adminClient().callCommand("browser-show-call", {
    channel: "browser-command-shows",
    data: { branch: "main" },
  });
  await handler.createMessage({
    channel: "browser-command-shows",
    data: { status: "done" },
    replyTo: threadId,
    text: "Shipped main.",
  });

  const { token } = await newIdentity({ kind: "human", name: "browser-command-reader" });
  await logInToChannels({ page, token });
  await page.goto(`/#/channels/browser-command-shows/threads/${String(threadId)}`);

  await expect(
    page.getByRole("article", { name: "Parent message" }).getByLabel("Call to /browser-show-call"),
  ).toHaveText(JSON.stringify({ branch: "main" }));
  await expect(page.getByRole("feed", { name: "Replies" }).getByRole("article")).toContainText(["Shipped main."]);
});

test("a person calls a command from the message box by keyboard, and a refusal shows by its field", async ({
  page,
}) => {
  await channelWithCommand({ channel: "browser-command-call", command: "browser-call-box" });
  await openAsCaller({ channel: "browser-command-call", page });

  const branch = await pickByKeyboard(page);

  await expect(branch).toBeFocused();

  await typeAndSend({ page, text: "x" });

  await expect(branch).toHaveAccessibleDescription("must NOT have fewer than 3 characters The branch to ship");
  await expect(branch).toHaveValue("x");

  await typeAndSend({ page, text: "-main" });

  await expect(page.getByRole("feed", { name: "Messages" }).getByRole("article")).toContainText([
    `/browser-call-box${JSON.stringify({ branch: "x-main" })}`,
  ]);
  await expect(page.getByRole("textbox", { name: "Message" })).toHaveValue("");
});
