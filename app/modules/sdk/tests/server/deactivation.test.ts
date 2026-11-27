import { Array as Arr, Effect, Struct } from "effect";
import { TestCookout, answer, freshToken, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";

const HUMAN = { kind: "human" } as const;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;
const notOwner = { code: "not_owner", status: FORBIDDEN };

function adaWithAgents(cookout: TestCookoutService): Effect.Effect<TestIdentity> {
  return Effect.gen(function* createAda() {
    const ada = yield* cookout.createIdentity("ada", HUMAN);
    yield* cookout.createIdentity("grace", HUMAN);
    yield* cookout.createIdentity("ada/helper", { owner: "ada" });
    yield* cookout.createIdentity("release-bot", { owner: "ada" });
    return ada;
  });
}

it.effect("deactivating an identity makes every token it holds fail, while its messages keep its name", () =>
  Effect.gen(function* deactivateKeepsHistory() {
    const cookout = yield* TestCookout;
    const aide = yield* cookout.createIdentity("auth-griller");
    yield* answer(() => aide.client.createChannel({ name: "grill" }));
    const { message } = yield* answer(() => aide.client.createMessage({ channel: "grill", text: "hello" }));
    const session = yield* answer(() => aide.client.join({ as: "auth-griller" }));
    const deactivated = yield* answer(() => cookout.client.deactivateIdentity("auth-griller"));
    const tokens = yield* Effect.all(
      [refusal(aide.client.whoami), refusal(cookout.clientFor(session.agentSessionToken).whoami)],
      ONE_AT_A_TIME,
    );
    const { messages } = yield* answer(() => cookout.client.listMessages("grill"));

    expect(deactivated).toStrictEqual({ identity: { ...aide.identity, deactivated: true } });
    expect([tokens, Arr.map(messages, ({ author, id }) => [id, author.name])]).toMatchObject([
      [
        { code: "token_revoked", status: UNAUTHORIZED },
        { code: "token_revoked", status: UNAUTHORIZED },
      ],
      [[message.id, "auth-griller"]],
    ]);
  }).pipe(Effect.provide(testCookout({ secrets: "live" }))),
);

it.effect("a deactivated name stays reserved: creating an identity with it is refused", () =>
  Effect.gen(function* nameReserved() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("ada", HUMAN);
    yield* answer(() => cookout.client.deactivateIdentity("ada"));
    const refused = yield* refusal(() => cookout.client.createIdentity({ kind: "human", name: "ada" }));

    expect(refused).toMatchObject({ code: "identity_exists", status: CONFLICT });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("deactivating a human leaves every agent they own active: its token works, it posts and it is listed", () =>
  Effect.gen(function* agentsStayActive() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("ada", HUMAN);
    const helper = yield* cookout.createIdentity("ada/helper", { owner: "ada" });
    const session = yield* answer(() => helper.client.join({ as: "ada/helper" }));
    const deactivated = yield* answer(() => cookout.client.deactivateIdentity("ada"));
    const [, token, sessionToken, posted, listed] = yield* Effect.all(
      [
        answer(() => helper.client.createChannel({ name: "grill" })),
        answer(helper.client.whoami),
        answer(cookout.clientFor(session.agentSessionToken).whoami),
        answer(() => helper.client.createMessage({ channel: "grill", text: "still here" })),
        answer(() => cookout.client.listIdentities()),
      ],
      ONE_AT_A_TIME,
    );

    expect(deactivated).toMatchObject({ identity: { deactivated: true, name: "ada" } });
    expect([token.identity, sessionToken.identity]).toStrictEqual([helper.identity, helper.identity]);
    expect(posted.message).toMatchObject({ author: { name: "ada/helper" }, text: "still here" });
    expect(Arr.map(listed.identities, ({ name }) => name)).toStrictEqual(["ada/helper", "admin"]);
  }).pipe(Effect.provide(testCookout({ secrets: "live" }))),
);

it.effect("a deactivated identity can't be mentioned, and the identity list hides it unless asked", () =>
  Effect.gen(function* hidden() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("ada", HUMAN);
    yield* cookout.createIdentity("grace", HUMAN);
    yield* answer(() => cookout.client.deactivateIdentity("ada"));
    yield* answer(() => cookout.client.createChannel({ name: "grill" }));
    const posted = yield* answer(() => cookout.client.createMessage({ channel: "grill", text: "@ada and @grace" }));
    const listed = yield* answer(() => cookout.client.listIdentities());

    expect([posted.message.mentions, posted.unknownMentions]).toStrictEqual([["grace"], ["ada"]]);
    expect(Arr.map(listed.identities, ({ name }) => name)).toStrictEqual(["admin", "grace"]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("reactivating answers a fresh token while the old tokens stay dead", () =>
  Effect.gen(function* reactivate() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", HUMAN);
    yield* answer(() => cookout.client.deactivateIdentity("ada"));
    const reactivated = yield* answer(() => cookout.client.reactivateIdentity("ada"));
    const old = yield* refusal(ada.client.whoami);
    const fresh = yield* Effect.flatMap(freshToken(reactivated), (token) => answer(cookout.clientFor(token).whoami));

    expect(reactivated.identity).toStrictEqual(ada.identity);
    expect(old).toMatchObject({ code: "token_revoked", status: UNAUTHORIZED });
    expect(fresh.identity).toStrictEqual(ada.identity);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an agent session token from before deactivation stays dead after reactivation", () =>
  Effect.gen(function* sessionStaysDead() {
    const cookout = yield* TestCookout;
    const aide = yield* cookout.createIdentity("auth-griller");
    const session = yield* answer(() => aide.client.join({ as: "auth-griller" }));
    yield* answer(() => cookout.client.deactivateIdentity("auth-griller"));
    yield* answer(() => cookout.client.reactivateIdentity("auth-griller"));
    const old = yield* refusal(cookout.clientFor(session.agentSessionToken).whoami);

    expect(old).toMatchObject({ code: "agent_session_revoked", status: UNAUTHORIZED });
  }).pipe(Effect.provide(testCookout({ secrets: "live" }))),
);

it.effect("an admin reactivates an agent whose owner is deactivated, answering the agent and no token", () =>
  Effect.gen(function* reactivateOwnerless() {
    const cookout = yield* TestCookout;
    yield* adaWithAgents(cookout);
    const helper = yield* cookout.createIdentity("ada/helper-2", { owner: "ada" });
    yield* answer(() => cookout.client.deactivateIdentity("ada/helper-2"));
    yield* answer(() => cookout.client.deactivateIdentity("ada"));
    const reactivated = yield* answer(() => cookout.client.reactivateIdentity("ada/helper-2"));
    const old = yield* refusal(helper.client.whoami);

    expect(reactivated).toStrictEqual({ identity: helper.identity });
    expect(old).toMatchObject({ code: "token_revoked", status: UNAUTHORIZED });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a reactivated agent holds no credential until its owner makes it an agent key", () =>
  Effect.gen(function* reactivatedAgentKey() {
    const cookout = yield* TestCookout;
    const ada = yield* adaWithAgents(cookout);
    yield* answer(() => ada.client.deactivateIdentity("release-bot"));
    const reactivated = yield* answer(() => ada.client.reactivateIdentity("release-bot"));
    const [keys, made] = yield* Effect.all(
      [
        answer(() => ada.client.listAgentKeys("release-bot")),
        answer(() => ada.client.createAgentKey("release-bot", { name: "ci" })),
      ],
      ONE_AT_A_TIME,
    );
    const keyed = yield* answer(cookout.clientFor(made.token).whoami);

    expect([reactivated, keys, keyed.identity]).toStrictEqual([
      { identity: reactivated.identity },
      { agentKeys: [] },
      reactivated.identity,
    ]);
  }).pipe(Effect.provide(testCookout({ secrets: "live" }))),
);

it.effect("an admin transfers an agent whose owner is deactivated to another human", () =>
  Effect.gen(function* transferOwnerless() {
    const cookout = yield* TestCookout;
    yield* adaWithAgents(cookout);
    yield* answer(() => cookout.client.deactivateIdentity("ada"));
    const moved = yield* answer(() => cookout.client.transferAgent("release-bot", "grace"));

    expect(moved.identity).toMatchObject({ kind: "agent", name: "release-bot", owner: "grace" });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("reactivating an active identity, or one that doesn't exist, is refused", () =>
  Effect.gen(function* reactivateRefused() {
    const cookout = yield* TestCookout;
    const refused = yield* Effect.all(
      [
        refusal(() => cookout.client.reactivateIdentity("admin")),
        refusal(() => cookout.client.reactivateIdentity("nobody")),
      ],
      ONE_AT_A_TIME,
    );

    expect(refused).toMatchObject([
      { code: "not_deactivated", status: CONFLICT },
      { code: "identity_not_found", status: NOT_FOUND },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an owner deactivates and reactivates their own agents", () =>
  Effect.gen(function* ownerRights() {
    const cookout = yield* TestCookout;
    const ada = yield* adaWithAgents(cookout);
    const own = yield* answer(() => ada.client.deactivateIdentity("ada/helper"));
    const back = yield* answer(() => ada.client.reactivateIdentity("ada/helper"));

    expect(own.identity).toMatchObject({ deactivated: true, name: "ada/helper" });
    expect(back).toStrictEqual({ identity: Struct.omit(own.identity, ["deactivated"]) });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("nobody but an admin or the owner deactivates an agent, and only an admin reactivates a human (403)", () =>
  Effect.gen(function* othersRefused() {
    const cookout = yield* TestCookout;
    const ada = yield* adaWithAgents(cookout);
    const helper = yield* cookout.createIdentity("grace/helper", { owner: "grace" });
    const refused = yield* Effect.all(
      [
        refusal(() => ada.client.deactivateIdentity("grace/helper")),
        refusal(() => ada.client.deactivateIdentity("admin")),
        refusal(() => helper.client.deactivateIdentity("ada/helper")),
      ],
      ONE_AT_A_TIME,
    );
    yield* answer(() => cookout.client.deactivateIdentity("grace"));
    const human = yield* refusal(() => ada.client.reactivateIdentity("grace"));

    expect(refused).toMatchObject([notOwner, notOwner, notOwner]);
    expect(human).toMatchObject({ code: "admin_only", status: FORBIDDEN });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("the last admin can't be deactivated, and a deactivated admin no longer counts", () =>
  Effect.gen(function* lastAdmin() {
    const cookout = yield* TestCookout;
    const second = yield* cookout.createIdentity("admin-2", { admin: true, kind: "human" });
    const missing = yield* refusal(() => second.client.deactivateIdentity("nobody"));
    const deactivated = yield* answer(() => second.client.deactivateIdentity("admin"));
    const last = yield* refusal(() => second.client.deactivateIdentity("admin-2"));
    const kept = yield* refusal(() => second.client.removeAdmin("admin-2"));

    expect(missing).toMatchObject({ code: "identity_not_found", status: NOT_FOUND });
    expect(deactivated.identity).toMatchObject({ admin: true, deactivated: true, name: "admin" });
    expect([last, kept]).toMatchObject([
      { code: "last_admin", status: CONFLICT },
      { code: "last_admin", status: CONFLICT },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("deactivating an identity twice answers it deactivated both times", () =>
  Effect.gen(function* twice() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("auth-griller");
    const answers = yield* Effect.all(
      [
        answer(() => cookout.client.deactivateIdentity("auth-griller")),
        answer(() => cookout.client.deactivateIdentity("auth-griller")),
      ],
      ONE_AT_A_TIME,
    );

    expect(answers).toMatchObject([
      { identity: { deactivated: true, name: "auth-griller" } },
      { identity: { deactivated: true, name: "auth-griller" } },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a deactivated admin identity stays refused after a reboot sets its token from the setting again", () =>
  Effect.gen(function* rebootKeepsItOff() {
    const cookout = yield* TestCookout;
    const second = yield* cookout.createIdentity("admin-2", { admin: true, kind: "human" });
    yield* answer(() => second.client.deactivateIdentity("admin"));
    const restarted = yield* cookout.restart;
    const refused = yield* refusal(restarted.whoami);

    expect(refused).toMatchObject({ code: "token_revoked", status: UNAUTHORIZED });
  }).pipe(Effect.provide(testCookout({ storage: "sqlite" }))),
);
