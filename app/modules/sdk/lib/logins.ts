import type {
  CreateAgentKeyResponse,
  ListAgentKeysResponse,
  PublicId,
  RevokeAgentKeyResponse,
  LoginCalls as SessionLoginCalls,
} from "../../logins/index.ts";
import type { RedeemSetupLinkRequest, SetupLinkCalls } from "../../logins/setup-links.ts";
import {
  agentKeyPath,
  agentKeysPath,
  collectLoginRequestPath,
  logOutEverywherePath,
  loginLinkPath,
  loginPath,
  loginRequestApprovalPath,
  loginRequestPath,
  loginRequestsPath,
  redeemLoginLinkPath,
  sessionByIdPath,
  sessionsPath,
} from "../../logins/index.ts";
import {
  isCreateAgentKeyResponse,
  isIdentityResponse,
  isListAgentKeysResponse,
  isListSessionsResponse,
  isLogOutEverywherePreview,
  isLogOutEverywhereResponse,
  isLoginCollectedResponse,
  isLoginLinkResponse,
  isLoginRequestResponse,
  isLoginRequestStartedResponse,
  isLogoutResponse,
  isRevokeAgentKeyResponse,
  isRevokeSessionResponse,
  isWebLoginCollectedResponse,
} from "./generated/validators.js";
import type { ClientConnection } from "./request.ts";
import type { AgentKeyCalls as KeyCalls } from "../../identities/client.ts";
import { redeemSetupLinkPath } from "../../logins/setup-links.ts";
import { send } from "./request.ts";

type AgentKeyCalls = KeyCalls<CreateAgentKeyResponse, ListAgentKeysResponse, RevokeAgentKeyResponse, PublicId>;

type LoginCalls = SessionLoginCalls & AgentKeyCalls & SetupLinkCalls;

function agentKeyCalls(server: ClientConnection): AgentKeyCalls {
  return {
    createAgentKey: async (name, body) => {
      const made = await send(server, {
        body,
        isExpected: isCreateAgentKeyResponse,
        method: "POST",
        params: { name },
        path: agentKeysPath,
      });
      return made;
    },
    listAgentKeys: async (name) => {
      const params = { name };
      const listed = await send(server, {
        isExpected: isListAgentKeysResponse,
        method: "GET",
        params,
        path: agentKeysPath,
      });
      return listed;
    },
    revokeAgentKey: async (name, id) => {
      const params = { id, name };
      const revoked = await send(server, {
        isExpected: isRevokeAgentKeyResponse,
        method: "DELETE",
        params,
        path: agentKeyPath,
      });
      return revoked;
    },
  };
}

type SessionCalls = Pick<
  SessionLoginCalls,
  "listSessions" | "revokeSession" | "previewLogOutEverywhere" | "logOutEverywhere"
>;

function sessionCalls(server: ClientConnection): SessionCalls {
  return {
    listSessions: async () => {
      const listed = await send(server, { isExpected: isListSessionsResponse, method: "GET", path: sessionsPath });
      return listed;
    },
    logOutEverywhere: async () => {
      const ended = await send(server, {
        isExpected: isLogOutEverywhereResponse,
        method: "POST",
        path: logOutEverywherePath,
      });
      return ended;
    },
    previewLogOutEverywhere: async () => {
      const preview = await send(server, {
        isExpected: isLogOutEverywherePreview,
        method: "GET",
        path: logOutEverywherePath,
      });
      return preview;
    },
    revokeSession: async (id) => {
      const params = { id };
      const revoked = await send(server, {
        isExpected: isRevokeSessionResponse,
        method: "DELETE",
        params,
        path: sessionByIdPath,
      });
      return revoked;
    },
  };
}

function loginLinkCalls(server: ClientConnection): Pick<LoginCalls, "createLoginLink" | "redeemLoginLink"> {
  return {
    createLoginLink: async (name) => {
      const params = { name };
      const made = await send(server, { isExpected: isLoginLinkResponse, method: "POST", params, path: loginLinkPath });
      return made;
    },
    redeemLoginLink: async (secret) => {
      const body = { secret };
      const redeemed = await send(server, {
        body,
        isExpected: isIdentityResponse,
        method: "POST",
        path: redeemLoginLinkPath,
      });
      return redeemed;
    },
  };
}

function setupLinkCalls(server: ClientConnection): SetupLinkCalls {
  return {
    redeemSetupLink: async (request: RedeemSetupLinkRequest) => {
      const redeemed = await send(server, {
        body: request,
        isExpected: isIdentityResponse,
        method: "POST",
        path: redeemSetupLinkPath,
      });
      return redeemed;
    },
  };
}

function webLoginCalls(server: ClientConnection): Pick<LoginCalls, "startWebLogin" | "collectWebLogin"> {
  return {
    collectWebLogin: async (requestId) => {
      const body = { kind: "web", requestId };
      const collected = await send(server, {
        body,
        isExpected: isWebLoginCollectedResponse,
        method: "POST",
        path: collectLoginRequestPath,
      });
      return collected;
    },
    startWebLogin: async () => {
      const body = { kind: "web" };
      const started = await send(server, {
        body,
        isExpected: isLoginRequestStartedResponse,
        method: "POST",
        path: loginRequestsPath,
      });
      return started;
    },
  };
}

function sessionLoginCalls(server: ClientConnection): SessionLoginCalls {
  return {
    ...sessionCalls(server),
    ...loginLinkCalls(server),
    ...webLoginCalls(server),
    approveLogin: async (userCode) => {
      const params = { code: userCode };
      const approved = await send(server, {
        isExpected: isLoginRequestResponse,
        method: "PUT",
        params,
        path: loginRequestApprovalPath,
      });
      return approved;
    },
    collectLogin: async (requestId) => {
      const body = { requestId };
      const collected = await send(server, {
        body,
        isExpected: isLoginCollectedResponse,
        method: "POST",
        path: collectLoginRequestPath,
      });
      return collected;
    },
    getLoginRequest: async (userCode) => {
      const params = { code: userCode };
      const found = await send(server, {
        isExpected: isLoginRequestResponse,
        method: "GET",
        params,
        path: loginRequestPath,
      });
      return found;
    },
    revokeLogin: async () => {
      const revoked = await send(server, { isExpected: isLogoutResponse, method: "DELETE", path: loginPath });
      return revoked;
    },
    startLogin: async (body) => {
      const started = await send(server, {
        body,
        isExpected: isLoginRequestStartedResponse,
        method: "POST",
        path: loginRequestsPath,
      });
      return started;
    },
  };
}

function loginCalls(server: ClientConnection): LoginCalls {
  return { ...sessionLoginCalls(server), ...agentKeyCalls(server), ...setupLinkCalls(server) };
}

export { loginCalls };
export type { LoginCalls };
