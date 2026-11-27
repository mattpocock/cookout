import { Array as Arr, Effect, FileSystem, Path } from "effect";
import { expect, it } from "@effect/vitest";
import { freshDatabasePath, identityName, isoTime, openStore, testSecretsCipher } from "../../../testing/server.ts";
import { NodeServices } from "@effect/platform-node";
import { sqliteStorage } from "../../server.ts";
import { tokenHash } from "../../../identities/index.ts";

const BEFORE_AGENT_KEYS = new URL("fixtures/before-agent-keys.db", import.meta.url);
const [ada, triage] = [identityName("ada"), identityName("triage")];
const [adaToken, triageToken, rotatedOut] = [
  tokenHash("hash:ada"),
  tokenHash("hash:triage"),
  tokenHash("hash:triage-old"),
];
const PUBLIC_ID = /^[0-9a-f]{16}$/u;

const copiedDatabase = Effect.gen(function* copyFixture() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const fixture = yield* path.fromFileUrl(BEFORE_AGENT_KEYS);
  const copy = yield* freshDatabasePath;
  yield* fs.copyFile(fixture, copy);
  return copy;
}).pipe(Effect.orDie);

it.live(
  "an agent's live Identity token stored on SQLite before agent keys is its key named legacy, with no expiry, and a person's token is untouched",
  () =>
    Effect.gen(function* upgradeSqlite() {
      const { storage } = yield* Effect.flatMap(copiedDatabase, (path) =>
        openStore(sqliteStorage({ cipher: testSecretsCipher, path })),
      );
      const seen = yield* Effect.all(
        {
          listed: Effect.map(
            storage.listAgentKeys(triage),
            Arr.map(({ id, madeAt, name }) => ({ id: PUBLIC_ID.test(id), madeAt, name })),
          ),
          lookups: Effect.forEach(
            [triageToken, rotatedOut, adaToken],
            (hash) => Effect.map(storage.findIdentityByTokenHash(hash), ({ status }) => status),
            { concurrency: 1 },
          ),
          theirs: storage.listAgentKeys(ada),
          used: storage.useAgentKey({ hash: triageToken, now: isoTime("2999-01-01T00:00:00.000Z") }),
        },
        { concurrency: 1 },
      );

      expect(seen).toStrictEqual({
        listed: [{ id: true, madeAt: "2026-01-01T00:00:00.000Z", name: "legacy" }],
        lookups: ["active", "revoked", "active"],
        theirs: [],
        used: "used",
      });
    }).pipe(Effect.provide(NodeServices.layer)),
);
