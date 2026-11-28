import { DateTime, Effect, Option } from "effect";
import { Identities, adminWithoutToken } from "../../../identities/server.ts";
import type { Identity, IdentityName, Token, TokenHash } from "../../../identities/index.ts";
import { Storage, newPublicId } from "../../../storage/server.ts";
import { currentTime, fixtureTime } from "./time.ts";
import { firstAdminName, isIdentityName, isOwner } from "../../../identities/index.ts";
import type { StorageUnavailable } from "../../../storage/server.ts";
import { isoTimeOf } from "../../../time/server.ts";

type AgentFixtureOptions = { readonly kind?: "agent"; readonly owner?: string; readonly admin?: boolean };

function nameOf(value: string): IdentityName {
  return Option.getOrThrow(Option.liftPredicate(value, isIdentityName));
}

const fixtureOwnerName: IdentityName = nameOf("matt");

function agentFixture(name: string, { admin = false, owner = fixtureOwnerName }: AgentFixtureOptions): Identity {
  const base = { admin, createdAt: fixtureTime, kind: "agent", name: nameOf(name) } as const;
  return { ...base, owner: Option.getOrThrow(Option.liftPredicate(owner, isOwner)) };
}

function ownedByAdminUnlessNamed(options: IdentityFixtureOptions): IdentityFixtureOptions {
  if (options.kind === "human") {
    return options;
  }
  return { owner: firstAdminName, ...options };
}

const testCookoutAdminName = firstAdminName;

const identityName = nameOf;

type IdentityFixtureOptions = { readonly kind: "human"; readonly admin?: boolean } | AgentFixtureOptions;

const identityFixture = (name: string, options: IdentityFixtureOptions = {}): Identity => {
  if (options.kind === "human") {
    return { admin: options.admin ?? false, createdAt: fixtureTime, kind: "human", name: nameOf(name) };
  }
  return agentFixture(name, options);
};

type SeededCredential = "identity token" | "session or agent key";

type CredentialNeeds = Storage | Identities;

type Seeding = Effect.Effect<Token, StorageUnavailable, CredentialNeeds>;

const ONE_AT_A_TIME = { concurrency: 1 } as const;
const LOGIN_LINK_MINUTES = 15;
const NO_USER_AGENT_WHERE = "web browser";
const TEST_AGENT_KEY = "test";
const asRoot = Option.getOrUndefined(Option.none<TokenHash>());

function createdOrDie(created: string): Effect.Effect<void> {
  const made = Option.liftPredicate(created, (result) => result === "created");
  return Effect.orDie(Effect.asVoid(Effect.fromOption(made)));
}

function isRedeemed({ status }: { readonly status: string }): boolean {
  return status === "redeemed";
}

function sessionFromLoginLink(identity: Identity): Seeding {
  return Effect.gen(function* redeemTestLoginLink() {
    const [storage, identities, now] = yield* Effect.all([Storage, Identities, currentTime], ONE_AT_A_TIME);
    const [link, session] = yield* Effect.all([identities.issueToken, identities.issueToken], ONE_AT_A_TIME);
    const expiresAt = isoTimeOf(DateTime.add(DateTime.makeUnsafe(now), { minutes: LOGIN_LINK_MINUTES }));
    const { name } = identity;
    yield* storage.addLoginLink({ createdAt: now, expiresAt, identity: name, linkHash: link.hash, parent: asRoot });
    const redeemed = { credentialHash: session.hash, host: NO_USER_AGENT_WHERE, linkHash: link.hash, now };
    const redemption = yield* storage.redeemLoginLink(redeemed);
    yield* Effect.orDie(Effect.fromOption(Option.liftPredicate(redemption, isRedeemed)));
    return session.token;
  });
}

function agentKey(identity: Identity): Seeding {
  return Effect.gen(function* makeTestAgentKey() {
    const [storage, identities, now, publicId] = yield* Effect.all(
      [Storage, Identities, currentTime, newPublicId],
      ONE_AT_A_TIME,
    );
    const { hash, token } = yield* identities.issueToken;
    const made = { expiresAt: Option.none(), hash, identity: identity.name, now, parent: asRoot, publicId };
    yield* storage.createAgentKey({ ...made, name: TEST_AGENT_KEY });
    return token;
  });
}

const credentialOfKind: Record<Identity["kind"], (identity: Identity) => Seeding> = {
  agent: agentKey,
  human: sessionFromLoginLink,
};

function identityToken(identity: Identity): Seeding {
  return Effect.gen(function* createWithIdentityToken() {
    const storage = yield* Storage;
    const { hash, token } = yield* Effect.flatMap(Identities, (identities) => identities.issueToken);
    yield* Effect.flatMap(storage.createIdentity(identity, hash), createdOrDie);
    return token;
  });
}

function sessionOrAgentKey(identity: Identity): Seeding {
  return Effect.gen(function* createWithSessionOrKey() {
    const storage = yield* Storage;
    yield* Effect.flatMap(storage.createIdentity(identity), createdOrDie);
    return yield* credentialOfKind[identity.kind](identity);
  });
}

const seededWith: Record<SeededCredential, (identity: Identity) => Seeding> = {
  "identity token": identityToken,
  "session or agent key": sessionOrAgentKey,
};

interface IdentitySeed {
  readonly identity: Identity;
  readonly credential: SeededCredential;
}

function seededIdentity({ credential, identity }: IdentitySeed): Seeding {
  return seededWith[credential](identity);
}

function loggedIn(name: IdentityName): Seeding {
  return Effect.gen(function* logPersonIn() {
    const storage = yield* Storage;
    const found = yield* Effect.orDie(Effect.flatMap(storage.findIdentityByName(name), Effect.fromNullishOr));
    return yield* sessionFromLoginLink(found);
  });
}

function adminLoggedIn(name: string): Seeding {
  const admin = nameOf(name);
  return Effect.andThen(adminWithoutToken(admin), loggedIn(admin));
}

export {
  type CredentialNeeds,
  type IdentityFixtureOptions,
  type SeededCredential,
  adminLoggedIn,
  fixtureOwnerName,
  identityFixture,
  identityName,
  loggedIn,
  ownedByAdminUnlessNamed,
  seededIdentity,
  testCookoutAdminName,
};
