import {
  LIST,
  buttonsOf,
  channelMade,
  listDialog,
  listOpened,
  listedLines,
  made,
  pressedIn,
  rowOf,
} from "./schedule-lists.ts";
import { adminClient, clientWith, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { CookoutClient } from "../../sdk/index.ts";
import { createTestAgent } from "../../testing/index.ts";

const EDIT = "Edit a scheduled message";
const CONTROLS = ["Pause", "Edit", "Delete"] as const;
const LONG = 12;

async function deactivatedMaker(channel: string): Promise<void> {
  const maker = await newIdentity({ kind: "human", name: `${channel}-maker` });
  await made({ by: maker.client, channel, text: "Their standup" });
  await adminClient().deactivateIdentity(`${channel}-maker`);
}

async function fieldsBoard(channel: string): Promise<void> {
  await channelMade(channel);
  await made({ by: adminClient(), channel, cron: "0 9 * * 1-5", text: "Standup" });
  await adminClient().createScheduledMessage({
    at: "2099-06-01T09:30",
    channel,
    text: "Deploy window",
    timeZone: "Europe/London",
  });
  const paused = await made({ by: adminClient(), channel, cron: "15 8 1 * *", text: "Invoices" });
  await adminClient().pauseScheduledMessage(paused.id);
  await made({ by: adminClient(), channel, cron: "0 9 21 6 *", text: "Midsummer" });
  await deactivatedMaker(channel);
}

it("the channel menu's Scheduled messages lists the channel's schedules, soonest next run first and paused ones last, each led by its timing", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-schedule-list-fields";
  await fieldsBoard(channel);
  const close = await listOpened({ channel, client: adminClient() });
  await rowOf("Their standup");
  const description = within(listDialog()).getByText(`Messages that post into #${channel} on a schedule.`);

  expect([description.textContent, await listedLines(channel)]).toStrictEqual([
    `Messages that post into #${channel} on a schedule.`,
    [
      ["Weekdays · 09:00", "Standup", expect.stringMatching(/^Next \w{3} \d{1,2} \w{3}, 09:00 UTC · by @admin$/u)],
      ["Cron 0 9 21 6 *", "Midsummer", expect.stringMatching(/^Next \w{3} 21 Jun, 09:00 UTC · by @admin$/u)],
      ["Once · Mon, 1 Jun 2099, 09:30", "Deploy window", "Next Mon 1 Jun, 09:30 Europe/London · by @admin"],
      ["Paused · Day 1 of each month · 08:15", "Invoices", "No next run · UTC · by @admin"],
      [
        "Paused: its creator was deactivated · Every day · 09:00",
        "Their standup",
        `No next run · UTC · by @${channel}-maker`,
      ],
    ],
  ]);

  close();
});

it("a schedule's text shows as a message does, clamped to two lines with the whole text as its tooltip", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-schedule-list-text";
  await channelMade(channel);
  const text = `Morning **all**, @admin: ${"the standup notes are in the doc. ".repeat(LONG).trimEnd()}`;
  await made({ by: adminClient(), channel, text });
  const close = await listOpened({ channel, client: adminClient() });
  const shown = await within(listDialog()).findByTitle(text);

  expect([
    shown.classList.contains("line-clamp-2"),
    within(shown).getByText("all").tagName,
    within(shown).getByRole("link", { name: "@admin" }).getAttribute("href"),
  ]).toStrictEqual([true, "STRONG", expect.stringMatching(/admin$/u)]);

  close();
});

it("a channel with nothing scheduled says so, and Close shuts the list", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const channel = "web-schedule-list-empty";
  await channelMade(channel);
  const close = await listOpened({ channel, client: adminClient() });
  const said = await within(listDialog()).findByText(`Nothing is scheduled in #${channel}.`);
  fireEvent.click(within(listDialog()).getByRole("button", { name: "Close" }));
  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: LIST })).toBeNull();
  });

  expect(said.textContent).toBe(`Nothing is scheduled in #${channel}.`);

  close();
});

type Viewer = "maker" | "owner" | "stranger" | "admin";

async function viewerClient(viewer: Viewer, channel: string): Promise<CookoutClient> {
  if (viewer === "admin") {
    return adminClient();
  }
  const { client } = await newIdentity({ kind: "human", name: `${channel}-${viewer}-viewer` });
  return client;
}

async function permissionBoard(channel: string): Promise<Readonly<Record<Viewer, CookoutClient>>> {
  await channelMade(channel);
  const [maker, owner, stranger] = await Promise.all([
    viewerClient("maker", channel),
    viewerClient("owner", channel),
    viewerClient("stranger", channel),
  ]);
  const agent = await createTestAgent({ by: owner, name: `${channel}-agent` });
  await made({ by: maker, channel, text: "The maker's" });
  await made({ by: clientWith(agent.token), channel, text: "The agent's" });
  return { admin: adminClient(), maker, owner, stranger };
}

it.for([
  ["maker", CONTROLS, []],
  ["owner", [], CONTROLS],
  ["stranger", [], []],
  ["admin", CONTROLS, CONTROLS],
] as const)(
  "the Pause, Edit and Delete buttons show to the %s only on the schedules it may change",
  {
    timeout: 10_000,
  },
  async ([viewer, makers, agents]) => {
    expect.hasAssertions();

    const channel = `web-schedule-list-may-${viewer}`;
    const clients = await permissionBoard(channel);
    const close = await listOpened({ channel, client: clients[viewer] });
    const shown = await Promise.all(
      ["The maker's", "The agent's"].map(async (text) => {
        const buttons = await buttonsOf(text);
        return buttons;
      }),
    );

    expect(shown).toStrictEqual([makers, agents]);

    close();
  },
);

async function pausedAndResumed(text: string): Promise<readonly (readonly string[])[]> {
  await pressedIn({ button: "Pause", text });
  await within(await rowOf(text)).findByRole("button", { name: "Resume" });
  const paused = await buttonsOf(text);
  await pressedIn({ button: "Resume", text });
  await within(await rowOf(text)).findByRole("button", { name: "Pause" });
  return [paused, await buttonsOf(text)];
}

async function edited(text: string, to: string): Promise<readonly string[]> {
  await pressedIn({ button: "Edit", text });
  const editing = await screen.findByRole("dialog", { name: EDIT });
  const filled = [
    within(editing).getByLabelText<HTMLInputElement>("Text").value,
    within(editing).getByLabelText<HTMLInputElement>("Cron expression").value,
  ];
  await within(editing).findByRole("list", { name: "Next runs" });
  fireEvent.change(within(editing).getByLabelText("Text"), { target: { value: to } });
  fireEvent.click(within(editing).getByRole("button", { name: "Save" }));
  await rowOf(to);
  return filled;
}

async function deleted(text: string, channel: string): Promise<string | null> {
  await pressedIn({ button: "Delete", text });
  const confirming = await screen.findByRole("alertdialog", { name: "Delete this scheduled message?" });
  fireEvent.click(within(confirming).getByRole("button", { name: "Delete" }));
  const said = await waitFor(() => within(listDialog()).getByText(`Nothing is scheduled in #${channel}.`));
  return said.textContent;
}

async function retroBy(channel: string): Promise<CookoutClient> {
  await channelMade(channel);
  const { client } = await newIdentity({ kind: "human", name: `${channel}-maker` });
  await made({ by: client, channel, cron: "30 9 * * 1", text: "Retro" });
  return client;
}

it("its creator pauses, resumes, edits (in the composer's dialog, filled in) and, once confirmed, deletes a schedule", {
  timeout: 15_000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-schedule-list-actions";
  const client = await retroBy(channel);
  const close = await listOpened({ channel, client });
  const toggled = await pausedAndResumed("Retro");
  const filled = await edited("Retro", "Retro, in the big room");
  const { scheduledMessages } = await adminClient().listScheduledMessages({ channel });
  const gone = await deleted("Retro, in the big room", channel);

  expect([toggled, filled, scheduledMessages.map(({ cron, text }) => ({ cron, text })), gone]).toStrictEqual([
    [
      ["Resume", "Edit", "Delete"],
      ["Pause", "Edit", "Delete"],
    ],
    ["Retro", "30 9 * * 1"],
    [{ cron: "30 9 * * 1", text: "Retro, in the big room" }],
    `Nothing is scheduled in #${channel}.`,
  ]);

  close();
});

it("a schedule's actions are quiet buttons, with Delete in the destructive tone", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const channel = "web-schedule-list-tones";
  const client = await retroBy(channel);
  const close = await listOpened({ channel, client });
  const row = await rowOf("Retro");
  const tones = CONTROLS.map((name) => within(row).getByRole("button", { name }).dataset["tone"]);

  expect(tones).toStrictEqual(["quiet", "quiet", "destructive"]);

  close();
});

it("cancelling an edit gives focus back to that schedule's Edit", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const channel = "web-schedule-list-edit-cancel";
  const client = await retroBy(channel);
  const close = await listOpened({ channel, client });
  await pressedIn({ button: "Edit", text: "Retro" });
  const editing = await screen.findByRole("dialog", { name: EDIT });
  fireEvent.click(within(editing).getByRole("button", { name: "Cancel" }));
  const edit = within(await rowOf("Retro")).getByRole("button", { name: "Edit" });

  await waitFor(() => {
    expect(globalThis.document.activeElement).toBe(edit);
  });

  close();
});
