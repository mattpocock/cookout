import { anonymousClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { AgentJoinRequestStartedResponse } from "../../sdk/index.ts";
import { alertSaying } from "./alerts.ts";
import { inboxCounts } from "./owned-agent.ts";
import { openAt } from "./render.tsx";
import { watched } from "./watched.ts";

const ONE_ROW = 1;

interface Opened {
  readonly owner: Awaited<ReturnType<typeof newIdentity>>;
  readonly agent: string;
  readonly close: () => Promise<void>;
}

async function inboxOpenFor(name: string): Promise<Opened> {
  const owner = await newIdentity({ kind: "human", name });
  const agent = `${name}-agent`;
  await owner.client.createIdentity({ kind: "agent", name: agent });
  const { live, stream } = watched(owner.client);
  const unmount = openAt({ client: owner.client, hash: "#/inbox", live });
  const events = await stream;
  await screen.findByText("You're all caught up.");
  return {
    agent,
    close: async () => {
      unmount();
      await events.close();
    },
    owner,
  };
}

async function asked(agent: string): Promise<AgentJoinRequestStartedResponse> {
  const started = await anonymousClient().startAgentJoin({ as: agent, host: "build-box" });
  await screen.findByText(`@${agent} asks to join from build-box.`);
  return started;
}

function forYou(): HTMLElement {
  return screen.getByRole("list", { name: "For you" });
}

async function refusedApprove(): Promise<string> {
  fireEvent.click(within(forYou()).getByRole("button", { name: "Approve" }));
  const refused = await alertSaying("Couldn't approve");
  await waitFor(() => {
    expect(within(forYou()).getAllByRole("listitem")).toHaveLength(ONE_ROW);
  });
  return refused.textContent;
}

async function anotherAsks(opened: Opened): Promise<void> {
  const another = `${opened.agent}-two`;
  await opened.owner.client.createIdentity({ kind: "agent", name: another });
  await asked(another);
}

it("a pending join request for an agent you own shows under For you, counted, and Approve approves it", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const opened = await inboxOpenFor("web-join-inbox");
  const started = await asked(opened.agent);
  const shown = [
    within(forYou()).getByRole("listitem").textContent,
    inboxCounts(),
    screen.getByRole("heading", { level: 2, name: "For you 1" }).textContent,
  ];
  fireEvent.click(within(forYou()).getByRole("button", { name: "Approve" }));
  await screen.findByText("You're all caught up.");
  const collected = await anonymousClient().collectAgentJoin(started.requestId);
  await opened.close();

  expect(shown).toStrictEqual([
    expect.stringContaining(`@${opened.agent} asks to join from build-box.`),
    ["1 for you"],
    "For you 1",
  ]);
  expect(collected).toMatchObject({ agentSession: { identity: opened.agent }, status: "approved" });
});

it("an Approve the approve-join rules refuse says why in the row, and it stays as other requests arrive", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const opened = await inboxOpenFor("web-join-inbox-live");
  await opened.owner.client.join({ as: opened.agent });
  await asked(opened.agent);
  const refused = await refusedApprove();
  await anotherAsks(opened);
  const stillRefused = await alertSaying("Couldn't approve");
  await opened.close();

  expect(refused).toMatch(/^Couldn't approve \(agent_session_live\): /u);
  expect(stillRefused.textContent).toBe(refused);
});
