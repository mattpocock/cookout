import { TestCookout, answer, commandLineServices, runCookout, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

const EXIT_FAILURE = 1;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const succeeded = { exitCode: 0, stderr: "" };
const describe: readonly string[] = ["identity", "describe", "todo-bot", "Ada's to-dos"];
const get: readonly string[] = ["identity", "get", "todo-bot"];
const list: readonly string[] = ["identity", "list"];
const clear: readonly string[] = ["identity", "describe", "todo-bot", "--clear"];
const neither: readonly string[] = ["identity", "describe", "todo-bot"];
const both: readonly string[] = ["identity", "describe", "todo-bot", "Ada's to-dos", "--clear"];

it.effect("cookout identity describe, get, list and describe --clear reach the server", () =>
  Effect.gen(function* describeVerbs() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const aide = yield* cookout.createIdentity("todo-bot", { owner: "ada" });
    const env = { COOKOUT_TOKEN: ada.token, COOKOUT_URL: cookout.url };
    const results = yield* Effect.forEach(
      [describe, get, list, clear],
      (args) => runCookout({ args, env }),
      ONE_AT_A_TIME,
    );
    const after = yield* answer(() => cookout.client.getIdentity("todo-bot"));
    const described = { description: "Ada's to-dos", name: "todo-bot" };

    expect(results).toMatchObject([
      { ...succeeded, stdoutJson: { identity: described } },
      { ...succeeded, stdoutJson: { identity: described } },
      { ...succeeded, stdoutJson: { identities: [{ name: "ada" }, { name: "admin" }, described] } },
      { ...succeeded, stdoutJson: { identity: { name: "todo-bot" } } },
    ]);
    expect(after).toStrictEqual({ identity: aide.identity });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("cookout identity describe needs either a description or --clear, not both", () =>
  Effect.gen(function* textOrClear() {
    const env = { COOKOUT_URL: "http://127.0.0.1:1" };
    const results = yield* Effect.forEach([neither, both], (args) => runCookout({ args, env }), ONE_AT_A_TIME);
    const usage = { exitCode: EXIT_FAILURE, stderrJson: { error: { code: "usage" } } };

    expect(results).toMatchObject([usage, usage]);
  }).pipe(Effect.provide(commandLineServices)),
);
