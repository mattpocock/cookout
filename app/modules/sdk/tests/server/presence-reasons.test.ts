import { Array as Arr, Effect, Fiber, Option } from "effect";
import type { CookoutClient, Presence } from "../../index.ts";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { TestClock } from "effect/testing";

const AGENT = "triage";
const HUMAN = { kind: "human" } as const;
const PAST_A_CHECK = "31 seconds";

interface Board {
  readonly cookout: TestCookoutService;
  readonly matt: TestIdentity;
  readonly agent: TestIdentity;
}

const board: Effect.Effect<Board, never, TestCookout> = Effect.gen(function* mattAndHisAgent() {
  const cookout = yield* TestCookout;
  const matt = yield* cookout.createIdentity("matt", HUMAN);
  const agent = yield* cookout.createIdentity(AGENT, { owner: "matt" });
  return { agent, cookout, matt };
});

function presenceOf(client: CookoutClient, name: string): Effect.Effect<Presence | undefined> {
  return Effect.map(
    answer(() => client.presence()),
    ({ presence }) => Option.getOrUndefined(Arr.findFirst(presence, ({ identity }) => identity === name)),
  );
}

function joinedSession({ cookout, matt }: Board): Effect.Effect<CookoutClient> {
  return Effect.map(
    answer(() => matt.client.join({ as: AGENT })),
    ({ agentSessionToken }) => cookout.clientFor(agentSessionToken),
  );
}

it.effect("an agent's offline reason is kept across a restart", () =>
  Effect.gen(function* reasonKept() {
    const watched = yield* board;
    const session = yield* joinedSession(watched);
    yield* answer(() => session.leave());
    const admin = yield* watched.cookout.restart;
    const presence = yield* presenceOf(admin, AGENT);

    expect(presence).toMatchObject({ offlineReason: "left", online: false });
  }).pipe(Effect.provide(testCookout({ storage: "sqlite" }))),
);

it.effect("revoking a key of an agent that is offline leaves its presence as it was", () =>
  Effect.gen(function* revokedWhileOffline() {
    const watched = yield* board;
    const made = yield* answer(() => watched.matt.client.createAgentKey(AGENT, { name: "ci" }));
    yield* answer(() => watched.matt.client.revokeAgentKey(AGENT, made.agentKey.id));
    const presence = yield* presenceOf(watched.cookout.client, AGENT);

    expect(presence).toStrictEqual({ identity: AGENT, online: false });
  }).pipe(Effect.provide(testCookout())),
);

it.effect(
  "leave ends only the watch sent with its agent session: one sent with the Identity token keeps it online",
  () =>
    Effect.gen(function* leaveKeepsOtherWatch() {
      const watched = yield* board;
      yield* answer(() => watched.agent.client.watch());
      const session = yield* joinedSession(watched);
      yield* answer(() => session.leave());
      const presence = yield* presenceOf(watched.cookout.client, AGENT);

      expect(presence).toStrictEqual({ connection: { via: "watch" }, identity: AGENT, online: true });
    }).pipe(Effect.provide(testCookout())),
);

it.effect("a watch whose agent is deleted ends with agent_session_revoked at the next check", () =>
  Effect.gen(function* deletedWhileWatching() {
    const watched = yield* board;
    const session = yield* joinedSession(watched);
    const events = yield* answer(() => session.watch());
    const next = yield* Effect.forkChild(refusal(() => events[Symbol.asyncIterator]().next()));
    yield* answer(() => watched.cookout.client.deleteIdentity(AGENT));
    yield* TestClock.adjust(PAST_A_CHECK);
    const error = yield* Fiber.join(next);

    expect(error).toMatchObject({ code: "agent_session_revoked" });
  }).pipe(Effect.provide(testCookout())),
);
