import type { Locator, Page } from "@playwright/test";
import type { Relay, RelayFixtures, RelayOptions } from "./relay.ts";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, inSidebar, inThread } from "./regions.ts";
import type { Message } from "../../../sdk/index.ts";
import type { Person } from "./people.ts";
import { logInWithStream } from "./login.ts";
import { relayFixtures } from "./relay.ts";

const test = base.extend<RelayFixtures & RelayOptions>(relayFixtures);

const CHANNEL = "browser-catch-up";
const OTHER = "browser-catch-up-other";
const PAGE_MARK = "cookoutCatchUpMark";

interface Reading {
  readonly parent: Message;
  readonly poster: Person;
  readonly reader: Person;
}

async function reading(): Promise<Reading> {
  const admin = adminClient();
  await Promise.all([admin.createChannel({ name: CHANNEL }), admin.createChannel({ name: OTHER })]);
  const poster = await newIdentity({ kind: "agent", name: `${CHANNEL}-poster` });
  const reader = await newIdentity({ kind: "human", name: `${CHANNEL}-reader` });
  await Promise.all([reader.client.subscribe(CHANNEL), reader.client.subscribe(OTHER)]);
  const { message: parent } = await poster.client.createMessage({ channel: CHANNEL, text: "Deploy at noon?" });
  return { parent, poster, reader };
}

function rowOf(page: Page, channel: string): Locator {
  return inSidebar(page).getByRole("link", { name: new RegExp(`^#${channel}(?![a-z-])`, "u") });
}

async function markPage(page: Page): Promise<void> {
  await page.evaluate((mark) => {
    Reflect.set(globalThis, mark, "kept");
  }, PAGE_MARK);
}

async function pageKept(page: Page): Promise<boolean> {
  const kept = await page.evaluate((mark) => Reflect.get(globalThis, mark) === "kept", PAGE_MARK);
  return kept;
}

async function cutWhile(page: Page, relay: Relay, work: () => Promise<void>): Promise<void> {
  const bar = page.getByRole("status", { name: "Live link" });
  await relay.cut();

  await expect(bar).toHaveText("Reconnecting…");

  await work();
  await relay.restore();

  await expect(bar).toHaveText("");
}

test("a message, a reply and an unread count from while the live link was down appear once it is back, with no reload", async ({
  page,
  relay,
}) => {
  const { parent, poster, reader } = await reading();
  await logInWithStream({
    page,
    token: reader.token,
    url: `${relay.url}/#/channels/${CHANNEL}/threads/${String(parent.id)}`,
  });

  await expect(inThread(page)).toContainText("Deploy at noon?");

  await markPage(page);

  await cutWhile(page, relay, async () => {
    await poster.client.createMessage({ channel: CHANNEL, text: "Or at one?" });
    await poster.client.createMessage({ channel: CHANNEL, replyTo: parent.id, text: "Noon works" });
    await poster.client.createMessage({ channel: OTHER, text: "Lunch?" });
  });

  await expect(inPane(page).getByRole("feed", { name: "Messages" })).toContainText("Or at one?");
  await expect(inThread(page).getByRole("feed", { name: "Replies" })).toContainText("Noon works");
  await expect(rowOf(page, OTHER)).toHaveAccessibleName(`#${OTHER} 1 unread`);
  await expect(rowOf(page, CHANNEL)).toHaveAccessibleName(`#${CHANNEL}`);
  await expect(pageKept(page)).resolves.toBe(true);
});
