import { adminClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { inPane, inSidebar } from "./regions.ts";
import type { CookoutClient } from "../../sdk/index.ts";
import { createCookoutClient } from "../../sdk/index.ts";
import { openAt } from "./render.tsx";
import { watched } from "./watched.ts";

interface NewChannel {
  readonly name: string;
  readonly description?: string;
}

async function openForm(): Promise<HTMLElement> {
  fireEvent.click(await inSidebar().findByRole("button", { name: "New channel" }));
  const form = await screen.findByRole("dialog", { name: "New channel" });
  return form;
}

function fieldNamed(name: string): HTMLInputElement {
  const field = screen.getByRole("textbox", { name });
  if (!(field instanceof HTMLInputElement)) {
    throw new TypeError(`${name} isn't an input.`);
  }
  return field;
}

async function submitNew(channel: NewChannel): Promise<void> {
  const dialog = await openForm();
  fireEvent.change(fieldNamed("Name"), { target: { value: channel.name } });
  fireEvent.change(fieldNamed("Description"), { target: { value: channel.description ?? "" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
}

async function openWithChannel(client: CookoutClient, name: string): Promise<() => void> {
  await client.createChannel({ name });
  const close = openAt({ client, hash: "#/" });
  await inSidebar().findByRole("link", { name: `#${name}` });
  return close;
}

interface LiveChannel {
  readonly client: CookoutClient;
  readonly close: () => Promise<void>;
}

async function openLiveChannel(name: string): Promise<LiveChannel> {
  const { client } = await newIdentity({ kind: "human", name });
  await adminClient().createChannel({ name });
  const { live, stream } = watched(client);
  const unmount = openAt({ client, hash: `#/channels/${name}`, live });
  await inPane().findByRole("button", { name: "Subscribe", pressed: false });
  const events = await stream;
  return {
    client,
    close: async () => {
      unmount();
      await events.close();
    },
  };
}

const REFUSED = /^Couldn't create the channel/u;
const TOO_LONG = 501;

function refusedOn(name: string): boolean {
  return screen.queryByRole("textbox", { description: REFUSED, name }) !== null;
}

it("creating a channel from the sidebar adds it to the channel list and opens it", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const client = adminClient();
  const close = await openWithChannel(client, "web-create-earlier");

  await submitNew({ description: "Made in the web.", name: "web-create-made" });
  const heading = await screen.findByRole("heading", { level: 1, name: "#web-create-made" });
  const link = inSidebar().getByRole("link", { name: "#web-create-made" });
  const { channel } = await client.getChannel("web-create-made");

  expect([
    heading.textContent,
    link.getAttribute("href"),
    inSidebar().getByRole("link", { name: "#web-create-earlier" }).textContent,
    globalThis.location.hash,
    channel.description,
    screen.queryByRole("dialog", { name: "New channel" }),
  ]).toStrictEqual([
    "#web-create-made",
    "#/channels/web-create-made",
    "#web-create-earlier",
    "#/channels/web-create-made",
    "Made in the web.",
    null,
  ]);

  close();
});

it("a channel created from the sidebar opens with its Subscribe toggle on", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const client = adminClient();
  const close = await openWithChannel(client, "web-create-before-subscribed");

  await submitNew({ name: "web-create-subscribed" });
  await screen.findByRole("heading", { level: 1, name: "#web-create-subscribed" });
  const toggle = await inPane().findByRole("button", { name: "Subscribed", pressed: true });
  const { channels } = await client.listSubscribedChannels();

  expect([toggle.textContent, channels.some(({ name }) => name === "web-create-subscribed")]).toStrictEqual([
    "Subscribed",
    true,
  ]);

  close();
});

it("subscribing or unsubscribing in another session flips the open channel's toggle", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { client, close } = await openLiveChannel("web-create-other-tab");

  await client.subscribe("web-create-other-tab");
  const { textContent: on } = await inPane().findByRole("button", { name: "Subscribed", pressed: true });
  await client.unsubscribe("web-create-other-tab");
  const { textContent: off } = await inPane().findByRole("button", { name: "Subscribe", pressed: false });

  expect([on, off]).toStrictEqual(["Subscribed", "Subscribe"]);

  await close();
});

it("a taken channel name is refused beside the name field, keeping what was typed", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const client = adminClient();
  await client.createChannel({ name: "web-create-taken" });
  const close = openAt({ client, hash: "#/" });

  await submitNew({ description: "A second try.", name: "web-create-taken" });
  const note = await screen.findByText(/channel_exists/u);

  expect([
    note.textContent,
    refusedOn("Name"),
    fieldNamed("Name").value,
    fieldNamed("Description").value,
  ]).toStrictEqual([
    "Couldn't create the channel (channel_exists): The channel web-create-taken already exists.",
    true,
    "web-create-taken",
    "A second try.",
  ]);

  close();
});

it("a channel name that breaks the name rules is refused beside the name field", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = openAt({ client: adminClient(), hash: "#/" });

  await submitNew({ name: "Not A Name" });
  await screen.findByText(/invalid_request/u);

  expect([refusedOn("Name"), refusedOn("Description"), fieldNamed("Name").value]).toStrictEqual([
    true,
    false,
    "Not A Name",
  ]);

  close();
});

it("a description that's too long is refused beside the description field", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = openAt({ client: adminClient(), hash: "#/" });

  await submitNew({ description: "x".repeat(TOO_LONG), name: "web-create-long" });
  await screen.findByText(/invalid_request/u);

  expect([refusedOn("Description"), refusedOn("Name")]).toStrictEqual([true, false]);

  close();
});

it("cancelling the New channel dialog closes it without creating anything", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const client = adminClient();
  const close = openAt({ client, hash: "#/" });

  const dialog = await openForm();
  fireEvent.change(fieldNamed("Name"), { target: { value: "web-create-cancelled" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  const { channels } = await client.listChannels();

  expect([
    screen.queryByRole("dialog", { name: "New channel" }),
    channels.some((channel) => channel.name === "web-create-cancelled"),
  ]).toStrictEqual([null, false]);

  close();
});

it("a server that can't be reached is refused beside the name field", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const unreachable = createCookoutClient({ env: {}, token: "cookout_any", url: "http://127.0.0.1:1" });
  const close = openAt({ client: { ...adminClient(), createChannel: unreachable.createChannel }, hash: "#/" });

  await submitNew({ name: "web-create-unreachable" });
  await screen.findByText(/unreachable/u);

  expect([refusedOn("Name"), fieldNamed("Name").value]).toStrictEqual([true, "web-create-unreachable"]);

  close();
});

it("the New channel button is a plus on the Channels heading's line, and says when its dialog is open", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = openAt({ client: adminClient(), hash: "#/" });
  const button = await inSidebar().findByRole("button", { name: "New channel" });
  const heading = inSidebar().getByRole("heading", { level: 2, name: "Channels" });
  const closed = button.getAttribute("aria-expanded");
  await openForm();

  expect([
    button.parentElement === heading.parentElement,
    button.textContent,
    closed,
    button.getAttribute("aria-expanded"),
  ]).toStrictEqual([true, "", "false", "true"]);

  close();
});
