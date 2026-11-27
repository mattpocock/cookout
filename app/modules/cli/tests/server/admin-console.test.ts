import { Effect, FileSystem } from "effect";
import { expect, it } from "@effect/vitest";
import { freshDatabasePath, runAdmin } from "../../../testing/server.ts";
import { NodeServices } from "@effect/platform-node";
import { secretsLive } from "../../../secrets/server.ts";

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

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
