import { Array as Arr, Effect, FileSystem, Schema, String as Str } from "effect";
import {
  answer,
  freshDatabasePath,
  identityFixture,
  openStore,
  refusal,
  runAdmin,
  startServe,
  testSecretsCipher,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { token, tokenHash } from "../../../identities/index.ts";
import type { CommandLineNeeds } from "../../../testing/server.ts";
import { NodeServices } from "@effect/platform-node";
import { secretsLive } from "../../../secrets/server.ts";
import { setupLinkWebPath } from "../../../logins/setup-links.ts";
import { sqliteStorage } from "../../../storage/server.ts";
import { testClient } from "../../../testing/index.ts";

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const BAD_REQUEST = 400;

it.effect("cookout admin setup-link names the board by COOKOUT_PUBLIC_URL when it is set", () =>
  Effect.gen(function* publicBoard() {
    const database = yield* freshDatabasePath;
    const printed = yield* runAdmin({
      args: ["setup-link"],
      database,
      env: { COOKOUT_PUBLIC_URL: "https://admin-console.example.com" },
    });

    expect(printed.exitCode).toBe(EXIT_SUCCESS);
    expect(printed.stdout).toMatch(/"setupLink": ?"https:\/\/admin-console\.example\.com\/#\/setup-link\/cookout_/u);
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

it.effect("cookout admin on a file that isn't a database says why on stderr, and exits 1", () =>
  Effect.gen(function* notADatabase() {
    const fs = yield* FileSystem.FileSystem;
    const database = yield* freshDatabasePath;
    yield* fs.writeFileString(database, "this is not a SQLite database\n");
    const refused = yield* runAdmin({ args: ["login-link", "ada"], database });

    expect(refused).toMatchObject({ exitCode: EXIT_FAILURE, stdout: "" });
    expect(refused.stderrJson).toStrictEqual({
      error: { code: "storage_unavailable", message: "file is not a database" },
    });
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

it.effect("a setup link sent with a name that has a '/' is refused as a bad request, not looked up", () =>
  Effect.gen(function* slashName() {
    const server = yield* startServe({ database: yield* freshDatabasePath, redeemSetupLink: false });
    const anonymous = testClient({ env: {}, url: server.url });
    const secret = token("cookout_setup-unused");
    const slashed = yield* refusal(() => anonymous.redeemSetupLink({ name: "ops/bot", secret }));
    const plain = yield* refusal(() => anonymous.redeemSetupLink({ name: "ops", secret }));

    expect([slashed.status, plain.code]).toStrictEqual([BAD_REQUEST, "setup_link_not_found"]);
  }).pipe(Effect.scoped, Effect.provide([NodeServices.layer, secretsLive])),
);

const isSetupLine = Schema.is(Schema.Struct({ setupLink: Schema.String }));

function secretIn(lines: readonly unknown[]): string {
  const [link = ""] = Arr.map(Arr.filter(lines, isSetupLine), ({ setupLink }) => setupLink);
  const [, secret = ""] = Str.split(setupLinkWebPath)(link);
  return secret;
}

const ada = identityFixture("ada", { kind: "human" });

function takenThenFree(): Effect.Effect<readonly [unknown, unknown], never, CommandLineNeeds> {
  return Effect.scoped(
    Effect.gen(function* redeemTakenName() {
      const database = yield* freshDatabasePath;
      const store = yield* openStore(sqliteStorage({ cipher: testSecretsCipher, path: database }));
      yield* Effect.andThen(store.storage.createIdentity(ada, tokenHash("hash:ada")), store.close);
      const server = yield* startServe({ database, redeemSetupLink: false });
      const anonymous = testClient({ env: {}, url: server.url });
      const secret = token(secretIn(server.lines));
      const taken = yield* refusal(() => anonymous.redeemSetupLink({ name: "ada", secret }));
      const free = yield* answer(() => anonymous.redeemSetupLink({ displayName: "Grace", name: "grace", secret }));
      return [taken.code, free] as const;
    }),
  ).pipe(Effect.orDie);
}

it.effect("a setup link sent with a name already taken is refused, and still makes the first admin under another", () =>
  Effect.gen(function* takenName() {
    const [taken, free] = yield* takenThenFree();
    const grace = { identity: { admin: true, displayName: "Grace", name: "grace" } };

    expect([taken, free]).toMatchObject(["identity_exists", grace]);
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);
