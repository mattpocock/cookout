import type { AgentKeyView, CreateAgentKeyResponse, PublicId, SessionView } from "../../logins/index.ts";
import type { CookoutClient, Identity, IdentityName, SetTriggerRequest, Token, Trigger } from "../../sdk/index.ts";
import type { Identities, IdentityChange } from "./identities-slice.ts";
import type { Part } from "./slice.ts";
import type { SessionsPart } from "./agent-sessions-part.ts";

type IdentityCallsClient = Pick<
  CookoutClient,
  | "clearTrigger"
  | "countMessagesBy"
  | "createAgentKey"
  | "createIdentity"
  | "createLoginLink"
  | "deactivateIdentity"
  | "deleteIdentity"
  | "getTrigger"
  | "listAgentKeys"
  | "listIdentitySessions"
  | "makeAdmin"
  | "makeFeeder"
  | "reactivateIdentity"
  | "removeAdmin"
  | "removeFeeder"
  | "revokeAgentKey"
  | "revokeAgentSession"
  | "revokeIdentitySession"
  | "setAvatar"
  | "setDescription"
  | "setDisplayName"
  | "setTrigger"
  | "transferAgent"
>;

const KEY_ARGUMENT = 1;

type CreateAgentKeyRequest = Parameters<CookoutClient["createAgentKey"]>[typeof KEY_ARGUMENT];

type LoginLinkResponse = Awaited<ReturnType<CookoutClient["createLoginLink"]>>;

interface NewAgent {
  readonly name: string;
  readonly displayName: string;
}

interface IdentityCalls {
  readonly setAdmin: (name: IdentityName, admin: boolean) => Promise<void>;
  readonly setFeeder: (name: IdentityName, feeder: boolean) => Promise<void>;
  readonly setDisplayName: (name: IdentityName, text: string | null) => Promise<void>;
  readonly setDescription: (name: IdentityName, text: string | null) => Promise<void>;
  readonly setAvatar: (name: IdentityName, png: Uint8Array) => Promise<void>;
  readonly createAgent: (agent: NewAgent) => Promise<IdentityName>;
  readonly listKeys: (name: IdentityName) => Promise<readonly AgentKeyView[]>;
  readonly makeKey: (name: IdentityName, key: CreateAgentKeyRequest) => Promise<CreateAgentKeyResponse>;
  readonly revokeKey: (name: IdentityName, key: AgentKeyView["id"]) => Promise<void>;
  readonly rotateToken: (name: IdentityName) => Promise<Token>;
  readonly sendLoginLink: (name: IdentityName) => Promise<LoginLinkResponse>;
  readonly revokeSession: (name: IdentityName) => Promise<void>;
  readonly listPersonSessions: (name: IdentityName) => Promise<readonly SessionView[]>;
  readonly revokePersonSession: (name: IdentityName, id: PublicId) => Promise<void>;
  readonly deactivate: (name: IdentityName) => Promise<void>;
  readonly reactivate: (name: IdentityName) => Promise<Token | null>;
  readonly delete: (name: IdentityName) => Promise<void>;
  readonly transfer: (name: IdentityName, to: string) => Promise<void>;
  readonly countMessages: (name: IdentityName) => Promise<number>;
  readonly readTrigger: (name: IdentityName) => Promise<Trigger | null>;
  readonly setTrigger: (name: IdentityName, request: SetTriggerRequest) => Promise<Trigger | null>;
  readonly clearTrigger: (name: IdentityName) => Promise<void>;
}

interface IdentityCallsOptions {
  readonly client: IdentityCallsClient;
  readonly identities: Pick<Part<Identities, IdentityChange>, "apply">;
  readonly sessions: Pick<SessionsPart, "put">;
}

function adminSetter({ client }: IdentityCallsOptions): (name: IdentityName, admin: boolean) => Promise<Identity> {
  return async (name, admin) => {
    if (admin) {
      const made = await client.makeAdmin(name);
      return made.identity;
    }
    const removed = await client.removeAdmin(name);
    return removed.identity;
  };
}

function textCalls(
  options: IdentityCallsOptions,
  put: (identity: Identity) => void,
): Pick<IdentityCalls, "setAdmin" | "setAvatar" | "setDescription" | "setDisplayName"> {
  const { client } = options;
  const admin = adminSetter(options);
  return {
    setAdmin: async (name, made) => {
      put(await admin(name, made));
    },
    setAvatar: async (name, png) => {
      const { identity } = await client.setAvatar(name, png);
      put(identity);
    },
    setDescription: async (name, text) => {
      const { identity } = await client.setDescription(name, text);
      put(identity);
    },
    setDisplayName: async (name, text) => {
      const { identity } = await client.setDisplayName(name, text);
      put(identity);
    },
  };
}

function feederCall(client: IdentityCallsClient, feeder: boolean): IdentityCallsClient["makeFeeder"] {
  if (feeder) {
    return client.makeFeeder;
  }
  return client.removeFeeder;
}

function lifeCalls(
  options: IdentityCallsOptions,
  put: (identity: Identity) => void,
): Pick<IdentityCalls, "deactivate" | "delete" | "reactivate" | "setFeeder"> {
  const { client, identities, sessions } = options;
  return {
    deactivate: async (name) => {
      const { identity } = await client.deactivateIdentity(name);
      put(identity);
      sessions.put(name, []);
    },
    delete: async (name) => {
      await client.deleteIdentity(name);
      identities.apply({ name, type: "identity-removed" });
      sessions.put(name, []);
    },
    reactivate: async (name) => {
      const reactivated = await client.reactivateIdentity(name);
      put(reactivated.identity);
      if ("token" in reactivated) {
        return reactivated.token;
      }
      return null;
    },
    setFeeder: async (name, feeder) => {
      const { identity } = await feederCall(client, feeder)(name);
      put(identity);
    },
  };
}

function triggerCalls({
  client,
}: IdentityCallsOptions): Pick<IdentityCalls, "clearTrigger" | "readTrigger" | "setTrigger"> {
  return {
    clearTrigger: async (name) => {
      await client.clearTrigger(name);
    },
    readTrigger: async (name) => {
      const { trigger } = await client.getTrigger(name);
      return trigger;
    },
    setTrigger: async (name, request) => {
      const { trigger } = await client.setTrigger(name, request);
      return trigger;
    },
  };
}

function keyCalls({ client }: IdentityCallsOptions): Pick<IdentityCalls, "listKeys" | "makeKey" | "revokeKey"> {
  return {
    listKeys: async (name) => {
      const { agentKeys } = await client.listAgentKeys(name);
      return agentKeys;
    },
    makeKey: async (name, key) => {
      const made = await client.createAgentKey(name, key);
      return made;
    },
    revokeKey: async (name, key) => {
      await client.revokeAgentKey(name, key);
    },
  };
}

const WEB_KEY = "web";

async function newWebKey(client: IdentityCallsClient, name: IdentityName): Promise<Token> {
  const { agentKeys } = await client.listAgentKeys(name);
  await Promise.all(
    agentKeys.map(async ({ id }) => {
      await client.revokeAgentKey(name, id);
    }),
  );
  const { token } = await client.createAgentKey(name, { name: WEB_KEY });
  return token;
}

function personSessionCalls({
  client,
}: IdentityCallsOptions): Pick<IdentityCalls, "listPersonSessions" | "revokePersonSession"> {
  return {
    listPersonSessions: async (name) => {
      const { sessions } = await client.listIdentitySessions(name);
      return sessions;
    },
    revokePersonSession: async (name, id) => {
      await client.revokeIdentitySession(name, id);
    },
  };
}

function createIdentityCalls(options: IdentityCallsOptions): IdentityCalls {
  const { client, identities, sessions } = options;
  function put(identity: Identity): void {
    identities.apply({ identity, type: "identity" });
  }
  return {
    ...textCalls(options, put),
    ...lifeCalls(options, put),
    ...triggerCalls(options),
    ...keyCalls(options),
    ...personSessionCalls(options),
    countMessages: async (name) => {
      const { messages } = await client.countMessagesBy(name);
      return messages;
    },
    createAgent: async ({ displayName, name }) => {
      const { identity } = await client.createIdentity({ displayName, kind: "agent", name });
      put(identity);
      return identity.name;
    },
    revokeSession: async (name) => {
      await client.revokeAgentSession(name);
      sessions.put(name, []);
    },
    rotateToken: async (name) => {
      const key = await newWebKey(client, name);
      return key;
    },
    sendLoginLink: async (name) => {
      const made = await client.createLoginLink(name);
      return made;
    },
    transfer: async (name, to) => {
      const { identity } = await client.transferAgent(name, to);
      put(identity);
    },
  };
}

export { type IdentityCalls, type IdentityCallsClient, createIdentityCalls };
