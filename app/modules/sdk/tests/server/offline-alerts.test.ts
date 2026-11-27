import { Array as Arr, Effect, Fiber } from "effect";
import type { CookoutClient, CookoutEvent, EventStream, JoinRequest, OfflineAlert } from "../../index.ts";
import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";
import { isOfflineAlert } from "../../../inbox/index.ts";

const AGENT = "triage";
const HUMAN = { kind: "human" } as const;
const AS_AGENT: JoinRequest = { as: AGENT };
const PAST_A_CHECK = "31 seconds";
const GRACE = "60 seconds";

type Feed = AsyncIterator<CookoutEvent, unknown>;

interface Board {
  readonly cookout: TestCookoutService;
  readonly matt: TestIdentity;
  readonly ada: TestIdentity;
}

const board: Effect.Effect<Board, never, TestCookout> = Effect.gen(function* mattHisAgentAndAda() {
  const cookout = yield* TestCookout;
  const matt = yield* cookout.createIdentity("matt", HUMAN);
  const ada = yield* cookout.createIdentity("ada", HUMAN);
  yield* cookout.createIdentity(AGENT, { owner: "matt" });
  return { ada, cookout, matt };
});

function joinedSession({ cookout, matt }: Board, asked: JoinRequest = AS_AGENT): Effect.Effect<CookoutClient> {
  return Effect.map(
    answer(() => matt.client.join(asked)),
    ({ agentSessionToken }) => cookout.clientFor(agentSessionToken),
  );
}

function watching(client: CookoutClient): Effect.Effect<EventStream, never, Scope.Scope> {
  return Effect.gen(function* watchUntilConnected() {
    const connected = Promise.withResolvers<null>();
    const events = yield* answer(() =>
      client.watch({
        onConnected: () => {
          connected.resolve(null);
        },
      }),
    );
    const iterator = events[Symbol.asyncIterator]();
    yield* Effect.forkScoped(Effect.ignore(answer(() => iterator.next())));
    yield* answer(() => connected.promise);
    return events;
  });
}

function feedOf(client: CookoutClient): Effect.Effect<Feed, never, Scope.Scope> {
  return Effect.map(
    Effect.acquireRelease(
      answer(() => client.watch()),
      (events) => answer(() => events.close()),
    ),
    (events) => events[Symbol.asyncIterator](),
  );
}

function eventIn(next: Readonly<IteratorResult<CookoutEvent, unknown>>): CookoutEvent | null {
  if (next.done === true) {
    return null;
  }
  return next.value;
}

function isAlertOrEnd(event: CookoutEvent | null): boolean {
  return event === null || event.type === "offline-alert";
}

function nextAlertEvent(feed: Feed): Effect.Effect<CookoutEvent | null> {
  return answer(() => feed.next()).pipe(Effect.map(eventIn), Effect.repeat({ until: isAlertOrEnd }));
}

function alertsOf(client: CookoutClient): Effect.Effect<readonly OfflineAlert[]> {
  return Effect.map(
    answer(() => client.inbox()),
    ({ alerts }) => Arr.filter(alerts, isOfflineAlert),
  );
}

function droppedAfter(watched: Board, wait: typeof GRACE): Effect.Effect<void, never, Scope.Scope> {
  return Effect.gen(function* dropThenWait() {
    const session = yield* joinedSession(watched);
    const events = yield* watching(session);
    yield* answer(() => events.close());
    yield* watched.cookout.liveConnectionsClosed(AGENT);
    yield* TestClock.adjust(wait);
  });
}

const alert = {
  agent: AGENT,
  id: 1,
  offlineReason: "connection lost",
  raisedAt: "2026-01-01T00:01:00.000Z",
  read: false,
};

type Scoped = Effect.Effect<void, never, Scope.Scope>;

function left(_watched: Board, session: CookoutClient): Scoped {
  return answer(() => session.leave());
}

function closedCleanly(_watched: Board, _session: CookoutClient, events: EventStream): Scoped {
  return answer(() => events.closeCleanly());
}

function reconnectedWithinGrace({ cookout }: Board, session: CookoutClient, events: EventStream): Scoped {
  return Effect.gen(function* reconnectWithinGrace() {
    yield* answer(() => events.close());
    yield* cookout.liveConnectionsClosed(AGENT);
    yield* TestClock.adjust("30 seconds");
    yield* watching(session);
  });
}

function takenOver(watched: Board): Scoped {
  return Effect.asVoid(joinedSession(watched, { as: AGENT, force: true }));
}

function revokedByOwner({ matt }: Board): Scoped {
  return answer(() => matt.client.revokeAgentSession(AGENT));
}

function revokedByAdmin({ cookout }: Board): Scoped {
  return answer(() => cookout.client.revokeAgentSession(AGENT));
}

function expired(): Scoped {
  return TestClock.adjust(PAST_A_CHECK);
}

it.effect("a dropped agent stream not restored within the grace raises one alert, live and in its owner's inbox", () =>
  Effect.gen(function* droppedRaisesAlert() {
    const watched = yield* board;
    const feed = yield* feedOf(watched.matt.client);
    const heard = yield* Effect.forkChild(nextAlertEvent(feed));
    yield* droppedAfter(watched, GRACE);
    const event = yield* Fiber.join(heard);
    const alerts = yield* Effect.all(
      [alertsOf(watched.matt.client), alertsOf(watched.ada.client), alertsOf(watched.cookout.client)],
      { concurrency: 1 },
    );

    expect(event).toStrictEqual({ alert, type: "offline-alert" });
    expect(alerts).toStrictEqual([[alert], [], []]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

interface Ending {
  readonly how: string;
  readonly end: (watched: Board, session: CookoutClient, events: EventStream) => Scoped;
}

it.effect.each<Ending>([
  { end: left, how: "leave" },
  { end: closedCleanly, how: "a clean close" },
  { end: reconnectedWithinGrace, how: "a reconnect within the grace" },
  { end: takenOver, how: "a join --force takeover" },
  { end: revokedByOwner, how: "the owner's own revoke" },
])("$how raises no offline alert", ({ end }) =>
  Effect.gen(function* expectedEnd() {
    const watched = yield* board;
    const session = yield* joinedSession(watched);
    const events = yield* watching(session);
    yield* end(watched, session, events);
    yield* TestClock.adjust("2 minutes");
    const alerts = yield* alertsOf(watched.matt.client);

    expect(alerts).toStrictEqual([]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

interface Unexpected {
  readonly how: string;
  readonly join: JoinRequest;
  readonly end: (watched: Board) => Scoped;
  readonly offlineReason: OfflineAlert["offlineReason"];
}

it.effect.each<Unexpected>([
  {
    end: expired,
    how: "the agent session expiring",
    join: { as: AGENT, idleExpiry: "10s" },
    offlineReason: "session expired",
  },
  {
    end: revokedByAdmin,
    how: "an admin's revoke",
    join: AS_AGENT,
    offlineReason: "session revoked",
  },
])("$how raises an offline alert for the owner at once", ({ end, join, offlineReason }) =>
  Effect.gen(function* unexpectedEnd() {
    const watched = yield* board;
    const session = yield* joinedSession(watched, join);
    yield* watching(session);
    yield* end(watched);
    yield* watched.cookout.liveConnectionsClosed(AGENT);
    const alerts = yield* alertsOf(watched.matt.client);

    expect(alerts).toMatchObject([{ agent: AGENT, offlineReason, read: false }]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

it.effect("an agent made a feeder raises no offline alert when an admin revokes the session it had", () =>
  Effect.gen(function* feederRevoked() {
    const watched = yield* board;
    const session = yield* joinedSession(watched);
    yield* watching(session);
    yield* answer(() => watched.matt.client.makeFeeder(AGENT));
    yield* revokedByAdmin(watched);
    yield* watched.cookout.liveConnectionsClosed(AGENT);
    const alerts = yield* alertsOf(watched.matt.client);

    expect(alerts).toStrictEqual([]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);
