import type { Caller, IdentityChanges } from "./auth.ts";
import type { Identity, IdentityName } from "../../index.ts";
import { announced, requireOwnerOrAdmin } from "./auth.ts";
import { feederRefused, identityFeederPath, isFeeder } from "../../feeders.ts";
import { identityNotFound, nameParam } from "./routes.ts";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/http";
import { IdentityResponseSchema } from "./wire.ts";
import type { Refusal } from "../../../http/index.ts";
import type { Route } from "../../../http/server.ts";
import type { SetFeederResult } from "../../../storage/server.ts";
import { Storage } from "../../../storage/server.ts";

const FORBIDDEN = 403;

function changedFeeder(name: IdentityName, result: SetFeederResult): Effect.Effect<Identity, Refusal> {
  if (result.status === "set") {
    return Effect.succeed(result.identity);
  }
  if (result.status === "human") {
    return Effect.fail({
      code: "identity_kind",
      message: `${name} is a human identity; only an agent can be a feeder.`,
      status: FORBIDDEN,
    });
  }
  return Effect.fail(identityNotFound(name));
}

function feederFlagRoute(method: "PUT" | "DELETE"): Route<Caller | Storage | IdentityChanges> {
  return {
    handle: (params) =>
      Effect.gen(function* setFeederRoute() {
        const name = yield* nameParam(params);
        yield* requireOwnerOrAdmin(name);
        const storage = yield* Storage;
        const result = yield* storage.setFeeder(name, method === "PUT");
        const identity = yield* Effect.flatMap(changedFeeder(name, result), announced);
        return yield* HttpServerResponse.schemaJson(IdentityResponseSchema)({ identity });
      }),
    method,
    path: identityFeederPath,
  };
}

export function refuseFeeder(identity: Readonly<Identity>): Effect.Effect<void, Refusal> {
  if (isFeeder(identity)) {
    return Effect.fail(feederRefused(identity.name));
  }
  return Effect.void;
}

export const feederRoutes: readonly Route<Caller | Storage | IdentityChanges>[] = [
  feederFlagRoute("PUT"),
  feederFlagRoute("DELETE"),
];

export { feederRefused, isFeeder } from "../../feeders.ts";
