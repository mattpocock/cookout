import { Array as Arr, Effect, String as Str } from "effect";
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
const hashD = tokenHash(Str.repeat(HASH_LENGTH)("d"));
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const MATT = identity("matt", { kind: "human" });
const GONE = { ...identity("gone"), deactivated: true } as const;

it.effect.each(storageLayers)(
  "storage contract ($adapter): deactivating an identity keeps it, marked, and revokes its token",
  ({ layer }) =>
    Effect.gen(function* deactivate() {
      const { storage } = yield* openStore(layer);
      yield* storage.createIdentity(identity("gone"), hashA);
      const deactivated = yield* storage.deactivateIdentity(nameOf("gone"));
      const found = yield* storage.findIdentityByName(nameOf("gone"));
      const listed = yield* storage.listIdentities();
      const afterwards = yield* Effect.all(
        [storage.findIdentityByTokenHash(hashA), storage.createIdentity(identity("gone"), hashB)],
        ONE_AT_A_TIME,
      );

      expect(deactivated).toStrictEqual({ identity: GONE, status: "deactivated" });
      expect([found, listed]).toStrictEqual([GONE, [GONE, MATT]]);
      expect(afterwards).toStrictEqual([{ status: "revoked" }, "name_taken"]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): deactivating a human changes no other identity, not even the agents they own",
  ({ layer }) =>
    Effect.gen(function* noCascade() {
      const { storage } = yield* openStore(layer);
      yield* Effect.forEach(
        [
          [identity("grace", { kind: "human" }), hashA],
          [identity("release-bot"), hashB],
          [identity("matt/helper"), hashC],
          [identity("grace/helper", { owner: "grace" }), hashD],
        ] as const,
        ([each, hash]) => storage.createIdentity(each, hash),
        ONE_AT_A_TIME,
      );
      const deactivated = yield* storage.deactivateIdentity(nameOf("matt"));
      const tokens = yield* Effect.forEach([hashB, hashC, hashD], storage.findIdentityByTokenHash, ONE_AT_A_TIME);
      const listed = yield* storage.listIdentities();

      expect(deactivated).toStrictEqual({ identity: { ...MATT, deactivated: true }, status: "deactivated" });
      expect(tokens).toMatchObject([{ status: "active" }, { status: "active" }, { status: "active" }]);
      expect(Arr.map(listed, ({ deactivated: off, name }) => [name, off === true])).toStrictEqual([
        ["grace", false],
        ["grace/helper", false],
        ["matt", true],
        ["matt/helper", false],
        ["release-bot", false],
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): deactivating or reactivating a missing identity finds nothing",
  ({ layer }) =>
    Effect.gen(function* missing() {
      const { storage } = yield* openStore(layer);
      const deactivated = yield* storage.deactivateIdentity(nameOf("nobody"));
      const reactivated = yield* storage.reactivateIdentity(nameOf("nobody"), hashA);

      expect([deactivated, reactivated]).toStrictEqual([{ status: "not_found" }, { status: "not_found" }]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): the last active admin can't be deactivated, and a deactivated admin doesn't count",
  ({ layer }) =>
    Effect.gen(function* lastAdmin() {
      const { storage } = yield* openStore(layer);
      yield* storage.createIdentity(identity("boss", { admin: true, kind: "human" }), hashA);
      yield* storage.createIdentity(identity("boss-2", { admin: true, kind: "human" }), hashB);
      const first = yield* storage.deactivateIdentity(nameOf("boss"));
      const second = yield* storage.deactivateIdentity(nameOf("boss-2"));
      const removed = yield* storage.setAdmin(nameOf("boss-2"), false);
      const boss2 = yield* storage.findIdentityByTokenHash(hashB);

      expect(first).toMatchObject({ status: "deactivated" });
      expect([second, removed]).toStrictEqual([{ status: "last_admin" }, { status: "last_admin" }]);
      expect(boss2).toMatchObject({ status: "active" });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): two admins deactivated at once leave one active admin",
  ({ layer }) =>
    Effect.gen(function* twoAtOnce() {
      const { storage } = yield* openStore(layer);
      yield* storage.createIdentity(identity("boss", { admin: true, kind: "human" }), hashA);
      yield* storage.createIdentity(identity("boss-2", { admin: true, kind: "human" }), hashB);
      const results = yield* Effect.all(
        [storage.deactivateIdentity(nameOf("boss")), storage.deactivateIdentity(nameOf("boss-2"))],
        { concurrency: "unbounded" },
      );

      expect(
        Arr.sort(
          Arr.map(results, ({ status }) => status),
          Str.Order,
        ),
      ).toStrictEqual(["deactivated", "last_admin"]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): reactivating holds only the new token, even for an agent whose owner is deactivated",
  ({ layer }) =>
    Effect.gen(function* reactivate() {
      const { storage } = yield* openStore(layer);
      yield* storage.createIdentity(identity("release-bot"), hashA);
      yield* storage.deactivateIdentity(nameOf("release-bot"));
      yield* storage.deactivateIdentity(nameOf("matt"));
      const answers = yield* Effect.all(
        [
          storage.reactivateIdentity(nameOf("release-bot"), hashB),
          storage.reactivateIdentity(nameOf("matt"), hashC),
          storage.reactivateIdentity(nameOf("matt"), hashD),
        ],
        ONE_AT_A_TIME,
      );
      const tokens = yield* Effect.forEach(
        [hashA, hashB, hashC, hashD],
        storage.findIdentityByTokenHash,
        ONE_AT_A_TIME,
      );

      expect(answers).toStrictEqual([
        { identity: identity("release-bot"), status: "reactivated" },
        { identity: MATT, status: "reactivated" },
        { status: "not_deactivated" },
      ]);
      expect(tokens).toStrictEqual([
        { status: "revoked" },
        { identity: identity("release-bot"), status: "active" },
        { identity: MATT, status: "active" },
        { status: "unknown" },
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): an agent created with no token is stored and found by name, and holds no token",
  ({ layer }) =>
    Effect.gen(function* createdTokenless() {
      const { storage } = yield* openStore(layer);
      const created = yield* storage.createIdentity(identity("release-bot"));
      const again = yield* storage.createIdentity(identity("release-bot"), hashA);
      const found = yield* storage.findIdentityByName(nameOf("release-bot"));
      const token = yield* storage.findIdentityByTokenHash(hashA);

      expect([created, again, found, token]).toStrictEqual([
        "created",
        "name_taken",
        identity("release-bot"),
        { status: "unknown" },
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): reactivating with no token brings the identity back holding none, its old token still revoked",
  ({ layer }) =>
    Effect.gen(function* reactivateTokenless() {
      const { storage } = yield* openStore(layer);
      yield* storage.createIdentity(identity("release-bot"), hashA);
      yield* storage.deactivateIdentity(nameOf("release-bot"));
      const reactivated = yield* storage.reactivateIdentity(nameOf("release-bot"));
      const found = yield* storage.findIdentityByName(nameOf("release-bot"));
      const token = yield* storage.findIdentityByTokenHash(hashA);

      expect([reactivated, found, token]).toStrictEqual([
        { identity: identity("release-bot"), status: "reactivated" },
        identity("release-bot"),
        { status: "revoked" },
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a deactivated identity's messages keep it as their author, and it can't be mentioned",
  ({ layer }) =>
    Effect.gen(function* history() {
      const { storage } = yield* openStore(layer);
      yield* storage.createChannel(channel("grill"));
      yield* storage.createIdentity(identity("bob"), hashA);
      const said = yield* appendTo(storage)(newMessage("grill", "mine", { author: { name: "bob" } }));
      yield* storage.deactivateIdentity(nameOf("bob"));
      const mention = yield* appendTo(storage)(newMessage("grill", "@bob @matt", { mentions: ["bob", "matt"] }));
      const page = yield* storage.listChannelMessages(channel("grill").name, { limit: 10 });

      expect(mention.mentions).toStrictEqual(["matt"]);
      expect(page).toMatchObject({ messages: [{ author: { name: "bob" }, id: said.id }, { id: mention.id }] });
    }),
);
