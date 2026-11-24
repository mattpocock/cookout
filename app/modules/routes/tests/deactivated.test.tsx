import { adminClient, clientWith, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { inDialog, inPane, inProfile } from "./regions.ts";
import { rowsOf, subscribedReader } from "./inbox-reader.ts";
import type { CookoutClient } from "../../sdk/index.ts";
import { openAt } from "./render.tsx";

const ONE = 1;

interface Crew {
  readonly human: CookoutClient;
  readonly bot: CookoutClient;
}

async function crewOf(prefix: string): Promise<Crew> {
  const human = await newIdentity({ kind: "human", name: `${prefix}-human` });
  const bot = await newIdentity({ kind: "agent", name: `${prefix}-bot`, owner: `${prefix}-human` });
  await human.client.setDisplayName(`${prefix}-bot`, "Release Bot");
  return { bot: bot.client, human: human.client };
}

function textsOf(elements: () => readonly HTMLElement[]): readonly string[] {
  const texts: string[] = [];
  for (const element of elements()) {
    texts.push(element.textContent);
  }
  return texts;
}

function rowNames(): readonly string[] {
  return textsOf(() => within(screen.getByRole("list", { name: "Identities" })).getAllByRole("link"));
}

async function profileHeading(): Promise<string> {
  const panel = await screen.findByRole("complementary", { name: "Profile" });
  const heading = await within(panel).findByRole("heading", { level: 3 });
  return heading.textContent;
}

async function deactivateFromProfile(name: string): Promise<void> {
  fireEvent.click(await inProfile().findEnabledButton("Deactivate"));
  fireEvent.click(await inDialog().findByRole("button", { name: `Deactivate @${name}` }));
  await waitFor(async () => {
    await expect(profileHeading()).resolves.toBe(`${name}(deactivated)`);
  });
}

async function reactivateFromProfile(name: string): Promise<void> {
  fireEvent.click(inProfile().getByRole("button", { name: "Reactivate" }));
  fireEvent.click(await inDialog().findByRole("button", { name: `Reactivate @${name}` }));
}

it("a deactivated author keeps their display name on their messages, marked (deactivated)", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { bot } = await crewOf("web-off-author");
  await adminClient().createChannel({ name: "web-off-author" });
  await bot.createMessage({ channel: "web-off-author", text: "Deployed" });
  await adminClient().deactivateIdentity("web-off-author-bot");
  const close = openAt({ client: adminClient(), hash: "#/channels/web-off-author" });
  const messages = await screen.findByRole("feed", { name: "Messages" });

  await waitFor(() => {
    expect(within(messages).getByRole("article").textContent).toMatch(
      /Release Bot@web-off-author-bot\(deactivated\)agent.*Deployed/u,
    );
  });

  close();
});

it("an inbox row marks a deactivated author (deactivated)", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { poster, reader } = await subscribedReader("web-off-inbox");
  await poster.createMessage({ channel: "web-off-inbox", text: "Deployed" });
  await adminClient().deactivateIdentity("web-off-inbox-poster");
  const close = openAt({ client: reader, hash: "#/inbox" });

  await waitFor(() => {
    expect(rowsOf("Activity")).toStrictEqual([
      "#/inbox/web-off-inbox New in #web-off-inboxweb-off-inbox-poster(deactivated)posted in#web-off-inboxjust nowDeployed",
    ]);
  });

  close();
});

it("people leaves deactivated identities out until Show deactivated is pressed", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await crewOf("web-off-people");
  await adminClient().deactivateIdentity("web-off-people-bot");
  const close = openAt({ client: adminClient(), hash: "#/people" });
  fireEvent.change(await screen.findByLabelText("Filter by name"), { target: { value: "web-off-people" } });
  await waitFor(() => {
    expect(rowNames()).toHaveLength(ONE);
  });
  const hidden = rowNames();
  fireEvent.click(inPane().getByRole("switch", { name: "Show deactivated" }));

  expect([hidden, rowNames()]).toStrictEqual([
    ["web-off-people-humanHuman"],
    [
      "Release Bot@web-off-people-bot(deactivated)agentAgent · owned by web-off-people-human",
      "web-off-people-humanHuman",
    ],
  ]);

  close();
});

it("an admin deactivates and reactivates from a profile, and the fresh token shows once", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await crewOf("web-off-profile");
  const close = openAt({ client: adminClient(), hash: "#/people/web-off-profile-human" });
  await deactivateFromProfile("web-off-profile-human");
  const { identities } = await adminClient().listIdentities({ include: "deactivated" });
  await reactivateFromProfile("web-off-profile-human");
  const token = await screen.findByLabelText("New Identity token");
  const { identity } = await clientWith(token.textContent).whoami();

  expect([
    identities.filter((each) => each.name.startsWith("web-off-profile")).map((each) => each.deactivated === true),
    identity.name,
    await profileHeading(),
  ]).toStrictEqual([[false, true], "web-off-profile-human", "web-off-profile-human"]);

  close();
});

it("deactivating a person asks without mentioning their agents, which stay active", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { bot } = await crewOf("web-off-person");
  const close = openAt({ client: adminClient(), hash: "#/people/web-off-person-human" });
  fireEvent.click(await inProfile().findEnabledButton("Deactivate"));
  const { textContent: asked } = await screen.findByRole("alertdialog", { name: "Deactivate @web-off-person-human?" });
  fireEvent.click(inDialog().getByRole("button", { name: "Deactivate @web-off-person-human" }));
  await waitFor(async () => {
    await expect(profileHeading()).resolves.toBe("web-off-person-human(deactivated)");
  });
  const { identity } = await bot.whoami();

  expect([asked.includes("agent"), identity.deactivated === true]).toStrictEqual([false, false]);

  close();
});

it("the @ suggestions leave out deactivated identities", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await crewOf("web-off-suggest");
  await adminClient().deactivateIdentity("web-off-suggest-bot");
  await adminClient().createChannel({ name: "web-off-suggest" });
  const close = openAt({ client: adminClient(), hash: "#/channels/web-off-suggest" });
  fireEvent.change(await screen.findByLabelText("Message"), { target: { value: "@web-off-suggest" } });
  const list = await screen.findByRole("listbox", { name: "Mention suggestions" });

  expect(textsOf(() => within(list).getAllByRole("option"))).toStrictEqual(["@web-off-suggest-human"]);

  close();
});
