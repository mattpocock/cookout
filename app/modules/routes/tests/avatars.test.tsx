import { adminClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { Message } from "../../sdk/index.ts";
import { openAt } from "./render.tsx";

interface Drawn {
  readonly agent: string | null;
  readonly hue: string;
  readonly tagged: boolean;
}

const ONE_COLOUR = 1;

function drawn(rows: () => readonly HTMLElement[]): readonly Drawn[] {
  const shown: Drawn[] = [];
  for (const row of rows()) {
    const avatar = within(row).getByTestId("avatar");
    shown.push({
      agent: avatar.dataset["agent"] ?? null,
      hue: avatar.className
        .split(" ")
        .filter((name) => name.startsWith("bg-[oklch"))
        .join(" "),
      tagged: within(row).queryByText("agent") !== null,
    });
  }
  return shown;
}

function messageRows(): readonly Drawn[] {
  const list = screen.getByRole("feed", { name: "Messages" });
  return drawn(() => within(list).getAllByRole("article"));
}

function threadRows(): readonly Drawn[] {
  const panel = screen.getByRole("complementary", { name: "Thread" });
  const parent = within(panel).getByRole("article", { name: "Parent message" });
  return drawn(() => [parent, ...within(within(panel).getByRole("feed", { name: "Replies" })).getAllByRole("article")]);
}

async function botThread(): Promise<Message> {
  const agent = await newIdentity({ kind: "agent", name: "web-avatar-bot" });
  await adminClient().createChannel({ name: "web-avatars" });
  const { message } = await agent.client.createMessage({ channel: "web-avatars", text: "Beep" });
  await adminClient().createMessage({ channel: "web-avatars", replyTo: message.id, text: "Hello bot" });
  return message;
}

async function goneAuthors(): Promise<void> {
  const owned = await newIdentity({ kind: "agent", name: "web-avatar-gone-bot", owner: "admin" });
  const person = await newIdentity({ kind: "human", name: "web-avatar-gone-human" });
  await adminClient().createChannel({ name: "web-avatars-gone" });
  await owned.client.createMessage({ channel: "web-avatars-gone", text: "Owned words" });
  await person.client.createMessage({ channel: "web-avatars-gone", text: "Human words" });
  await adminClient().deactivateIdentity("web-avatar-gone-bot");
  await adminClient().deactivateIdentity("web-avatar-gone-human");
}

it("an agent's messages are drawn as an agent's and a human's as a human's, one name in one colour everywhere", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const message = await botThread();
  const close = openAt({ client: adminClient(), hash: `#/channels/web-avatars/threads/${String(message.id)}` });

  await waitFor(() => {
    const rows = [...messageRows(), ...threadRows()];

    expect([
      rows.map((row) => [row.agent, row.tagged]),
      new Set(rows.filter((row) => row.tagged).map((row) => row.hue)).size,
    ]).toStrictEqual([
      [
        ["true", true],
        ["true", true],
        ["false", false],
      ],
      ONE_COLOUR,
    ]);
  });

  close();
});

it("a deactivated author is drawn as an agent if the message carries an owner, else as a human", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await goneAuthors();
  const close = openAt({ client: adminClient(), hash: "#/channels/web-avatars-gone" });

  await waitFor(() => {
    expect(messageRows().map((row) => [row.agent, row.tagged])).toStrictEqual([
      ["true", true],
      ["false", false],
    ]);
  });

  close();
});
