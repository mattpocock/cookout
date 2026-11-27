import type { AgentKeyCalls, LoginCalls as SessionLoginCalls } from "../../logins/index.ts";
import {
  agentKeyPath,
  agentKeysPath,
  collectLoginRequestPath,
  loginPath,
  loginRequestApprovalPath,
  loginRequestPath,
  loginRequestsPath,
  sessionByIdPath,
  sessionsPath,
} from "../../logins/index.ts";
import {
  isCreateAgentKeyResponse,
  isListAgentKeysResponse,
  isListSessionsResponse,
  isLoginCollectedResponse,
  isLoginRequestResponse,
  isLoginRequestStartedResponse,
  isLogoutResponse,
  isRevokeAgentKeyResponse,
  isRevokeSessionResponse,
  isWebLoginCollectedResponse,
} from "./generated/validators.js";
import type { ClientConnection } from "./request.ts";
import { send } from "./request.ts";

type LoginCalls = SessionLoginCalls & AgentKeyCalls;

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

function sessionCalls(server: ClientConnection): Pick<SessionLoginCalls, "listSessions" | "revokeSession"> {
  return {
    listSessions: async () => {
      const listed = await send(server, { isExpected: isListSessionsResponse, method: "GET", path: sessionsPath });
      return listed;
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

function loginCalls(server: ClientConnection): LoginCalls {
  return {
    ...sessionCalls(server),
    ...agentKeyCalls(server),
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

export { loginCalls };
export type { LoginCalls };
