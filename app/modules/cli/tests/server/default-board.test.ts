import { Array as Arr, Effect, FileSystem, Option, Path, Stdio, String as Str, Stream } from "effect";
import type { CliResult, CommandLineNeeds, TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import type { Layer, Scope } from "effect";
import {
  TestCookout,
  answer,
  commandLineServices,
  runCookout,
  runCookoutWhile,
  serverAnswering,
  testCookout,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { isUserCode } from "../../../logins/index.ts";

const ONE_AT_A_TIME = { concurrency: 1 } as const;
const POLL_SECONDS = 2;

function codeIn(prompt: string): string {
  return Option.getOrThrow(Arr.findFirst(Str.split(prompt, /[\s,]+/u), isUserCode));
}
const NOTHING_LISTENS = "http://127.0.0.1:1";

type Env = Readonly<Record<string, string>>;

interface BoardSetup {
  readonly ada: TestIdentity;
  readonly cookout: TestCookoutService;
  readonly env: Env;
  readonly file: string;
}

const encoder = new TextEncoder();

function typedOnTerminal(text: string): Layer.Layer<Stdio.Stdio> {
  return Stdio.layerTest({ stdin: Stream.make(encoder.encode(text)), stdinIsTerminal: Effect.succeed(true) });
}

function logIn(env: Env, token: string, ...args: readonly string[]): Effect.Effect<CliResult, never, CommandLineNeeds> {
  const stdin = Stdio.layerTest({ stdin: Stream.make(encoder.encode(`${token}\n`)) });
  return runCookout({ args: ["login", "--token", ...args], env }).pipe(Effect.provide(stdin));
}

function logInTyping(env: Env, token: string, typed: string): Effect.Effect<CliResult, never, CommandLineNeeds> {
  return runCookout({ args: ["login", "--token"], env }).pipe(Effect.provide(typedOnTerminal(`${typed}\n${token}\n`)));
}

function logInByBrowserTypingNothing(env: Env): Effect.Effect<CliResult, never, CommandLineNeeds> {
  return runCookout({ args: ["login"], env }).pipe(Effect.provide(typedOnTerminal("  \n")));
}

function logInByBrowserTyping(
  env: Env,
  ada: TestIdentity,
  typed: string,
): Effect.Effect<CliResult, never, CommandLineNeeds | Scope.Scope> {
  return runCookoutWhile({
    args: ["login"],
    env,
    tickSeconds: POLL_SECONDS,
    whileRunning: (prompt) => answer(() => ada.client.approveLogin(codeIn(prompt))),
  }).pipe(Effect.provide(typedOnTerminal(`${typed}\n`)));
}

function run(env: Env, ...args: readonly string[]): Effect.Effect<CliResult, never, CommandLineNeeds> {
  return runCookout({ args, env });
}

const setUp: Effect.Effect<BoardSetup, never, CommandLineNeeds | TestCookout | Scope.Scope> = Effect.gen(
  function* makeConfigFolder() {
    const cookout = yield* TestCookout;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const folder = yield* Effect.orDie(fs.makeTempDirectoryScoped({ prefix: "cookout-config-" }));
    return { ada, cookout, env: { XDG_CONFIG_HOME: folder }, file: path.join(folder, "cookout", "credentials") };
  },
);

it.effect("login --url makes that board this machine's default, so later commands need no COOKOUT_URL", () =>
  Effect.gen(function* defaultBoard() {
    const { ada, cookout, env } = yield* setUp;
    yield* answer(() => ada.client.createChannel({ name: "grill" }));

    const results = yield* Effect.all(
      [logIn(env, ada.token, "--url", cookout.url), run(env, "whoami"), run(env, "message", "post", "grill", "hi")],
      ONE_AT_A_TIME,
    );

    expect(results).toMatchObject([
      { exitCode: 0, stdoutJson: { identity: { name: "ada" }, url: cookout.url } },
      { exitCode: 0, stdoutJson: { source: "login", summary: `ada (login) at ${cookout.url}`, url: cookout.url } },
      { exitCode: 0, stdoutJson: { message: { author: { name: "ada" } } } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("with no --url and no COOKOUT_URL, login asks for the board's URL on a terminal", () =>
  Effect.gen(function* askedForUrl() {
    const { ada, cookout, env } = yield* setUp;

    const login = yield* logInTyping(env, ada.token, cookout.url);
    const whoami = yield* run(env, "whoami");

    expect(login).toMatchObject({ exitCode: 0, stdoutJson: { url: cookout.url } });
    expect(whoami).toMatchObject({ exitCode: 0, stdoutJson: { source: "login", url: cookout.url } });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a browser login with no URL given asks for it on a terminal, then waits for approval", () =>
  Effect.gen(function* browserAskedForUrl() {
    const { ada, cookout, env } = yield* setUp;

    const login = yield* logInByBrowserTyping(env, ada, cookout.url);
    const whoami = yield* run(env, "whoami");

    expect(login).toMatchObject({ exitCode: 0, stdoutJson: { identity: { name: "ada" }, url: cookout.url } });
    expect(whoami).toMatchObject({ exitCode: 0, stdoutJson: { source: "login", url: cookout.url } });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("with no URL given and no terminal to ask on, or nothing typed, login is refused with usage", () =>
  Effect.gen(function* noTerminal() {
    const { ada, env, file } = yield* setUp;
    const fs = yield* FileSystem.FileSystem;

    const results = yield* Effect.all(
      [logIn(env, ada.token), logInTyping(env, ada.token, "  "), run(env, "login"), logInByBrowserTypingNothing(env)],
      ONE_AT_A_TIME,
    );
    const stored = yield* Effect.orDie(fs.exists(file));

    expect(results).toMatchObject([
      { exitCode: 1, stderrJson: { error: { code: "usage" } } },
      { exitCode: 1, stderrJson: { error: { code: "usage" } } },
      { exitCode: 1, stderrJson: { error: { code: "usage" } } },
      { exitCode: 1, stderrJson: { error: { code: "usage" } } },
    ]);
    expect(stored).toBe(false);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect(
  "login refuses a URL where nothing answers as unreachable, and one that isn't a cookout server, and stores nothing",
  () =>
    Effect.gen(function* notACookout() {
      const { ada, env, file } = yield* setUp;
      const fs = yield* FileSystem.FileSystem;
      const notCookout = yield* serverAnswering({ status: 404, text: "Not Found" });

      const results = yield* Effect.all(
        [
          logIn(env, ada.token, "--url", NOTHING_LISTENS),
          logIn(env, ada.token, "--url", notCookout),
          run(env, "login", "--url", notCookout),
        ],
        ONE_AT_A_TIME,
      );
      const stored = yield* Effect.orDie(fs.exists(file));

      expect(results).toMatchObject([
        { exitCode: 1, stderrJson: { error: { code: "unreachable" } } },
        { exitCode: 1, stderrJson: { error: { code: "not_a_cookout" } } },
        { exitCode: 1, stderrJson: { error: { code: "not_a_cookout" } } },
      ]);
      expect(stored).toBe(false);
    }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a bare host such as 127.0.0.1:1 means https://", () =>
  Effect.gen(function* bareHost() {
    const { ada, env } = yield* setUp;

    const login = yield* logIn(env, ada.token, "--url", "127.0.0.1:1");

    expect(login).toMatchObject({ exitCode: 1, stderrJson: { error: { code: "unreachable" } } });
    expect(login.stderr).toContain("cannot reach https://127.0.0.1:1: ");
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("the most recent login is the default board, and COOKOUT_URL overrides it", () =>
  Effect.gen(function* overrideDefault() {
    const { ada, cookout, env } = yield* setUp;
    const second = yield* cookout.startSecondServer;
    yield* logIn(env, ada.token, "--url", cookout.url);
    yield* logIn(env, ada.token, "--url", second.url);

    const results = yield* Effect.all(
      [run(env, "whoami"), run({ ...env, COOKOUT_URL: cookout.url }, "whoami")],
      ONE_AT_A_TIME,
    );

    expect(results).toMatchObject([
      { exitCode: 0, stdoutJson: { url: second.url } },
      { exitCode: 0, stdoutJson: { url: cookout.url } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("logout removes the default board's Login, or the one for --url", () =>
  Effect.gen(function* logoutDefault() {
    const { ada, cookout, env } = yield* setUp;
    const second = yield* cookout.startSecondServer;
    yield* logIn(env, ada.token, "--url", cookout.url);
    yield* logIn(env, ada.token, "--url", second.url);

    const results = yield* Effect.all(
      [
        run(env, "logout", "--url", cookout.url),
        run({ ...env, COOKOUT_URL: cookout.url }, "whoami"),
        run(env, "logout"),
        run(env, "whoami"),
        run(env, "logout"),
      ],
      ONE_AT_A_TIME,
    );

    expect(results).toMatchObject([
      { exitCode: 0, stdoutJson: { loggedOut: true, url: cookout.url } },
      { exitCode: 1, stderrJson: { error: { code: "token_missing" } } },
      { exitCode: 0, stdoutJson: { loggedOut: true, url: second.url } },
      { exitCode: 1, stderrJson: { error: { code: "url_missing" } } },
      { exitCode: 0, stdoutJson: { loggedOut: false } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("an agent session with no COOKOUT_URL joins the default board, but never sends the Login's token", () =>
  Effect.gen(function* agentUsesDefaultBoard() {
    const { ada, cookout, env } = yield* setUp;
    const fs = yield* FileSystem.FileSystem;
    const aide = yield* cookout.createIdentity("release-bot");
    const stateFolder = yield* Effect.orDie(fs.makeTempDirectoryScoped({ prefix: "cookout-state-" }));
    const agent = { ...env, CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: "session-1", COOKOUT_STATE_DIR: stateFolder };
    yield* logIn(env, ada.token, "--url", cookout.url);

    const results = yield* Effect.all(
      [
        run(agent, "whoami"),
        run({ ...agent, COOKOUT_TOKEN: aide.token }, "join", "--as", "release-bot"),
        run(agent, "whoami"),
      ],
      ONE_AT_A_TIME,
    );

    expect(results).toMatchObject([
      { exitCode: 1, stderrJson: { error: { code: "not_joined" } } },
      { exitCode: 0 },
      { exitCode: 0, stdoutJson: { identity: { name: "release-bot" }, url: cookout.url } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
