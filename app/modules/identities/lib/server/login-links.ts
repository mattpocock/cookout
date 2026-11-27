import { Caller, CredentialSent, adminActed, issueToken, requireAdmin } from "./auth.ts";
import { Effect, Option, Predicate } from "effect";
import type { Identity, IdentityName, LoginLinkResponse } from "../../index.ts";
import type { IdentityChanges, Secrets } from "./auth.ts";
import { loginLinkPath, loginLinkSeconds, loginLinkWebPath } from "../../../logins/index.ts";
import { HttpServerResponse } from "effect/http";
import { LoginLinkResponseSchema } from "./wire.ts";
import type { Refusal } from "../../../http/index.ts";
import type { Route } from "../../../http/server.ts";
import { Storage } from "../../../storage/server.ts";
import type { StorageUnavailable } from "../../../storage/server.ts";
import { echoed } from "../../../http/index.ts";
import { isIdentityName } from "../../index.ts";
import { lifetimeOf } from "./login-support.ts";
import { requestOrigin } from "../../../http/server.ts";

const FORBIDDEN = 403;
const NOT_FOUND = 404;

function identityNotFound(name: string): Refusal {
  return { code: "identity_not_found", message: `There is no identity named ${echoed(name)}.`, status: NOT_FOUND };
}

function notAPerson({ kind, name }: Identity): Refusal {
  return {
    code: "human_only",
    details: { kind },
    message: `A login link logs a person in, and ${name} is an ${kind}.`,
    status: FORBIDDEN,
  };
}

interface LinkFor {
  readonly name: IdentityName;
  readonly origin: string;
}

interface MadeLink {
  readonly made: LoginLinkResponse;
  readonly credential: Effect.Success<ReturnType<Storage["Service"]["addLoginLink"]>>;
}

function madeLinkFor({ name, origin }: LinkFor): Effect.Effect<MadeLink, StorageUnavailable, Storage | Secrets> {
  return Effect.gen(function* makeLoginLink() {
    const storage = yield* Storage;
    const issued = yield* issueToken;
    const parent = yield* CredentialSent;
    const { createdAt, expiresAt } = yield* lifetimeOf(loginLinkSeconds);
    const credential = yield* storage.addLoginLink({
      createdAt,
      expiresAt,
      identity: name,
      linkHash: issued.hash,
      parent: Option.getOrUndefined(parent),
    });
    return { credential, made: { expiresAt, link: `${origin}${loginLinkWebPath}${issued.token}` } };
  });
}

function loginLinkFor(link: LinkFor): Effect.Effect<LoginLinkResponse, StorageUnavailable, Storage | Secrets> {
  return Effect.map(madeLinkFor(link), ({ made }) => made);
}

function personOrRefused(name: IdentityName, found: Identity | undefined): Effect.Effect<Identity, Refusal> {
  if (Predicate.isUndefined(found) || found.deactivated === true) {
    return Effect.fail(identityNotFound(name));
  }
  if (found.kind !== "human") {
    return Effect.fail(notAPerson(found));
  }
  return Effect.succeed(found);
}

function personNamed(name: string): Effect.Effect<Identity, Refusal | StorageUnavailable, Storage> {
  if (!isIdentityName(name)) {
    return Effect.fail(identityNotFound(name));
  }
  return Effect.flatMap(Storage, (storage) =>
    Effect.flatMap(storage.findIdentityByName(name), (found) => personOrRefused(name, found)),
  );
}

const makeRoute: Route<Caller | Storage | Secrets | IdentityChanges> = {
  handle: (params) =>
    Effect.gen(function* makeLoginLinkRoute() {
      yield* requireAdmin;
      const admin = yield* Caller;
      const person = yield* personNamed(String(params["name"]));
      const origin = yield* requestOrigin;
      const { credential, made } = yield* madeLinkFor({ name: person.name, origin });
      yield* adminActed({ act: "sent a login link", admin: admin.name, credential, identity: person.name });
      return yield* HttpServerResponse.schemaJson(LoginLinkResponseSchema)(made);
    }),
  method: "POST",
  path: loginLinkPath,
};

function consoleLoginLink({
  name,
  origin,
}: Readonly<{ name: string; origin: string }>): Effect.Effect<
  LoginLinkResponse,
  Refusal | StorageUnavailable,
  Storage | Secrets | IdentityChanges
> {
  return Effect.gen(function* makeConsoleLoginLink() {
    const person = yield* personNamed(name);
    const { credential, made } = yield* madeLinkFor({ name: person.name, origin }).pipe(
      Effect.provideService(CredentialSent, Option.none()),
    );
    yield* adminActed({ act: "sent a login link", credential, identity: person.name });
    return made;
  });
}

export const loginLinkRoutes: readonly Route<Caller | Storage | Secrets | IdentityChanges>[] = [makeRoute];

export { consoleLoginLink, loginLinkFor };
