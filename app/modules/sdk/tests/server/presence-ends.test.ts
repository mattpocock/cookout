import { Array as Arr, Effect, Option, String as Str } from "effect";
import type { CookoutClient, EventStream, JoinRequest, OfflineReason, Presence } from "../../index.ts";
import type { LastEnd, TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { openEventStream, request } from "../../../http/client.ts";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";
import { eventsPath } from "../../../events/index.ts";
import { sessionPath } from "../../../identities/index.ts";

const BOOT = "2026-01-01T00:00:00.000Z";
const AGENT = "triage";
const HUMAN = { kind: "human" } as const;
const PAST_A_CHECK = "31 seconds";

interface Board {
  readonly cookout: TestCookoutService;
  readonly matt: TestIdentity;
  readonly agent: TestIdentity;
}

interface Ended {
  readonly presence: Presence | undefined;
  readonly end: LastEnd;
}

interface AroundTheGrace extends Omit<Ended, "presence"> {
  readonly withinGrace: Presence | undefined;
  readonly afterGrace: Presence | undefined;
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

const AS_AGENT: JoinRequest = { as: AGENT };
const NOT_FOUND = 404;

function joinedSession({ cookout, matt }: Board, asked: JoinRequest = AS_AGENT): Effect.Effect<CookoutClient> {
  return Effect.map(
    answer(() => matt.client.join(asked)),
    ({ agentSessionToken }) => cookout.clientFor(agentSessionToken),
  );
}

function watchingAsSession(
  watched: Board,
  asked?: JoinRequest,
): Effect.Effect<{ readonly session: CookoutClient; readonly events: EventStream }> {
  return Effect.gen(function* joinThenWatch() {
    const session = yield* joinedSession(watched, asked);
    const events = yield* answer(() => session.watch());
    return { events, session };
  });
}

function webTab(url: string, token: string): Effect.Effect<void, never, Scope.Scope> {
  return Effect.gen(function* openWebTab() {
    const loggedIn = yield* answer(() =>
      request({ baseUrl: url, headers: { authorization: `Bearer ${token}` }, method: "POST", path: sessionPath }),
    );
    const [setCookie = ""] = loggedIn.headers.getSetCookie();
    const cookie = Arr.headNonEmpty(Str.split("; ")(setCookie));
    const opened = yield* answer(() =>
      openEventStream({ baseUrl: url, headers: { cookie }, method: "GET", path: eventsPath }),
    );
    if (opened.ok) {
      yield* Effect.addFinalizer(() => answer(() => opened.close()));
    }
  });
}

function connectedWatch(client: CookoutClient): Effect.Effect<EventStream, never, Scope.Scope> {
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

function endedAtOnce({ cookout }: Board, name: string): Effect.Effect<Ended> {
  return Effect.gen(function* readEnd() {
    yield* cookout.liveConnectionsClosed(name);
    const presence = yield* presenceOf(cookout.client, name);
    const end = yield* cookout.lastEnd(name);
    return { end, presence };
  });
}

function aroundTheGrace({ cookout }: Board, name: string): Effect.Effect<AroundTheGrace> {
  return Effect.gen(function* readAroundTheGrace() {
    yield* cookout.liveConnectionsClosed(name);
    yield* TestClock.adjust("59 seconds");
    const withinGrace = yield* presenceOf(cookout.client, name);
    yield* TestClock.adjust("1 second");
    const afterGrace = yield* presenceOf(cookout.client, name);
    const end = yield* cookout.lastEnd(name);
    return { afterGrace, end, withinGrace };
  });
}

interface Offline {
  readonly identity: string;
  readonly lastSeenAt: string;
  readonly offlineReason: OfflineReason;
  readonly online: false;
}

function offline(offlineReason: OfflineReason): Offline {
  return { identity: AGENT, lastSeenAt: BOOT, offlineReason, online: false };
}

it.effect("leave makes a watching agent offline at once, with the reason left, as an expected end", () =>
  Effect.gen(function* leaveGoesOffline() {
    const watched = yield* board;
    const { session } = yield* watchingAsSession(watched);
    yield* answer(() => session.leave());
    const { end, presence } = yield* endedAtOnce(watched, AGENT);

    expect(presence).toStrictEqual(offline("left"));
    expect(end).toStrictEqual({ endedUnexpectedly: false, offlineReason: "left" });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("leave makes an agent offline at once even after its watch has closed, within the grace", () =>
  Effect.gen(function* leaveAfterWatch() {
    const watched = yield* board;
    const { events, session } = yield* watchingAsSession(watched);
    yield* answer(() => events.close());
    yield* watched.cookout.liveConnectionsClosed(AGENT);
    yield* answer(() => session.leave());
    const presence = yield* presenceOf(watched.cookout.client, AGENT);

    expect(presence).toStrictEqual(offline("left"));
  }).pipe(Effect.provide(testCookout())),
);

interface Revoking {
  readonly who: string;
  readonly revoke: (watched: Board) => Promise<unknown>;
  readonly unexpected: boolean;
}

it.effect.each<Revoking>([
  {
    revoke: ({ matt }): Promise<unknown> => matt.client.revokeAgentSession(AGENT),
    unexpected: false,
    who: "its owner's revoke",
  },
  {
    revoke: ({ cookout }): Promise<unknown> => cookout.client.revokeAgentSession(AGENT),
    unexpected: true,
    who: "an admin's revoke of someone else's agent",
  },
  {
    revoke: ({ matt }): Promise<unknown> => matt.client.join({ as: AGENT, force: true }),
    unexpected: false,
    who: "a join --force takeover",
  },
])(
  "$who makes the watching agent offline at once with session revoked, unexpected: $unexpected",
  ({ revoke, unexpected }) =>
    Effect.gen(function* revoked() {
      const watched = yield* board;
      yield* watchingAsSession(watched);
      yield* answer(() => revoke(watched));
      const { end, presence } = yield* endedAtOnce(watched, AGENT);

      expect(presence).toStrictEqual(offline("session revoked"));
      expect(end).toStrictEqual({ endedUnexpectedly: unexpected, offlineReason: "session revoked" });
    }).pipe(Effect.provide(testCookout())),
);

it.effect("an agent session expiring on the test clock makes the watching agent offline at once, as unexpected", () =>
  Effect.gen(function* sessionExpires() {
    const watched = yield* board;
    yield* watchingAsSession(watched, { as: AGENT, idleExpiry: "10s" });
    yield* TestClock.adjust(PAST_A_CHECK);
    const { end, presence } = yield* endedAtOnce(watched, AGENT);

    expect(presence).toStrictEqual({ ...offline("session expired"), lastSeenAt: "2026-01-01T00:00:30.000Z" });
    expect(end).toStrictEqual({ endedUnexpectedly: true, offlineReason: "session expired" });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("revoking the agent key a watch was sent with makes the agent offline at once, as session revoked", () =>
  Effect.gen(function* keyRevoked() {
    const watched = yield* board;
    const made = yield* answer(() => watched.matt.client.createAgentKey(AGENT, { name: "ci" }));
    yield* answer(() => watched.cookout.clientFor(made.token).watch());
    yield* answer(() => watched.matt.client.revokeAgentKey(AGENT, made.agentKey.id));
    const { end, presence } = yield* endedAtOnce(watched, AGENT);

    expect(presence).toStrictEqual(offline("session revoked"));
    expect(end).toStrictEqual({ endedUnexpectedly: false, offlineReason: "session revoked" });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("deactivating a watching agent makes it offline at once, with deactivated", () =>
  Effect.gen(function* deactivated() {
    const watched = yield* board;
    yield* watchingAsSession(watched);
    yield* answer(() => watched.cookout.client.deactivateIdentity(AGENT));
    const { end, presence } = yield* endedAtOnce(watched, AGENT);

    expect(presence).toStrictEqual(offline("deactivated"));
    expect(end).toStrictEqual({ endedUnexpectedly: true, offlineReason: "deactivated" });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a clean close goes offline only after the grace, with no reason, and isn't recorded as unexpected", () =>
  Effect.gen(function* cleanClose() {
    const watched = yield* board;
    const session = yield* joinedSession(watched);
    const events = yield* connectedWatch(session);
    yield* answer(() => events.closeCleanly());
    const { afterGrace, end, withinGrace } = yield* aroundTheGrace(watched, AGENT);

    expect(withinGrace).toMatchObject({ online: true });
    expect(afterGrace).toStrictEqual({ identity: AGENT, lastSeenAt: BOOT, online: false });
    expect(end).toStrictEqual({ endedUnexpectedly: false });
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

it.effect("a drop goes offline only after the grace, reads connection lost, and is recorded as unexpected", () =>
  Effect.gen(function* dropped() {
    const watched = yield* board;
    const { events } = yield* watchingAsSession(watched);
    yield* answer(() => events.close());
    const { afterGrace, end, withinGrace } = yield* aroundTheGrace(watched, AGENT);

    expect(withinGrace).toMatchObject({ online: true });
    expect(afterGrace).toStrictEqual(offline("connection lost"));
    expect(end).toStrictEqual({ endedUnexpectedly: true, offlineReason: "connection lost" });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a clean close naming a live connection the caller doesn't hold is 404 not_found", () =>
  Effect.gen(function* notMine() {
    const watched = yield* board;
    yield* connectedWatch(watched.agent.client);
    const asMatt = { authorization: `Bearer ${watched.matt.token}` };
    const refused = yield* answer(() =>
      request({ baseUrl: watched.cookout.url, headers: asMatt, method: "DELETE", path: "/v1/events/1" }),
    );
    const named = yield* answer(() =>
      request({ baseUrl: watched.cookout.url, headers: asMatt, method: "DELETE", path: "/v1/events/nope" }),
    );

    expect([refused.status, named.status]).toStrictEqual([NOT_FOUND, NOT_FOUND]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

it.effect("after a restart, an identity that never reconnects reads connection lost at the end of the boot grace", () =>
  Effect.gen(function* bootGraceEnds() {
    const watched = yield* board;
    const { events } = yield* watchingAsSession(watched);
    yield* answer(() => events.close());
    yield* watched.cookout.liveConnectionsClosed(AGENT);
    const admin = yield* watched.cookout.restart;
    yield* TestClock.adjust("5 minutes");
    const presence = yield* presenceOf(admin, AGENT);
    const end = yield* watched.cookout.lastEnd(AGENT);

    expect(presence).toStrictEqual(offline("connection lost"));
    expect(end).toStrictEqual({ endedUnexpectedly: true, offlineReason: "connection lost" });
  }).pipe(Effect.provide(testCookout({ storage: "sqlite" }))),
);

it.effect("a closed web tab reads offline after the grace with no reason, since a tab sends no clean close", () =>
  Effect.gen(function* webTabCloses() {
    const { cookout, matt } = yield* board;
    yield* Effect.scoped(webTab(cookout.url, matt.token));
    yield* cookout.liveConnectionsClosed("matt");
    yield* TestClock.adjust("60 seconds");
    const presence = yield* presenceOf(cookout.client, "matt");

    expect(presence).toStrictEqual({ identity: "matt", lastSeenAt: BOOT, online: false });
  }).pipe(Effect.provide(testCookout())),
);
