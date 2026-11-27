import { TestCookout, commandLineServices, runCookout, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

const ONE_AT_A_TIME = { concurrency: 1 } as const;
const succeeded = { exitCode: 0, stderr: "" };
const verbs: readonly (readonly string[])[] = [
  ["identity", "feeder", "github"],
  ["identity", "feeder", "github", "--remove"],
];

it.effect("cookout identity feeder makes the owner's agent a feeder, and --remove makes it an agent again", () =>
  Effect.gen(function* feederVerbs() {
    const cookout = yield* TestCookout;
    const matt = yield* cookout.createIdentity("matt", { kind: "human" });
    yield* cookout.createIdentity("github", { owner: "matt" });
    const env = { COOKOUT_TOKEN: matt.token, COOKOUT_URL: cookout.url };
    const results = yield* Effect.forEach(verbs, (args) => runCookout({ args, env }), ONE_AT_A_TIME);

    const [made, cleared] = results;

    expect(made).toMatchObject({ ...succeeded, stdoutJson: { identity: { feeder: true, name: "github" } } });
    expect(cleared).toMatchObject({ ...succeeded, stdoutJson: { identity: { kind: "agent", name: "github" } } });
    expect(cleared).not.toHaveProperty("stdoutJson.identity.feeder");
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a feeder's cookout inbox and cookout watch are refused, saying it only posts", () =>
  Effect.gen(function* feederRefused() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("matt", { kind: "human" });
    const github = yield* cookout.createIdentity("github", { owner: "matt" });
    const env = { COOKOUT_TOKEN: github.token, COOKOUT_URL: cookout.url };
    yield* runCookout({ args: ["identity", "feeder", "github"], env: { ...env, COOKOUT_TOKEN: cookout.adminToken } });
    const reads: readonly (readonly string[])[] = [["inbox"], ["watch"]];
    const results = yield* Effect.forEach(reads, (args) => runCookout({ args, env }), ONE_AT_A_TIME);
    const refused = {
      exitCode: 1,
      stderrJson: {
        error: {
          code: "identity_kind",
          message: "github is a feeder: it only posts, so it can't watch, read an inbox or join.",
        },
      },
    };

    expect(results).toMatchObject([refused, refused]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
