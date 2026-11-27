import { adminClient, newIdentity } from "./identities.ts";
import { expect, it, onTestFinished, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { inDialog, inSettings, inSidebar } from "./regions.ts";
import type { CookoutClient } from "../../sdk/index.ts";
import { openAt } from "./render.tsx";

interface Crew {
  readonly human: CookoutClient;
  readonly agent: string;
}

async function crewOf(prefix: string): Promise<Crew> {
  const human = await newIdentity({ kind: "human", name: `${prefix}-human` });
  await newIdentity({ kind: "agent", name: `${prefix}-bot`, owner: `${prefix}-human` });
  return { agent: `${prefix}-bot`, human: human.client };
}

async function openSettings(client: CookoutClient): Promise<() => void> {
  const close = openAt({ client, hash: "#/people" });
  await screen.findByRole("list", { name: "Identities" });
  fireEvent.click(await inSidebar().findByRole("link", { name: "Settings" }));
  await inSettings().findByRole("heading", { level: 2, name: "My agents" });
  return close;
}

async function keysOf(agent: string): Promise<HTMLElement> {
  const card = await screen.findByRole("group", { name: `@${agent}` });
  const keys = await within(card).findByRole("region", { name: "Keys" });
  return keys;
}

interface Asked {
  readonly agent: string;
  readonly name: string;
  readonly expiresIn: string;
}

async function askForKey({ agent, expiresIn, name }: Asked): Promise<void> {
  const form = within(await keysOf(agent)).getByRole("form", { name: `Make a key for @${agent}` });
  fireEvent.change(within(form).getByRole("textbox", { name: "Key name" }), { target: { value: name } });
  fireEvent.change(within(form).getByRole("textbox", { name: /^Expires in/u }), { target: { value: expiresIn } });
  fireEvent.click(within(form).getByRole("button", { name: "Make key" }));
}

async function detailOf(agent: string, name: string): Promise<string> {
  const row = await within(await keysOf(agent)).findByRole("group", { name });
  return within(row).getByText(/^made /u).textContent;
}

it("a key made with no expiry never expires, and an expiry the board refuses says why", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { agent, human } = await crewOf("web-keys-expiry");
  const close = await openSettings(human);
  await askForKey({ agent, expiresIn: "", name: "forever" });
  const detail = await detailOf(agent, "forever");
  await askForKey({ agent, expiresIn: "soon", name: "later" });
  const refusal = await within(await keysOf(agent)).findByRole("alert");

  expect([detail, refusal.textContent]).toStrictEqual([
    expect.stringMatching(/ · never expires$/u),
    expect.stringMatching(/^Couldn't make the key \(.+\): .+/u),
  ]);

  close();
});

function stubClipboard(): ReturnType<typeof vi.fn<(text: string) => Promise<void>>> {
  const writeText = vi.fn<(text: string) => Promise<void>>(async () => {
    await Promise.resolve();
  });
  Object.defineProperty(globalThis.navigator, "clipboard", { configurable: true, value: { writeText } });
  onTestFinished(() => {
    Reflect.deleteProperty(globalThis.navigator, "clipboard");
  });
  return writeText;
}

it("copy key puts the new key's secret on the clipboard", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const writeText = stubClipboard();
  const { agent, human } = await crewOf("web-keys-copy");
  const close = await openSettings(human);
  await askForKey({ agent, expiresIn: "1d", name: "copied" });
  const secret = await within(await keysOf(agent)).findByLabelText("New agent key");
  fireEvent.click(within(await keysOf(agent)).getByRole("button", { name: "Copy key" }));

  await waitFor(() => {
    expect(writeText).toHaveBeenCalledWith(secret.textContent);
  });

  close();
});

async function revokeAsked(agent: string, name: string): Promise<void> {
  const row = await within(await keysOf(agent)).findByRole("group", { name });
  fireEvent.click(within(row).getByRole("button", { name: "Revoke" }));
  await inDialog().findByRole("heading", { name: `Revoke the key ${name}?` });
}

async function cancelled(agent: string, name: string): Promise<HTMLElement> {
  await revokeAsked(agent, name);
  fireEvent.click(inDialog().getByRole("button", { name: "Cancel" }));
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  const kept = await within(await keysOf(agent)).findByRole("group", { name });
  return kept;
}

async function refusedRevoke(agent: string): Promise<string> {
  await revokeAsked(agent, "gone");
  fireEvent.click(inDialog().getByRole("button", { name: "Revoke key" }));
  const refusal = await inDialog().findByRole("alert");
  return refusal.textContent;
}

it("cancel on a key's Revoke keeps it, and a key revoked elsewhere first says why", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { agent, human } = await crewOf("web-keys-gone");
  const { agentKey } = await human.createAgentKey(agent, { name: "gone" });
  const close = await openSettings(human);
  const kept = await cancelled(agent, "gone");
  await human.revokeAgentKey(agent, agentKey.id);

  expect([kept.getAttribute("aria-label"), await refusedRevoke(agent)]).toStrictEqual([
    "gone",
    expect.stringMatching(/^Couldn't revoke the key \(.+\): .+/u),
  ]);

  close();
});

async function revokedTwice(agent: string): Promise<void> {
  await revokeAsked(agent, "twice");
  const confirm = inDialog().getByRole("button", { name: "Revoke key" });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });
}

it("pressing Revoke key twice revokes the key once and closes the dialog", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { agent, human } = await crewOf("web-keys-twice");
  await human.createAgentKey(agent, { name: "twice" });
  const close = await openSettings(human);
  await revokedTwice(agent);

  expect(within(await keysOf(agent)).queryByRole("alert")).toBeNull();

  close();
});

async function settingsAgain(): Promise<void> {
  fireEvent.click(await inSidebar().findByRole("link", { name: "People & agents" }));
  await screen.findByRole("list", { name: "Identities" });
  fireEvent.click(await inSidebar().findByRole("link", { name: "Settings" }));
}

it("a card whose agent was given away meanwhile says it couldn't list the keys", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { agent, human } = await crewOf("web-keys-given");
  await newIdentity({ kind: "human", name: "web-keys-given-heir" });
  const close = await openSettings(human);
  await keysOf(agent);
  await adminClient().transferAgent(agent, "web-keys-given-heir");
  await settingsAgain();
  const refusal = await within(await keysOf(agent)).findByRole("alert");

  expect(refusal.textContent).toMatch(/^Couldn't list the keys \(.+\): .+/u);

  close();
});
