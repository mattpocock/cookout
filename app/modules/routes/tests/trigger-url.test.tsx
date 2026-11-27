import { adminClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { openedBy, profileDot } from "./presence.ts";
import type { CookoutClient } from "../../sdk/index.ts";
import { inProfile } from "./regions.ts";

const WAKES = "Wakes on mention";
const UNREACHABLE_URL = "http://127.0.0.1:1/fire";

interface Owned {
  readonly owner: CookoutClient;
  readonly aide: string;
}

async function ownedAgent(prefix: string): Promise<Owned> {
  const owner = await newIdentity({ kind: "human", name: `${prefix}-owner` });
  await newIdentity({ kind: "agent", name: `${prefix}-bot`, owner: `${prefix}-owner` });
  return { aide: `${prefix}-bot`, owner: owner.client };
}

async function failedAgent(prefix: string): Promise<Owned> {
  const owned = await ownedAgent(prefix);
  await owned.owner.setTrigger(owned.aide, { token: "routine-secret", url: UNREACHABLE_URL });
  await adminClient().createChannel({ name: prefix });
  await adminClient().createMessage({ channel: prefix, text: `@${owned.aide} are you there?` });
  await waitFor(async () => {
    await expect(owned.owner.getTrigger(owned.aide)).resolves.toHaveProperty("trigger.lastResult.ok", false);
  });
  return owned;
}

async function skippedAgent(prefix: string): Promise<Owned> {
  const owner = await newIdentity({ kind: "human", name: `${prefix}-owner` });
  const agent = await newIdentity({ kind: "agent", name: `${prefix}-bot`, owner: `${prefix}-owner` });
  const aide = `${prefix}-bot`;
  await owner.client.setTrigger(aide, { token: "routine-secret", url: UNREACHABLE_URL });
  await agent.client.join({ as: aide });
  await adminClient().createChannel({ name: prefix });
  await adminClient().createMessage({ channel: prefix, text: `@${aide} are you there?` });
  await waitFor(async () => {
    await expect(owner.client.getTrigger(aide)).resolves.toHaveProperty(
      "trigger.lastResult.skipped",
      "agent_session_live",
    );
  });
  return { aide, owner: owner.client };
}

function triggerForm(aide: string): HTMLElement {
  return inProfile().getByRole("form", { name: `Trigger URL for @${aide}` });
}

it("the owner sets a trigger URL with a write-only token on the agent's profile, and the agent wakes on mention", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { aide, owner } = await ownedAgent("web-trigger-set");
  await openedBy({ client: owner, hash: `#/people/${aide}` });
  await inProfile().findByText("No trigger URL: a mention calls nothing.");
  const form = triggerForm(aide);
  fireEvent.change(within(form).getByLabelText("Trigger URL", { exact: false }), {
    target: { value: "https://routines.example.com/fire" },
  });
  fireEvent.change(within(form).getByLabelText("Token (write-only: never shown again)"), {
    target: { value: "routine-secret" },
  });
  fireEvent.click(within(form).getByRole("button", { name: "Save trigger URL" }));

  await expect(
    Promise.all([inProfile().findByText("Not called yet."), profileDot({ label: WAKES, who: aide })]),
  ).resolves.toStrictEqual([expect.anything(), { presence: "online", tooltip: WAKES }]);
  await expect(owner.getTrigger(aide)).resolves.toStrictEqual({
    trigger: { url: "https://routines.example.com/fire" },
  });
});

it("an agent whose trigger call fails shows Unreachable, and the owner's Clear takes the URL away", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { aide, owner } = await failedAgent("web-trigger-fail");
  await openedBy({ client: owner, hash: `#/people/${aide}` });
  const label = "Unreachable: the trigger URL couldn't be reached, just now";

  await expect(
    Promise.all([
      profileDot({ label, who: aide }),
      inProfile().findByText("Last call failed: the trigger URL couldn't be reached, just now"),
    ]),
  ).resolves.toStrictEqual([{ presence: "unreachable", tooltip: label }, expect.anything()]);

  fireEvent.click(within(triggerForm(aide)).getByRole("button", { name: "Clear" }));

  await expect(inProfile().findByText("No trigger URL: a mention calls nothing.")).resolves.toBeDefined();

  await waitFor(() => {
    expect(screen.queryByText("Unreachable", { exact: false })).toBeNull();
  });
});

it("a mention of a joined agent shows on its profile as a skipped call, not a failed one", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { aide, owner } = await skippedAgent("web-trigger-skip");
  await openedBy({ client: owner, hash: `#/people/${aide}` });

  await expect(
    inProfile().findByText("Last mention called nothing: the agent was joined, just now"),
  ).resolves.toBeDefined();
});

function filledWithHeaders(aide: string): HTMLElement {
  const form = triggerForm(aide);
  fireEvent.change(within(form).getByLabelText("Trigger URL", { exact: false }), {
    target: { value: "https://routines.example.com/fire" },
  });
  fireEvent.change(within(form).getByLabelText("Token (write-only: never shown again)"), {
    target: { value: "routine-secret" },
  });
  const headers = within(form).getByLabelText("Extra headers (values write-only)", { exact: false });
  fireEvent.change(headers, { target: { value: "anthropic-version: 2023-06-01\nX-Key: header-secret\n" } });
  return headers;
}

it("the owner adds extra headers with the trigger URL, and the form shows only their names", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { aide, owner } = await ownedAgent("web-trigger-headers");
  await openedBy({ client: owner, hash: `#/people/${aide}` });
  await inProfile().findByText("No trigger URL: a mention calls nothing.");
  const headers = filledWithHeaders(aide);
  fireEvent.click(within(triggerForm(aide)).getByRole("button", { name: "Save trigger URL" }));

  await expect(inProfile().findByText("Sends headers: anthropic-version, x-key")).resolves.toBeDefined();
  expect(headers).toHaveProperty("value", "");
  expect(document.body.innerHTML).not.toContain("header-secret");
  await expect(owner.getTrigger(aide)).resolves.toStrictEqual({
    trigger: { headerNames: ["anthropic-version", "x-key"], url: "https://routines.example.com/fire" },
  });
});

function savedAgain(aide: string): void {
  const form = triggerForm(aide);
  fireEvent.change(within(form).getByLabelText("Token (write-only: never shown again)"), {
    target: { value: "routine-secret-2" },
  });
  fireEvent.change(within(form).getByLabelText("Extra headers (values write-only)", { exact: false }), {
    target: { value: "anthropic-beta: experimental" },
  });
  fireEvent.click(within(form).getByRole("button", { name: "Save trigger URL" }));
}

it("saving again without editing the URL keeps it, and replaces every header", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { aide, owner } = await ownedAgent("web-trigger-resave");
  const first = { url: "https://routines.example.com/fire" };
  await owner.setTrigger(aide, { ...first, headers: [{ name: "x-key", value: "one" }], token: "routine-secret" });
  await openedBy({ client: owner, hash: `#/people/${aide}` });
  await inProfile().findByText("Sends headers: x-key");
  savedAgain(aide);

  await expect(inProfile().findByText("Sends headers: anthropic-beta")).resolves.toBeDefined();
  await expect(owner.getTrigger(aide)).resolves.toStrictEqual({
    trigger: { ...first, headerNames: ["anthropic-beta"] },
  });
});

it("the last call line follows a call made while the trigger form is open", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { aide, owner } = await ownedAgent("web-trigger-live");
  await owner.setTrigger(aide, { token: "routine-secret", url: UNREACHABLE_URL });
  await adminClient().createChannel({ name: "web-trigger-live" });
  await openedBy({ client: owner, hash: `#/people/${aide}` });
  await inProfile().findByText("Not called yet.");
  await adminClient().createMessage({ channel: "web-trigger-live", text: `@${aide} are you there?` });

  await expect(
    inProfile().findByText("Last call failed: the trigger URL couldn't be reached, just now"),
  ).resolves.toBeDefined();
});
