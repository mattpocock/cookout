import { Effect, FileSystem, Path } from "effect";
import { expect, it } from "@effect/vitest";
import { freshDatabasePath, identityName, isoTime, openStore, testSecretsCipher } from "../../../testing/server.ts";
import { NodeServices } from "@effect/platform-node";
import type { Storage } from "../../server.ts";
import { isPublicId } from "../../../logins/index.ts";
import { sqliteStorage } from "../../server.ts";

const FIRST_PARAMETER = 0;

type NewLoginAlert = Parameters<Storage["Service"]["recordLoginAlert"]>[typeof FIRST_PARAMETER];

const BEFORE_LOGIN_ALERTS = new URL("fixtures/before-login-alerts.db", import.meta.url);
const ada = identityName("ada");
const triage = identityName("triage");
const backAt = isoTime("2026-01-01T00:05:00.000Z");
const FIRST = 1;
const SECOND = 2;
const THIRD = 3;

const session = "0123456789abcdef";

function newLogin(): NewLoginAlert {
  if (!isPublicId(session)) {
    throw new Error("Not a public ID");
  }
  return {
    login: { kind: "new session", session, sessionKind: "cli", where: "ada-laptop" },
    owner: ada,
    raisedAt: isoTime("2026-01-01T00:06:00.000Z"),
  };
}

const copiedDatabase = Effect.gen(function* copyFixture() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const fixture = yield* path.fromFileUrl(BEFORE_LOGIN_ALERTS);
  const copy = yield* freshDatabasePath;
  yield* fs.copyFile(fixture, copy);
  return copy;
}).pipe(Effect.orDie);

it.effect("offline alerts stored on SQLite before Login alerts are listed, read and cleared after it", () =>
  Effect.gen(function* upgradeSqlite() {
    const path = yield* copiedDatabase;
    const { storage } = yield* openStore(sqliteStorage({ cipher: testSecretsCipher, path }));
    const listed = yield* storage.listAlerts(ada);
    const back = yield* storage.markBackOnline(triage, backAt);
    const cleared = yield* storage.markTriggerAlertsCleared(triage, backAt);
    const login = yield* storage.recordLoginAlert(newLogin());
    const read = yield* storage.markAlertsRead(ada, login.id);

    expect({ back, cleared, listed, login: login.id, read: read.length }).toMatchObject({
      back: [{ backOnlineAt: backAt, id: FIRST }],
      cleared: [{ backOnlineAt: backAt, id: SECOND }],
      listed: [
        {
          agent: triage,
          id: FIRST,
          offlineReason: "connection lost",
          raisedAt: "2026-01-01T00:01:00.000Z",
          read: false,
        },
        {
          agent: triage,
          id: SECOND,
          offlineReason: "trigger failed",
          raisedAt: "2026-01-01T00:02:00.000Z",
          read: false,
          trigger: { error: "connection refused", message: 7 },
        },
      ],
      login: THIRD,
      read: THIRD,
    });
  }).pipe(Effect.provide(NodeServices.layer)),
);
