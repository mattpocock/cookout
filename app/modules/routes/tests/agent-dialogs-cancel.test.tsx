import { agentCard, choose } from "./agent-menu.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { inSettings, inSidebar } from "./regions.ts";
import { newIdentity } from "./identities.ts";
import { openAt } from "./render.tsx";

async function settingsOf(prefix: string): Promise<() => void> {
  const human = await newIdentity({ kind: "human", name: `${prefix}-human` });
  await newIdentity({ kind: "agent", name: `${prefix}-bot`, owner: `${prefix}-human` });
  const close = openAt({ client: human.client, hash: "#/people" });
  await screen.findByRole("list", { name: "Identities" });
  fireEvent.click(await inSidebar().findByRole("link", { name: "Settings" }));
  await inSettings().findByRole("heading", { level: 2, name: "My agents" });
  return close;
}

async function cancelIn(name: string, text: string): Promise<void> {
  const dialog = await screen.findByRole("dialog", { name });
  fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: text } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });
}

it("cancel on the New agent dialog closes it and creates nothing", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = await settingsOf("web-cancel-create");
  fireEvent.click(await inSettings().findByRole("button", { name: "New agent" }));
  await cancelIn("New agent", "web-cancel-create-new");
  await agentCard("web-cancel-create-bot");

  expect(inSettings().queryByRole("group", { name: "@web-cancel-create-new" })).toBeNull();

  close();
});

it("cancel on an agent's Edit display name dialog keeps its name as it was", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = await settingsOf("web-cancel-rename");
  await choose({ agent: "web-cancel-rename-bot", item: "Edit display name" });
  await cancelIn("Edit display name", "Never saved");

  expect(within(await agentCard("web-cancel-rename-bot")).queryByText(/Never saved/u)).toBeNull();

  close();
});
