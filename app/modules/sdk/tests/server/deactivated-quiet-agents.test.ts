import { Array as Arr, DateTime, Duration, Effect, Option } from "effect";
import type {
  CookoutClient,
  CookoutEvent,
  DeactivatedQuietAgent,
  DeactivatedQuietAgentId,
  EventStream,
} from "../../index.ts";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { TestCookout, answer, refusal, testCookout, testStartTime } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";
import type { TestIdentity } from "../../../testing/server.ts";
import { createCookoutClient } from "../../index.ts";

type Wait = `${number} days` | `${number} millis`;

const HUMAN = { kind: "human" } as const;
const ADMIN = { admin: true, kind: "human" } as const;
const ONE = 1;
const UNAUTHORIZED = 401;
const NOT_FOUND = 404;
const SETTLE = "30 millis";
const JUST_UNDER_NINETY_DAYS = "7775999999 millis";
const JUST_UNDER_THIRTY_DAYS = "2591999999 millis";
const TEXT = "@ada/scout was deactivated after 90 days with no activity.";

const board = Effect.gen(function* openBoard() {
  const cookout = yield* TestCookout;
  const ada = yield* cookout.createIdentity("ada", HUMAN);
  const scout = yield* cookout.createIdentity("ada/scout", { owner: "ada" });
  yield* answer(() => ada.client.createChannel({ name: "grill" }));
  return { ada, cookout, scout };
});

const settled: Effect.Effect<void> = TestClock.withLive(Effect.sleep(SETTLE));

function quietFor(wait: Wait): Effect.Effect<void> {
  return Effect.andThen(Effect.andThen(settled, TestClock.adjust(wait)), settled);
}

function later(wait: Wait): string {
  return DateTime.formatIso(DateTime.addDuration(DateTime.makeUnsafe(testStartTime), Duration.fromInputUnsafe(wait)));
}

function unread(client: CookoutClient): Effect.Effect<readonly DeactivatedQuietAgent[]> {
  return Effect.map(
    answer(() => client.inbox()),
    ({ deactivatedQuietAgents }) => deactivatedQuietAgents,
  );
}

function entriesOnceThere(client: CookoutClient): Effect.Effect<readonly DeactivatedQuietAgent[]> {
  return Effect.repeat(unread(client), { until: (entries) => entries.length >= ONE });
}

function history(client: CookoutClient): Effect.Effect<readonly DeactivatedQuietAgent[]> {
  return Effect.map(
    answer(() => client.inboxHistory()),
    ({ deactivatedQuietAgents }) => deactivatedQuietAgents,
  );
}

function idOf(entries: readonly DeactivatedQuietAgent[]): DeactivatedQuietAgentId {
  return Option.getOrThrow(Option.map(Arr.head(entries), ({ id }) => id));
}

function clientAt(url: string, who: TestIdentity): CookoutClient {
  return createCookoutClient({ env: {}, token: who.token, url });
}

function watching(client: CookoutClient): Effect.Effect<AsyncIterator<CookoutEvent>, never, Scope.Scope> {
  return Effect.map(
    Effect.acquireRelease(
      answer(() => client.watch()),
      (events: EventStream) => answer(() => events.close()),
    ),
    (events) => events[Symbol.asyncIterator](),
  );
}

function nextEntryEvent(events: AsyncIterator<CookoutEvent>): Effect.Effect<Readonly<IteratorResult<CookoutEvent>>> {
  return Effect.repeat(
    answer(() => events.next()),
    {
      until: (heard: Readonly<IteratorResult<CookoutEvent>>) =>
        heard.done === true || heard.value.type === "deactivated-quiet-agent",
    },
  );
}

it.effect(
  "an agent with no activity for 90 days is deactivated, its token fails, and its owner gets the entry live and in the inbox",
  () =>
    Effect.gen(function* deactivatedAtNinety() {
      const { ada, scout } = yield* board;
      const justUnder = yield* Effect.andThen(quietFor(JUST_UNDER_NINETY_DAYS), answer(scout.client.whoami));
      const events = yield* watching(ada.client);
      const entries = yield* Effect.andThen(quietFor("1 millis"), entriesOnceThere(ada.client));
      const heard = yield* nextEntryEvent(events);
      const refused = yield* refusal(scout.client.whoami);
      const { alerts } = yield* answer(() => ada.client.inboxHistory());

      const entry = {
        deactivatedAt: later("90 days"),
        identity: { deactivated: true, name: "ada/scout" },
        read: false,
      };

      expect([justUnder, refused]).toMatchObject([
        { identity: { name: "ada/scout" } },
        { code: "token_revoked", status: UNAUTHORIZED },
      ]);
      expect([entries, heard, alerts]).toMatchObject([
        [{ ...entry, text: TEXT }],
        { value: { deactivatedQuietAgent: entry, type: "deactivated-quiet-agent" } },
        [],
      ]);
    }).pipe(Effect.provide(testCookout())),
);

it.effect("activity on day 89 restarts the clock, and nothing happens on day 90", () =>
  Effect.gen(function* restarted() {
    const { ada, scout } = yield* board;
    yield* quietFor("89 days");
    yield* answer(() => scout.client.createMessage({ channel: "grill", text: "still here" }));
    const still = yield* Effect.andThen(quietFor("1 days"), answer(scout.client.whoami));
    const entries = yield* history(ada.client);

    expect([still, entries]).toMatchObject([{ identity: { name: "ada/scout" } }, []]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a person with no activity for 90 days or more is never deactivated", () =>
  Effect.gen(function* personStays() {
    const { ada } = yield* board;
    const after = yield* Effect.andThen(quietFor("200 days"), answer(ada.client.whoami));

    expect(after.identity).toMatchObject({ name: "ada" });
    expect(after.identity).not.toHaveProperty("deactivated");
  }).pipe(Effect.provide(testCookout())),
);

it.effect("the entry goes to every active admin when the owner is Deactivated, and Mark read reads it for all", () =>
  Effect.gen(function* toAdmins() {
    const { cookout } = yield* board;
    const bob = yield* cookout.createIdentity("bob", ADMIN);
    yield* answer(() => cookout.client.deactivateIdentity("ada"));
    const entries = yield* Effect.andThen(quietFor("90 days"), entriesOnceThere(bob.client));
    const theirs = yield* entriesOnceThere(cookout.client);
    const { deactivatedQuietAgent } = yield* answer(() => bob.client.markDeactivatedQuietAgentRead(idOf(entries)));
    const after = yield* Effect.all([unread(bob.client), unread(cookout.client)], { concurrency: 1 });

    expect([Arr.map(entries, ({ identity }) => identity.name), theirs]).toStrictEqual([["ada/scout"], entries]);
    expect([deactivatedQuietAgent.read, after]).toStrictEqual([true, [[], []]]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("marking all as read covers the entry, and one the caller didn't get is 404", () =>
  Effect.gen(function* markAll() {
    const { ada, cookout } = yield* board;
    const entries = yield* Effect.andThen(quietFor("90 days"), entriesOnceThere(ada.client));
    const notTheirs = yield* refusal(() => cookout.client.markDeactivatedQuietAgentRead(idOf(entries)));
    const zero = yield* HttpClientRequest.post(`${cookout.url}/v1/inbox/deactivated-quiet-agents/0/read`).pipe(
      HttpClientRequest.setHeader("authorization", `Bearer ${ada.token}`),
      HttpClient.execute,
    );
    yield* answer(() => ada.client.ackAll({ deactivatedQuietAgentsUpTo: idOf(entries) }));
    const [after, read] = yield* Effect.all([unread(ada.client), history(ada.client)], { concurrency: 1 });

    expect([notTheirs, zero.status]).toMatchObject([
      { code: "deactivated_quiet_agent_not_found", status: NOT_FOUND },
      NOT_FOUND,
    ]);
    expect([after, Arr.map(read, (entry) => entry.read)]).toStrictEqual([[], [true]]);
  }).pipe(Effect.provide([testCookout(), FetchHttpClient.layer])),
);

it.effect("reactivating reads the entry, answers no token, and the next offer comes 30 days later", () =>
  Effect.gen(function* reactivated() {
    const { ada } = yield* board;
    yield* Effect.andThen(quietFor("90 days"), entriesOnceThere(ada.client));
    const back = yield* answer(() => ada.client.reactivateIdentity("ada/scout"));
    const [after, read] = yield* Effect.all([unread(ada.client), history(ada.client)], { concurrency: 1 });
    const early = yield* Effect.andThen(
      quietFor(JUST_UNDER_THIRTY_DAYS),
      answer(() => ada.client.inbox()),
    );
    const offer = yield* Effect.andThen(
      quietFor("1 millis"),
      Effect.repeat(
        answer(() => ada.client.inbox()),
        { until: (inbox) => inbox.deactivationOffers.length >= ONE },
      ),
    );

    expect([after, Arr.map(read, (entry) => entry.read), "token" in back, back.identity.name]).toStrictEqual([
      [],
      [true],
      false,
      "ada/scout",
    ]);
    expect([early.deactivationOffers, offer.deactivationOffers]).toMatchObject([
      [],
      [{ identity: { name: "ada/scout" }, quietDays: 30, raisedAt: later("120 days") }],
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a restart before day 90 still deactivates on time, once", () =>
  Effect.gen(function* restartBefore() {
    const { ada, cookout } = yield* board;
    const { url } = yield* Effect.andThen(quietFor("40 days"), cookout.restartServer);
    const entries = yield* Effect.andThen(quietFor("50 days"), entriesOnceThere(clientAt(url, ada)));
    const again = yield* cookout.restartServer;
    const all = yield* Effect.andThen(quietFor("1 days"), history(clientAt(again.url, ada)));

    expect(Arr.map(entries, ({ deactivatedAt }) => deactivatedAt)).toStrictEqual([later("90 days")]);
    expect(all).toHaveLength(ONE);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a deactivation that fell due while the server was down happens at boot", () =>
  Effect.gen(function* dueWhileDown() {
    const { ada, cookout } = yield* board;
    const { url } = yield* cookout.restartServerAfter(TestClock.adjust("100 days"));
    const entries = yield* entriesOnceThere(clientAt(url, ada));

    expect(entries).toMatchObject([{ deactivatedAt: later("100 days"), identity: { name: "ada/scout" } }]);
  }).pipe(Effect.provide(testCookout())),
);
