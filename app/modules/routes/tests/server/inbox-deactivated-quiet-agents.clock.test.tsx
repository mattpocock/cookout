import { Array as Arr, Effect, Option } from "effect";
import {
  EARLIER,
  ENTRY,
  FOR_YOU,
  HUMAN,
  buttonsIn,
  caughtUp,
  clickInForYou,
  deactivatedLiveIn,
  inboxCounts,
  quietFor,
  readOldest,
  rowsIn,
  settled,
  unreadIds,
} from "./deactivated-quiet-agents.ts";
import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { inDialog, inPane } from "../regions.ts";
import type { CookoutClient } from "../../../sdk/index.ts";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";
import type { TestIdentity } from "../../../testing/server.ts";
import { cuttable } from "../cuttable.ts";
import { openAt } from "../render.tsx";

const ZERO = 0;

const deactivatedLive = deactivatedLiveIn((client) => client);

function activeOf(client: CookoutClient): Effect.Effect<Option.Option<boolean>> {
  return Effect.map(
    answer(() => client.listIdentities({ include: "deactivated" })),
    ({ identities }) =>
      Option.map(
        Arr.findFirst(identities, ({ name }) => name === "triage-agent"),
        ({ deactivated }) => deactivated !== true,
      ),
  );
}

it.effect("after 90 quiet days the owner's inbox shows the entry under For you and counts it, with no reload", () =>
  Effect.gen(function* entryShows() {
    yield* deactivatedLive;
    const name = within(screen.getByRole("list", { name: FOR_YOU })).getByRole("link", { name: "triage-agent" });

    expect([
      screen.getByRole("heading", { level: 2, name: "For you 1" }).textContent,
      rowsIn(FOR_YOU),
      inboxCounts(),
      name.getAttribute("href"),
    ]).toStrictEqual([
      "For you 1",
      [expect.stringMatching(/^@triage-agent was deactivated after 90 days with no activity\..*triage-agent/u)],
      ["1 for you"],
      "#/inbox?profile=triage-agent",
    ]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

it.effect(
  "Reactivate in the row asks first, reactivates the agent with no token to show, and moves the row to Earlier",
  () =>
    Effect.gen(function* reactivateInRow() {
      const ada = yield* deactivatedLive;
      clickInForYou("Reactivate");
      const confirm = yield* answer(() => inDialog().findByRole("button", { name: "Reactivate @triage-agent" }));
      fireEvent.click(confirm);
      yield* Effect.repeat(unreadIds(ada.client), { until: (ids) => ids.length === ZERO });
      yield* caughtUp;
      const active = yield* activeOf(ada.client);

      expect([
        active,
        rowsIn(FOR_YOU),
        inboxCounts(),
        rowsIn(EARLIER),
        inPane().queryByRole("button", { name: "Copy token" }),
      ]).toStrictEqual([Option.some(true), [], [], [expect.stringContaining(ENTRY)], null]);
    }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

it.effect("Mark read in the row moves it to Earlier and drops the count", () =>
  Effect.gen(function* markReadInRow() {
    const ada = yield* deactivatedLive;
    clickInForYou("Mark read");
    yield* caughtUp;
    const unread = yield* unreadIds(ada.client);

    expect([rowsIn(FOR_YOU), inboxCounts(), rowsIn(EARLIER), unread]).toStrictEqual([
      [],
      [],
      [expect.stringContaining(ENTRY)],
      [],
    ]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

it.effect("Mark all as read reads the entry, moving it to Earlier", () =>
  Effect.gen(function* markAll() {
    const ada = yield* deactivatedLive;
    fireEvent.click(inPane().getByRole("button", { name: "Mark all as read" }));
    yield* caughtUp;
    const unread = yield* unreadIds(ada.client);

    expect([rowsIn(FOR_YOU), inboxCounts(), rowsIn(EARLIER), unread]).toStrictEqual([
      [],
      [],
      [expect.stringContaining(ENTRY)],
      [],
    ]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

it.effect("a second tab drops the row from For you as soon as another session's Reactivate reads the entry", () =>
  Effect.gen(function* reactivateElsewhere() {
    const ada = yield* deactivatedLive;
    yield* answer(() => ada.client.reactivateIdentity("triage-agent"));
    yield* caughtUp;

    expect([rowsIn(FOR_YOU), inboxCounts(), rowsIn(EARLIER)]).toStrictEqual([[], [], [expect.stringContaining(ENTRY)]]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

const deactivated: Effect.Effect<TestIdentity, never, TestCookout> = Effect.gen(function* deactivateUnwatched() {
  const cookout = yield* TestCookout;
  const ada = yield* cookout.createIdentity("ada", { ...HUMAN, credential: "identity token" });
  yield* cookout.createIdentity("triage-agent", { owner: "ada" });
  yield* Effect.andThen(quietFor("2159 hours"), quietFor("1 hour"));
  yield* Effect.repeat(unreadIds(ada.client), { until: (ids) => ids.length > ZERO });
  return ada;
});

function refusingMarkRead(client: CookoutClient): CookoutClient {
  return { ...client, markDeactivatedQuietAgentRead: () => Promise.reject(new Error("refused")) };
}

it.effect("an entry read in another session while the live link was down leaves For you once it is back", () =>
  Effect.gen(function* readWhileDown() {
    const ada = yield* deactivated;
    const { live, report } = cuttable();
    openAt({ client: ada.client, hash: "#/inbox", live });
    yield* answer(() => inPane().findByText(ENTRY));
    report("down");
    yield* readOldest(ada.client);
    report("up");
    yield* caughtUp;

    expect([rowsIn(FOR_YOU), inboxCounts()]).toStrictEqual([[], []]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a refused Mark read keeps the row in For you", () =>
  Effect.gen(function* refusedMarkRead() {
    const ada = yield* deactivated;
    openAt({ client: refusingMarkRead(ada.client), hash: "#/inbox" });
    yield* answer(() => inPane().findByText(ENTRY));
    clickInForYou("Mark read");
    yield* settled;

    expect([rowsIn(FOR_YOU), inboxCounts(), rowsIn(EARLIER)]).toStrictEqual([
      [expect.stringContaining(ENTRY)],
      ["1 for you"],
      [],
    ]);
  }).pipe(Effect.provide(testCookout())),
);

const TWO = 2;

const twoDeactivated: Effect.Effect<TestIdentity, never, TestCookout> = Effect.gen(function* deactivateTwo() {
  const cookout = yield* TestCookout;
  const ada = yield* cookout.createIdentity("ada", { ...HUMAN, credential: "identity token" });
  yield* cookout.createIdentity("triage-agent", { owner: "ada" });
  yield* TestClock.adjust("1 minute");
  yield* cookout.createIdentity("ada/helper", { owner: "ada" });
  yield* Effect.andThen(quietFor("2159 hours"), quietFor("1 hour"));
  yield* Effect.repeat(unreadIds(ada.client), { until: (ids) => ids.length >= TWO });
  return ada;
});

it.effect("two deactivated agents give two rows, newest first", () =>
  Effect.gen(function* twoRows() {
    const ada = yield* twoDeactivated;
    openAt({ client: ada.client, hash: "#/inbox" });
    yield* answer(() => inPane().findByText(ENTRY));

    expect([rowsIn(FOR_YOU), inboxCounts()]).toStrictEqual([
      [expect.stringContaining("@ada/helper was deactivated"), expect.stringContaining(ENTRY)],
      ["2 for you"],
    ]);
  }).pipe(Effect.provide(testCookout())),
);

function refusingReactivate(client: CookoutClient): CookoutClient {
  return { ...client, reactivateIdentity: () => Promise.reject(new Error("refused")) };
}

const REFUSED = /^Couldn't reactivate/u;

const reactivateRefused: Effect.Effect<TestIdentity, never, TestCookout | Scope.Scope> = Effect.gen(
  function* refuseReactivate() {
    const ada = yield* deactivatedLiveIn(refusingReactivate);
    clickInForYou("Reactivate");
    const confirm = yield* answer(() => inDialog().findByRole("button", { name: "Reactivate @triage-agent" }));
    fireEvent.click(confirm);
    yield* answer(() => inDialog().findByText(REFUSED));
    fireEvent.click(inDialog().getByRole("button", { name: "Cancel" }));
    yield* settled;
    return ada;
  },
);

it.effect("a refused Reactivate shows its error on the row and keeps Reactivate, so the owner can try again", () =>
  Effect.gen(function* refusedReactivate() {
    yield* reactivateRefused;

    expect([rowsIn(FOR_YOU), buttonsIn(FOR_YOU), inboxCounts()]).toStrictEqual([
      [expect.stringMatching(/^@triage-agent was deactivated.*Couldn't reactivate/u)],
      ["Reactivate", "Mark read"],
      ["1 for you"],
    ]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

it.effect("after a refused Reactivate, the row leaves For you once the entry is read elsewhere", () =>
  Effect.gen(function* refusedThenReadElsewhere() {
    const ada = yield* reactivateRefused;
    yield* readOldest(ada.client);
    yield* caughtUp;

    expect([rowsIn(FOR_YOU), inboxCounts(), rowsIn(EARLIER)]).toStrictEqual([[], [], [expect.stringContaining(ENTRY)]]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);
