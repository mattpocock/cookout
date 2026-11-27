import type { Identity, TokenHash } from "../../../identities/index.ts";
import type { Storage, StorageUnavailable } from "../../server.ts";
import { expect, it } from "@effect/vitest";
import { identityFixture as identity, isoTime, openStore, storageLayers } from "../../../testing/server.ts";
import { Effect } from "effect";
import type { IsoTime } from "../../../time/index.ts";
import { tokenHash } from "../../../identities/index.ts";

const made = isoTime("2026-01-01T00:00:00.000Z");
const before = isoTime("2026-01-01T23:59:59.999Z");
const expiresAt = isoTime("2026-01-02T00:00:00.000Z");
const ada = identity("ada", { admin: true, kind: "human" });
const linkHash = tokenHash("hash:setup");
const session = tokenHash("hash:session");

type Store = Storage["Service"];

interface Redeem {
  readonly admin?: Identity;
  readonly credentialHash?: TokenHash;
  readonly linkHash?: TokenHash;
  readonly now?: IsoTime;
}

function redeemed(storage: Store, redeem: Redeem = {}): ReturnType<Store["redeemSetupLink"]> {
  return storage.redeemSetupLink({
    admin: ada,
    credentialHash: session,
    host: "Firefox on macOS",
    linkHash,
    now: before,
    ...redeem,
  });
}

interface MadeAdmin {
  readonly found: Effect.Success<ReturnType<Store["findIdentityByName"]>>;
  readonly sessions: Effect.Success<ReturnType<Store["listSessions"]>>;
  readonly used: Effect.Success<ReturnType<Store["checkLoginCredential"]>>;
}

function madeAdmin(storage: Store): Effect.Effect<MadeAdmin, StorageUnavailable> {
  return Effect.all(
    {
      found: storage.findIdentityByName(ada.name),
      sessions: storage.listSessions({ current: session, identity: ada.name, now: before }),
      used: storage.checkLoginCredential({ hash: session, now: before }),
    },
    { concurrency: 1 },
  );
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): a setup link redeems once into the first admin, logged in at the root of its lineage",
  ({ layer }) =>
    Effect.gen(function* redeemOnce() {
      const { storage } = yield* openStore(layer);
      yield* storage.replaceSetupLink({ createdAt: made, expiresAt, linkHash });
      const first = yield* redeemed(storage);
      const second = yield* redeemed(storage, { admin: identity("bea", { admin: true, kind: "human" }) });
      const { found, sessions, used } = yield* madeAdmin(storage);

      expect(first).toMatchObject({ identity: { admin: true, name: "ada" }, status: "redeemed" });
      expect(second).toStrictEqual({ status: "gone" });
      expect(found).toStrictEqual(ada);
      expect(used).toMatchObject({ identity: { name: "ada" }, status: "active" });
      expect(sessions).toMatchObject([{ current: true, kind: "web", madeAt: before, where: "Firefox on macOS" }]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a new setup link replaces the earlier one, and one at its 24 hours or never made finds nothing",
  ({ layer }) =>
    Effect.gen(function* replacedAndExpired() {
      const { storage } = yield* openStore(layer);
      yield* storage.replaceSetupLink({ createdAt: made, expiresAt, linkHash: tokenHash("hash:earlier") });
      yield* storage.replaceSetupLink({ createdAt: made, expiresAt, linkHash });
      const earlier = yield* redeemed(storage, { linkHash: tokenHash("hash:earlier") });
      const unknown = yield* redeemed(storage, { linkHash: tokenHash("hash:unknown") });
      const expired = yield* redeemed(storage, { now: expiresAt });
      const found = yield* storage.findIdentityByName(ada.name);

      expect([earlier, unknown, expired]).toStrictEqual([{ status: "gone" }, { status: "gone" }, { status: "gone" }]);
      expect(found).toBeUndefined();
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a setup link finds nothing once the store has an active admin",
  ({ layer }) =>
    Effect.gen(function* adminExists() {
      const { storage } = yield* openStore(layer);
      yield* storage.createIdentity(identity("grace", { admin: true, kind: "human" }), tokenHash("hash:grace"));
      yield* storage.replaceSetupLink({ createdAt: made, expiresAt, linkHash });
      const refused = yield* redeemed(storage);
      const found = yield* storage.findIdentityByName(ada.name);

      expect(refused).toStrictEqual({ status: "gone" });
      expect(found).toBeUndefined();
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a setup link given a name someone has keeps working for another name",
  ({ layer }) =>
    Effect.gen(function* nameTaken() {
      const { storage } = yield* openStore(layer);
      yield* storage.createIdentity(identity("ada", { kind: "human" }), tokenHash("hash:ada"));
      yield* storage.replaceSetupLink({ createdAt: made, expiresAt, linkHash });
      const taken = yield* redeemed(storage);
      const other = yield* redeemed(storage, { admin: identity("bea", { admin: true, kind: "human" }) });

      expect(taken).toStrictEqual({ status: "name_taken" });
      expect(other).toMatchObject({ identity: { admin: true, name: "bea" }, status: "redeemed" });
    }),
);
