import { Caller, CredentialSent, adminActedOn, credentialsEnded, issueToken } from "./auth.ts";
import {
  CreateAgentKeyRequestSchema,
  CreateAgentKeyResponseSchema,
  ListAgentKeysResponseSchema,
  RevokeAgentKeyResponseSchema,
  isAgentKeyName,
} from "./login-wire.ts";
import { DateTime, Effect, Option } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import type { IdentityChanges, Secrets } from "./auth.ts";
import { Storage, newPublicId } from "../../../storage/server.ts";
import { agentKeyPath, agentKeysPath } from "../../../logins/index.ts";
import {
  expiryOf,
  keyIdOf,
  keyNameInvalid,
  keyNotFound,
  managedAgent,
  nameTaken,
  ownedAgent,
} from "./agent-key-checks.ts";
import type { AgentKeyView } from "../../../logins/index.ts";
import type { NewAgentKey } from "../../../storage/server.ts";
import type { Route } from "../../../http/server.ts";
import { isoTimeOf } from "../../../time/server.ts";

const CREATED = 201;

type Needs = Caller | Storage | Secrets | IdentityChanges;

const keyRequest = Effect.filterOrFail(
  HttpServerRequest.schemaBodyJson(CreateAgentKeyRequestSchema),
  ({ name }) => isAgentKeyName(name),
  () => keyNameInvalid,
);

function viewOf(key: NewAgentKey): AgentKeyView {
  const made = { id: key.publicId, madeAt: key.now, name: key.name };
  return Option.match(key.expiresAt, { onNone: () => made, onSome: (expiresAt) => ({ ...made, expiresAt }) });
}

const createRoute: Route<Needs> = {
  handle: (params) =>
    Effect.gen(function* createAgentKeyRoute() {
      const agent = yield* ownedAgent(params);
      const body = yield* keyRequest;
      const now = yield* DateTime.now;
      const expiresAt = yield* expiryOf({ expiresIn: body.expiresIn, now });
      const [{ hash, token }, publicId, parent, storage] = yield* Effect.all(
        [issueToken, newPublicId, CredentialSent, Storage],
        { concurrency: 1 },
      );
      const made = {
        identity: agent.name,
        name: body.name,
        now: isoTimeOf(now),
        parent: Option.getOrUndefined(parent),
      };
      const key = { ...made, expiresAt, hash, publicId };
      if ((yield* storage.createAgentKey(key)) === "name_taken") {
        return yield* Effect.fail(nameTaken(body.name));
      }
      return yield* HttpServerResponse.schemaJson(CreateAgentKeyResponseSchema)(
        { agentKey: viewOf(key), token },
        { status: CREATED },
      );
    }),
  method: "POST",
  path: agentKeysPath,
};

const listRoute: Route<Needs> = {
  handle: (params) =>
    Effect.gen(function* listAgentKeysRoute() {
      const agent = yield* managedAgent(params);
      const storage = yield* Storage;
      const agentKeys = yield* storage.listAgentKeys(agent.name);
      return yield* HttpServerResponse.schemaJson(ListAgentKeysResponseSchema)({ agentKeys });
    }),
  method: "GET",
  path: agentKeysPath,
};

const revokeRoute: Route<Needs> = {
  handle: (params) =>
    Effect.gen(function* revokeAgentKeyRoute() {
      const agent = yield* managedAgent(params);
      const id = yield* keyIdOf(params);
      const [caller, storage, now] = yield* Effect.all([Caller, Storage, DateTime.now], { concurrency: 1 });
      const result = yield* storage.revokeAgentKey({ id, identity: agent.name, now: isoTimeOf(now) });
      if (result.status === "not_found") {
        return yield* Effect.fail(keyNotFound);
      }
      yield* credentialsEnded({ by: caller.name, ended: result.ended });
      yield* adminActedOn({ act: "revoked an agent key", caller, credential: id, target: agent });
      return yield* HttpServerResponse.schemaJson(RevokeAgentKeyResponseSchema)({ ended: result.ended.length });
    }),
  method: "DELETE",
  path: agentKeyPath,
};

export const agentKeyRoutes: readonly Route<Needs>[] = [createRoute, listRoute, revokeRoute];
