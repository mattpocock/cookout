import { adminClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { openAt } from "./render.tsx";

const MENTIONS = { name: "Mention suggestions" };

async function openChannel(channel: string): Promise<() => void> {
  await adminClient().createChannel({ name: channel });
  const close = openAt({ client: adminClient(), hash: `#/channels/${channel}` });
  await screen.findByLabelText("Message");
  return close;
}

function type(text: string): void {
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: text } });
}

function press(key: string): void {
  fireEvent.keyDown(screen.getByLabelText("Message"), { key });
}

interface Combobox {
  readonly expanded: string | null;
  readonly controls: boolean;
  readonly active: boolean;
  readonly chosen: string | null;
}

function comboboxNow(): Combobox {
  const box = screen.getByRole("combobox", { name: "Message" });
  const list = screen.getByRole("listbox", MENTIONS);
  const selected = within(list).getByRole("option", { selected: true });
  return {
    active: box.getAttribute("aria-activedescendant") === selected.id,
    chosen: selected.textContent,
    controls: box.getAttribute("aria-controls") === list.id,
    expanded: box.getAttribute("aria-expanded"),
  };
}

async function mentionListFor(channel: string): Promise<() => void> {
  await newIdentity({ kind: "human", name: `combobox-${channel}-first` });
  await newIdentity({ kind: "human", name: `combobox-${channel}-second` });
  const close = await openChannel(`web-combobox-${channel}`);
  type(`Ping @combobox-${channel}-`);
  await screen.findByRole("listbox", MENTIONS);
  return close;
}

it("while the mention list shows, the box is a combobox that controls a listbox, and its active option follows the arrows", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = await mentionListFor("roles");
  const first = comboboxNow();
  press("ArrowDown");
  const moved = comboboxNow();
  press("ArrowUp");

  expect([first, moved, comboboxNow()]).toStrictEqual([
    { active: true, chosen: "@combobox-roles-first", controls: true, expanded: "true" },
    { active: true, chosen: "@combobox-roles-second", controls: true, expanded: "true" },
    { active: true, chosen: "@combobox-roles-first", controls: true, expanded: "true" },
  ]);

  close();
});

it("with no suggestions showing, the message box is a plain text box again", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = await mentionListFor("closed");
  press("Escape");

  expect([
    screen.queryByRole("listbox", MENTIONS),
    screen.queryByRole("combobox", { name: "Message" }),
    screen.getByRole("textbox", { name: "Message" }).getAttribute("aria-activedescendant"),
  ]).toStrictEqual([null, null, null]);

  close();
});
