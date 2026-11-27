import type { IdentityName, Token } from "../../sdk/index.ts";
import type { AgentCreation } from "./agent-creation.ts";
import type { IdentityActions } from "./identity-actions.ts";
import type { IdentityList } from "./identity-list.ts";
import type { SessionList } from "../../board/index.ts";
import { createAgentCreation } from "./agent-creation.ts";
import { createIdentityActions } from "./identity-actions.ts";
import { createSessionList } from "../../board/index.ts";

interface OwnerPowers {
  readonly actions: (name: IdentityName) => IdentityActions;
  readonly creation: AgentCreation;
  readonly sessionList: (name: IdentityName) => SessionList;
}

const NONE = 0;

function personSessionList(list: IdentityList, name: IdentityName): SessionList {
  return createSessionList({
    listSessions: async () => {
      const sessions = await list.calls.listPersonSessions(name);
      return sessions;
    },
    logOutEverywhere: async () => {
      const sessions = await list.calls.listPersonSessions(name);
      await Promise.all(
        sessions.map(async ({ id }) => {
          await list.calls.revokePersonSession(name, id);
        }),
      );
    },
    previewLogOutEverywhere: async () => {
      const sessions = await list.calls.listPersonSessions(name);
      return { agentSessions: NONE, joinCodes: NONE, sessions: sessions.length };
    },
    revokeSession: async (id) => {
      await list.calls.revokePersonSession(name, id);
    },
  });
}

function ownerPowersOf(list: IdentityList): OwnerPowers {
  const stores = new Map<string, IdentityActions>();
  const sessionLists = new Map<string, SessionList>();
  function sessionList(name: IdentityName): SessionList {
    const store = sessionLists.get(name) ?? personSessionList(list, name);
    sessionLists.set(name, store);
    return store;
  }
  function actions(name: IdentityName): IdentityActions {
    const store = stores.get(name) ?? createIdentityActions({ list, name });
    stores.set(name, store);
    return store;
  }
  function created(name: IdentityName, token: Token): void {
    actions(name).showToken(token);
  }
  return { actions, creation: createAgentCreation({ created, list }), sessionList };
}

export type { AgentCreation } from "./agent-creation.ts";
export type { IdentityActions } from "./identity-actions.ts";
export { ownerPowersOf };
