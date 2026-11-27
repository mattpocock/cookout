import { Array as Arr, Effect, String as Str, pipe } from "effect";
import type { CliResult, CommandLineNeeds } from "../../../testing/server.ts";
import {
  TestCookout,
  answer,
  commandLineServices,
  freshStateFolder,
  runCookout,
  testCookout,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { TestClock } from "effect/testing";

interface Step {
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

type Env = Readonly<Record<string, string>>;

const ONE_AT_A_TIME = { concurrency: 1 } as const;
const WHOAMI = ["whoami"];
const exportLine = /^export COOKOUT_SESSION=(?<token>\S+)$/u;

function runAll(steps: readonly Step[]): Effect.Effect<readonly CliResult[], never, CommandLineNeeds> {
  return pipe(steps, Effect.forEach(runCookout, ONE_AT_A_TIME));
}

function claudeCode(session: string, shared: Env): Env {
  return { ...shared, CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: session };
}

function exportedToken({ stdout }: CliResult): string {
  return Str.replace(exportLine, "$<token>")(stdout);
}

function withToken(env: Env, token: string): Env {
  return { ...env, COOKOUT_TOKEN: token };
}

it.effect(
  "inside a harness the credential is COOKOUT_SESSION, then the joined session, then COOKOUT_TOKEN; outside, COOKOUT_TOKEN wins",
  () =>
    Effect.gen(function* precedence() {
      const cookout = yield* TestCookout;
      const [aide, other, third] = yield* Effect.all(
        [cookout.createIdentity("release-bot"), cookout.createIdentity("other"), cookout.createIdentity("third")],
        ONE_AT_A_TIME,
      );
      const shared = { COOKOUT_STATE_DIR: yield* freshStateFolder, COOKOUT_URL: cookout.url };
      const first = claudeCode("s1", shared);
      yield* runCookout({ args: ["join", "--as", "release-bot"], env: withToken(first, aide.token) });
      const session = yield* Effect.map(
        runCookout({ args: ["join", "--as", "other", "--print-env"], env: withToken(first, other.token) }),
        exportedToken,
      );
      yield* TestClock.adjust("2 hours");
      const results = yield* runAll([
        { args: WHOAMI, env: { ...withToken(first, third.token), COOKOUT_SESSION: session } },
        { args: WHOAMI, env: withToken(first, third.token) },
        { args: WHOAMI, env: withToken(claudeCode("s2", shared), third.token) },
        { args: WHOAMI, env: { ...withToken(shared, third.token), COOKOUT_SESSION: session } },
        { args: ["leave"], env: { ...first, COOKOUT_SESSION: session } },
        { args: WHOAMI, env: first },
      ]);

      expect(Arr.map(results, ({ stderr, stdoutJson }) => ({ stderr, stdoutJson }))).toMatchObject([
        { stderr: "", stdoutJson: { identity: { name: "other" }, source: "COOKOUT_SESSION" } },
        {
          stderr: "COOKOUT_TOKEN ignored: this session joined as release-bot",
          stdoutJson: {
            identity: { name: "release-bot" },
            joinedAt: "2026-01-01T00:00:00.000Z",
            source: "agent session token",
            summary: `release-bot (agent session token, joined 2 h ago) at ${cookout.url}`,
          },
        },
        {
          stderr: "",
          stdoutJson: {
            identity: { name: "third" },
            source: "COOKOUT_TOKEN",
            summary: `third (COOKOUT_TOKEN) at ${cookout.url}`,
          },
        },
        { stderr: "", stdoutJson: { identity: { name: "third" }, source: "COOKOUT_TOKEN" } },
        { stdoutJson: { revoked: true } },
        { stderr: "", stdoutJson: { identity: { name: "release-bot" }, source: "agent session token" } },
      ]);
    }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("inside a harness with no board's URL anywhere, whoami is url_missing, with or without COOKOUT_TOKEN", () =>
  Effect.gen(function* noBoard() {
    const env = claudeCode("s1", {
      COOKOUT_STATE_DIR: yield* freshStateFolder,
      XDG_CONFIG_HOME: yield* freshStateFolder,
    });
    const results = yield* runAll([
      { args: WHOAMI, env: withToken(env, "cookout_x") },
      { args: WHOAMI, env },
    ]);
    const urlMissing = { exitCode: 1, stderrJson: { error: { code: "url_missing" } } };

    expect(results).toMatchObject([urlMissing, urlMissing]);
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("a joined session with COOKOUT_TOKEN set posts as the joined agent", () =>
  Effect.gen(function* joinedBeatsToken() {
    const cookout = yield* TestCookout;
    const [aide, other] = yield* Effect.all(
      [cookout.createIdentity("release-bot"), cookout.createIdentity("other")],
      ONE_AT_A_TIME,
    );
    const env = claudeCode("s1", { COOKOUT_STATE_DIR: yield* freshStateFolder, COOKOUT_URL: cookout.url });
    yield* answer(() => other.client.createChannel({ name: "grill" }));
    yield* runCookout({ args: ["join", "--as", "release-bot"], env: withToken(env, aide.token) });
    const posted = yield* runCookout({ args: ["message", "post", "grill", "hello"], env: withToken(env, other.token) });

    expect(posted).toMatchObject({ exitCode: 0, stdoutJson: { message: { author: { name: "release-bot" } } } });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
