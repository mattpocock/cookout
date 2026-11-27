import type { Message, ScheduledMessage } from "../../sdk/index.ts";
import { channelMade, linesOf, rowOf } from "./schedule-lists.ts";
import { expect, it } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";
import { adminClient } from "./identities.ts";
import { inPane } from "./regions.ts";
import { openAt } from "./render.tsx";
import { scriptedLive } from "../../testing/web.ts";

type Send = (type: string, data: object) => void;

interface Page {
  readonly close: () => void;
  readonly send: Send;
}

function pageOpened(schedule: ScheduledMessage): Page {
  const { live, send } = scriptedLive();
  const close = openAt({ client: adminClient(), hash: `#/channels/${schedule.channel}`, live });
  return {
    close,
    send: (type, data) => {
      send({ data: JSON.stringify({ ...data, type }), event: type });
    },
  };
}

async function markerBoard(channel: string): Promise<ScheduledMessage> {
  await channelMade(channel);
  await adminClient().createMessage({ channel, text: "Before lunch" });
  const { scheduledMessage } = await adminClient().createScheduledMessage({
    at: "2099-06-01T09:30",
    channel,
    text: "Lunch",
    timeZone: "UTC",
  });
  return scheduledMessage;
}

async function postedBy(schedule: ScheduledMessage): Promise<Message> {
  await inPane().findByText("Before lunch");
  const { message } = await adminClient().createMessage({ channel: schedule.channel, text: schedule.text });
  return { ...message, scheduledMessage: { deleted: false, id: schedule.id } };
}

interface Opening {
  readonly page: Page;
  readonly posted: Message;
  readonly schedule: ScheduledMessage;
}

async function finishedLines(text: string): Promise<readonly (string | null)[]> {
  const lines = await waitFor(async () => {
    const shown = await linesOf(text);
    const [heading = ""] = shown;
    if (!(heading ?? "").startsWith("Finished")) {
      throw new Error(`${text} isn't finished yet`);
    }
    return shown;
  });
  return lines;
}

async function markerOpened({ page, posted, schedule }: Opening): Promise<readonly unknown[]> {
  const marker = await inPane().findByRole("button", { name: "Scheduled" });
  fireEvent.click(marker);
  const row = await rowOf(posted.text);
  const opened = [globalThis.location.hash, row.getAttribute("aria-current"), await linesOf(posted.text)];
  page.send("scheduled-message", {
    deleted: false,
    scheduledMessage: { ...schedule, nextRuns: [], status: "finished" },
  });
  const finished = await finishedLines(posted.text);
  globalThis.location.hash = `#/channels/${schedule.channel}`;
  page.send("message", { message: await postedBy(schedule) });
  await inPane().findByRole("button", { name: "Scheduled" });
  return [...opened, finished];
}

it("a scheduled post's Scheduled marker opens its schedule on the channel's Scheduled messages page, and deleting it elsewhere marks the post Schedule deleted", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const schedule = await markerBoard("web-schedule-list-marker");
  const page = pageOpened(schedule);
  const posted = await postedBy(schedule);
  page.send("message", { message: posted });
  const opened = await markerOpened({ page, posted, schedule });
  page.send("scheduled-message", { deleted: true, scheduledMessage: schedule });
  const said = await inPane().findByText("Schedule deleted");

  expect([...opened, said.closest("button"), inPane().queryByRole("button", { name: "Scheduled" })]).toStrictEqual([
    `#/channels/${schedule.channel}/schedules/${schedule.id}`,
    "true",
    ["Once · Mon, 1 Jun 2099, 09:30", "Lunch", "Next Mon 1 Jun, 09:30 UTC · by @admin"],
    ["Finished · Once · Mon, 1 Jun 2099, 09:30", "Lunch", "No next run · UTC · by @admin"],
    null,
    null,
  ]);

  page.close();
});

it("a post that arrives already marked as from a deleted schedule says Schedule deleted, with no link", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const schedule = await markerBoard("web-schedule-list-marker-deleted");
  const { close, send } = pageOpened(schedule);
  const posted = await postedBy(schedule);
  send("message", { message: { ...posted, scheduledMessage: { deleted: true, id: schedule.id } } });
  const said = await inPane().findByText("Schedule deleted");

  expect([said.closest("button"), inPane().queryByRole("button", { name: "Scheduled" })]).toStrictEqual([null, null]);

  close();
});
