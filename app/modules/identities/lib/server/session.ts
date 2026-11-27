import { Caller, CredentialSent, issueToken } from "./auth.ts";
import { Effect, Option } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { now, webSessionWhere } from "./login-support.ts";
import { sessionCookieName, sessionPath, token, whoamiPath } from "../../index.ts";
import type { Identity } from "../../index.ts";
import { IdentityResponseSchema } from "./wire.ts";
import type { IssuedToken } from "./auth.ts";
import type { Refusal } from "../../../http/index.ts";
import type { Route } from "../../../http/server.ts";
import { Secrets } from "../../../secrets/server.ts";
import { Storage } from "../../../storage/server.ts";
import type { StorageUnavailable } from "../../../storage/server.ts";
import { siteCookieOptions } from "../../../http/server.ts";

const FORBIDDEN = 403;

function humanOnly({ kind, name }: Identity): Refusal {
  return {
    code: "human_only",
    details: { kind },
    message: `Only a human identity can log in to the web UI, and ${name} is an ${kind}.`,
    status: FORBIDDEN,
  };
}

const identityResponse = HttpServerResponse.schemaJson(IdentityResponseSchema);

const callerResponse = Effect.gen(function* answerWithCaller() {
  const identity = yield* Caller;
  return yield* identityResponse({ identity });
});

const whoamiRoute: Route<Caller> = {
  handle: () => callerResponse,
  method: "GET",
  path: whoamiPath,
};

function issueWebSession(
  identity: Identity,
): Effect.Effect<IssuedToken, Refusal | StorageUnavailable, HttpServerRequest.HttpServerRequest | Secrets | Storage> {
  return Effect.gen(function* issueWebSessionCredential() {
    const storage = yield* Storage;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const sent = yield* CredentialSent;
    const issued = yield* issueToken;
    const at = yield* now;
    yield* storage.issueLoginCredential({
      credentialHash: issued.hash,
      host: webSessionWhere(request.headers["user-agent"]),
      identity: identity.name,
      now: at,
      parent: Option.getOrUndefined(sent),
    });
    return issued;
  });
}

const loginRoute: Route<Caller | Storage | Secrets> = {
  handle: () =>
    Effect.gen(function* logIn() {
      const identity = yield* Caller;
      if (identity.kind !== "human") {
        return yield* Effect.fail(humanOnly(identity));
      }
      const issued = yield* issueWebSession(identity);
      const response = yield* identityResponse({ identity });
      const options = yield* siteCookieOptions;
      return yield* HttpServerResponse.setCookie(response, sessionCookieName, issued.token, options);
    }),
  method: "POST",
  path: sessionPath,
};

const revokeSessionCookie = Effect.gen(function* revokeSessionCookie() {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const sent = Option.fromUndefinedOr(request.cookies[sessionCookieName]).pipe(Option.filter((value) => value !== ""));
  if (Option.isSome(sent)) {
    const secrets = yield* Secrets;
    const storage = yield* Storage;
    const hash = yield* secrets.hashToken(token(sent.value));
    const at = yield* now;
    yield* storage.revokeLoginCredential(hash, at);
  }
});

const logoutRoute: Route<Caller | Storage | Secrets> = {
  handle: () =>
    Effect.gen(function* logOut() {
      yield* revokeSessionCookie;
      const response = yield* callerResponse;
      const options = yield* siteCookieOptions;
      return yield* HttpServerResponse.expireCookie(response, sessionCookieName, options);
    }),
  method: "DELETE",
  path: sessionPath,
};

export const callerRoutes: readonly Route<Caller | Storage | Secrets>[] = [whoamiRoute, loginRoute, logoutRoute];
