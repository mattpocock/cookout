import { Array as Arr, Effect, String as Str } from "effect";
import type { OfflineAlert, OfflineAlertId } from "../../../presence/index.ts";
import type { Storage, StorageUnavailable, StoredInboxAlert } from "../../server.ts";
import { expect, it } from "@effect/vitest";
import {
  identityFixture as identity,
  isoTime,
  identityName as nameOf,
  openStore,
  storageLayers,
} from "../../../testing/server.ts";
import { isOfflineAlertId } from "../../../presence/index.ts";
import { tokenHash } from "../../../identities/index.ts";

type NewOfflineAlert = Parameters<Storage["Service"]["recordOfflineAlert"]>["0"];

const HASH_LENGTH = 64;
const ONE_AT_A_TIME = { concurrency: 1, discard: true } as const;

function alertId(value: number): OfflineAlertId {
  if (isOfflineAlertId(value)) {
    return value;
  }
  throw new Error(`Not an offline alert ID: ${String(value)}`);
}

const FIRST_ID = 1;
const SECOND_ID = 2;
const THIRD_ID = 3;
const MISSING_ID = 9;
const first = alertId(FIRST_ID);
const second = alertId(SECOND_ID);
const third = alertId(THIRD_ID);
const missing = alertId(MISSING_ID);

const adasDrop: NewOfflineAlert = {
  agent: nameOf("triage"),
  offlineReason: "connection lost",
  owner: nameOf("ada"),
  raisedAt: isoTime("2026-01-01T00:01:00.000Z"),
};

const bobsExpiry: NewOfflineAlert = {
  agent: nameOf("release"),
  offlineReason: "session expired",
  owner: nameOf("bob"),
  raisedAt: isoTime("2026-01-01T00:02:00.000Z"),
};

const adasRevoke: NewOfflineAlert = {
  ...adasDrop,
  offlineReason: "session revoked",
  raisedAt: isoTime("2026-01-01T00:03:00.000Z"),
};

const adasDropStored: OfflineAlert = {
  agent: nameOf("triage"),
  id: first,
  offlineReason: "connection lost",
  raisedAt: isoTime("2026-01-01T00:01:00.000Z"),
  read: false,
};

function bobsExpiryStored(): OfflineAlert {
  return {
    ...adasDropStored,
    agent: nameOf("release"),
    offlineReason: "session expired",
    raisedAt: bobsExpiry.raisedAt,
  };
}

function boardOf(storage: Storage["Service"]): Effect.Effect<void, StorageUnavailable> {
  return Effect.forEach(
    [
      [identity("ada", { kind: "human" }), "a"],
      [identity("bob", { kind: "human" }), "b"],
      [identity("triage", { owner: "ada" }), "c"],
      [identity("release", { owner: "bob" }), "d"],
    ] as const,
    ([each, letter]) => storage.createIdentity(each, tokenHash(Str.repeat(HASH_LENGTH)(letter))),
    ONE_AT_A_TIME,
  );
}

function raisedAll(storage: Storage["Service"]): Effect.Effect<void, StorageUnavailable> {
  return Effect.andThen(
    boardOf(storage),
    Effect.forEach([adasDrop, bobsExpiry, adasRevoke], storage.recordOfflineAlert, ONE_AT_A_TIME),
  );
}

function readFlags(alerts: readonly StoredInboxAlert[]): readonly boolean[] {
  return Arr.map(alerts, ({ read }) => read);
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): offline alerts are stored in order and listed only for their owner, unread",
  ({ layer }) =>
    Effect.gen(function* alertsListed() {
      const { storage } = yield* openStore(layer);
      yield* boardOf(storage);
      const stored = yield* storage.recordOfflineAlert(adasDrop);
      yield* storage.recordOfflineAlert(bobsExpiry);
      yield* storage.recordOfflineAlert(adasRevoke);
      const ada = yield* storage.listAlerts(nameOf("ada"));
      const triage = yield* storage.listAlerts(nameOf("triage"));

      expect(stored).toStrictEqual(adasDropStored);
      expect(ada).toStrictEqual([
        adasDropStored,
        { ...adasDropStored, id: third, offlineReason: "session revoked", raisedAt: "2026-01-01T00:03:00.000Z" },
      ]);
      expect(triage).toStrictEqual([]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): an offline alert is marked read alone, but only by its owner",
  ({ layer }) =>
    Effect.gen(function* alertRead() {
      const { storage } = yield* openStore(layer);
      yield* raisedAll(storage);
      const notTheOwner = yield* storage.markAlertRead(nameOf("bob"), first);
      const notThere = yield* storage.markAlertRead(nameOf("ada"), missing);
      const one = yield* storage.markAlertRead(nameOf("ada"), third);
      const ada = yield* storage.listAlerts(nameOf("ada"));

      expect([notTheOwner, notThere]).toStrictEqual([null, null]);
      expect(one).toMatchObject({ id: third, read: true });
      expect(readFlags(ada)).toStrictEqual([false, true]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): marking alerts read up to an ID marks only the owner's unread ones up to it",
  ({ layer }) =>
    Effect.gen(function* alertsReadUpTo() {
      const { storage } = yield* openStore(layer);
      yield* raisedAll(storage);
      const upTo = yield* storage.markAlertsRead(nameOf("ada"), second);
      const again = yield* storage.markAlertsRead(nameOf("ada"), third);
      const ada = yield* storage.listAlerts(nameOf("ada"));
      const bob = yield* storage.listAlerts(nameOf("bob"));

      expect(upTo).toStrictEqual([{ ...adasDropStored, read: true }]);
      expect(again).toMatchObject([{ id: third, read: true }]);
      expect([readFlags(ada), readFlags(bob)]).toStrictEqual([[true, true], [false]]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): an agent back online marks its alerts still waiting with the time, once",
  ({ layer }) =>
    Effect.gen(function* backOnline() {
      const { storage } = yield* openStore(layer);
      yield* raisedAll(storage);
      const back = yield* storage.markBackOnline(nameOf("triage"), isoTime("2026-01-01T00:05:00.000Z"));
      const later = yield* storage.markBackOnline(nameOf("triage"), isoTime("2026-01-01T00:06:00.000Z"));
      const bob = yield* storage.listAlerts(nameOf("bob"));

      expect(Arr.map(back, ({ backOnlineAt, id }) => [id, backOnlineAt])).toStrictEqual([
        [first, "2026-01-01T00:05:00.000Z"],
        [third, "2026-01-01T00:05:00.000Z"],
      ]);
      expect(later).toStrictEqual([]);
      expect(bob).toStrictEqual([{ ...bobsExpiryStored(), id: second }]);
    }),
);

it.effect.each(storageLayers)("storage contract ($adapter): deleting an agent drops its offline alerts", ({ layer }) =>
  Effect.gen(function* deletedAgent() {
    const { storage } = yield* openStore(layer);
    yield* raisedAll(storage);
    yield* storage.deleteIdentity(nameOf("triage"));
    const ada = yield* storage.listAlerts(nameOf("ada"));

    expect(ada).toStrictEqual([]);
  }),
);
