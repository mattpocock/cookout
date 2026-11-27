import { Array as Arr, Effect } from "effect";
import type { InboxAlert, LoginAlert } from "../../index.ts";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { createTestAgent } from "../../../testing/index.ts";
import { isOfflineAlert } from "../../../inbox/index.ts";

const FORBIDDEN = 403;
const NOT_FOUND = 404;
const HUMAN = { kind: "human" } as const;
const ADMIN = { admin: true, kind: "human" } as const;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const AGENT = "release-bot";
const AT: unknown = expect.any(String);
const KIND: unknown = expect.any(String);
const MADE_BY: unknown = expect.objectContaining({ kind: KIND });

type Client = TestIdentity["client"];

function cliSession(cookout: TestCookoutService, approver: Client, host: string): Effect.Effect<string> {
  return Effect.gen(function* approvedLogin() {
    const started = yield* answer(() => cookout.clientFor().startLogin({ host }));
    yield* answer(() => approver.approveLogin(started.userCode));
    const collected = yield* answer(() => cookout.clientFor().collectLogin(started.requestId));
    if (collected.status === "approved") {
      return collected.token;
    }
    return expect.unreachable("The login was not approved.");
  });
}

function isLoginAlert(alert: InboxAlert): alert is LoginAlert {
  return !isOfflineAlert(alert);
}

function adminActsOf(client: Client): Effect.Effect<readonly LoginAlert["login"][]> {
  return Effect.map(
    answer(() => client.inbox()),
    ({ alerts }) =>
      Arr.filter(
        Arr.map(Arr.filter(alerts, isLoginAlert), ({ login }) => login),
        (login) => login.kind === "admin act",
      ),
  );
}

type Listed = Awaited<ReturnType<Client["listIdentitySessions"]>>["sessions"][number];

function sessionAt(client: Client, name: string, where: string): Effect.Effect<Listed> {
  return Effect.gen(function* sessionWhere() {
    const { sessions } = yield* answer(() => client.listIdentitySessions(name));
    return yield* Effect.orDie(Effect.fromOption(Arr.findFirst(sessions, (each) => each.where === where)));
  });
}

function tokenOf(back: object): string {
  if ("token" in back && typeof back.token === "string") {
    return back.token;
  }
  return expect.unreachable("Reactivating a person answered no token.");
}

function joinedAgent(cookout: TestCookoutService, owner: Client): Effect.Effect<void> {
  return Effect.gen(function* approveAgentJoin() {
    yield* answer(() => createTestAgent({ by: owner, name: "triage" }));
    const start = yield* answer(() => cookout.clientFor().startAgentJoin({ as: "triage", host: "build-box" }));
    yield* answer(() => owner.approveAgentJoin(start.userCode));
    const collected = yield* answer(() => cookout.clientFor().collectAgentJoin(start.requestId));

    expect(collected.status).toBe("approved");
  });
}

it.effect("an admin lists another person's sessions without a secret and revokes one, which alerts the person", () =>
  Effect.gen(function* adminRevokesSession() {
    const cookout = yield* TestCookout;
    const matt = yield* cookout.createIdentity("matt", ADMIN);
    const ada = yield* cookout.createIdentity("ada", HUMAN);
    const laptop = yield* cliSession(cookout, ada.client, "ada-laptop");
    const listed = yield* sessionAt(matt.client, "ada", "ada-laptop");
    const revoked = yield* answer(() => matt.client.revokeIdentitySession("ada", listed.id));
    const after = yield* refusal(() => cookout.clientFor(laptop).whoami());
    const [acts, admins] = yield* Effect.all([adminActsOf(ada.client), adminActsOf(matt.client)], ONE_AT_A_TIME);

    expect({ acts, admins, after: after.status, listed, revoked }).toStrictEqual({
      acts: [{ act: "revoked a session", admin: "matt", credential: listed.id, kind: "admin act" }],
      admins: [],
      after: 401,
      listed: {
        current: false,
        expiresAt: AT,
        id: listed.id,
        kind: "cli",
        lastUsedAt: AT,
        madeAt: AT,
        madeBy: MADE_BY,
        where: "ada-laptop",
      },
      revoked: { ended: 1 },
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an admin revoking an agent's key or agent session alerts its owner, naming the agent", () =>
  Effect.gen(function* adminRevokesAgentCredentials() {
    const cookout = yield* TestCookout;
    const matt = yield* cookout.createIdentity("matt", ADMIN);
    const ada = yield* cookout.createIdentity("ada", HUMAN);
    yield* cookout.createIdentity(AGENT, { owner: "ada" });
    const key = yield* answer(() => ada.client.createAgentKey(AGENT, { name: "ci" }));
    yield* joinedAgent(cookout, ada.client);
    yield* answer(() => matt.client.revokeAgentKey(AGENT, key.agentKey.id));
    yield* answer(() => matt.client.revokeAgentSession("triage"));
    const acts = yield* adminActsOf(ada.client);

    expect(acts).toStrictEqual([
      { act: "revoked an agent key", admin: "matt", agent: AGENT, credential: key.agentKey.id, kind: "admin act" },
      { act: "revoked an agent session", admin: "matt", agent: "triage", kind: "admin act" },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an admin deactivating a person alerts them, shown once they are reactivated", () =>
  Effect.gen(function* adminDeactivates() {
    const cookout = yield* TestCookout;
    const matt = yield* cookout.createIdentity("matt", ADMIN);
    yield* cookout.createIdentity("ada", HUMAN);
    yield* answer(() => matt.client.deactivateIdentity("ada"));
    const back = yield* answer(() => matt.client.reactivateIdentity("ada"));
    const acts = yield* adminActsOf(cookout.clientFor(tokenOf(back)));

    expect(acts).toStrictEqual([{ act: "deactivated", admin: "matt", kind: "admin act" }]);
  }).pipe(Effect.provide(testCookout())),
);

function ownSessionRevoked(matt: Client): Effect.Effect<number> {
  return Effect.gen(function* revokeOwnSession() {
    const { id } = yield* sessionAt(matt, "matt", "matt-laptop");
    const { ended } = yield* answer(() => matt.revokeIdentitySession("matt", id));
    return ended;
  });
}

it.effect("an admin acting on their own credentials, or on an agent they own, raises no alert", () =>
  Effect.gen(function* ownActs() {
    const cookout = yield* TestCookout;
    const matt = yield* cookout.createIdentity("matt", ADMIN);
    yield* cookout.createIdentity(AGENT, { owner: "matt" });
    yield* cliSession(cookout, matt.client, "matt-laptop");
    const revoked = yield* ownSessionRevoked(matt.client);
    const key = yield* answer(() => matt.client.createAgentKey(AGENT, { name: "ci" }));
    yield* answer(() => matt.client.revokeAgentKey(AGENT, key.agentKey.id));
    yield* answer(() => matt.client.createLoginLink("matt"));
    const acts = yield* adminActsOf(matt.client);

    expect({ acts, revoked }).toStrictEqual({ acts: [], revoked: 1 });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a person who isn't an admin is 403 admin_only on another person's sessions", () =>
  Effect.gen(function* notAdmin() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", HUMAN);
    const grace = yield* cookout.createIdentity("grace", HUMAN);
    yield* cliSession(cookout, grace.client, "grace-laptop");
    const { id } = yield* sessionAt(grace.client, "grace", "grace-laptop");
    const refused = yield* Effect.all(
      [
        refusal(() => ada.client.listIdentitySessions("grace")),
        refusal(() => ada.client.revokeIdentitySession("grace", id)),
      ],
      ONE_AT_A_TIME,
    );
    const still = yield* sessionAt(grace.client, "grace", "grace-laptop");

    expect({ refused, still: still.id }).toMatchObject({
      refused: [
        { code: "admin_only", status: FORBIDDEN },
        { code: "admin_only", status: FORBIDDEN },
      ],
      still: id,
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an admin can't rotate another identity's token, and a person still rotates their own", () =>
  Effect.gen(function* noSecrets() {
    const cookout = yield* TestCookout;
    const matt = yield* cookout.createIdentity("matt", ADMIN);
    const ada = yield* cookout.createIdentity("ada", HUMAN);
    yield* cookout.createIdentity(AGENT, { owner: "ada" });
    const refused = yield* Effect.all(
      [refusal(() => matt.client.rotateToken("ada")), refusal(() => matt.client.rotateToken(AGENT))],
      ONE_AT_A_TIME,
    );
    const rotated = yield* answer(() => ada.client.rotateToken("ada"));
    const whoami = yield* answer(() => cookout.clientFor(rotated.token).whoami());
    const loginLink: unknown = expect.stringContaining("login link");
    const agentKey: unknown = expect.stringContaining("agent key");

    expect({ refused, whoami: whoami.identity.name }).toMatchObject({
      refused: [
        { code: "admin_sees_no_secrets", message: loginLink, status: FORBIDDEN },
        { code: "admin_sees_no_secrets", message: agentKey, status: FORBIDDEN },
      ],
      whoami: "ada",
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an admin's person sessions are 404 for an unknown name, 403 for an agent, and 404 once revoked", () =>
  Effect.gen(function* overseenRefusals() {
    const cookout = yield* TestCookout;
    const matt = yield* cookout.createIdentity("matt", ADMIN);
    const ada = yield* cookout.createIdentity("ada", HUMAN);
    yield* cookout.createIdentity(AGENT, { owner: "ada" });
    yield* cliSession(cookout, ada.client, "ada-laptop");
    const { id } = yield* sessionAt(matt.client, "ada", "ada-laptop");
    yield* answer(() => matt.client.revokeIdentitySession("ada", id));
    const refused = yield* Effect.all(
      [
        refusal(() => matt.client.listIdentitySessions("nobody")),
        refusal(() => matt.client.listIdentitySessions("Not A Name")),
        refusal(() => matt.client.listIdentitySessions(AGENT)),
        refusal(() => matt.client.revokeIdentitySession("ada", id)),
      ],
      ONE_AT_A_TIME,
    );

    expect(refused).toMatchObject([
      { code: "identity_not_found", status: NOT_FOUND },
      { code: "identity_not_found", status: NOT_FOUND },
      { code: "human_only", status: FORBIDDEN },
      { code: "session_not_found", status: NOT_FOUND },
    ]);
  }).pipe(Effect.provide(testCookout())),
);
