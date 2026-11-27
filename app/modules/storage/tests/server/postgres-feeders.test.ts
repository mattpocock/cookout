import { Effect, String as Str } from "effect";
import {
  emptyPostgresDatabase,
  identityFixture,
  onPostgresDatabase,
  openStore,
  testSecretsCipher,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { postgresStorage } from "../../server.ts";
import { tokenHash } from "../../../identities/index.ts";

const HASH_LENGTH = 64;
const ada = identityFixture("ada", { kind: "human" });
const github = identityFixture("github", { owner: "ada" });
const hashA = tokenHash(Str.repeat(HASH_LENGTH)("a"));
const hashB = tokenHash(Str.repeat(HASH_LENGTH)("b"));
const BEFORE_FEEDERS = ["ALTER TABLE identities DROP COLUMN feeder", "UPDATE schema_version SET version = version - 1"];

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
