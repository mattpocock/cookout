import { DateTime, Effect, String as Str } from "effect";
import {
  emptyPostgresDatabase,
  identityFixture,
  onPostgresDatabase,
  openStore,
  testSecretsCipher,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Storage } from "../../server.ts";
import { isoTimeOf } from "../../../time/server.ts";
import { postgresStorage } from "../../server.ts";
import { tokenHash } from "../../../identities/index.ts";

const HASH_LENGTH = 64;
const ada = identityFixture("ada", { kind: "human" });
const github = identityFixture("github", { owner: "ada" });
const hashA = tokenHash(Str.repeat(HASH_LENGTH)("a"));
const hashB = tokenHash(Str.repeat(HASH_LENGTH)("b"));
const BEFORE_FEEDERS = [
  "DROP TABLE setup_links",
  "ALTER TABLE identities DROP COLUMN feeder",
  "UPDATE schema_version SET version = version - 2",
];

it.effect("an agent stored on Postgres before feeders is no feeder after the upgrade, and can be made one", () =>
  Effect.scoped(
    Effect.gen(function* upgradeFeeders() {
      const url = yield* emptyPostgresDatabase;
      const first = yield* openStore(postgresStorage({ cipher: testSecretsCipher, url }));
      yield* Effect.all(
        [first.storage.createIdentity(ada, hashA), first.storage.createIdentity(github, hashB), first.close],
        { concurrency: 1 },
      );
      yield* onPostgresDatabase({ statements: BEFORE_FEEDERS, url });
      const second = yield* openStore(postgresStorage({ cipher: testSecretsCipher, url }));
      const found = yield* second.storage.findIdentityByName(github.name);
      const made = yield* second.storage.setFeeder(github.name, true);
      yield* second.close;

      expect([found, made]).toStrictEqual([github, { identity: { ...github, feeder: true }, status: "set" }]);
    }),
  ),
);

const BEFORE_SETUP_LINKS = ["DROP TABLE setup_links", "UPDATE schema_version SET version = version - 1"];
const grace = identityFixture("grace", { admin: true, kind: "human" });
const setupLinkHash = tokenHash("hash:setup");

type Store = Storage["Service"];

function setUpWith(storage: Store): ReturnType<Store["redeemSetupLink"]> {
  return Effect.gen(function* setUp() {
    const today = yield* DateTime.now;
    const now = isoTimeOf(today);
    const expiresAt = isoTimeOf(DateTime.add(today, { days: 1 }));
    yield* storage.replaceSetupLink({ createdAt: now, expiresAt, linkHash: setupLinkHash });
    return yield* storage.redeemSetupLink({
      admin: grace,
      credentialHash: tokenHash("hash:grace-session"),
      host: "Firefox on macOS",
      linkHash: setupLinkHash,
      now,
    });
  });
}

it.effect(
  "an agent stored on Postgres before setup links is kept, and the store with no admin takes a setup link",
  () =>
    Effect.scoped(
      Effect.gen(function* upgradeSetupLinks() {
        const url = yield* emptyPostgresDatabase;
        const first = yield* openStore(postgresStorage({ cipher: testSecretsCipher, url }));
        yield* Effect.all(
          [first.storage.createIdentity(ada, hashA), first.storage.createIdentity(github, hashB), first.close],
          { concurrency: 1 },
        );
        yield* onPostgresDatabase({ statements: BEFORE_SETUP_LINKS, url });
        const second = yield* openStore(postgresStorage({ cipher: testSecretsCipher, url }));
        const redeemed = yield* setUpWith(second.storage);
        const found = yield* second.storage.findIdentityByName(github.name);
        yield* second.close;

        expect([found, redeemed.status]).toStrictEqual([github, "redeemed"]);
      }),
    ),
);
