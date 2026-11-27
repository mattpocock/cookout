import { adminClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import type { CookoutClient } from "../../sdk/index.ts";
import { createTestAgent } from "../../testing/index.ts";
import { inPane } from "./regions.ts";
import { openAt } from "./render.tsx";
import { watched } from "./watched.ts";
import { within } from "@testing-library/react";

const AGENT = "web-acts-bot";

async function actedOnAgent(owner: CookoutClient): Promise<void> {
  await createTestAgent({ by: owner, name: AGENT });
  const { agentKey } = await owner.createAgentKey(AGENT, { name: "ci" });
  await adminClient().revokeAgentKey(AGENT, agentKey.id);
  await adminClient().deactivateIdentity(AGENT);
}

async function inboxTexts(owner: CookoutClient): Promise<readonly (string | null)[]> {
  const { live, stream } = watched(owner);
  const unmount = openAt({ client: owner, hash: "#/inbox", live });
  const events = await stream;
  const pane = within(inPane().element());
  const revoked = await pane.findByText(
    /^An admin acted on your credentials: @admin revoked an agent key of @web-acts-bot, /u,
  );
  const deactivated = await pane.findByText(/^An admin acted on your credentials: @admin deactivated @web-acts-bot, /u);
  unmount();
  await events.close();
  return [revoked.textContent, deactivated.textContent];
}

it("an admin's acts on a person's agent show in its owner's Inbox naming the agent", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { client: owner } = await newIdentity({ kind: "human", name: "web-acts-owner" });
  await actedOnAgent(owner);
  const texts = await inboxTexts(owner);

  expect(texts).toStrictEqual([
    expect.stringContaining("revoked an agent key of @web-acts-bot"),
    expect.stringContaining("deactivated @web-acts-bot"),
  ]);
});
