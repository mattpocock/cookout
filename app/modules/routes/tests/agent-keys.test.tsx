import { adminClient, clientWith, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { inDialog, inSettings, inSidebar } from "./regions.ts";
import type { CookoutClient } from "../../sdk/index.ts";
import { openAt } from "./render.tsx";
import { refusalOf } from "../../sdk/index.ts";

interface Crew {
  readonly human: CookoutClient;
  readonly agent: string;
}

async function crewOf(prefix: string): Promise<Crew> {
  const human = await newIdentity({ kind: "human", name: `${prefix}-human` });
  await newIdentity({ kind: "agent", name: `${prefix}-bot`, owner: `${prefix}-human` });
  return { agent: `${prefix}-bot`, human: human.client };
}

async function toSettings(): Promise<void> {
  fireEvent.click(await inSidebar().findByRole("link", { name: "Settings" }));
  await inSettings().findByRole("heading", { level: 2, name: "My agents" });
}

async function openSettings(client: CookoutClient): Promise<() => void> {
  const close = openAt({ client, hash: "#/people" });
  await screen.findByRole("list", { name: "Identities" });
  await toSettings();
  return close;
}

async function keysOf(agent: string): Promise<HTMLElement> {
  const card = await screen.findByRole("group", { name: `@${agent}` });
  const keys = await within(card).findByRole("region", { name: "Keys" });
  return keys;
}

async function makeKey(agent: string, name: string): Promise<string> {
  const form = within(await keysOf(agent)).getByRole("form", { name: `Make a key for @${agent}` });
  fireEvent.change(within(form).getByRole("textbox", { name: "Key name" }), { target: { value: name } });
  fireEvent.change(within(form).getByRole("textbox", { name: /^Expires in/u }), { target: { value: "30d" } });
  fireEvent.click(within(form).getByRole("button", { name: "Make key" }));
  const secret = await within(await keysOf(agent)).findByLabelText("New agent key");
  return secret.textContent;
}

async function nameWith(token: string): Promise<string> {
  const { identity } = await clientWith(token).whoami();
  return identity.name;
}

async function refusalWith(client: CookoutClient): Promise<string> {
  try {
    await client.whoami();
    return "accepted";
  } catch (error: unknown) {
    return refusalOf(error).code;
  }
}

interface Opened {
  readonly close: () => void;
  readonly panel: HTMLElement;
}

async function openProfile(client: CookoutClient, agent: string): Promise<Opened> {
  const close = openAt({ client, hash: `#/people/${agent}` });
  const panel = await screen.findByRole("complementary", { name: "Profile" });
  await within(panel).findByRole("heading", { level: 3 });
  return { close, panel };
}

interface Shown {
  readonly secret: string;
  readonly warning: string;
  readonly detail: string;
}

async function madeAndShown(agent: string, name: string): Promise<Shown> {
  const secret = await makeKey(agent, name);
  const shown = within(await keysOf(agent));
  const warning = shown.getByText(/won't be shown again/u).textContent;
  const row = await shown.findByRole("group", { name });
  return { detail: within(row).getByText(/^made /u).textContent, secret, warning };
}

async function reopenedKeys(agent: string, name: string): Promise<HTMLElement> {
  fireEvent.click(await inSidebar().findByRole("link", { name: "People & agents" }));
  await screen.findByRole("list", { name: "Identities" });
  await toSettings();
  const keys = await keysOf(agent);
  await within(keys).findByRole("group", { name });
  return keys;
}

it("the owner makes a key and sees its secret once, the list shows it, and reopening the card shows no secret", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { agent, human } = await crewOf("web-keys-make");
  const close = await openSettings(human);
  const { detail, secret, warning } = await madeAndShown(agent, "github-actions");
  const reopened = await reopenedKeys(agent, "github-actions");

  expect([await nameWith(secret), warning, detail, within(reopened).queryByLabelText("New agent key")]).toStrictEqual([
    agent,
    "Copy it now: it won't be shown again.",
    expect.stringMatching(/^made .+ · never used · expires .+/u),
    null,
  ]);

  close();
});

it("done on a new key's secret never shows it again", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { agent, human } = await crewOf("web-keys-done");
  const close = await openSettings(human);
  await makeKey(agent, "ci");
  fireEvent.click(within(await keysOf(agent)).getByRole("button", { name: "Done" }));

  await waitFor(async () => {
    expect(within(await keysOf(agent)).queryByLabelText("New agent key")).toBeNull();
  });

  close();
});

async function madeAndDone(agent: string, name: string): Promise<string> {
  const secret = await makeKey(agent, name);
  fireEvent.click(within(await keysOf(agent)).getByRole("button", { name: "Done" }));
  return secret;
}

async function revokedIn(agent: string, name: string): Promise<string> {
  const keys = within(await keysOf(agent));
  fireEvent.click(within(await keys.findByRole("group", { name })).getByRole("button", { name: "Revoke" }));
  const { textContent } = await inDialog().findByRole("heading", { name: `Revoke the key ${name}?` });
  fireEvent.click(inDialog().getByRole("button", { name: "Revoke key" }));
  await waitFor(() => {
    expect(keys.queryByRole("group", { name })).toBeNull();
  });
  return textContent;
}

it("revoke on a key asks first, ends it, and the list reloads without it", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { agent, human } = await crewOf("web-keys-revoke");
  const close = await openSettings(human);
  const secret = await madeAndDone(agent, "deploy");
  const before = await refusalWith(clientWith(secret));
  const title = await revokedIn(agent, "deploy");

  expect([before, title, await refusalWith(clientWith(secret))]).toStrictEqual([
    "accepted",
    "Revoke the key deploy?",
    "token_revoked",
  ]);

  close();
});

async function adminSees(agent: string): Promise<readonly unknown[]> {
  const asAdmin = await openProfile(adminClient(), agent);
  const keys = await within(asAdmin.panel).findByRole("region", { name: "Keys" });
  const row = await within(keys).findByRole("group", { name: "service" });
  const seen = [
    within(row).getByRole("button", { name: "Revoke" }).textContent,
    within(keys).queryByRole("form", { name: `Make a key for @${agent}` }),
  ];
  asAdmin.close();
  return seen;
}

it("an admin who isn't the owner sees the keys and Revoke but no Make key; another person sees no Keys section", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { agent, human } = await crewOf("web-keys-admin");
  await human.createAgentKey(agent, { name: "service" });
  const other = await newIdentity({ kind: "human", name: "web-keys-admin-other" });
  const seen = await adminSees(agent);
  const asOther = await openProfile(other.client, agent);

  expect([...seen, within(asOther.panel).queryByRole("region", { name: "Keys" })]).toStrictEqual([
    "Revoke",
    null,
    null,
  ]);

  asOther.close();
});
