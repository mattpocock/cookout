import { expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { inSettings, inSidebar } from "./regions.ts";
import type { CookoutClient } from "../../sdk/index.ts";
import { alertSaying } from "./alerts.ts";
import { newIdentity } from "./identities.ts";
import { openAt } from "./render.tsx";

async function openSettings(client: CookoutClient): Promise<() => void> {
  const close = openAt({ client, hash: "#/people" });
  await screen.findByRole("list", { name: "Identities" });
  fireEvent.click(await inSidebar().findByRole("link", { name: "Settings" }));
  await inSettings().findByRole("heading", { level: 2, name: "My agents" });
  return close;
}

async function createAgentIn(name: string, displayName: string): Promise<void> {
  const form = await screen.findByRole("form", { name: "Create an agent" });
  fireEvent.change(within(form).getByRole("textbox", { name: "New agent's name" }), { target: { value: name } });
  fireEvent.change(within(form).getByRole("textbox", { name: /^Its display name/u }), {
    target: { value: displayName },
  });
  fireEvent.click(within(form).getByRole("button", { name: "Create" }));
}

interface Created {
  readonly card: HTMLElement;
  readonly joining: string;
}

async function createdIn(name: string): Promise<Created> {
  await createAgentIn(name, " New bot ");
  const card = await screen.findByRole("group", { name: `@${name}` });
  const form = screen.getByRole("form", { name: "Create an agent" });
  const joining = await within(form).findByText(new RegExp(`cookout join --as ${name}`, "u"));
  return { card, joining: joining.textContent };
}

it("create makes an agent you own, with its display name, and shows no token but how it joins and Make key", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const human = await newIdentity({ kind: "human", name: "web-create-human" });
  const close = await openSettings(human.client);
  const { card, joining } = await createdIn("web-create-new");
  const { identities } = await human.client.listIdentities();

  expect([
    identities.find((each) => each.name === "web-create-new"),
    within(card).queryByLabelText("New Identity token"),
    within(card).getByRole("button", { name: "Make key" }).textContent,
    joining,
  ]).toStrictEqual([
    expect.objectContaining({ displayName: "New bot", kind: "agent", owner: "web-create-human" }),
    null,
    "Make key",
    "Created @web-create-new. Its harness joins with cookout join --as web-create-new, which you approve; for CI or a service, use Make key on its card.",
  ]);

  close();
});

it("a taken name is refused inline in the create form", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const human = await newIdentity({ kind: "human", name: "web-create-taken-human" });
  await newIdentity({ kind: "agent", name: "web-create-taken-bot", owner: "web-create-taken-human" });
  const close = await openSettings(human.client);
  await createAgentIn("web-create-taken-bot", "Taken bot");
  const alert = await alertSaying("Couldn't create the agent (identity_exists)");

  expect(screen.getByRole("form", { name: "Create an agent" }).contains(alert)).toBe(true);

  close();
});
