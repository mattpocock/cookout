import { Array as Arr, DateTime, Effect } from "effect";
import type { Identity, IdentityName } from "../../../identities/index.ts";
import type { PendingAgentJoinRequest, Storage, StorageUnavailable } from "../../../storage/server.ts";
import type { InboxAgentJoinRequest } from "../agent-join-requests.ts";
import type { Option } from "effect";
import { agentJoinRequestText } from "../agent-join-requests.ts";
import { isoTimeOf } from "../../../time/server.ts";

type Listed = Effect.Effect<readonly InboxAgentJoinRequest[], StorageUnavailable>;

interface Changed {
  readonly caller: Identity;
  readonly agent: IdentityName;
}

interface AgentJoinRequestCalls {
  readonly agentJoinRequests: (caller: Identity) => Listed;
  readonly agentJoinRequestsAfterChange: (
    changed: Changed,
  ) => Effect.Effect<Option.Option<readonly InboxAgentJoinRequest[]>, StorageUnavailable>;
}

const ONE_AT_A_TIME = { concurrency: 1 } as const;

function mayApprove(caller: IdentityName, agent: Identity): boolean {
  if (agent.kind !== "agent" || agent.deactivated === true) {
    return false;
  }
  return agent.owner === caller || agent.broughtInBy === caller;
}

function shownTo(storage: Storage["Service"], caller: IdentityName) {
  return (pending: PendingAgentJoinRequest): Listed =>
    Effect.map(storage.findIdentityByName(pending.agent), (found) =>
      Arr.map(
        Arr.filter(Arr.fromNullishOr(found), (agent) => mayApprove(caller, agent)),
        (agent) => {
          const { createdAt, expiresAt, host, userCode } = pending;
          return { agent, createdAt, expiresAt, host, text: agentJoinRequestText(pending), userCode };
        },
      ),
    );
}

function listedFor(storage: Storage["Service"]): AgentJoinRequestCalls["agentJoinRequests"] {
  return (caller) =>
    Effect.gen(function* listAgentJoinRequests() {
      const now = yield* DateTime.now;
      const pending = yield* storage.listPendingAgentJoinRequests(isoTimeOf(now));
      const shown = yield* Effect.forEach(pending, shownTo(storage, caller.name), ONE_AT_A_TIME);
      return Arr.flatten(shown);
    });
}

function agentJoinRequestsOn(storage: Storage["Service"]): AgentJoinRequestCalls {
  const agentJoinRequests = listedFor(storage);
  return {
    agentJoinRequests,
    agentJoinRequestsAfterChange: ({ agent, caller }) =>
      Effect.flatMap(storage.findIdentityByName(agent), (found) => {
        if (!Arr.some(Arr.fromNullishOr(found), (shown) => mayApprove(caller.name, shown))) {
          return Effect.succeedNone;
        }
        return Effect.asSome(agentJoinRequests(caller));
      }),
  };
}

export { agentJoinRequestsOn };
