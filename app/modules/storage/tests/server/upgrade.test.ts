import { Array as Arr, Effect, FileSystem, Option, Path } from "effect";
import { expect, it } from "@effect/vitest";
import { freshDatabasePath, identityName, isoTime, messageId, openStore } from "../../../testing/server.ts";
import { NodeServices } from "@effect/platform-node";
import type { Scope } from "effect";
import { sqliteStorage } from "../../server.ts";

const AT_SCHEMA_VERSION_24 = "fixtures/before-closed-threads.db";
const AT_SCHEMA_VERSION_47 = "fixtures/before-call-times.db";
const FIRST_MESSAGE = 1;
const PARENT = messageId(FIRST_MESSAGE);
const closing = { closedAt: isoTime("2026-11-23T23:00:00.000Z"), closedBy: identityName("matt") };

function copiedDatabase(
  fixtureFile: string,
): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path | Scope.Scope> {
  return Effect.gen(function* copyFixture() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const fixture = yield* path.fromFileUrl(new URL(fixtureFile, import.meta.url));
    const copy = yield* freshDatabasePath;
    yield* fs.copyFile(fixture, copy);
    return copy;
  }).pipe(Effect.orDie);
}

it.effect(
  "a database at schema version 24, with a message and a reply, takes every later migration, keeps its rows and starts untitled",
  () =>
    Effect.gen(function* upgradeDeployed() {
      const path = yield* copiedDatabase(AT_SCHEMA_VERSION_24);
      const { storage } = yield* openStore(sqliteStorage(path));

      const closed = yield* storage.closeThread(PARENT, closing);
      const found = yield* storage.getThread(PARENT);
      const replies = Option.map(Option.fromUndefinedOr(found), (thread) =>
        Arr.map(thread.replies, ({ text }) => text),
      );

      expect(closed).toMatchObject({
        changed: true,
        parent: { ...closing, replyCount: 1, text: "before the upgrade" },
      });
      expect(replies).toStrictEqual(Option.some(["a reply"]));
      expect(closed).not.toHaveProperty("parent.title");
      expect(closed).not.toHaveProperty("parent.titleSetBy");
    }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect(
  "a database at schema version 47, with a pending delivery, takes every later migration and keeps its call time",
  () =>
    Effect.gen(function* upgradeDelivery() {
      const path = yield* copiedDatabase(AT_SCHEMA_VERSION_47);
      const { storage } = yield* openStore(sqliteStorage(path));

      const pending = yield* storage.listPendingDeliveries;

      expect(pending).toMatchObject([
        { attempts: 1, callId: "call_1", calledAt: "2026-01-01T00:00:00.000Z", outcome: "pending", threadId: PARENT },
      ]);
    }).pipe(Effect.provide(NodeServices.layer)),
);
