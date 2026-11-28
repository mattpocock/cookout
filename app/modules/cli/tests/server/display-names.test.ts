import { Array as Arr, Effect, Predicate } from "effect";
import { TestCookout, answer, commandLineServices, runCookout, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";

const EXIT_FAILURE = 1;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const succeeded = { exitCode: 0, stderr: "" };
const create: readonly string[] = ["identity", "create", "linus", "--kind", "human", "--display-name", "Linus T"];
const set: readonly string[] = ["identity", "display-name", "linus", "Linus Torvalds"];
const clear: readonly string[] = ["identity", "display-name", "linus", "--clear"];
const neither: readonly string[] = ["identity", "display-name", "linus"];
const both: readonly string[] = ["identity", "display-name", "linus", "Linus", "--clear"];

it.effect("cookout identity create --display-name, display-name and --clear reach the server", () =>
  Effect.gen(function* displayNameVerbs() {
    const cookout = yield* TestCookout;
    const env = { COOKOUT_TOKEN: cookout.adminSession, COOKOUT_URL: cookout.url };
    const results = yield* Effect.forEach([create, set, clear], (args) => runCookout({ args, env }), ONE_AT_A_TIME);
    const { identities } = yield* answer(cookout.client.listIdentities);

    expect(results).toMatchObject([
      { ...succeeded, stdoutJson: { identity: { displayName: "Linus T", name: "linus" } } },
      { ...succeeded, stdoutJson: { identity: { displayName: "Linus Torvalds", name: "linus" } } },
      { ...succeeded, stdoutJson: { identity: { name: "linus" } } },
    ]);
    expect(Arr.some(identities, ({ displayName }) => Predicate.isNotUndefined(displayName))).toBe(false);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("cookout identity display-name needs either a display name or --clear, not both", () =>
  Effect.gen(function* textOrClear() {
    const env = { COOKOUT_URL: "http://127.0.0.1:1" };
    const results = yield* Effect.forEach([neither, both], (args) => runCookout({ args, env }), ONE_AT_A_TIME);
    const usage = { exitCode: EXIT_FAILURE, stderrJson: { error: { code: "usage" } } };

    expect(results).toMatchObject([usage, usage]);
  }).pipe(Effect.provide(commandLineServices)),
);
