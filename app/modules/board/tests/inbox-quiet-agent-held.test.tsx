import { adminClient, humanIn, opened, shown } from "./held-store.ts";
import { expect, it, vi } from "vitest";
import type { BoardStore } from "../index.ts";
import type { CookoutEvent } from "../../sdk/index.ts";
import type { DeactivatedQuietAgentId } from "../../inbox/index.ts";
import { parseEvent } from "../../sdk/index.ts";
import { quietAgentsOf } from "../index.ts";

const ENTRY = 1;

interface QuietLoaded {
  readonly ids: readonly DeactivatedQuietAgentId[];
  readonly held: readonly DeactivatedQuietAgentId[];
}

function quietIn(store: BoardStore): QuietLoaded {
  const quiet = quietAgentsOf(store.snapshot());
  if (quiet.status !== "loaded") {
    throw new Error(`The quiet agents are ${quiet.status}.`);
  }
  return { held: quiet.held, ids: quiet.deactivatedQuietAgents.map(({ id }) => id) };
}

function listed(store: BoardStore): DeactivatedQuietAgentId {
  const [first] = quietIn(store).ids;
  if (typeof first !== "number") {
    throw new TypeError("The quiet agent isn't listed yet.");
  }
  return first;
}

async function quietAgentEvent(name: string): Promise<CookoutEvent> {
  const { identity } = await adminClient().createIdentity({ kind: "human", name });
  const data = {
    deactivatedQuietAgent: {
      deactivatedAt: "2026-11-24T00:00:00.000Z",
      id: ENTRY,
      identity,
      read: false,
      text: "Gone",
    },
  };
  const event = parseEvent({
    data: JSON.stringify({ ...data, type: "deactivated-quiet-agent" }),
    event: "deactivated-quiet-agent",
  });
  if (event === null) {
    throw new Error("A deactivated-quiet-agent event parses.");
  }
  return event;
}

it("a quiet agent's entry stays held until it's released", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const reader = await humanIn("web-inbox-quiet-held");
  const { hand, store } = opened({ client: reader.client });
  shown(store.subscribeShowing("inbox")(vi.fn<() => void>()));
  hand.send(await quietAgentEvent("web-inbox-quiet-held-scout"));
  const id = await vi.waitFor(() => listed(store));
  store.inboxCalls.hold(id);
  const { held } = quietIn(store);
  store.inboxCalls.release(id);

  expect({ held, released: quietIn(store).held }).toStrictEqual({ held: [id], released: [] });
});
