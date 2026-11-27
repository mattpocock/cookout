import { Effect, FileSystem, Path } from "effect";
import { expect, it } from "@effect/vitest";
import { freshDatabasePath, identityFixture, openStore, testSecretsCipher } from "../../../testing/server.ts";
import { NodeServices } from "@effect/platform-node";
import type { Storage } from "../../server.ts";
import { sqliteStorage } from "../../server.ts";

const BEFORE_FEEDERS = new URL("fixtures/before-feeders.db", import.meta.url);
const github = identityFixture("github", { owner: "ada" });

const copiedDatabase = Effect.gen(function* copyFixture() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const fixture = yield* path.fromFileUrl(BEFORE_FEEDERS);
  const copy = yield* freshDatabasePath;
  yield* fs.copyFile(fixture, copy);
  return copy;
}).pipe(Effect.orDie);

interface Upgraded {
  readonly found: Effect.Success<ReturnType<Storage["Service"]["findIdentityByName"]>>;
  readonly made: Effect.Success<ReturnType<Storage["Service"]["setFeeder"]>>["status"];
}

function upgraded(
  storage: Storage["Service"],
): Effect.Effect<Upgraded, Effect.Error<ReturnType<Storage["Service"]["setFeeder"]>>> {
  return Effect.all(
    {
      found: storage.findIdentityByName(github.name),
      made: Effect.map(storage.setFeeder(github.name, true), ({ status }) => status),
    },
    { concurrency: 1 },
  );
}

it.effect("an agent stored on SQLite before feeders is no feeder after the upgrade, and can be made one", () =>
  Effect.gen(function* upgradeSqlite() {
    const path = yield* copiedDatabase;
    const { storage } = yield* openStore(sqliteStorage({ cipher: testSecretsCipher, path }));
    const seen = yield* upgraded(storage);

    expect(seen).toStrictEqual({ found: github, made: "set" });
  }).pipe(Effect.provide(NodeServices.layer)),
);
