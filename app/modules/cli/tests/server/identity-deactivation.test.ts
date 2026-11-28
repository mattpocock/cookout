import { TestCookout, answer, commandLineServices, runCookout, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

const ONE_AT_A_TIME = { concurrency: 1 } as const;
const succeeded = { exitCode: 0, stderr: "" };
const verbs: readonly (readonly string[])[] = [
  ["identity", "deactivate", "grace"],
  ["identity", "list"],
  ["identity", "list", "--deactivated"],
  ["identity", "reactivate", "grace"],
];

it.effect("cookout identity deactivate and reactivate, and identity list --deactivated shows the deactivated", () =>
  Effect.gen(function* deactivationVerbs() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("grace", { kind: "human" });
    const env = { COOKOUT_TOKEN: cookout.adminSession, COOKOUT_URL: cookout.url };
    const results = yield* Effect.forEach(verbs, (args) => runCookout({ args, env }), ONE_AT_A_TIME);

    expect(results).toMatchObject([
      { ...succeeded, stdoutJson: { identity: { deactivated: true, name: "grace" } } },
      { ...succeeded, stdoutJson: { identities: [{ name: "admin" }] } },
      { ...succeeded, stdoutJson: { identities: [{ name: "admin" }, { deactivated: true, name: "grace" }] } },
      { ...succeeded, stdoutJson: { identity: { name: "grace" } } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("cookout identity delete deletes an identity, and a second delete prints identity_not_found", () =>
  Effect.gen(function* deleteVerb() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("e2e-cli-bot");
    const env = { COOKOUT_TOKEN: cookout.adminSession, COOKOUT_URL: cookout.url };
    const deleteArgs: readonly string[] = ["identity", "delete", "e2e-cli-bot"];
    const results = yield* Effect.forEach([deleteArgs, deleteArgs], (args) => runCookout({ args, env }), ONE_AT_A_TIME);

    expect(results).toMatchObject([
      { ...succeeded, stdoutJson: { identity: { name: "e2e-cli-bot" } } },
      { exitCode: 1, stderrJson: { error: { code: "identity_not_found" } } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

const handlerVerbs: readonly (readonly string[])[] = [
  ["identity", "get", "example"],
  ["identity", "list"],
  ["identity", "deactivate", "example"],
];

it.effect("cookout identity get and list show what a handler handles, and deactivating it warns on stderr", () =>
  Effect.gen(function* handlerVerbsRun() {
    const cookout = yield* TestCookout;
    yield* answer(() =>
      cookout.client.addCommand({ name: "example", schema: { type: "object" }, url: "https://hooks.example.com/x" }),
    );
    const env = { COOKOUT_TOKEN: cookout.adminSession, COOKOUT_URL: cookout.url };
    const results = yield* Effect.forEach(handlerVerbs, (args) => runCookout({ args, env }), ONE_AT_A_TIME);

    expect(results).toMatchObject([
      { ...succeeded, stdoutJson: { identity: { handler: true, handles: ["example"], name: "example" } } },
      { ...succeeded, stdoutJson: { identities: [{ name: "admin" }, { handles: ["example"], name: "example" }] } },
      {
        exitCode: 0,
        stderrJson: { warning: "/example will stop replying until @example is reactivated." },
        stdoutJson: { identity: { deactivated: true, name: "example" } },
      },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("cookout identity get shows no handles on an identity that handles no command", () =>
  Effect.gen(function* plainGet() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("plain-bot");
    const env = { COOKOUT_TOKEN: cookout.adminSession, COOKOUT_URL: cookout.url };
    const result = yield* runCookout({ args: ["identity", "get", "plain-bot"], env });

    expect(result).toMatchObject({ ...succeeded, stdoutJson: { identity: { name: "plain-bot" } } });
    expect(result.stdoutJson).not.toHaveProperty(["identity", "handles"]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
