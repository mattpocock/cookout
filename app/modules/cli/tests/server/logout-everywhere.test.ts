import { Array as Arr, Effect, FileSystem, Option, Stdio, String as Str, Stream } from "effect";
import type { CliResult, CommandLineNeeds, TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import {
  TestCookout,
  answer,
  commandLineServices,
  runCookout,
  runCookoutWhile,
  testCookout,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { isUserCode, loginLinkWebPath, redeemLoginLinkPath } from "../../../logins/index.ts";
import type { Scope } from "effect";
import { request } from "../../../http/client.ts";
import { whoamiPath } from "../../../identities/index.ts";

type Env = Readonly<Record<string, string>>;

const POLL_SECONDS = 2;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const UNAUTHORIZED = 401;
const encoder = new TextEncoder();

function codeIn(prompt: string): string {
  return Option.getOrThrow(Arr.findFirst(Str.split(prompt, /[\s,]+/u), isUserCode));
}

function run(env: Env, ...args: readonly string[]): Effect.Effect<CliResult, never, CommandLineNeeds> {
  return runCookout({ args, env });
}

function typed(text: string, env: Env, ...args: readonly string[]): Effect.Effect<CliResult, never, CommandLineNeeds> {
  const terminal = Stdio.layerTest({
    stdin: Stream.make(encoder.encode(text)),
    stdinIsTerminal: Effect.succeed(true),
  });
  return runCookout({ args, env }).pipe(Effect.provide(terminal));
}

function logInByBrowser(env: Env, ada: TestIdentity): Effect.Effect<CliResult, never, CommandLineNeeds | Scope.Scope> {
  return runCookoutWhile({
    args: ["login"],
    env,
    tickSeconds: POLL_SECONDS,
    whileRunning: (prompt) => answer(() => ada.client.approveLogin(codeIn(prompt))),
  });
}

interface TwoMachines {
  readonly laptop: Env;
  readonly ada: TestIdentity;
  readonly desktop: Env;
  readonly cookout: TestCookoutService;
}

const twoMachines = Effect.gen(function* logInTwoMachines() {
  const cookout = yield* TestCookout;
  const fs = yield* FileSystem.FileSystem;
  const ada = yield* cookout.createIdentity("ada", { kind: "human" });
  const configFolder = Effect.orDie(fs.makeTempDirectoryScoped({ prefix: "cookout-config-" }));
  const laptop = { COOKOUT_URL: cookout.url, XDG_CONFIG_HOME: yield* configFolder };
  const desktop = { COOKOUT_URL: cookout.url, XDG_CONFIG_HOME: yield* configFolder };
  yield* logInByBrowser(laptop, ada);
  yield* logInByBrowser(desktop, ada);
  const machines: TwoMachines = { ada, cookout, desktop, laptop };
  return machines;
});

function browserSession(cookout: TestCookoutService, name: string): Effect.Effect<string> {
  return Effect.gen(function* redeemLoginLink() {
    const { link } = yield* answer(() => cookout.client.createLoginLink(name));
    const [, secret = ""] = Str.split(loginLinkWebPath)(link);
    const redeemed = yield* answer(() =>
      request({ baseUrl: cookout.url, body: { secret }, method: "POST", path: redeemLoginLinkPath }),
    );
    const [cookie = ""] = redeemed.headers.getSetCookie();
    const [pair] = Str.split("; ")(cookie);
    return pair;
  });
}

it.effect(
  "logout --everywhere --yes ends the other machine and a browser session, and this machine keeps working",
  () =>
    Effect.gen(function* everywhere() {
      const { cookout, desktop, laptop } = yield* twoMachines;
      const cookie = yield* browserSession(cookout, "ada");

      const loggedOut = yield* run(laptop, "logout", "--everywhere", "--yes");
      const results = yield* Effect.all([run(desktop, "whoami"), run(laptop, "whoami")], ONE_AT_A_TIME);
      const browser = yield* answer(() =>
        request({ baseUrl: cookout.url, headers: { cookie }, method: "GET", path: whoamiPath }),
      );

      expect(loggedOut).toMatchObject({
        exitCode: 0,
        stdoutJson: { ended: { agentSessions: 0, joinCodes: 0, sessions: 3 } },
      });
      expect(loggedOut.stderr).toContain("3 sessions");
      expect(results).toMatchObject([{ exitCode: 1 }, { exitCode: 0, stdoutJson: { identity: { name: "ada" } } }]);
      expect(browser.status).toBe(UNAUTHORIZED);
    }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("logout --everywhere asks on the terminal and ends nothing unless the answer is yes", () =>
  Effect.gen(function* confirmed() {
    const { desktop, laptop } = yield* twoMachines;

    const declined = yield* typed("n\n", laptop, "logout", "--everywhere");
    const [stillIn, accepted, ended] = yield* Effect.all(
      [run(desktop, "whoami"), typed("yes\n", laptop, "logout", "--everywhere"), run(desktop, "whoami")],
      ONE_AT_A_TIME,
    );

    expect(declined).toMatchObject({ exitCode: 1 });
    expect(declined.stderr).toMatch(/Log out everywhere but this machine\?[\s\S]*"code":"not_confirmed"/u);
    expect([stillIn, accepted, ended]).toMatchObject([
      { exitCode: 0 },
      { exitCode: 0, stdoutJson: { ended: { sessions: 2 } } },
      { exitCode: 1 },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("logout --everywhere with no terminal to ask on and no --yes is refused, ending nothing", () =>
  Effect.gen(function* noTerminal() {
    const { desktop, laptop } = yield* twoMachines;

    const refused = yield* run(laptop, "logout", "--everywhere");
    const stillIn = yield* run(desktop, "whoami");

    expect(refused).toMatchObject({ exitCode: 1 });
    expect(refused.stderr).toContain('"code":"usage"');
    expect(refused.stderr).toContain("--yes");
    expect(stillIn).toMatchObject({ exitCode: 0 });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("logout --everywhere ended with Ctrl-D at its question is not confirmed, ending nothing", () =>
  Effect.gen(function* endOfInput() {
    const { desktop, laptop } = yield* twoMachines;

    const declined = yield* typed("", laptop, "logout", "--everywhere");
    const stillIn = yield* run(desktop, "whoami");

    expect([declined, stillIn]).toMatchObject([{ exitCode: 1 }, { exitCode: 0 }]);
    expect(declined.stderr).toContain('"code":"not_confirmed"');
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("logout --everywhere with --url is refused with usage, ending nothing", () =>
  Effect.gen(function* everywhereWithUrl() {
    const { cookout, desktop, laptop } = yield* twoMachines;

    const refused = yield* run(laptop, "logout", "--everywhere", "--yes", "--url", cookout.url);
    const stillIn = yield* run(desktop, "whoami");

    expect([refused, stillIn]).toMatchObject([
      { exitCode: 1, stderrJson: { error: { code: "usage" } } },
      { exitCode: 0 },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
