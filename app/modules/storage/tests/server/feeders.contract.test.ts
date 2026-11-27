import { Effect, String as Str } from "effect";
import {
  appendTo,
  channelFixture as channel,
  identityFixture as identity,
  identityName as nameOf,
  newMessageFixture as newMessage,
  openStore,
  storageLayers,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { tokenHash } from "../../../identities/index.ts";

const HASH_LENGTH = 64;
const hashA = tokenHash(Str.repeat(HASH_LENGTH)("a"));
const hashB = tokenHash(Str.repeat(HASH_LENGTH)("b"));
const hashC = tokenHash(Str.repeat(HASH_LENGTH)("c"));
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const unavailable = { _tag: "StorageUnavailable" };
const MATT = identity("matt", { kind: "human" });
const GITHUB = identity("github");
const FEEDER = { ...GITHUB, feeder: true } as const;

it.effect.each(storageLayers)(
  "storage contract ($adapter): an agent made a feeder is kept as one when listed, found by name or token and rotated",
  ({ layer }) =>
    Effect.gen(function* feederKept() {
      const { storage } = yield* openStore(layer);
      yield* storage.createIdentity(GITHUB, hashA);
      const set = yield* storage.setFeeder(GITHUB.name, true);
      const seen = yield* Effect.all(
        [
          storage.findIdentityByName(GITHUB.name),
          storage.listIdentities(),
          storage.findIdentityByTokenHash(hashA),
          storage.replaceToken(GITHUB.name, hashB),
        ],
        ONE_AT_A_TIME,
      );

      expect(set).toStrictEqual({ identity: FEEDER, status: "set" });
      expect(seen).toStrictEqual([
        FEEDER,
        [FEEDER, MATT],
        { identity: FEEDER, status: "active" },
        { identity: FEEDER, status: "replaced" },
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): an agent is no feeder until made one, and clearing the setting makes it an agent again",
  ({ layer }) =>
    Effect.gen(function* feederCleared() {
      const { storage } = yield* openStore(layer);
      yield* storage.createIdentity(GITHUB, hashA);
      const before = yield* storage.findIdentityByName(GITHUB.name);
      yield* storage.setFeeder(GITHUB.name, true);
      const cleared = yield* storage.setFeeder(GITHUB.name, false);
      const after = yield* storage.findIdentityByName(GITHUB.name);

      expect([before, cleared, after]).toStrictEqual([GITHUB, { identity: GITHUB, status: "set" }, GITHUB]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a human can't be a feeder, and a missing identity isn't found",
  ({ layer }) =>
    Effect.gen(function* notAnAgent() {
      const { storage } = yield* openStore(layer);
      const human = yield* storage.setFeeder(MATT.name, true);
      const missing = yield* storage.setFeeder(nameOf("nobody"), true);
      const found = yield* storage.findIdentityByName(MATT.name);

      expect([human, missing, found]).toStrictEqual([{ status: "human" }, { status: "not_found" }, MATT]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a feeder named in a message's text isn't one of its mentions",
  ({ layer }) =>
    Effect.gen(function* notMentioned() {
      const { storage } = yield* openStore(layer);
      yield* storage.createChannel(channel("grill"));
      yield* storage.createIdentity(GITHUB, hashA);
      yield* storage.createIdentity(identity("triage"), hashC);
      yield* storage.setFeeder(GITHUB.name, true);
      const said = yield* appendTo(storage)(
        newMessage("grill", "@github @triage @matt", { mentions: ["github", "triage", "matt"] }),
      );

      expect(said.mentions).toStrictEqual(["triage", "matt"]);
    }),
);

it.effect.each(storageLayers)("storage contract ($adapter): a closed store sets no feeder", ({ layer }) =>
  Effect.gen(function* closedStore() {
    const { close, storage } = yield* openStore(layer);
    yield* storage.createIdentity(GITHUB, hashA);
    yield* close;
    const refused = yield* Effect.flip(storage.setFeeder(GITHUB.name, true));

    expect(refused).toMatchObject(unavailable);
  }),
);
