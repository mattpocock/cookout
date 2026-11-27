import type { AgentCreation } from "./agent-creation.ts";
import type { AgentKeys } from "./agent-keys.ts";
import type { IdentityActions } from "./identity-actions.ts";
import type { IdentityList } from "./identity-list.ts";
import type { IdentityName } from "../../sdk/index.ts";
import { createAgentCreation } from "./agent-creation.ts";
import { createAgentKeys } from "./agent-keys.ts";
import { createIdentityActions } from "./identity-actions.ts";

interface OwnerPowers {
  readonly actions: (name: IdentityName) => IdentityActions;
  readonly creation: AgentCreation;
  readonly keys: (name: IdentityName) => AgentKeys;
}

function ownerPowersOf(list: IdentityList): OwnerPowers {
  const stores = new Map<string, IdentityActions>();
  function actions(name: IdentityName): IdentityActions {
    const store = stores.get(name) ?? createIdentityActions({ list, name });
    stores.set(name, store);
    return store;
  }
  const keyStores = new Map<string, AgentKeys>();
  function keys(name: IdentityName): AgentKeys {
    const store = keyStores.get(name) ?? createAgentKeys({ list, name });
    keyStores.set(name, store);
    return store;
  }
  return { actions, creation: createAgentCreation({ list }), keys };
}

export type { AgentCreation } from "./agent-creation.ts";
export type { AgentKeys, AgentKeysSnapshot } from "./agent-keys.ts";
export type { IdentityActions } from "./identity-actions.ts";
export { ownerPowersOf };
