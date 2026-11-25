import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import { hillsPng } from "../../../testing/index.ts";
import { inPane } from "./regions.ts";
import { logInToChannels } from "./login.ts";
import { unique } from "./names.ts";

const OUTSIDE = { left: 4, top: 4 } as const;
const NATURAL_WIDTH = 480;

interface Opened {
  readonly thumbnail: Locator;
  readonly dialog: Locator;
}

async function openChannelWithImage(page: Page, channel: string): Promise<Locator> {
  await adminClient().createChannel({ name: channel });
  const poster = await newIdentity({ kind: "human", name: `${channel}-ann` });
  await poster.client.createMessage({
    attachments: [{ bytes: hillsPng(), name: "hills.png" }],
    channel,
    text: "The view from the office",
  });
  await logInToChannels({ page, token: poster.token });
  await page.goto(`/#/channels/${channel}`);
  return inPane(page).getByRole("button", { name: "hills.png" });
}

async function openedFullSize(page: Page, channel: string): Promise<Opened> {
  const thumbnail = await openChannelWithImage(page, channel);
  await thumbnail.focus();
  await page.keyboard.press("Enter");
  return { dialog: page.getByRole("dialog", { name: "hills.png" }), thumbnail };
}

test("Enter on a thumbnail opens the image at full size, and Escape closes it, back on the thumbnail", async ({
  page,
}) => {
  const { dialog, thumbnail } = await openedFullSize(page, unique("browser-attachments-escape"));

  await expect(dialog.getByRole("img", { name: "hills.png" })).toHaveJSProperty("naturalWidth", NATURAL_WIDTH);

  await page.keyboard.press("Escape");

  await expect(dialog).toBeHidden();
  await expect(thumbnail).toBeFocused();
});

test("a click outside the full-size image closes it, back on the thumbnail", async ({ page }) => {
  const { dialog, thumbnail } = await openedFullSize(page, unique("browser-attachments-outside"));

  await expect(dialog.getByRole("img", { name: "hills.png" })).toBeVisible();

  await page.mouse.click(OUTSIDE.left, OUTSIDE.top);

  await expect(dialog).toBeHidden();
  await expect(thumbnail).toBeFocused();
});
