import { Array as Arr, Effect, Predicate, Schema, String as Str } from "effect";
import type { Identity, IdentityName, LoginLinkResponse, Token } from "../../index.ts";
import { IdentityNameSchema, SentDisplayNameSchema } from "./wire.ts";
import { setupLinkNotFound, setupLinkSeconds, setupLinkWebPath } from "../../../logins/index.ts";
import type { Option } from "effect";
import type { Refusal } from "../../../http/index.ts";
import type { Secrets } from "./auth.ts";
import { Storage } from "../../../storage/server.ts";
import type { StorageUnavailable } from "../../../storage/server.ts";
import { issueToken } from "./auth.ts";
import { lifetimeOf } from "./login-support.ts";
import { token } from "../../index.ts";

const NOT_FOUND = 404;
const CONFLICT = 409;

const setupLinkGone: Refusal = {
  code: setupLinkNotFound,
  message:
    "There is no such setup link: it was used, it expired, a newer one replaced it, or the cookout already has an admin. Run `cookout admin setup-link` on the server for a new one.",
  status: NOT_FOUND,
};

function setupNameTaken(name: IdentityName): Refusal {
  return { code: "identity_exists", message: `The name ${name} is taken. Choose another.`, status: CONFLICT };
}

const personNameIsPlain = Schema.makeFilter(
  (name: string) => !Str.includes("/")(name) || "A person's name has no '/'.",
);

const RedeemSetupLinkRequestSchema = Schema.Struct({
  displayName: Schema.optionalKey(SentDisplayNameSchema),
  name: IdentityNameSchema.check(personNameIsPlain),
  secret: Schema.String,
});

type RedeemSetupLinkBody = typeof RedeemSetupLinkRequestSchema.Type;

function displayNameOf({ displayName }: RedeemSetupLinkBody): Pick<Identity, "displayName"> {
  if (Predicate.isUndefined(displayName)) {
    return {};
  }
  return { displayName };
}

function firstAdminOf({
  body,
  createdAt,
}: {
  readonly body: RedeemSetupLinkBody;
  readonly createdAt: Identity["createdAt"];
}): Identity {
  return { ...displayNameOf(body), admin: true, createdAt, kind: "human", name: body.name };
}

function sentSecret(body: RedeemSetupLinkBody): Token {
  return token(body.secret);
}

function isActiveAdmin(identity: Identity): boolean {
  return identity.admin && identity.deactivated !== true;
}

const hasActiveAdmin: Effect.Effect<boolean, StorageUnavailable, Storage> = Effect.flatMap(Storage, (storage) =>
  Effect.map(storage.listIdentities(), (identities) => Arr.some(identities, isActiveAdmin)),
);

function newSetupLink(origin: string): Effect.Effect<LoginLinkResponse, StorageUnavailable, Storage | Secrets> {
  return Effect.gen(function* makeSetupLink() {
    const storage = yield* Storage;
    const issued = yield* issueToken;
    const { createdAt, expiresAt } = yield* lifetimeOf(setupLinkSeconds);
    yield* storage.replaceSetupLink({ createdAt, expiresAt, linkHash: issued.hash });
    return { expiresAt, link: `${origin}${setupLinkWebPath}${issued.token}` };
  });
}

function setupLinkFor(
  origin: string,
): Effect.Effect<Option.Option<LoginLinkResponse>, StorageUnavailable, Storage | Secrets> {
  return Effect.flatMap(hasActiveAdmin, (held) => {
    if (held) {
      return Effect.succeedNone;
    }
    return Effect.asSome(newSetupLink(origin));
  });
}

export { RedeemSetupLinkRequestSchema, firstAdminOf, sentSecret, setupLinkFor, setupLinkGone, setupNameTaken };
