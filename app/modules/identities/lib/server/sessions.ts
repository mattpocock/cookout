import { Caller, CredentialSent, credentialsEnded } from "./auth.ts";
import { Effect, Option } from "effect";
import type { HumanIdentity, Identity } from "../../index.ts";
import { ListSessionsResponseSchema, RevokeSessionResponseSchema } from "./login-wire.ts";
import { isPublicId, sessionByIdPath, sessionsPath } from "../../../logins/index.ts";
import { HttpServerResponse } from "effect/http";
import type { IdentityChanges } from "./auth.ts";
import type { PublicId } from "../../../logins/index.ts";
import type { Refusal } from "../../../http/index.ts";
import type { Route } from "../../../http/server.ts";
import { Storage } from "../../../storage/server.ts";
import { now } from "./login-support.ts";

const FORBIDDEN = 403;
const NOT_FOUND = 404;

const humanOnly: Refusal = {
  code: "human_only",
  message: "Only a person has sessions: an agent has its agent session token.",
  status: FORBIDDEN,
};

const sessionNotFound: Refusal = {
  code: "session_not_found",
  message: "You have no live session with that ID. List yours with GET /v1/sessions.",
  status: NOT_FOUND,
};

function isHuman(caller: Identity): caller is HumanIdentity {
  return caller.kind === "human";
}

const human = Effect.filterOrFail(Caller, isHuman, () => humanOnly);

function sessionIdOf(params: Readonly<Record<string, string>>): Effect.Effect<PublicId, Refusal> {
  return Effect.filterOrFail(Effect.succeed(String(params["id"])), isPublicId, () => sessionNotFound);
}

const listRoute: Route<Caller | Storage> = {
  handle: () =>
    Effect.gen(function* listSessionsRoute() {
      const caller = yield* human;
      const storage = yield* Storage;
      const current = yield* CredentialSent;
      const at = yield* now;
      const sessions = yield* storage.listSessions({
        current: Option.getOrUndefined(current),
        identity: caller.name,
        now: at,
      });
      return yield* HttpServerResponse.schemaJson(ListSessionsResponseSchema)({ sessions });
    }),
  method: "GET",
  path: sessionsPath,
};

const revokeRoute: Route<Caller | Storage | IdentityChanges> = {
  handle: (params) =>
    Effect.gen(function* revokeSessionRoute() {
      const caller = yield* human;
      const storage = yield* Storage;
      const id = yield* sessionIdOf(params);
      const at = yield* now;
      const result = yield* storage.revokeSession({ id, identity: caller.name, now: at });
      if (result.status === "not_found") {
        return yield* Effect.fail(sessionNotFound);
      }
      yield* credentialsEnded({ by: caller.name, ended: result.ended });
      return yield* HttpServerResponse.schemaJson(RevokeSessionResponseSchema)({ ended: result.ended.length });
    }),
  method: "DELETE",
  path: sessionByIdPath,
};

export const sessionRoutes: readonly Route<Caller | Storage | IdentityChanges>[] = [listRoute, revokeRoute];
