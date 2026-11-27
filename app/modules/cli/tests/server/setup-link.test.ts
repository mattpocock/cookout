import { Array as Arr, Effect, Schema, String as Str } from "effect";
import {
  answer,
  freshDatabasePath,
  identityFixture,
  openStore,
  runAdmin,
  startServe,
  testSecretsCipher,
} from "../../../testing/server.ts";
import { createTestAgent, testClient } from "../../../testing/index.ts";
import { expect, it } from "@effect/vitest";
import { loginLinkWebPath, redeemLoginLinkPath, redeemSetupLinkPath, setupLinkWebPath } from "../../../logins/index.ts";
import { token, tokenHash, whoamiPath } from "../../../identities/index.ts";
import type { CommandLineNeeds } from "../../../testing/server.ts";
import { NodeServices } from "@effect/platform-node";
import { request } from "../../../http/client.ts";
import { secretsLive } from "../../../secrets/server.ts";
import { sqliteStorage } from "../../../storage/server.ts";

const NO_TOKEN = "";
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const OK = 200;
const NOT_FOUND = 404;
const isSetupLine = Schema.is(Schema.Struct({ expiresAt: Schema.String, setupLink: Schema.String }));

function setupLinksIn(lines: readonly unknown[]): readonly string[] {
  return Arr.map(Arr.filter(lines, isSetupLine), ({ setupLink }) => setupLink);
}

function secretAfter(path: string, link: string): string {
  const [, secret = ""] = Str.split(path)(link);
  return secret;
}

interface Answered {
  readonly status: number;
  readonly json: unknown;
  readonly cookie: string;
}

function posted(url: string, path: string, body: object): Effect.Effect<Answered> {
  return Effect.map(
    answer(() => request({ baseUrl: url, body, method: "POST", path })),
    ({ headers, json, status }) => {
      const [cookie = ""] = headers.getSetCookie();
      return { cookie: Arr.headNonEmpty(Str.split("; ")(cookie)), json, status };
    },
  );
}

function redeemedSetup(url: string, link: string, name: string): Effect.Effect<Answered> {
  return posted(url, redeemSetupLinkPath, { name, secret: secretAfter(setupLinkWebPath, link) });
}

function whoamiBy(url: string, cookie: string): Effect.Effect<unknown> {
  return Effect.map(
    answer(() => request({ baseUrl: url, headers: { cookie }, method: "GET", path: whoamiPath })),
    ({ json }) => json,
  );
}

interface FirstBoot {
  readonly firstLinks: readonly string[];
  readonly status: number;
  readonly whoami: unknown;
  readonly secondLinks: readonly string[];
}

function bootTwiceRedeemingBetween(): Effect.Effect<FirstBoot, never, CommandLineNeeds> {
  return Effect.scoped(
    Effect.gen(function* setUpThenRestart() {
      const database = yield* freshDatabasePath;
      const first = yield* startServe({ adminToken: NO_TOKEN, database });
      const [link = ""] = setupLinksIn(first.lines);
      const redeemed = yield* redeemedSetup(first.url, link, "grace");
      const whoami = yield* whoamiBy(first.url, redeemed.cookie);
      yield* first.stop;
      const second = yield* startServe({ adminToken: NO_TOKEN, database });
      const seen = { firstLinks: setupLinksIn(first.lines), secondLinks: setupLinksIn(second.lines) };
      return { ...seen, status: redeemed.status, whoami };
    }),
  );
}

it.effect(
  "cookout serve on a fresh SQLite store with no COOKOUT_ADMIN_TOKEN prints a setup link that makes the first admin, and a second boot prints none",
  () =>
    Effect.gen(function* firstBoot() {
      const seen = yield* bootTwiceRedeemingBetween();

      expect(seen).toMatchObject({
        firstLinks: [expect.stringContaining(setupLinkWebPath)],
        secondLinks: [],
        status: OK,
        whoami: { identity: { admin: true, kind: "human", name: "grace" } },
      });
    }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

function linksOfTwoBoots(): Effect.Effect<readonly [string, string, number], never, CommandLineNeeds> {
  return Effect.scoped(
    Effect.gen(function* bootTwice() {
      const database = yield* freshDatabasePath;
      const first = yield* startServe({ adminToken: NO_TOKEN, database });
      yield* first.stop;
      const second = yield* startServe({ adminToken: NO_TOKEN, database, env: { COOKOUT_ADMIN_TOKEN: "" } });
      const [earlier = ""] = setupLinksIn(first.lines);
      const [later = ""] = setupLinksIn(second.lines);
      const stale = yield* redeemedSetup(second.url, earlier, "grace");
      return [earlier, later, stale.status] as const;
    }),
  );
}

it.effect(
  "each boot with no admin, and COOKOUT_ADMIN_TOKEN unset or empty, prints a fresh setup link, and the earlier one stops working",
  () =>
    Effect.gen(function* twoBoots() {
      const [earlier, later, stale] = yield* linksOfTwoBoots();

      expect([later === earlier, Str.isNonEmpty(later), stale]).toStrictEqual([false, true, NOT_FOUND]);
    }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

it.effect("cookout serve with COOKOUT_ADMIN_TOKEN set prints no setup link", () =>
  Effect.scoped(
    Effect.gen(function* tokenSet() {
      const database = yield* freshDatabasePath;
      const server = yield* startServe({ database });

      expect(setupLinksIn(server.lines)).toStrictEqual([]);
    }),
  ).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

const isLoginLinkLine = Schema.is(Schema.Struct({ expiresAt: Schema.String, loginLink: Schema.String }));

function loginSecretOf(printed: unknown): string {
  if (isLoginLinkLine(printed)) {
    return secretAfter(loginLinkWebPath, printed.loginLink);
  }
  return "";
}

function consoleLinkFor(database: string, name: string): Effect.Effect<string, never, CommandLineNeeds> {
  return Effect.map(runAdmin({ args: ["login-link", name], database }), ({ stdoutJson }) => loginSecretOf(stdoutJson));
}

interface ConsoleLinks {
  readonly running: readonly [number, number];
  readonly stopped: number;
  readonly alerts: unknown;
  readonly adminNamed: boolean;
}

interface ConsoleActs {
  readonly alerts: readonly unknown[];
  readonly adminNamed: boolean;
}

function consoleActsOf(server: { readonly adminToken: string; readonly url: string }): Effect.Effect<ConsoleActs> {
  return Effect.gen(function* readConsoleActs() {
    const admin = testClient({ env: {}, token: server.adminToken, url: server.url });
    const ada = yield* answer(() => admin.rotateToken("ada"));
    const inbox = yield* answer(() => testClient({ env: {}, token: ada.token, url: server.url }).inbox());
    const acts = Arr.filter(inbox.alerts, (alert) => "login" in alert && alert.login.kind === "admin act");
    return { adminNamed: Arr.some(acts, (alert) => "login" in alert && "admin" in alert.login), alerts: acts };
  });
}

function redeemedTwice(url: string, secret: string): Effect.Effect<readonly [number, number]> {
  return Effect.gen(function* redeemTwice() {
    const once = yield* posted(url, redeemLoginLinkPath, { secret });
    const again = yield* posted(url, redeemLoginLinkPath, { secret });
    return [once.status, again.status] as const;
  });
}

function adaCreatedOn(server: { readonly adminToken: string; readonly url: string }): Effect.Effect<void> {
  const admin = testClient({ env: {}, token: server.adminToken, url: server.url });
  return Effect.asVoid(answer(() => admin.createIdentity({ kind: "human", name: "ada" })));
}

function consoleLinksRunningAndStopped(): Effect.Effect<ConsoleLinks, never, CommandLineNeeds> {
  return Effect.scoped(
    Effect.gen(function* runningThenStopped() {
      const database = yield* freshDatabasePath;
      const first = yield* startServe({ database });
      yield* adaCreatedOn(first);
      const running = yield* Effect.flatMap(consoleLinkFor(database, "ada"), (secret) =>
        redeemedTwice(first.url, secret),
      );
      yield* first.stop;
      const secret = yield* consoleLinkFor(database, "ada");
      const second = yield* startServe({ database });
      const stopped = yield* posted(second.url, redeemLoginLinkPath, { secret });
      const acts = yield* consoleActsOf(second);
      return { ...acts, running, stopped: stopped.status };
    }),
  );
}

it.effect(
  "cookout admin login-link logs a person in once, with the server running or stopped, and their Login alert names the server console",
  () =>
    Effect.gen(function* consoleLinks() {
      const seen = yield* consoleLinksRunningAndStopped();
      const consoleAct = { login: { act: "sent a login link", kind: "admin act" } };

      expect(seen).toMatchObject({
        adminNamed: false,
        alerts: [consoleAct, consoleAct],
        running: [OK, NOT_FOUND],
        stopped: OK,
      });
    }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

function refusedNames(): Effect.Effect<readonly unknown[], never, CommandLineNeeds> {
  return Effect.scoped(
    Effect.gen(function* refuseNames() {
      const database = yield* freshDatabasePath;
      const server = yield* startServe({ database });
      const admin = testClient({ env: {}, token: server.adminToken, url: server.url });
      yield* answer(() => createTestAgent({ by: admin, name: "triage" }));
      const runs = yield* Effect.forEach(
        ["nobody", "triage"],
        (name) => runAdmin({ args: ["login-link", name], database }),
        {
          concurrency: 1,
        },
      );
      return Arr.map(runs, ({ exitCode, stderrJson, stdout }) => ({ exitCode, stderrJson, stdout }));
    }),
  );
}

it.effect("cookout admin login-link exits 1 for an unknown name and for an agent, printing no link", () =>
  Effect.gen(function* refused() {
    const runs = yield* refusedNames();

    expect(runs).toMatchObject([
      { exitCode: EXIT_FAILURE, stderrJson: { error: { code: "identity_not_found" } }, stdout: "" },
      { exitCode: EXIT_FAILURE, stderrJson: { error: { code: "human_only" } }, stdout: "" },
    ]);
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

function setupLinkCommandRuns(): Effect.Effect<readonly unknown[], never, CommandLineNeeds> {
  return Effect.gen(function* runSetupLinkCommand() {
    const database = yield* freshDatabasePath;
    const before = yield* runAdmin({ args: ["setup-link"], database });
    const [link = ""] = setupLinksIn([before.stdoutJson]);
    const server = yield* startServe({ adminToken: NO_TOKEN, database });
    yield* server.stop;
    const after = yield* runAdmin({ args: ["setup-link"], database });
    yield* Effect.scoped(Effect.flatMap(startServe({ database }), ({ stop }) => stop));
    const refused = yield* runAdmin({ args: ["setup-link"], database });
    return [Str.includes(setupLinkWebPath)(link), after.exitCode, refused.exitCode, refused.stderrJson];
  }).pipe(Effect.scoped);
}

it.effect("cookout admin setup-link prints a fresh link while no admin exists, and refuses once one does", () =>
  Effect.gen(function* setupLinkCommand() {
    const runs = yield* setupLinkCommandRuns();

    expect(runs).toMatchObject([true, EXIT_SUCCESS, EXIT_FAILURE, { error: { code: "admin_exists" } }]);
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

const ada = identityFixture("ada", { kind: "human" });

function takenThenFree(): Effect.Effect<readonly [unknown, unknown], never, CommandLineNeeds> {
  return Effect.scoped(
    Effect.gen(function* redeemTakenName() {
      const database = yield* freshDatabasePath;
      const store = yield* openStore(sqliteStorage({ cipher: testSecretsCipher, path: database }));
      yield* Effect.andThen(store.storage.createIdentity(ada, tokenHash("hash:ada")), store.close);
      const server = yield* startServe({ adminToken: NO_TOKEN, database });
      const [link = ""] = setupLinksIn(server.lines);
      const taken = yield* redeemedSetup(server.url, link, "ada");
      const secret = secretAfter(setupLinkWebPath, link);
      const sent = { displayName: "Grace", name: "grace", secret: token(secret) };
      const free = yield* answer(() => testClient({ env: {}, url: server.url }).redeemSetupLink(sent));
      return [taken.json, free] as const;
    }),
  ).pipe(Effect.orDie);
}

it.effect("a setup link sent with a name already taken is refused, and still makes the first admin under another", () =>
  Effect.gen(function* takenName() {
    const [taken, free] = yield* takenThenFree();

    const grace = { identity: { admin: true, displayName: "Grace", name: "grace" } };

    expect([taken, free]).toMatchObject([{ error: { code: "identity_exists" } }, grace]);
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);
