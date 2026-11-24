import { expect, it } from "vitest";
import { inPane, inSidebar } from "./regions.ts";
import { people, post } from "./attention-posts.ts";
import { screen, waitFor, within } from "@testing-library/react";
import type { CookoutClient } from "../../sdk/index.ts";
import { openAt } from "./render.tsx";

const WHY = /^(?:Mentioned you|Replied to you|New reply in a thread you follow|New in #.+)$/u;

function whysIn(label: string): readonly string[] {
  const whys: string[] = [];
  for (const why of within(inPane().getByRole("list", { name: label })).getAllByText(WHY)) {
    whys.push(why.textContent);
  }
  return whys;
}

function sidebarLink(name: string): HTMLElement {
  return inSidebar().getByRole("link", { name: new RegExp(`^${name}(?![a-z-])`, "u") });
}

function badgesOn(name: string): readonly string[] {
  const badges: string[] = [];
  for (const label of within(sidebarLink(name)).queryAllByText(/^\d+ (?:unread|for you)$/u)) {
    const hidden = label.closest("span.sr-only > span") !== null;
    badges.push(`${label.textContent}, hidden: ${String(hidden)}`);
  }
  return badges;
}

function isBold(name: string): boolean {
  return within(sidebarLink(name)).getByText(name.replace(/^#/u, "")).className.includes("font-semibold");
}

it("a mention shows the strong badge in the sidebar and leads its Inbox row with Mentioned you, under For you", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-attention-mention";
  const { poster, reader } = await people(channel);
  await post({ by: poster, channel, text: `@${channel}-reader can you check?` });
  const close = openAt({ client: reader, hash: "#/inbox" });
  await screen.findByRole("list", { name: "For you" });

  await waitFor(() => {
    expect([
      badgesOn("Inbox"),
      badgesOn(`#${channel}`),
      whysIn("For you"),
      inPane().queryByRole("list", { name: "Activity" }),
    ]).toStrictEqual([["1 for you, hidden: false"], ["1 for you, hidden: false"], ["Mentioned you"], null]);
  });

  close();
});

it("a followed-thread reply that doesn't mention you is activity only: bold, no count, under Activity", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-attention-activity";
  const { poster, reader } = await people(channel);
  const parent = await post({ by: poster, channel, text: "Deploy at noon?" });
  await reader.follow(parent.id);
  await post({ by: poster, channel, replyTo: parent, text: "Noon works" });
  const close = openAt({ client: reader, hash: "#/inbox" });
  await screen.findByRole("list", { name: "Activity" });

  expect([
    badgesOn("Inbox"),
    badgesOn(`#${channel}`),
    isBold(`#${channel}`),
    whysIn("Activity"),
    inPane().queryByRole("list", { name: "For you" }),
  ]).toStrictEqual([
    ["1 unread, hidden: true"],
    ["1 unread, hidden: true"],
    true,
    ["New reply in a thread you follow"],
    null,
  ]);

  close();
});

function headings(): readonly string[] {
  const texts: string[] = [];
  for (const heading of inPane().getAllByRole("heading", { level: 2 })) {
    texts.push(heading.textContent);
  }
  return texts;
}

async function ownThreadAnswered(channel: string): Promise<CookoutClient> {
  const { poster, reader } = await people(channel);
  await reader.subscribe(channel);
  const mine = await post({ by: reader, channel, text: "Deploy at noon?" });
  await post({ by: poster, channel, text: "Lunch first" });
  await post({ by: poster, channel, replyTo: mine, text: "Noon works" });
  return reader;
}

it("the Inbox lists For you before Activity, and a reply in your own thread is Replied to you", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-attention-order";
  const reader = await ownThreadAnswered(channel);
  const close = openAt({ client: reader, hash: "#/inbox" });
  await screen.findByRole("list", { name: "Activity" });
  await inPane().findByRole("heading", { level: 2, name: "Earlier" });

  expect([headings(), whysIn("For you"), whysIn("Activity")]).toStrictEqual([
    ["For you 1", "Activity 1", "Earlier"],
    ["Replied to you"],
    [`New in #${channel}`],
  ]);

  close();
});
