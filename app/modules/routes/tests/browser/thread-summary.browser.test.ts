import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import { inPane, inSidebar } from "./regions.ts";
import { logIn } from "./login.ts";
import { unique } from "./names.ts";

interface Look {
  readonly arrow: boolean;
  readonly lastReply: boolean;
  readonly viewThread: boolean;
  readonly width: number;
}

async function lookOf(link: Locator): Promise<Look> {
  const box = await link.boundingBox();
  if (box === null) {
    throw new Error("Not shown");
  }
  return {
    arrow: await link.getByText("→").isVisible(),
    lastReply: await link.getByText(/^Last reply/u).isVisible(),
    viewThread: await link.getByText("View thread").isVisible(),
    width: box.width,
  };
}

async function openSummary(page: Page, channel: string): Promise<Locator> {
  await adminClient().createChannel({ name: channel });
  const { message: parent } = await adminClient().createMessage({ channel, text: "Ship it?" });
  await adminClient().createMessage({ channel, replyTo: parent.id, text: "Yes" });
  const reader = await newIdentity({ kind: "human", name: unique("browser-summary-reader") });
  await logIn({ page, token: reader.token });
  await inSidebar(page)
    .getByRole("link", { name: `#${channel}` })
    .click();
  const link = inPane(page).getByRole("link", { name: /View thread/u });

  await expect(link).toBeVisible();

  return link;
}

test("hovering a thread's summary keeps its last reply text, adds an arrow, and never makes it narrower", async ({
  page,
}) => {
  const link = await openSummary(page, unique("browser-reply-arrow"));
  const atRest = await lookOf(link);
  await link.hover();

  await expect(link.getByText("→")).toBeVisible();

  const hovered = await lookOf(link);

  expect([atRest, { ...hovered, wider: hovered.width >= atRest.width }]).toStrictEqual([
    { arrow: false, lastReply: true, viewThread: false, width: atRest.width },
    { arrow: true, lastReply: true, viewThread: false, wider: true, width: hovered.width },
  ]);
});
