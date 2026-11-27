import { Effect, FileSystem, Path } from "effect";
import type { Storage, StorageUnavailable } from "../../server.ts";
import { expect, it } from "@effect/vitest";
import { freshDatabasePath, identityFixture, openStore, testSecretsCipher } from "../../../testing/server.ts";
import type { Channel } from "../../../channels/index.ts";
import { NodeServices } from "@effect/platform-node";
import { sqliteStorage } from "../../server.ts";

const BEFORE_AGENT_SUBSCRIPTIONS = new URL("fixtures/before-agent-subscriptions.db", import.meta.url);
const ada = identityFixture("ada", { kind: "human" });
const aide = identityFixture("todo-bot", { owner: "ada" });

const copiedDatabase = Effect.gen(function* copyFixture() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const fixture = yield* path.fromFileUrl(BEFORE_AGENT_SUBSCRIPTIONS);
  const copy = yield* freshDatabasePath;
  yield* fs.copyFile(fixture, copy);
  return copy;
}).pipe(Effect.orDie);

type Subscribed = Effect.Effect<Readonly<Record<"ada" | "aide", readonly Channel[]>>, StorageUnavailable>;

function subscribed(storage: Storage["Service"]): Subscribed {
  return Effect.all(
    { ada: storage.listSubscribedChannels(ada.name), aide: storage.listSubscribedChannels(aide.name) },
    { concurrency: 1 },
  );
}

it.effect("upgrading SQLite removes every agent's subscription and keeps every person's", () =>
  Effect.gen(function* upgradeSqlite() {
    const path = yield* copiedDatabase;
    const { storage } = yield* openStore(sqliteStorage({ cipher: testSecretsCipher, path }));
    const listed = yield* subscribed(storage);

    expect(listed).toMatchObject({ ada: [{ name: "grill" }], aide: [] });
  }).pipe(Effect.provide(NodeServices.layer)),
);
