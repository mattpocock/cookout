import { Effect, FileSystem, Path } from "effect";
import { expect, it } from "@effect/vitest";
import { freshDatabasePath, identityName, isoTime, openStore } from "../../../testing/server.ts";
import { NodeServices } from "@effect/platform-node";
import { sqliteStorage } from "../../server.ts";

const BEFORE_REQUEST_ORIGINS = new URL("fixtures/before-request-origins.db", import.meta.url);
const created = isoTime("2026-01-01T00:00:00.000Z");
const now = isoTime("2026-01-01T00:05:00.000Z");
const expiresAt = isoTime("2999-01-01T00:00:00.000Z");

const copiedDatabase = Effect.gen(function* copyFixture() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const fixture = yield* path.fromFileUrl(BEFORE_REQUEST_ORIGINS);
  const copy = yield* freshDatabasePath;
  yield* fs.copyFile(fixture, copy);
  return copy;
}).pipe(Effect.orDie);

it.effect(
  "a Login request and an agent join request stored on SQLite before request origins are found after it, with no origin",
  () =>
    Effect.gen(function* upgradeSqlite() {
      const path = yield* copiedDatabase;
      const { storage } = yield* openStore(sqliteStorage(path));
      const login = yield* storage.findLoginRequest("WDJB-MJHT", now);
      const join = yield* storage.findAgentJoinRequest("JOIN-CODE", now);
      const approved = yield* storage.approveLoginRequest("WDJB-MJHT", identityName("ada"), now);

      expect([login, join, approved]).toStrictEqual([
        { approved: false, createdAt: created, expiresAt, host: "ada-laptop", userCode: "WDJB-MJHT" },
        {
          agent: "triage-agent",
          approved: false,
          createdAt: created,
          expiresAt,
          host: "build-box",
          userCode: "JOIN-CODE",
        },
        "approved",
      ]);
    }).pipe(Effect.provide(NodeServices.layer)),
);
