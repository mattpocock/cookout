import type { AgentCreationCalls, DescriptionCalls, FeederCalls } from "../../identities/client.ts";
import type {
  CreateIdentityRequest,
  DeactivateIdentityResponse,
  IdentityKind,
  IdentityResponse,
  IdentityWithTokenResponse,
  ListIdentitiesQuery,
  ListIdentitiesResponse,
} from "../../identities/index.ts";
import { getJson, send } from "./request.ts";
import {
  identitiesPath,
  identityAdminPath,
  identityDeactivatePath,
  identityDisplayNamePath,
  identityMessageCountPath,
  identityOwnerPath,
  identityPath,
  identityReactivatePath,
  identityTokenPath,
  sessionPath,
  whoamiPath,
} from "../../identities/index.ts";
import {
  isDeactivateIdentityResponse,
  isHealthResponse,
  isIdentityMessageCountResponse,
  isIdentityResponse,
  isIdentityWithTokenResponse,
  isListIdentitiesResponse,
} from "./generated/validators.js";
import type { ClientConnection } from "./request.ts";
import type { HealthResponse } from "../../http/index.ts";
import type { IdentityAvatarCalls } from "./avatars.ts";
import type { IdentityDeletionCalls } from "./call-groups.ts";
import type { LoginCalls } from "./logins.ts";
import type { TriggerCalls } from "./triggers.ts";
import { avatarCalls } from "./avatars.ts";
import { healthPath } from "../../http/index.ts";
import { identityFeederPath } from "../../identities/feeders.ts";
import { loginCalls } from "./logins.ts";
import { triggerCalls } from "./triggers.ts";

type CreatedIdentity<Kind extends IdentityKind> = Kind extends "agent" ? IdentityResponse : IdentityWithTokenResponse;

type CreateIdentityCall = <Kind extends IdentityKind>(
  request: CreateIdentityRequest & { readonly kind: Kind },
) => Promise<CreatedIdentity<Kind>>;

interface IdentityCalls {
  readonly health: () => Promise<HealthResponse>;
  readonly whoami: () => Promise<IdentityResponse>;
  readonly login: () => Promise<IdentityResponse>;
  readonly logout: () => Promise<IdentityResponse>;
  readonly listIdentities: (query?: ListIdentitiesQuery) => Promise<ListIdentitiesResponse>;
  readonly createIdentity: CreateIdentityCall;
  readonly rotateToken: (name: string) => Promise<IdentityWithTokenResponse>;
  readonly deactivateIdentity: (name: string) => Promise<DeactivateIdentityResponse>;
  readonly reactivateIdentity: (name: string) => Promise<IdentityWithTokenResponse>;
  readonly makeAdmin: (name: string) => Promise<IdentityResponse>;
  readonly removeAdmin: (name: string) => Promise<IdentityResponse>;
  readonly setDisplayName: (name: string, displayName: string | null) => Promise<IdentityResponse>;
  readonly transferAgent: (agent: string, owner: string) => Promise<IdentityResponse>;
}

function isCreated<Kind extends IdentityKind>(kind: Kind) {
  return (answer: unknown): answer is CreatedIdentity<Kind> => {
    if (kind === "agent") {
      return isIdentityResponse(answer);
    }
    return isIdentityWithTokenResponse(answer);
  };
}

function createIdentityCall(server: ClientConnection): CreateIdentityCall {
  return async (body) => {
    const created = await send(server, {
      body,
      isExpected: isCreated(body.kind),
      method: "POST",
      path: identitiesPath,
    });
    return created;
  };
}

function sessionCall(server: ClientConnection, method: "POST" | "DELETE") {
  return async (): Promise<IdentityResponse> => {
    const answer = await send(server, { isExpected: isIdentityResponse, method, path: sessionPath });
    return answer;
  };
}

function flagCall(server: ClientConnection, method: "PUT" | "DELETE", path: string) {
  return async (name: string): Promise<IdentityResponse> => {
    const params = { name };
    const answer = await send(server, { isExpected: isIdentityResponse, method, params, path });
    return answer;
  };
}

function feederCalls(server: ClientConnection): FeederCalls<IdentityResponse> {
  return {
    makeFeeder: flagCall(server, "PUT", identityFeederPath),
    removeFeeder: flagCall(server, "DELETE", identityFeederPath),
  };
}

function setDisplayNameCall(server: ClientConnection): IdentityCalls["setDisplayName"] {
  return async (name, displayName) => {
    const answer = await send(server, {
      body: { displayName },
      isExpected: isIdentityResponse,
      method: "PUT",
      params: { name },
      path: identityDisplayNamePath,
    });
    return answer;
  };
}

function agentCreationCalls(server: ClientConnection): AgentCreationCalls<IdentityResponse> {
  return {
    createAgentForOwner: async (request) => {
      const { identity } = await send(server, {
        body: { ...request, kind: "agent" },
        isExpected: isIdentityResponse,
        method: "POST",
        path: identitiesPath,
      });
      return { identity };
    },
  };
}

function descriptionCalls(server: ClientConnection): DescriptionCalls<IdentityResponse> {
  return {
    getIdentity: async (name) => {
      const answer = await send(server, {
        isExpected: isIdentityResponse,
        method: "GET",
        params: { name },
        path: identityPath,
      });
      return answer;
    },
    setDescription: async (name, description) => {
      const answer = await send(server, {
        body: { description },
        isExpected: isIdentityResponse,
        method: "PATCH",
        params: { name },
        path: identityPath,
      });
      return answer;
    },
  };
}

function transferAgentCall(server: ClientConnection): IdentityCalls["transferAgent"] {
  return async (agent, owner) => {
    const answer = await send(server, {
      body: { owner },
      isExpected: isIdentityResponse,
      method: "PUT",
      params: { name: agent },
      path: identityOwnerPath,
    });
    return answer;
  };
}

function deactivationCalls(server: ClientConnection): Pick<IdentityCalls, "deactivateIdentity" | "reactivateIdentity"> {
  return {
    deactivateIdentity: async (name) => {
      const deactivated = await send(server, {
        isExpected: isDeactivateIdentityResponse,
        method: "POST",
        params: { name },
        path: identityDeactivatePath,
      });
      return deactivated;
    },
    reactivateIdentity: async (name) => {
      const reactivated = await send(server, {
        isExpected: isIdentityWithTokenResponse,
        method: "POST",
        params: { name },
        path: identityReactivatePath,
      });
      return reactivated;
    },
  };
}

function deletionCalls(server: ClientConnection): IdentityDeletionCalls {
  return {
    countMessagesBy: async (name) => {
      const counted = await send(server, {
        isExpected: isIdentityMessageCountResponse,
        method: "GET",
        params: { name },
        path: identityMessageCountPath,
      });
      return counted;
    },
    deleteIdentity: async (name) => {
      const deleted = await send(server, {
        isExpected: isIdentityResponse,
        method: "DELETE",
        params: { name },
        path: identityPath,
      });
      return deleted;
    },
  };
}

function ownIdentityCalls(server: ClientConnection): IdentityCalls & IdentityDeletionCalls {
  return {
    createIdentity: createIdentityCall(server),
    ...deactivationCalls(server),
    ...deletionCalls(server),
    health: async () => {
      const healthy = await getJson(server, healthPath, isHealthResponse);
      return healthy;
    },
    listIdentities: async (query = {}) => {
      const listed = await send(server, {
        isExpected: isListIdentitiesResponse,
        method: "GET",
        path: identitiesPath,
        query: { ...query },
      });
      return listed;
    },
    login: sessionCall(server, "POST"),
    logout: sessionCall(server, "DELETE"),
    makeAdmin: flagCall(server, "PUT", identityAdminPath),
    removeAdmin: flagCall(server, "DELETE", identityAdminPath),
    rotateToken: async (name) => {
      const rotated = await send(server, {
        isExpected: isIdentityWithTokenResponse,
        method: "POST",
        params: { name },
        path: identityTokenPath,
      });
      return rotated;
    },
    setDisplayName: setDisplayNameCall(server),
    transferAgent: transferAgentCall(server),
    whoami: async () => {
      const identity = await getJson(server, whoamiPath, isIdentityResponse);
      return identity;
    },
  };
}

function identityCalls(
  server: ClientConnection,
): IdentityCalls &
  IdentityDeletionCalls &
  DescriptionCalls<IdentityResponse> &
  FeederCalls<IdentityResponse> &
  AgentCreationCalls<IdentityResponse> &
  LoginCalls &
  TriggerCalls &
  IdentityAvatarCalls {
  return {
    ...avatarCalls(server),
    ...agentCreationCalls(server),
    ...loginCalls(server),
    ...ownIdentityCalls(server),
    ...descriptionCalls(server),
    ...feederCalls(server),
    ...triggerCalls(server),
  };
}

export { identityCalls };
export type { CreateIdentityCall };
export type { CallGroups } from "./call-groups.ts";
