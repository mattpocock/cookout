import { Array as Arr, Effect } from "effect";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { CookoutClient } from "../../index.ts";

const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const BOOT = "2026-01-01T00:00:00.000Z";
const WEEK_ON = "2026-01-08T00:00:00.000Z";
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const HUMAN = { kind: "human" } as const;
const MISSING = { code: "identity_not_found", status: NOT_FOUND } as const;

interface Seeded {
  readonly ada: CookoutClient;
  readonly aide: TestIdentity;
  readonly grace: CookoutClient;
}

function seeded(cookout: TestCookoutService): Effect.Effect<Seeded> {
  return Effect.gen(function* seedOwners() {
    const ada = yield* cookout.createIdentity("ada", HUMAN);
    const grace = yield* cookout.createIdentity("grace", HUMAN);
    const aide = yield* cookout.createIdentity("release-bot", { owner: "ada" });
    return { ada: ada.client, aide, grace: grace.client };
  });
}

function joinedAndUsed(cookout: TestCookoutService, aide: TestIdentity): Effect.Effect<CookoutClient> {
  return Effect.gen(function* joinAndUse() {
    const issued = yield* answer(() => aide.client.join({ as: "release-bot", host: "build-box" }));
    const session = cookout.clientFor(issued.agentSessionToken);
    yield* answer(() => session.whoami());
    return session;
  });
}

it.effect("the owner of an agent is refused a token rotation, and the agent key it makes instead works", () =>
  Effect.gen(function* ownerMakesKey() {
    const cookout = yield* TestCookout;
    const { ada } = yield* seeded(cookout);
    const refused = yield* refusal(() => ada.rotateToken("release-bot"));
    const made = yield* answer(() => ada.createAgentKey("release-bot", { name: "ci" }));
    const fresh = yield* answer(() => cookout.clientFor(made.token).whoami());

    expect({ code: refused.code, fresh: fresh.identity.name, message: refused.message }).toStrictEqual({
      code: "agent_keys_instead",
      fresh: "release-bot",
      message:
        "release-bot is an agent: it has agent keys, not a token to rotate. Make a new key with cookout agent-key create release-bot <key-name>, then revoke the old one.",
    });
  }).pipe(Effect.provide(testCookout({ secrets: "live" }))),
);

it.effect("another human, or the agent itself, is refused with 403 on rotate, sessions, revoke and transfer", () =>
  Effect.gen(function* othersRefused() {
    const cookout = yield* TestCookout;
    const { aide, grace } = yield* seeded(cookout);
    const refused = yield* Effect.all(
      [
        refusal(() => grace.rotateToken("release-bot")),
        refusal(() => grace.listAgentSessions("release-bot")),
        refusal(() => grace.revokeAgentSession("release-bot")),
        refusal(() => aide.client.rotateToken("release-bot")),
        refusal(() => grace.rotateToken("nobody")),
        refusal(() => grace.transferAgent("release-bot", "grace")),
      ],
      ONE_AT_A_TIME,
    );

    expect(refused).toMatchObject([
      { code: "not_owner", status: FORBIDDEN },
      { code: "not_owner", status: FORBIDDEN },
      { code: "not_owner", status: FORBIDDEN },
      { code: "not_owner", status: FORBIDDEN },
      { code: "not_owner", status: FORBIDDEN },
      { code: "admin_only", status: FORBIDDEN },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("the owner lists its agent's live session, never its token, and revoking it refuses the session", () =>
  Effect.gen(function* ownerRevokes() {
    const cookout = yield* TestCookout;
    const { ada, aide } = yield* seeded(cookout);
    const session = yield* joinedAndUsed(cookout, aide);
    const [listed, revoked] = yield* Effect.all(
      [answer(() => ada.listAgentSessions("release-bot")), answer(() => ada.revokeAgentSession("release-bot"))],
      ONE_AT_A_TIME,
    );
    const after = yield* refusal(() => session.whoami());
    const afterwards = yield* Effect.all(
      [answer(() => ada.listAgentSessions("release-bot")), answer(() => ada.revokeAgentSession("release-bot"))],
      ONE_AT_A_TIME,
    );

    expect(listed).toStrictEqual({
      agentSessions: [{ expiresAt: WEEK_ON, host: "build-box", issuedAt: BOOT, lastUsedAt: BOOT }],
    });
    expect(revoked).toStrictEqual({ revoked: true });
    expect(after).toMatchObject({ code: "agent_session_revoked", status: UNAUTHORIZED });
    expect(afterwards).toStrictEqual([{ agentSessions: [] }, { revoked: false }]);
  }).pipe(Effect.provide(testCookout({ secrets: "live" }))),
);

it.effect(
  "an admin lists and revokes sessions and lists keys for any agent, and naming a missing identity is 404",
  () =>
    Effect.gen(function* adminManages() {
      const cookout = yield* TestCookout;
      const { aide } = yield* seeded(cookout);
      yield* answer(() => aide.client.join({ as: "release-bot" }));
      const listed = yield* answer(() => cookout.client.listAgentSessions("release-bot"));
      const [revoked, keys] = yield* Effect.all(
        [
          answer(() => cookout.client.revokeAgentSession("release-bot")),
          answer(() => cookout.client.listAgentKeys("release-bot")),
        ],
        ONE_AT_A_TIME,
      );
      const missing = yield* Effect.all(
        [
          refusal(() => cookout.client.rotateToken("nobody")),
          refusal(() => cookout.client.listAgentSessions("nobody")),
          refusal(() => cookout.client.revokeAgentSession("nobody")),
          refusal(() => cookout.client.transferAgent("nobody", "ada")),
        ],
        ONE_AT_A_TIME,
      );

      expect(listed).toStrictEqual({ agentSessions: [{ expiresAt: WEEK_ON, issuedAt: BOOT }] });
      expect(revoked).toStrictEqual({ revoked: true });
      expect(Arr.map(keys.agentKeys, ({ name }) => name)).toStrictEqual(["test"]);
      expect(missing).toMatchObject([MISSING, MISSING, MISSING, MISSING]);
    }).pipe(Effect.provide(testCookout())),
);

it.effect("an admin transfers an agent to another human, who then owns it in place of the old owner", () =>
  Effect.gen(function* adminTransfers() {
    const cookout = yield* TestCookout;
    const { ada, grace } = yield* seeded(cookout);
    const moved = yield* answer(() => cookout.client.transferAgent("release-bot", "grace"));
    const refused = yield* refusal(() => ada.createAgentKey("release-bot", { name: "ci" }));
    const made = yield* answer(() => grace.createAgentKey("release-bot", { name: "ci" }));
    const fresh = yield* answer(() => cookout.clientFor(made.token).whoami());

    expect(moved).toStrictEqual({
      identity: { admin: false, createdAt: BOOT, kind: "agent", name: "release-bot", owner: "grace" },
    });
    expect(refused).toMatchObject({ code: "not_owner", status: FORBIDDEN });
    expect(fresh.identity).toMatchObject({ owner: "grace" });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a transfer of a namespaced agent, of a human, or to an owner who is no human is refused", () =>
  Effect.gen(function* transferRefused() {
    const cookout = yield* TestCookout;
    yield* seeded(cookout);
    yield* cookout.createIdentity("ada/x", { owner: "ada" });
    const refused = yield* Effect.all(
      [
        refusal(() => cookout.client.transferAgent("ada/x", "grace")),
        refusal(() => cookout.client.transferAgent("ada", "grace")),
        refusal(() => cookout.client.transferAgent("release-bot", "nobody")),
      ],
      ONE_AT_A_TIME,
    );
    const [namespaced] = refused;

    expect(refused).toMatchObject([
      { code: "name_not_owned", status: BAD_REQUEST },
      { code: "identity_kind", status: FORBIDDEN },
      { code: "owner_not_human", details: { owner: "nobody" }, status: BAD_REQUEST },
    ]);
    expect(namespaced.message).toContain("rename");
  }).pipe(Effect.provide(testCookout())),
);
