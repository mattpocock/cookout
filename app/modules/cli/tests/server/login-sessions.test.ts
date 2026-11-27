import { Array as Arr, Effect, FileSystem, Option, Order, Schema, String as Str } from "effect";
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
import type { Scope } from "effect";
import { isUserCode } from "../../../logins/index.ts";

type Env = Readonly<Record<string, string>>;

const POLL_SECONDS = 2;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const SOME_TEXT: unknown = expect.any(String);

function codeIn(prompt: string): string {
  return Option.getOrThrow(Arr.findFirst(Str.split(prompt, /[\s,]+/u), isUserCode));
}

function run(env: Env, ...args: readonly string[]): Effect.Effect<CliResult, never, CommandLineNeeds> {
  return runCookout({ args, env });
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

const ListedSession = Schema.Struct({ current: Schema.Boolean, id: Schema.String, kind: Schema.String });
const isSessionList = Schema.is(Schema.Struct({ sessions: Schema.Array(ListedSession) }));

interface Listed {
  readonly kinds: readonly string[];
  readonly other: string;
  readonly own: string;
}

function kindOf({ current, kind }: typeof ListedSession.Type): string {
  if (current) {
    return `${kind} (current)`;
  }
  return kind;
}

function ownAndOther({ stdout, stdoutJson }: CliResult): Effect.Effect<Listed> {
  if (!isSessionList(stdoutJson)) {
    return Effect.die(`not a session list: ${stdout}`);
  }
  const { sessions } = stdoutJson;
  const own = Arr.findFirst(sessions, (listed) => listed.current);
  const other = Arr.findFirst(sessions, (listed) => !listed.current && listed.kind === "cli");
  return Effect.succeed({
    kinds: Arr.sort(Arr.map(sessions, kindOf), Order.String),
    other: Option.getOrThrow(Option.map(other, (listed) => listed.id)),
    own: Option.getOrThrow(Option.map(own, (listed) => listed.id)),
  });
}

function listedOn(env: Env): Effect.Effect<Listed, never, CommandLineNeeds> {
  return Effect.flatMap(run(env, "login", "list"), ownAndOther);
}

it.effect("login list on one of two machines logged in as ada lists both and marks its own as current", () =>
  Effect.gen(function* listBoth() {
    const { desktop, laptop } = yield* twoMachines;

    const onLaptop = yield* listedOn(laptop);
    const onDesktop = yield* listedOn(desktop);

    expect([onLaptop.kinds, onDesktop.kinds]).toStrictEqual([
      ["cli", "cli (current)", "web"],
      ["cli", "cli (current)", "web"],
    ]);
    expect([onLaptop.own, onLaptop.other]).toStrictEqual([onDesktop.other, onDesktop.own]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("login revoke of another machine's session ends it, says to log in again there, and keeps this one", () =>
  Effect.gen(function* revokeOther() {
    const { cookout, desktop, laptop } = yield* twoMachines;
    const { other } = yield* listedOn(laptop);

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
    const { own } = yield* listedOn(laptop);

    const revoked = yield* run(laptop, "login", "revoke", own);
    const results = yield* Effect.all([run(laptop, "logout"), run(desktop, "whoami")], ONE_AT_A_TIME);

    expect(revoked).toMatchObject({ exitCode: 0, stdoutJson: { ended: 1, loggedOut: true, url: cookout.url } });
    expect(results).toMatchObject([
      { exitCode: 0, stdoutJson: { loggedOut: false, message: `There is no Login for ${cookout.url}.` } },
      { exitCode: 0, stdoutJson: { identity: { name: "ada" } } },
    ]);
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
