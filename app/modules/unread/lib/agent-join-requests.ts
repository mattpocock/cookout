import type { CookoutClient, CookoutEvent, InboxAgentJoinRequest, Refusal } from "../../sdk/index.ts";
import { createNotifier } from "./notifier.ts";
import { refusalOf } from "../../sdk/index.ts";

interface AgentJoinRequestsState {
  readonly refused: ReadonlyMap<string, Refusal>;
}

interface AgentJoinRequests {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => AgentJoinRequestsState;
  readonly approve: (userCode: string) => void;
}

interface LiveAgentJoinRequests extends AgentJoinRequests {
  readonly pending: () => readonly InboxAgentJoinRequest[];
  readonly pendingAre: (listed: readonly InboxAgentJoinRequest[]) => void;
  readonly receive: (event: CookoutEvent) => boolean;
}

interface AgentJoinRequestsOptions {
  readonly client: Pick<CookoutClient, "approveAgentJoin">;
  readonly onChange: (pending: readonly InboxAgentJoinRequest[]) => void;
}

function createAgentJoinRequests({ client, onChange }: AgentJoinRequestsOptions): LiveAgentJoinRequests {
  const shown = createNotifier<AgentJoinRequestsState>({ refused: new Map() });
  let pending: readonly InboxAgentJoinRequest[] = [];

  function pendingAre(listed: readonly InboxAgentJoinRequest[]): void {
    pending = listed;
    const refused = new Map<string, Refusal>();
    for (const { userCode } of listed) {
      const before = shown.current().refused.get(userCode) ?? null;
      if (before !== null) {
        refused.set(userCode, before);
      }
    }
    shown.publish({ refused });
    onChange(pending);
  }

  async function approveNow(userCode: string): Promise<void> {
    try {
      await client.approveAgentJoin(userCode);
      pendingAre(pending.filter((request) => request.userCode !== userCode));
    } catch (error: unknown) {
      shown.publish({ refused: new Map([...shown.current().refused, [userCode, refusalOf(error)]]) });
    }
  }

  let queue: Promise<void> = Promise.resolve();
  async function approveAfter(previous: Promise<void>, userCode: string): Promise<void> {
    await previous;
    await approveNow(userCode);
  }

  return {
    approve: (userCode) => {
      queue = approveAfter(queue, userCode);
    },
    pending: () => pending,
    pendingAre,
    receive: (event) => {
      if (event.type !== "agent-join-requests") {
        return false;
      }
      pendingAre(event.agentJoinRequests);
      return true;
    },
    snapshot: shown.current,
    subscribe: shown.subscribe,
  };
}

export { type AgentJoinRequests, type LiveAgentJoinRequests, createAgentJoinRequests };
