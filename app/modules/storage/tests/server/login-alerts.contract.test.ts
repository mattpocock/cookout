import { Array as Arr, Effect, String as Str } from "effect";
import type { Storage, StorageUnavailable, StoredInboxAlert } from "../../server.ts";
import { expect, it } from "@effect/vitest";
import {
  identityFixture as identity,
  isoTime,
  identityName as nameOf,
  openStore,
  storageLayers,
} from "../../../testing/server.ts";
import type { OfflineAlertId } from "../../../presence/index.ts";
import type { PublicId } from "../../../logins/index.ts";
import { isOfflineAlertId } from "../../../presence/index.ts";
import { isPublicId } from "../../../logins/index.ts";
import { tokenHash } from "../../../identities/index.ts";

const FIRST_PARAMETER = 0;

type NewLoginAlert = Parameters<Storage["Service"]["recordLoginAlert"]>[typeof FIRST_PARAMETER];

const HASH_LENGTH = 64;
const ONE_AT_A_TIME = { concurrency: 1, discard: true } as const;
const ONE = 1;
const TWO = 2;
const THREE = 3;
const FOUR = 4;

function alertId(value: number): OfflineAlertId {
  if (isOfflineAlertId(value)) {
    return value;
  }
  throw new Error(`Not an alert ID: ${String(value)}`);
}

const FIRST = alertId(ONE);
const SECOND = alertId(TWO);
const THIRD = alertId(THREE);
const FOURTH = alertId(FOUR);

function publicId(value: string): PublicId {
  if (isPublicId(value)) {
    return value;
  }
  throw new Error(`Not a public ID: ${value}`);
}

const firefox: NewLoginAlert = {
  login: {
    clientIp: "203.0.113.7",
    kind: "new session",
    session: publicId("0123456789abcdef"),
    sessionKind: "web",
    where: "Firefox on macOS",
  },
  owner: nameOf("ada"),
  raisedAt: isoTime("2026-01-01T10:42:00.000Z"),
};

const laptop: NewLoginAlert = {
  login: { kind: "new session", session: publicId("fedcba9876543210"), sessionKind: "cli", where: "ada-laptop" },
  owner: nameOf("ada"),
  raisedAt: isoTime("2026-01-01T10:44:00.000Z"),
};

const adminRevoked: NewLoginAlert = {
  login: {
    act: "revoked a session",
    admin: nameOf("matt"),
    credential: publicId("fedcba9876543210"),
    kind: "admin act",
  },
  owner: nameOf("ada"),
  raisedAt: isoTime("2026-01-01T10:45:00.000Z"),
};

const agentSessionRevoked: NewLoginAlert = {
  login: { act: "revoked an agent session", admin: nameOf("matt"), agent: nameOf("triage"), kind: "admin act" },
  owner: nameOf("ada"),
  raisedAt: isoTime("2026-01-01T10:48:00.000Z"),
};

const deactivated: NewLoginAlert = {
  login: { act: "deactivated", admin: nameOf("matt"), kind: "admin act" },
  owner: nameOf("ada"),
  raisedAt: isoTime("2026-01-01T10:49:00.000Z"),
};

const bobsLogin: NewLoginAlert = {
  login: { kind: "new session", session: publicId("00000000000000bb"), sessionKind: "web", where: "web browser" },
  owner: nameOf("bob"),
  raisedAt: isoTime("2026-01-01T10:46:00.000Z"),
};

const linked: NewLoginAlert = {
  login: {
    kind: "new session",
    session: publicId("00000000000000aa"),
    sessionKind: "web",
    via: "login link",
    where: "Firefox on macOS",
  },
  owner: nameOf("ada"),
  raisedAt: isoTime("2026-01-01T10:47:00.000Z"),
};

function boardOf(storage: Storage["Service"]): Effect.Effect<void, StorageUnavailable> {
  return Effect.forEach(
    [
      [identity("ada", { kind: "human" }), "a"],
      [identity("bob", { kind: "human" }), "b"],
      [identity("matt", { admin: true, kind: "human" }), "m"],
      [identity("triage", { owner: "ada" }), "c"],
    ] as const,
    ([each, letter]) => storage.createIdentity(each, tokenHash(Str.repeat(HASH_LENGTH)(letter))),
    ONE_AT_A_TIME,
  );
}

function storedOf({ login, raisedAt }: NewLoginAlert, id: OfflineAlertId): StoredInboxAlert {
  return { id, login, raisedAt, read: false };
}

function readFlags(alerts: readonly StoredInboxAlert[]): readonly (readonly [OfflineAlertId, boolean])[] {
  return Arr.map(alerts, ({ id, read }) => [id, read] as const);
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): a Login alert keeps the session's public ID, kind, where, IP and time, for its person only",
  ({ layer }) =>
    Effect.gen(function* loginAlertsListed() {
      const { storage } = yield* openStore(layer);
      yield* boardOf(storage);
      const stored = yield* storage.recordLoginAlert(firefox);
      yield* Effect.forEach([bobsLogin, laptop, adminRevoked], storage.recordLoginAlert, ONE_AT_A_TIME);
      const ada = yield* storage.listAlerts(nameOf("ada"));
      const bob = yield* storage.listAlerts(nameOf("bob"));

      expect({ ada, bob, stored }).toStrictEqual({
        ada: [storedOf(firefox, FIRST), storedOf(laptop, THIRD), storedOf(adminRevoked, FOURTH)],
        bob: [storedOf(bobsLogin, SECOND)],
        stored: storedOf(firefox, FIRST),
      });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): an admin act Login alert keeps the agent it named, with no credential when it named none",
  ({ layer }) =>
    Effect.gen(function* agentActKept() {
      const { storage } = yield* openStore(layer);
      yield* boardOf(storage);
      yield* Effect.forEach([agentSessionRevoked, deactivated], storage.recordLoginAlert, ONE_AT_A_TIME);
      const ada = yield* storage.listAlerts(nameOf("ada"));

      expect(ada).toStrictEqual([storedOf(agentSessionRevoked, FIRST), storedOf(deactivated, SECOND)]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a Login alert for a session a login link made keeps that it came from one",
  ({ layer }) =>
    Effect.gen(function* linkedAlertKept() {
      const { storage } = yield* openStore(layer);
      yield* boardOf(storage);
      const stored = yield* storage.recordLoginAlert(linked);
      yield* storage.recordLoginAlert(laptop);
      const ada = yield* storage.listAlerts(nameOf("ada"));

      expect({ ada, stored }).toStrictEqual({
        ada: [storedOf(linked, FIRST), storedOf(laptop, SECOND)],
        stored: storedOf(linked, FIRST),
      });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): Login alerts and offline alerts share one ID sequence, and are read alone or up to an ID alike",
  ({ layer }) =>
    Effect.gen(function* loginAlertsRead() {
      const { storage } = yield* openStore(layer);
      yield* boardOf(storage);
      yield* storage.recordLoginAlert(firefox);
      const offline = yield* storage.recordOfflineAlert({
        agent: nameOf("triage"),
        offlineReason: "connection lost",
        owner: nameOf("ada"),
        raisedAt: isoTime("2026-01-01T10:43:00.000Z"),
      });
      yield* storage.recordLoginAlert(laptop);
      const one = yield* storage.markAlertRead(nameOf("ada"), THIRD);
      const notTheirs = yield* storage.markAlertRead(nameOf("bob"), FIRST);
      const upTo = yield* storage.markAlertsRead(nameOf("ada"), SECOND);
      const ada = yield* storage.listAlerts(nameOf("ada"));

      expect({ ada: readFlags(ada), notTheirs, offline: offline.id, one, upTo: readFlags(upTo) }).toStrictEqual({
        ada: [
          [FIRST, true],
          [SECOND, true],
          [THIRD, true],
        ],
        notTheirs: null,
        offline: SECOND,
        one: { ...storedOf(laptop, THIRD), read: true },
        upTo: [
          [FIRST, true],
          [SECOND, true],
        ],
      });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): an agent back online leaves Login alerts alone, and deleting a person drops theirs",
  ({ layer }) =>
    Effect.gen(function* loginAlertsKept() {
      const { storage } = yield* openStore(layer);
      yield* boardOf(storage);
      yield* Effect.forEach([firefox, bobsLogin], storage.recordLoginAlert, ONE_AT_A_TIME);
      const back = yield* storage.markBackOnline(nameOf("triage"), isoTime("2026-01-01T11:00:00.000Z"));
      const cleared = yield* storage.markTriggerAlertsCleared(nameOf("triage"), isoTime("2026-01-01T11:00:00.000Z"));
      yield* storage.deleteIdentity(nameOf("bob"));
      const ada = yield* storage.listAlerts(nameOf("ada"));
      const bob = yield* storage.listAlerts(nameOf("bob"));

      expect([back, cleared, ada, bob]).toStrictEqual([[], [], [storedOf(firefox, FIRST)], []]);
    }),
);
