import { expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { CookoutClient } from "../../sdk/index.ts";
import type { Cuttable } from "./cuttable.ts";
import type { OwnedAgent } from "./owned-agent.ts";
import { cuttable } from "./cuttable.ts";
import { inPane } from "./regions.ts";
import { inboxOfOwnerWithWatchingAgent } from "./owned-agent.ts";

interface HistoryReads {
  readonly client: (owner: CookoutClient) => CookoutClient;
  readonly settled: () => Promise<void>;
}

function historyReads(): HistoryReads {
  const out = new Set<Promise<unknown>>();
  return {
    client: (owner) => ({
      ...owner,
      inboxHistory: async (query) => {
        const reading = owner.inboxHistory(query);
        out.add(reading);
        const history = await reading;
        return history;
      },
    }),
    settled: async () => {
      await screen.findByText("Nothing read yet.");
      await Promise.allSettled(out);
    },
  };
}

async function raisedWhileDown(report: Cuttable["report"], open: OwnedAgent): Promise<void> {
  report("down");
  await open.bringer.revokeAgentSession(open.agent);
  await waitFor(async () => {
    await expect(open.owner.inbox()).resolves.toMatchObject({ alerts: [{ read: false }] });
  });
  report("up");
}

it("an offline alert raised while the live link was down shows in the inbox once it is back, with no reload", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { live, report } = cuttable();
  const history = historyReads();
  const open = await inboxOfOwnerWithWatchingAgent({ client: history.client, live, owner: "web-catch-up-alert" });
  await history.settled();
  await raisedWhileDown(report, open);

  await expect(inPane().findByText(open.row)).resolves.toBeDefined();
  expect(screen.queryByText("You're all caught up.")).toBeNull();

  await open.close();
});
