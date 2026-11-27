import { Array as Arr, Effect, Option } from "effect";
import type { CookoutClient, EventStream, OfflineAlert, OfflineAlertId } from "../../index.ts";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";
import { createCookoutClient } from "../../index.ts";
import { isOfflineAlert } from "../../../inbox/index.ts";
import { request } from "../../../http/client.ts";

const AGENT = "triage";
const HUMAN = { kind: "human" } as const;
const NOT_FOUND = 404;

interface Board {
  readonly cookout: TestCookoutService;
  readonly matt: TestIdentity;
  readonly session: CookoutClient;
  readonly sessionToken: string;
}

const board: Effect.Effect<Board, never, TestCookout> = Effect.gen(function* mattAndHisAgent() {
  const cookout = yield* TestCookout;
  const matt = yield* cookout.createIdentity("matt", HUMAN);
  yield* cookout.createIdentity(AGENT, { owner: "matt" });
  const { agentSessionToken } = yield* answer(() => matt.client.join({ as: AGENT }));
  return { cookout, matt, session: cookout.clientFor(agentSessionToken), sessionToken: agentSessionToken };
});

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

function dropped({ cookout, session }: Board): Effect.Effect<void, never, Scope.Scope> {
  return Effect.gen(function* dropTheWatch() {
    const events = yield* watching(session);
    yield* answer(() => events.close());
    yield* cookout.liveConnectionsClosed(AGENT);
  });
}

function droppedTwice(watched: Board): Effect.Effect<void, never, Scope.Scope> {
  return Effect.gen(function* dropTwice() {
    yield* dropped(watched);
    yield* TestClock.adjust("60 seconds");
    yield* dropped(watched);
    yield* TestClock.adjust("60 seconds");
  });
}

function unreadAlerts(client: CookoutClient): Effect.Effect<readonly OfflineAlert[]> {
  return Effect.map(
    answer(() => client.inbox()),
    ({ alerts }) => Arr.filter(alerts, isOfflineAlert),
  );
}

function historyAlerts(client: CookoutClient): Effect.Effect<readonly OfflineAlert[]> {
  return Effect.map(
    answer(() => client.inboxHistory()),
    ({ alerts }) => Arr.filter(alerts, isOfflineAlert),
  );
}

function clientAt(url: string, token: string): CookoutClient {
  return createCookoutClient({ env: {}, token, url });
}

function alertIds(client: CookoutClient): Effect.Effect<readonly OfflineAlertId[]> {
  return Effect.map(
    unreadAlerts(client),
    Arr.map(({ id }) => id),
  );
}

function newestOf(ids: readonly OfflineAlertId[]): OfflineAlertId {
  return Option.getOrThrow(Arr.last(ids));
}

function oldestOf(ids: readonly OfflineAlertId[]): OfflineAlertId {
  return Option.getOrThrow(Arr.head(ids));
}

it.effect("marking an alert read takes it out of the unread inbox, and the history still shows it, read", () =>
  Effect.gen(function* markOneRead() {
    const watched = yield* board;
    yield* droppedTwice(watched);
    const ids = yield* alertIds(watched.matt.client);
    const { alert } = yield* answer(() => watched.matt.client.markOfflineAlertRead(oldestOf(ids)));
    const unread = yield* unreadAlerts(watched.matt.client);
    const history = yield* historyAlerts(watched.matt.client);

    expect(alert).toMatchObject({ id: 1, read: true });
    expect(unread).toMatchObject([{ id: 2, read: false }]);
    expect(history).toMatchObject([
      { id: 2, read: false },
      { id: 1, read: true },
    ]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

it.effect("Mark all as read marks every alert up to the newest seen, and the history keeps them", () =>
  Effect.gen(function* markAllRead() {
    const watched = yield* board;
    yield* droppedTwice(watched);
    const ids = yield* alertIds(watched.matt.client);
    const { alerts } = yield* answer(() => watched.matt.client.ackAll({ alertsUpTo: newestOf(ids) }));
    const unread = yield* unreadAlerts(watched.matt.client);
    const history = yield* historyAlerts(watched.matt.client);

    expect(alerts).toMatchObject([
      { id: 1, read: true },
      { id: 2, read: true },
    ]);
    expect(unread).toStrictEqual([]);
    expect(history).toMatchObject([{ read: true }, { read: true }]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

it.effect("an alert ID that is no whole number is 404 to mark read", () =>
  Effect.gen(function* notAnId() {
    const { cookout, matt } = yield* board;
    const headers = { authorization: `Bearer ${matt.token}` };
    const answered = yield* answer(() =>
      request({ baseUrl: cookout.url, headers, method: "POST", path: "/v1/inbox/alerts/nope/read" }),
    );

    expect(answered.status).toBe(NOT_FOUND);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an alert someone else owns is 404 to mark read, for an admin too", () =>
  Effect.gen(function* notTheirs() {
    const watched = yield* board;
    yield* droppedTwice(watched);
    const ids = yield* alertIds(watched.matt.client);
    const ada = yield* watched.cookout.createIdentity("ada", HUMAN);
    const refused = yield* Effect.all(
      [
        refusal(() => watched.cookout.client.markOfflineAlertRead(oldestOf(ids))),
        refusal(() => ada.client.markOfflineAlertRead(newestOf(ids))),
      ],
      { concurrency: 1 },
    );

    expect(refused).toMatchObject([
      { code: "offline_alert_not_found", status: NOT_FOUND },
      { code: "offline_alert_not_found", status: NOT_FOUND },
    ]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

it.effect("once the agent is back, its alert says when, and a later page of the history lists no alerts", () =>
  Effect.gen(function* backOnline() {
    const watched = yield* board;
    yield* dropped(watched);
    yield* TestClock.adjust("2 minutes");
    yield* watching(watched.session);
    const [alert] = yield* unreadAlerts(watched.matt.client);
    const later = yield* answer(() => watched.matt.client.inboxHistory({ before: 1 }));

    expect(alert).toMatchObject({ backOnlineAt: "2026-01-01T00:02:00.000Z", raisedAt: "2026-01-01T00:01:00.000Z" });
    expect(later.alerts).toStrictEqual([]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

it.effect("after a restart, an agent that reconnects within the boot grace raises no alert", () =>
  Effect.gen(function* reconnectsInBootGrace() {
    const watched = yield* board;
    yield* dropped(watched);
    const { url } = yield* watched.cookout.restartServer;
    yield* TestClock.adjust("1 minute");
    yield* watching(clientAt(url, watched.sessionToken));
    yield* TestClock.adjust("10 minutes");
    const alerts = yield* unreadAlerts(clientAt(url, watched.matt.token));

    expect(alerts).toStrictEqual([]);
  }).pipe(Effect.scoped, Effect.provide(testCookout({ storage: "sqlite" }))),
);

it.effect("after a restart, an agent that never reconnects raises one alert at the boot grace's end", () =>
  Effect.gen(function* missingAfterBootGrace() {
    const watched = yield* board;
    yield* dropped(watched);
    const { url } = yield* watched.cookout.restartServer;
    yield* TestClock.adjust("4 minutes");
    const during = yield* unreadAlerts(clientAt(url, watched.matt.token));
    yield* TestClock.adjust("1 minute");
    const after = yield* unreadAlerts(clientAt(url, watched.matt.token));

    expect(during).toStrictEqual([]);
    expect(after).toMatchObject([
      { agent: AGENT, offlineReason: "connection lost", raisedAt: "2026-01-01T00:05:00.000Z" },
    ]);
  }).pipe(Effect.scoped, Effect.provide(testCookout({ storage: "sqlite" }))),
);
