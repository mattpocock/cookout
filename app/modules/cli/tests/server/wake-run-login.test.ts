import { Array as Arr, Effect, FileSystem, Path, Stdio, Stream } from "effect";
import type {
  BoardAgent,
  CliResult,
  CommandLineNeeds,
  CookoutRunLine,
  TestCookout,
  WakeBoard,
} from "../../../testing/server.ts";
import {
  answer,
  boardAgent,
  commandLineServices,
  cookoutRunsIn,
  joinWaking,
  mention,
  runCookout,
  startRunner,
  testCookout,
  wakeBoard,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Scope } from "effect";

type Env = Readonly<Record<string, string>>;

interface WokenWithLogin {
  readonly cormac: BoardAgent;
  readonly identities: readonly string[];
  readonly ran: readonly CookoutRunLine[];
}

const ONE_RUN = 1;
const EXIT_FAILURE = 1;
const encoder = new TextEncoder();
const RUNS = [
  { args: ["join", "--as", "cormac", "--force"], env: { CLAUDE_CODE_SESSION_ID: "another-session" } },
  { args: ["identity", "create", "dora", "--kind", "agent", "--display-name", "Dora"], env: { CLAUDECODE: "" } },
  { args: ["message", "post", "grill", "still brigid"], env: {} },
];

function logIn(env: Env, token: string): Effect.Effect<CliResult, never, CommandLineNeeds> {
  const stdin = Stdio.layerTest({ stdin: Stream.make(encoder.encode(`${token}\n`)) });
  return runCookout({ args: ["login", "--token"], env }).pipe(Effect.provide(stdin));
}

type Needs = CommandLineNeeds | TestCookout | Scope.Scope;

interface LoggedInBoard {
  readonly cormac: BoardAgent;
  readonly home: string;
  readonly on: WakeBoard;
}

const boardWithAdasLogin: Effect.Effect<LoggedInBoard, never, Needs> = Effect.gen(function* logInAndJoinCormac() {
  const fs = yield* FileSystem.FileSystem;
  const on = yield* wakeBoard;
  const home = yield* Effect.orDie(fs.makeTempDirectoryScoped({ prefix: "cookout-home-" }));
  yield* logIn({ COOKOUT_URL: on.url, HOME: home }, on.ada.token);
  const cormac = yield* boardAgent({ board: on, name: "cormac" });
  yield* runCookout({ args: ["join", "--as", "cormac"], env: cormac.env });
  return { cormac, home, on };
});

const wokenWithLogin: Effect.Effect<WokenWithLogin, never, Needs> = Effect.gen(function* wakeBrigidWithAdasLogin() {
  const path = yield* Path.Path;
  const { cormac, home, on } = yield* boardWithAdasLogin;
  const log = path.join(on.folder, "wake.log");
  yield* joinWaking({ name: "brigid", on, settings: { ack: true, log, runs: RUNS } });
  const runner = yield* startRunner({ COOKOUT_STATE_DIR: on.folder, HOME: home });
  yield* mention({ ada: on.ada, text: "@brigid join cormac" });
  yield* runner.stdoutLines(ONE_RUN);
  const listed = yield* answer(() => on.ada.client.listIdentities());
  const identities = Arr.map(listed.identities, ({ name }) => name);
  return { cormac, identities, ran: yield* cookoutRunsIn(log) };
});

it.effect(
  "a wake run never sends the person's Login under HOME, and still acts as its agent with its agent session",
  () =>
    Effect.gen(function* wakeRunWithLogin() {
      const { cormac, identities, ran } = yield* wokenWithLogin;
      const stillCormac = yield* runCookout({ args: ["whoami"], env: cormac.env });

      expect(ran).toMatchObject([
        { exitCode: EXIT_FAILURE, stderr: { error: { code: "wake_run_no_login" } } },
        { exitCode: EXIT_FAILURE, stderr: { error: { code: "wake_run_no_login" } } },
        { exitCode: 0, stdout: { message: { author: { name: "brigid" }, text: "still brigid" } } },
      ]);
      expect(stillCormac).toMatchObject({
        exitCode: 0,
        stdoutJson: { identity: { name: "cormac" }, source: "agent session token" },
      });
      expect(identities).not.toContain("dora");
    }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
