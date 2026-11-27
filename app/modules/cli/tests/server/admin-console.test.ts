import { Effect, FileSystem } from "effect";
import { expect, it } from "@effect/vitest";
import { freshDatabasePath, refusal, runAdmin, startServe } from "../../../testing/server.ts";
import { NodeServices } from "@effect/platform-node";
import { secretsLive } from "../../../secrets/server.ts";
import { testClient } from "../../../testing/index.ts";
import { token } from "../../../identities/index.ts";

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
    const server = yield* startServe({ adminToken: "", database: yield* freshDatabasePath });
    const anonymous = testClient({ env: {}, url: server.url });
    const secret = token("cookout_setup-unused");
    const slashed = yield* refusal(() => anonymous.redeemSetupLink({ name: "ops/bot", secret }));
    const plain = yield* refusal(() => anonymous.redeemSetupLink({ name: "ops", secret }));

    expect([slashed.status, plain.code]).toStrictEqual([BAD_REQUEST, "setup_link_not_found"]);
  }).pipe(Effect.scoped, Effect.provide([NodeServices.layer, secretsLive])),
);
