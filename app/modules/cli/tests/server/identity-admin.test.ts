import { Array as Arr, Effect, String as Str } from "effect";
import { TestCookout, answer, commandLineServices, runCookout, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { sessionPath, whoamiPath } from "../../../identities/index.ts";
import type { PublicId } from "../../../logins/index.ts";
import type { TestCookoutService } from "../../../testing/server.ts";
import { request } from "../../../http/client.ts";

const ONE_AT_A_TIME = { concurrency: 1 } as const;
const succeeded = { exitCode: 0, stderr: "" };
const UNAUTHORIZED = 401;
const verbs: readonly (readonly string[])[] = [
  ["identity", "admin", "grace"],
  ["identity", "admin", "grace", "--remove"],
];

it.effect("cookout identity admin makes an admin, and --remove takes it away", () =>
  Effect.gen(function* adminVerbs() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("grace", { kind: "human" });
    const env = { COOKOUT_TOKEN: cookout.adminToken, COOKOUT_URL: cookout.url };
    const results = yield* Effect.forEach(verbs, (args) => runCookout({ args, env }), ONE_AT_A_TIME);

    expect(results).toMatchObject([
      { ...succeeded, stdoutJson: { identity: { admin: true, name: "grace" } } },
      { ...succeeded, stdoutJson: { identity: { admin: false, name: "grace" } } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

const ownerVerbs: readonly (readonly string[])[] = [
  ["identity", "sessions", "release-bot"],
  ["identity", "sessions", "release-bot", "--revoke"],
  ["identity", "transfer", "release-bot", "--owner", "grace"],
];

it.effect("cookout identity sessions lists, --revoke revokes, and transfer --owner gives the agent away", () =>
  Effect.gen(function* ownerVerbsRun() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("grace", { kind: "human" });
    yield* cookout.createIdentity("release-bot");
    const env = { COOKOUT_TOKEN: cookout.adminToken, COOKOUT_URL: cookout.url };
    const results = yield* Effect.forEach(ownerVerbs, (args) => runCookout({ args, env }), ONE_AT_A_TIME);

    expect(results).toMatchObject([
      { ...succeeded, stdoutJson: { agentSessions: [] } },
      { ...succeeded, stdoutJson: { revoked: false } },
      { ...succeeded, stdoutJson: { identity: { name: "release-bot", owner: "grace" } } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("cookout identity rotate ends the web sessions logged in with the old token", () =>
  Effect.gen(function* rotateEndsWebSession() {
    const cookout = yield* TestCookout;
    const grace = yield* cookout.createIdentity("grace", { credential: "identity token", kind: "human" });
    const loggedIn = yield* answer(() =>
      request({
        baseUrl: cookout.url,
        headers: { authorization: `Bearer ${grace.token}` },
        method: "POST",
        path: sessionPath,
      }),
    );
    const [setCookie = ""] = loggedIn.headers.getSetCookie();
    const cookie = Arr.headNonEmpty(Str.split("; ")(setCookie));
    const env = { COOKOUT_TOKEN: grace.token, COOKOUT_URL: cookout.url };
    const rotated = yield* runCookout({ args: ["identity", "rotate", "grace"], env });
    const afterwards = yield* answer(() =>
      request({ baseUrl: cookout.url, headers: { cookie }, method: "GET", path: whoamiPath }),
    );

    expect(rotated).toMatchObject({ ...succeeded, stdoutJson: { identity: { name: "grace" } } });
    expect(afterwards).toMatchObject({ json: { error: { code: "token_unknown" } }, status: UNAUTHORIZED });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

function listedWith(id: PublicId): unknown {
  return expect.arrayContaining([expect.objectContaining({ id, kind: "cli" })]);
}

function graceSessionId(cookout: TestCookoutService): Effect.Effect<PublicId> {
  return Effect.gen(function* graceOnALaptop() {
    const grace = yield* cookout.createIdentity("grace", { kind: "human" });
    const started = yield* answer(() => cookout.clientFor().startLogin({ host: "grace-laptop" }));
    yield* answer(() => grace.client.approveLogin(started.userCode));
    yield* answer(() => cookout.clientFor().collectLogin(started.requestId));
    const { sessions } = yield* answer(() => grace.client.listSessions());
    const session = yield* Effect.orDie(
      Effect.fromOption(Arr.findFirst(sessions, (each) => each.where === "grace-laptop")),
    );
    return session.id;
  });
}

it.effect("cookout identity sessions <person> lists and --revoke <id> revokes for an admin, and refuses others", () =>
  Effect.gen(function* personSessions() {
    const cookout = yield* TestCookout;
    const id = yield* graceSessionId(cookout);
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const asAdmin = { COOKOUT_TOKEN: cookout.adminToken, COOKOUT_URL: cookout.url };
    const asAda = { COOKOUT_TOKEN: ada.token, COOKOUT_URL: cookout.url };
    const results = yield* Effect.forEach(
      [
        { args: ["identity", "sessions", "grace"], env: asAda },
        { args: ["identity", "sessions", "grace", "--revoke", id], env: asAda },
        { args: ["identity", "sessions", "grace"], env: asAdmin },
        { args: ["identity", "sessions", "grace", "--revoke", id], env: asAdmin },
        { args: ["identity", "sessions", "grace", "--revoke"], env: asAdmin },
      ],
      runCookout,
      ONE_AT_A_TIME,
    );

    expect(results).toMatchObject([
      { exitCode: 1, stderrJson: { error: { code: "admin_only" } } },
      { exitCode: 1, stderrJson: { error: { code: "admin_only" } } },
      {
        ...succeeded,
        stdoutJson: { sessions: listedWith(id) },
      },
      { ...succeeded, stdoutJson: { ended: 1 } },
      { exitCode: 1, stderrJson: { error: { code: "usage" } } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);
