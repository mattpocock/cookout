import { Array as Arr, Effect, FileSystem, Option, Schema, Stdio, String as Str, Stream } from "effect";
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
const SOME_TEXT: unknown = expect.any(String);
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

const ListedSession = Schema.Struct({ id: Schema.String });
const isSessionList = Schema.is(Schema.Struct({ sessions: Schema.Array(ListedSession) }));

function sessionIds({ stdout, stdoutJson }: CliResult): Effect.Effect<readonly string[]> {
  if (isSessionList(stdoutJson)) {
    return Effect.succeed(Arr.map(stdoutJson.sessions, (session) => session.id));
  }
  return Effect.die(`not a session list: ${stdout}`);
}

function listedOn(env: Env): Effect.Effect<readonly string[], never, CommandLineNeeds> {
  return Effect.flatMap(run(env, "login", "list"), sessionIds);
}

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

const session = { expiresAt: SOME_TEXT, id: SOME_TEXT, kind: "cli", lastUsedAt: SOME_TEXT, madeAt: SOME_TEXT };

it.effect("login list on one of two machines logged in as ada lists both and marks its own as current", () =>
  Effect.gen(function* listBoth() {
    const { desktop, laptop } = yield* twoMachines;

    const results = yield* Effect.all([run(laptop, "login", "list"), run(desktop, "login", "list")], ONE_AT_A_TIME);

    expect(results).toMatchObject([
      {
        exitCode: 0,
        stdoutJson: {
          sessions: [
            { ...session, current: true },
            { ...session, current: false },
          ],
        },
      },
      {
        exitCode: 0,
        stdoutJson: {
          sessions: [
            { ...session, current: false },
            { ...session, current: true },
          ],
        },
      },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("login revoke of another machine's session ends it, says to log in again there, and keeps this one", () =>
  Effect.gen(function* revokeOther() {
    const { cookout, desktop, laptop } = yield* twoMachines;
    const [, other = ""] = yield* listedOn(laptop);

    const revoked = yield* run(laptop, "login", "revoke", other);
    const ended = yield* run(desktop, "whoami");
    const kept = yield* run(laptop, "whoami");

    expect(revoked).toMatchObject({ exitCode: 0, stdoutJson: { ended: 1, loggedOut: false } });
    expect([ended, kept]).toMatchObject([
      { exitCode: 1, stderrJson: { error: { code: SOME_TEXT } } },
      { exitCode: 0, stdoutJson: { identity: { name: "ada" }, source: "login" } },
    ]);
    expect(ended.stderr).toContain(`The Login saved for ${cookout.url} no longer works: run \`cookout login\``);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("login revoke of this machine's own session also removes its saved Login, as logout does", () =>
  Effect.gen(function* revokeOwn() {
    const { cookout, desktop, laptop } = yield* twoMachines;
    const [own = ""] = yield* listedOn(laptop);

    const revoked = yield* run(laptop, "login", "revoke", own);
    const results = yield* Effect.all([run(laptop, "logout"), run(desktop, "whoami")], ONE_AT_A_TIME);

    expect(revoked).toMatchObject({ exitCode: 0, stdoutJson: { ended: 1, loggedOut: true, url: cookout.url } });
    expect(results).toMatchObject([
      { exitCode: 0, stdoutJson: { loggedOut: false, message: `There is no Login for ${cookout.url}.` } },
      { exitCode: 0, stdoutJson: { identity: { name: "ada" } } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

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
        stdoutJson: { ended: { agentSessions: 0, joinCodes: 0, sessions: 2 } },
      });
      expect(loggedOut.stderr).toContain("2 sessions");
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
      { exitCode: 0, stdoutJson: { ended: { sessions: 1 } } },
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

it.effect("login list, login revoke and logout --everywhere with an agent's token are refused with human_only", () =>
  Effect.gen(function* agentRefused() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("ada", { kind: "human" });
    const aide = yield* cookout.createIdentity("release-bot", { owner: "ada" });
    const env = { COOKOUT_TOKEN: aide.token, COOKOUT_URL: cookout.url };

    const results = yield* Effect.all(
      [
        run(env, "login", "list"),
        run(env, "login", "revoke", "0123456789abcdef"),
        run(env, "logout", "--everywhere", "--yes"),
      ],
      ONE_AT_A_TIME,
    );

    expect(results).toMatchObject([
      { exitCode: 1, stderrJson: { error: { code: "human_only" } } },
      { exitCode: 1, stderrJson: { error: { code: "human_only" } } },
      { exitCode: 1, stderrJson: { error: { code: "human_only" } } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("login revoke of an id that isn't a session id is refused with session_not_found", () =>
  Effect.gen(function* malformedId() {
    const { laptop } = yield* twoMachines;

    const refused = yield* run(laptop, "login", "revoke", "not-an-id");

    expect(refused).toMatchObject({ exitCode: 1, stderrJson: { error: { code: "session_not_found" } } });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("login --help lists list and revoke, and logout --help lists --everywhere and --yes", () =>
  Effect.gen(function* help() {
    const cookout = yield* TestCookout;
    const env = { COOKOUT_URL: cookout.url };

    const login = yield* run(env, "login", "--help");
    const logout = yield* run(env, "logout", "--help");

    expect(login.stdout).toMatch(/list\s+List this person's live sessions/u);
    expect(login.stdout).toMatch(/revoke\s+Revoke one of this person's sessions/u);
    expect(logout.stdout).toContain("--everywhere");
    expect(logout.stdout).toContain("--yes");
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
