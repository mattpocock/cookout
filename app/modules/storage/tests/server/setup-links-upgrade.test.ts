import { DateTime, Effect, FileSystem, Path } from "effect";
import type { Storage, StorageUnavailable } from "../../server.ts";
import { expect, it } from "@effect/vitest";
import { freshDatabasePath, identityFixture, openStore, testSecretsCipher } from "../../../testing/server.ts";
import { NodeServices } from "@effect/platform-node";
import { isoTimeOf } from "../../../time/server.ts";
import { sqliteStorage } from "../../server.ts";
import { tokenHash } from "../../../identities/index.ts";

const BEFORE_SETUP_LINKS = new URL("fixtures/before-feeders.db", import.meta.url);
const github = identityFixture("github", { owner: "ada" });
const grace = identityFixture("grace", { admin: true, kind: "human" });
const linkHash = tokenHash("hash:setup");
const ONE_DAY = 1;

const copiedDatabase = Effect.gen(function* copyFixture() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const fixture = yield* path.fromFileUrl(BEFORE_SETUP_LINKS);
  const copy = yield* freshDatabasePath;
  yield* fs.copyFile(fixture, copy);
  return copy;
}).pipe(Effect.orDie);

type Store = Storage["Service"];

interface SetUp {
  readonly found: Effect.Success<ReturnType<Store["findIdentityByName"]>>;
  readonly redeemed: Effect.Success<ReturnType<Store["redeemSetupLink"]>>["status"];
}

function setUpAfterUpgrade(storage: Store): Effect.Effect<SetUp, StorageUnavailable> {
  return Effect.gen(function* redeemAfterUpgrade() {
    const today = yield* DateTime.now;
    const now = isoTimeOf(today);
    const expiresAt = isoTimeOf(DateTime.add(DateTime.makeUnsafe(now), { days: ONE_DAY }));
    yield* storage.replaceSetupLink({ createdAt: now, expiresAt, linkHash });
    const redeemed = yield* storage.redeemSetupLink({
      admin: grace,
      credentialHash: tokenHash("hash:grace-session"),
      host: "Firefox on macOS",
      linkHash,
      now,
    });
    const found = yield* storage.findIdentityByName(github.name);
    return { found, redeemed: redeemed.status };
  });
}

it.effect("an agent stored on SQLite before setup links is kept, and the store with no admin takes a setup link", () =>
  Effect.gen(function* upgradeSqlite() {
    const path = yield* copiedDatabase;
    const { storage } = yield* openStore(sqliteStorage({ cipher: testSecretsCipher, path }));
    const seen = yield* setUpAfterUpgrade(storage);

    expect(seen).toStrictEqual({ found: github, redeemed: "redeemed" });
  }).pipe(Effect.provide(NodeServices.layer)),
);
