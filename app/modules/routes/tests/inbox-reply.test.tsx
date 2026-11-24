import type { CookoutClient, Message } from "../../sdk/index.ts";
import { adminClient, newIdentity, revocableView } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, waitFor, within } from "@testing-library/react";
import { inConversation, inThread } from "./regions.ts";
import { chose } from "./menus.ts";
import { openWithClockStopped } from "./clock.ts";
import { subscribedReader } from "./inbox-reader.ts";

interface Followed {
  readonly reader: CookoutClient;
  readonly parent: Message;
  readonly address: string;
}

function addressOf(parent: Message): string {
  return `#/inbox/${parent.channel}/${String(parent.id)}`;
}

async function followedWithNews(channel: string): Promise<Followed> {
  const { poster, reader } = await subscribedReader(channel);
  const { message: parent } = await poster.createMessage({ channel, text: "Deploy at noon?" });
  await reader.follow(parent.id);
  await poster.createMessage({ channel, replyTo: parent.id, text: "Any takers?" });
  return { address: addressOf(parent), parent, reader };
}

async function typed(text: string): Promise<HTMLElement> {
  const box = await inConversation().findByRole("textbox", { name: "Reply" });
  fireEvent.change(box, { target: { value: text } });
  return box;
}

async function sent(text: string): Promise<HTMLElement> {
  const box = await typed(text);
  fireEvent.click(await inConversation().findEnabledButton("Send"));
  return box;
}

async function suggested(): Promise<readonly (string | null)[]> {
  const list = await inConversation().findByRole("listbox", { name: "Mention suggestions" });
  const shown: (string | null)[] = [];
  for (const button of within(list).getAllByRole("option")) {
    shown.push(button.textContent);
  }
  return shown;
}

it("replying in a thread conversation posts into the thread, shows the reply and keeps the conversation", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const thread = await followedWithNews("web-inbox-reply");
  const unmount = openWithClockStopped({ client: thread.reader, hash: thread.address });
  await inConversation().findByText("Any takers?");
  const box = await sent("I'll take it");
  await inConversation().findByText("I'll take it");
  await waitFor(() => {
    expect(box).toHaveProperty("value", "");
  });
  const { replies } = await thread.reader.getThread(thread.parent.id);

  expect([replies.map((reply) => reply.text), globalThis.location.hash]).toStrictEqual([
    ["Any takers?", "I'll take it"],
    thread.address,
  ]);

  unmount();
});

const NONE = 0;
const MEMBERS = ["@inbox-member-dot", "@inbox-member-cy", "@inbox-member-bea"];

async function repliesBy(parent: Message, posters: readonly CookoutClient[]): Promise<void> {
  if (posters.length === NONE) {
    return;
  }
  const [first = adminClient(), ...rest] = posters;
  await first.createMessage({ channel: parent.channel, replyTo: parent.id, text: "Reply" });
  await repliesBy(parent, rest);
}

async function threadWithMembers(): Promise<Message> {
  await newIdentity({ kind: "human", name: "inbox-member-ada" });
  const starter = await newIdentity({ kind: "human", name: "inbox-member-bea" });
  const earlier = await newIdentity({ kind: "agent", name: "inbox-member-cy" });
  const latest = await newIdentity({ kind: "human", name: "inbox-member-dot" });
  await adminClient().createChannel({ name: "web-inbox-reply-members" });
  const { message } = await starter.client.createMessage({ channel: "web-inbox-reply-members", text: "Hi" });
  await repliesBy(message, [earlier.client, latest.client, adminClient()]);
  return message;
}

it("in a thread conversation, typing @ lists the thread's members first, most recent poster first", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const unmount = openWithClockStopped({ client: adminClient(), hash: addressOf(await threadWithMembers()) });
  await inConversation().findByText("Hi");
  await typed("Ping @inbox-member");

  await expect(suggested()).resolves.toStrictEqual([...MEMBERS, "@inbox-member-ada"]);

  unmount();
});

it("a draft typed in a thread conversation is in the thread panel's box when the thread is opened", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const thread = await followedWithNews("web-inbox-reply-draft");
  const unmount = openWithClockStopped({ client: thread.reader, hash: thread.address });
  await inConversation().findByText("Any takers?");
  await typed("Half written");
  fireEvent.click(inConversation().getByRole("link", { name: "Open thread" }));
  const box = await inThread().findByRole("textbox", { name: "Reply" });

  expect(box).toHaveProperty("value", "Half written");

  unmount();
});

async function messageSaying(text: string): Promise<HTMLElement> {
  const shown = await inConversation().findByText(text);
  const article = shown.closest("article");
  if (article === null) {
    throw new TypeError(`No message saying ${text}`);
  }
  return article;
}

it("reply on a message in a thread conversation mentions its author in the box", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const thread = await followedWithNews("web-inbox-reply-mention");
  const unmount = openWithClockStopped({ client: thread.reader, hash: thread.address });
  fireEvent.contextMenu(await messageSaying("Any takers?"));
  await chose("Reply");
  const box = inConversation().getByRole("textbox", { name: "Reply" });

  await waitFor(() => {
    expect(box).toHaveProperty("value", "@web-inbox-reply-mention-poster ");
  });

  unmount();
});

interface Refused {
  readonly writer: Awaited<ReturnType<typeof revocableView>>;
  readonly address: string;
}

async function refusedWriter(): Promise<Refused> {
  await adminClient().createChannel({ name: "web-inbox-reply-refused" });
  const { message } = await adminClient().createMessage({ channel: "web-inbox-reply-refused", text: "Hello" });
  const writer = await revocableView({
    methods: ["createMessage"],
    revoked: "web-inbox-reply-rotated",
    viewer: "web-inbox-reply-viewer",
  });
  return { address: addressOf(message), writer };
}

it("a refused reply in a thread conversation keeps its text and shows the refusal", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { address, writer } = await refusedWriter();
  const unmount = openWithClockStopped({ client: writer.client, hash: address });
  await inConversation().findByText("Hello");
  await writer.rotateToken();
  const box = await sent("Too late");
  const alert = await inConversation().findByRole("alert");

  expect(alert.textContent).toMatch(/^Couldn't post the reply \(token_revoked\)/u);
  expect(box).toHaveProperty("value", "Too late");

  unmount();
});
