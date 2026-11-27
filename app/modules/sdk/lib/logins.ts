import {
  collectLoginRequestPath,
  loginPath,
  loginRequestApprovalPath,
  loginRequestPath,
  loginRequestsPath,
  sessionByIdPath,
  sessionsPath,
} from "../../logins/index.ts";
import {
  isListSessionsResponse,
  isLoginCollectedResponse,
  isLoginRequestResponse,
  isLoginRequestStartedResponse,
  isLogoutResponse,
  isRevokeSessionResponse,
} from "./generated/validators.js";
import type { ClientConnection } from "./request.ts";
import type { LoginCalls } from "../../logins/index.ts";
import { send } from "./request.ts";

function sessionCalls(server: ClientConnection): Pick<LoginCalls, "listSessions" | "revokeSession"> {
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

function loginCalls(server: ClientConnection): LoginCalls {
  return {
    ...sessionCalls(server),
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
export type { LoginCalls } from "../../logins/index.ts";
