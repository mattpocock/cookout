import { Array as Arr, Effect } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { TestClock } from "effect/testing";
import { createTestAgent } from "../../../testing/index.ts";
import { isPublicId } from "../../../logins/index.ts";

const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;
const BOOT = "2026-01-01T00:00:00.000Z";
const AN_HOUR_ON = "2026-01-01T01:00:00.000Z";
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const HUMAN = { kind: "human" } as const;
const AGENT = "release-bot";
const UNKNOWN_IDS = Arr.filter(["0123456789abcdef"], isPublicId);

interface Seeded {
  readonly ada: TestIdentity;
  readonly grace: TestIdentity;
}

function seeded(cookout: TestCookoutService): Effect.Effect<Seeded> {
  return Effect.gen(function* seedOwnerAndAgent() {
    const ada = yield* cookout.createIdentity("ada", HUMAN);
    const grace = yield* cookout.createIdentity("grace", HUMAN);
    yield* cookout.createIdentity(AGENT, { owner: "ada" });
    yield* answer(() => ada.client.createChannel({ name: "deploys" }));
    return { ada, grace };
  });
}

function postedBy(cookout: TestCookoutService, token: string): Effect.Effect<string> {
  return Effect.map(
    answer(() => cookout.clientFor(token).createMessage({ channel: "deploys", text: "Deployed." })),
    ({ message }) => message.author.name,
  );
}

it.effect("an owner makes two keys that both post as the agent, and revoking one leaves the other working", () =>
  Effect.gen(function* twoKeys() {
    const cookout = yield* TestCookout;
    const { ada } = yield* seeded(cookout);
    const [ci, deploy] = yield* Effect.all(
      [
        answer(() => ada.client.createAgentKey(AGENT, { name: "ci" })),
        answer(() => ada.client.createAgentKey(AGENT, { name: "deploy" })),
      ],
      ONE_AT_A_TIME,
    );
    const authors = yield* Effect.forEach([ci.token, deploy.token], (token) => postedBy(cookout, token), ONE_AT_A_TIME);
    const revoked = yield* answer(() => ada.client.revokeAgentKey(AGENT, ci.agentKey.id));
    const after = yield* Effect.all(
      { ci: refusal(() => cookout.clientFor(ci.token).whoami()), deploy: postedBy(cookout, deploy.token) },
      ONE_AT_A_TIME,
    );
    const listed = yield* answer(() => ada.client.listAgentKeys(AGENT));

    expect({ after: { ci: after.ci.code, deploy: after.deploy }, authors, listed, revoked }).toStrictEqual({
      after: { ci: "token_revoked", deploy: AGENT },
      authors: [AGENT, AGENT],
      listed: { agentKeys: [{ id: deploy.agentKey.id, lastUsedAt: BOOT, madeAt: BOOT, name: "deploy" }] },
      revoked: { ended: 1 },
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a key's secret is in the answer that makes it and in no list of the agent's keys", () =>
  Effect.gen(function* secretOnce() {
    const cookout = yield* TestCookout;
    const { ada } = yield* seeded(cookout);
    const made = yield* answer(() => ada.client.createAgentKey(AGENT, { expiresIn: "30d", name: "ci" }));
    const listed = yield* Effect.all(
      [answer(() => ada.client.listAgentKeys(AGENT)), answer(() => cookout.client.listAgentKeys(AGENT))],
      ONE_AT_A_TIME,
    );

    const listedKey = { expiresAt: "2026-01-31T00:00:00.000Z", id: made.agentKey.id, madeAt: BOOT, name: "ci" };

    expect({ listed, made: made.agentKey }).toStrictEqual({
      listed: [{ agentKeys: [listedKey] }, { agentKeys: [listedKey] }],
      made: listedKey,
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an agent making a key, for itself or a worker, is 403 human_only, and another person 403 not_owner", () =>
  Effect.gen(function* onlyTheOwner() {
    const cookout = yield* TestCookout;
    const { ada, grace } = yield* seeded(cookout);
    const worker = yield* cookout.createIdentity("worker", { owner: "ada" });
    const { agentSessionToken } = yield* answer(() => ada.client.join({ as: AGENT }));
    const session = cookout.clientFor(agentSessionToken);
    const refused = yield* Effect.all(
      [
        refusal(() => session.createAgentKey(AGENT, { name: "ci" })),
        refusal(() => session.createAgentKey("worker", { name: "ci" })),
        refusal(() => worker.client.createAgentKey("worker", { name: "ci" })),
        refusal(() => grace.client.createAgentKey(AGENT, { name: "ci" })),
        refusal(() => grace.client.listAgentKeys(AGENT)),
      ],
      ONE_AT_A_TIME,
    );

    expect(refused).toMatchObject([
      { code: "human_only", status: FORBIDDEN },
      { code: "human_only", status: FORBIDDEN },
      { code: "human_only", status: FORBIDDEN },
      { code: "not_owner", status: FORBIDDEN },
      { code: "not_owner", status: FORBIDDEN },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an admin lists and revokes an agent's keys, but making one is 403 not_owner", () =>
  Effect.gen(function* adminManages() {
    const cookout = yield* TestCookout;
    const { ada } = yield* seeded(cookout);
    const made = yield* answer(() => ada.client.createAgentKey(AGENT, { name: "ci" }));
    const refused = yield* refusal(() => cookout.client.createAgentKey(AGENT, { name: "admin" }));
    const listed = yield* answer(() => cookout.client.listAgentKeys(AGENT));
    const revoked = yield* answer(() => cookout.client.revokeAgentKey(AGENT, made.agentKey.id));
    const after = yield* refusal(() => cookout.clientFor(made.token).whoami());

    expect({
      after: after.code,
      listed: Arr.map(listed.agentKeys, ({ name }) => name),
      refused: { code: refused.code, status: refused.status },
      revoked,
    }).toStrictEqual({
      after: "token_revoked",
      listed: ["ci"],
      refused: { code: "not_owner", status: FORBIDDEN },
      revoked: { ended: 1 },
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a key with an expiry works until it, then is refused with 401 agent_key_expired", () =>
  Effect.gen(function* expires() {
    const cookout = yield* TestCookout;
    const { ada } = yield* seeded(cookout);
    const made = yield* answer(() => ada.client.createAgentKey(AGENT, { expiresIn: "1h", name: "short" }));
    const before = yield* answer(() => cookout.clientFor(made.token).whoami());
    yield* TestClock.adjust("2 hours");
    const after = yield* refusal(() => cookout.clientFor(made.token).whoami());

    expect({
      after: { code: after.code, status: after.status },
      before: before.identity.name,
      expiresAt: made.agentKey.expiresAt,
    }).toStrictEqual({
      after: { code: "agent_key_expired", status: UNAUTHORIZED },
      before: AGENT,
      expiresAt: AN_HOUR_ON,
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an expiry counts in seconds, minutes, hours or days", () =>
  Effect.gen(function* units() {
    const cookout = yield* TestCookout;
    const { ada } = yield* seeded(cookout);
    const made = yield* Effect.forEach(
      ["90s", "5m", "2h", "3d"],
      (expiresIn, at) => answer(() => ada.client.createAgentKey(AGENT, { expiresIn, name: `key-${String(at)}` })),
      ONE_AT_A_TIME,
    );

    expect(Arr.map(made, ({ agentKey }) => agentKey.expiresAt)).toStrictEqual([
      "2026-01-01T00:01:30.000Z",
      "2026-01-01T00:05:00.000Z",
      "2026-01-01T02:00:00.000Z",
      "2026-01-04T00:00:00.000Z",
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("creating an agent answers no secret, and rotating its token is refused with agent_keys_instead", () =>
  Effect.gen(function* noAgentTokens() {
    const cookout = yield* TestCookout;
    const { ada } = yield* seeded(cookout);
    const created = yield* answer(() => createTestAgent({ broughtIn: true, by: ada.client, name: "scout" }));
    const refused = yield* refusal(() => ada.client.rotateToken("scout"));

    expect({ created, refused: { code: refused.code, status: refused.status } }).toStrictEqual({
      created: {
        identity: { admin: false, createdAt: BOOT, displayName: "Scout", kind: "agent", name: "scout", owner: "ada" },
      },
      refused: { code: "agent_keys_instead", status: CONFLICT },
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a bad name or expiry is 400, a live key's name 409, and an unknown agent or key 404", () =>
  Effect.gen(function* refusals() {
    const cookout = yield* TestCookout;
    const { ada } = yield* seeded(cookout);
    yield* answer(() => ada.client.createAgentKey(AGENT, { name: "ci" }));
    const refused = yield* Effect.all(
      [
        refusal(() => ada.client.createAgentKey(AGENT, { name: "Not A Name" })),
        refusal(() => ada.client.createAgentKey(AGENT, { expiresIn: "soon", name: "other" })),
        refusal(() => ada.client.createAgentKey(AGENT, { name: "ci" })),
        refusal(() => ada.client.createAgentKey("nobody", { name: "ci" })),
        refusal(() => ada.client.listAgentKeys("ada")),
        refusal(() => ada.client.listAgentKeys("Not A Name")),
        ...Arr.map(UNKNOWN_IDS, (id) => refusal(() => ada.client.revokeAgentKey(AGENT, id))),
      ],
      ONE_AT_A_TIME,
    );

    expect(refused).toMatchObject([
      { code: "agent_key_name_invalid", status: BAD_REQUEST },
      { code: "agent_key_expiry_invalid", status: BAD_REQUEST },
      { code: "agent_key_name_taken", status: CONFLICT },
      { code: "identity_not_found", status: NOT_FOUND },
      { code: "identity_not_found", status: NOT_FOUND },
      { code: "identity_not_found", status: NOT_FOUND },
      { code: "agent_key_not_found", status: NOT_FOUND },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("revoking with an ID that is no public ID is 404 agent_key_not_found", () =>
  Effect.gen(function* notAnId() {
    const cookout = yield* TestCookout;
    const { ada } = yield* seeded(cookout);
    const response = yield* HttpClientRequest.delete(`${cookout.url}/v1/identities/${AGENT}/agent-keys/not-an-id`).pipe(
      HttpClientRequest.setHeader("authorization", `Bearer ${ada.token}`),
      HttpClient.execute,
    );
    const body = yield* response.json;

    expect({ body, status: response.status }).toMatchObject({
      body: { error: { code: "agent_key_not_found" } },
      status: NOT_FOUND,
    });
  }).pipe(Effect.provide([testCookout(), FetchHttpClient.layer])),
);
