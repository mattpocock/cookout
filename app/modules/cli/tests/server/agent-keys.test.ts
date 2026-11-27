import { Array as Arr, Effect, Schema, String as Str } from "effect";
import { TestCookout, commandLineServices, runCookout, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { CliResult } from "../../../testing/server.ts";

const ONE_AT_A_TIME = { concurrency: 1 } as const;
const succeeded = { exitCode: 0, stderr: "" };
const failed = { exitCode: 1 };
const BOOT = "2026-01-01T00:00:00.000Z";

const MadeSchema = Schema.Struct({ agentKey: Schema.Struct({ id: Schema.String }), token: Schema.String });
const isMade = Schema.is(MadeSchema);

const notAgentTokens: readonly (readonly string[])[] = [
  ["identity", "create", "scout", "--kind", "agent", "--display-name", "Scout"],
  ["identity", "rotate", "scout"],
  ["agent-key", "revoke", "scout", "not-an-id"],
];

function madeKey(created: CliResult): Effect.Effect<typeof MadeSchema.Type> {
  const json = created.stdoutJson;
  if (isMade(json)) {
    return Effect.succeed(json);
  }
  return Effect.die(new TypeError(`agent-key create printed no key: ${created.stdout}`));
}

it.effect("cookout agent-key create, list and revoke work, and COOKOUT_TOKEN set to a new key posts as the agent", () =>
  Effect.gen(function* keyVerbs() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const asAda = { COOKOUT_TOKEN: ada.token, COOKOUT_URL: cookout.url };
    yield* runCookout({
      args: ["identity", "create", "release-bot", "--kind", "agent", "--display-name", "Release bot"],
      env: asAda,
    });
    const created = yield* runCookout({
      args: ["agent-key", "create", "release-bot", "ci", "--expires", "30d"],
      env: asAda,
    });
    const made = yield* madeKey(created);
    const asKey = { COOKOUT_TOKEN: made.token, COOKOUT_URL: cookout.url };
    const steps: readonly { readonly args: readonly string[]; readonly env: Readonly<Record<string, string>> }[] = [
      { args: ["channel", "create", "deploys"], env: asAda },
      { args: ["message", "post", "deploys", "Deployed 1.4.2."], env: asKey },
      { args: ["agent-key", "list", "release-bot"], env: asAda },
      { args: ["agent-key", "revoke", "release-bot", made.agentKey.id], env: asAda },
      { args: ["message", "post", "deploys", "Again."], env: asKey },
      { args: ["agent-key", "create", "release-bot", "deploy"], env: asAda },
    ];
    const results = yield* Effect.forEach(steps, (step) => runCookout(step), ONE_AT_A_TIME);

    expect([created, ...results]).toMatchObject([
      { ...succeeded, stdoutJson: { agentKey: { expiresAt: "2026-01-31T00:00:00.000Z", madeAt: BOOT, name: "ci" } } },
      { ...succeeded, stdoutJson: { channel: { name: "deploys" } } },
      { ...succeeded, stdoutJson: { message: { author: { name: "release-bot" }, text: "Deployed 1.4.2." } } },
      {
        ...succeeded,
        stdoutJson: { agentKeys: [{ id: made.agentKey.id, lastUsedAt: BOOT, madeAt: BOOT, name: "ci" }] },
      },
      { ...succeeded, stdoutJson: { ended: 1 } },
      { ...failed, stderrJson: { error: { code: "token_revoked" } } },
      { ...succeeded, stdoutJson: { agentKey: { madeAt: BOOT, name: "deploy" } } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("cookout identity create prints an agent with no token, rotate refuses it, and a bad key ID is refused", () =>
  Effect.gen(function* noAgentTokens() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const asAda = { COOKOUT_TOKEN: ada.token, COOKOUT_URL: cookout.url };
    const results = yield* Effect.forEach(notAgentTokens, (args) => runCookout({ args, env: asAda }), ONE_AT_A_TIME);

    expect({ results, stdouts: Arr.map(results, ({ stdout }) => Str.includes("token")(stdout)) }).toMatchObject({
      results: [
        {
          ...succeeded,
          stdoutJson: {
            identity: {
              admin: false,
              createdAt: BOOT,
              displayName: "Scout",
              kind: "agent",
              name: "scout",
              owner: "ada",
            },
          },
        },
        { ...failed, stderrJson: { error: { code: "agent_keys_instead" } } },
        { ...failed, stderrJson: { error: { code: "agent_key_not_found" } } },
      ],
      stdouts: [false, false, false],
    });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
