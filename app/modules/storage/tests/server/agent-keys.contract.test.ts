import { Array as Arr, Effect, Option } from "effect";
import type {
  CreateAgentKeyResult,
  EndedCredential,
  NewAgentKey,
  RevokeSessionResult,
  StorageUnavailable,
  UseAgentKeyResult,
} from "../../server.ts";
import {
  ONE_AT_A_TIME,
  UNKNOWN_ID,
  WEEK,
  ada,
  adaToken,
  agent,
  approvedSession,
  first,
  later,
  made,
  publicIdOf,
  withPeople,
} from "./lineage-seeds.ts";
import { expect, it } from "@effect/vitest";
import { isoTime, openStore, storageLayers } from "../../../testing/server.ts";
import type { Store } from "./lineage-seeds.ts";
import type { TokenHash } from "../../../identities/index.ts";
import { tokenHash } from "../../../identities/index.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

const [ciKey, deployKey, joinedWithCi, newCiKey] = [
  tokenHash("hash:ci-key"),
  tokenHash("hash:deploy-key"),
  tokenHash("hash:joined"),
  tokenHash("hash:new-ci"),
];
const [ciId, deployId, otherId] = [
  publicIdOf("00000000000000c1"),
  publicIdOf("00000000000000d2"),
  publicIdOf("00000000000000e3"),
];
const tomorrow = isoTime("2026-01-02T00:00:00.000Z");
const nextWeek = isoTime("2026-01-08T00:00:00.000Z");
const unexpiring = { expiresAt: Option.none(), identity: agent.name, now: made, parent: adaToken };
const ci: NewAgentKey = { ...unexpiring, hash: ciKey, name: "ci", publicId: ciId };
const deploy: NewAgentKey = { ...unexpiring, hash: deployKey, name: "deploy", publicId: deployId };
const NOT_FOUND = { status: "not_found" };

function statusesOf(storage: Store, hashes: readonly TokenHash[]): Fails<readonly string[]> {
  return Effect.forEach(
    hashes,
    (hash) => Effect.map(storage.findIdentityByTokenHash(hash), ({ status }) => status),
    ONE_AT_A_TIME,
  );
}

function namesOf(storage: Store): Fails<readonly string[]> {
  return Effect.map(
    storage.listAgentKeys(agent.name),
    Arr.map(({ name }) => name),
  );
}

function joinedWith(storage: Store, parent: TokenHash): Fails<unknown> {
  return storage.issueAgentSession({
    force: true,
    parent,
    session: { expiresAt: nextWeek, hash: joinedWithCi, identity: agent.name, idleSeconds: WEEK, issuedAt: made },
  });
}

function madeAndUsed(
  storage: Store,
): Fails<{ readonly keys: readonly CreateAgentKeyResult[]; readonly used: readonly UseAgentKeyResult[] }> {
  return Effect.gen(function* makeThenUse() {
    yield* withPeople(storage);
    const keys = yield* Effect.all(
      [
        storage.createAgentKey(ci),
        storage.createAgentKey({ ...deploy, name: "ci" }),
        storage.createAgentKey({ ...deploy, expiresAt: Option.some(tomorrow) }),
      ],
      ONE_AT_A_TIME,
    );
    const used = yield* Effect.all(
      [
        storage.useAgentKey({ hash: ciKey, now: later }),
        storage.useAgentKey({ hash: deployKey, now: later }),
        storage.useAgentKey({ hash: deployKey, now: tomorrow }),
        storage.useAgentKey({ hash: adaToken, now: later }),
      ],
      ONE_AT_A_TIME,
    );
    return { keys, used };
  });
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): an agent's keys are made with names unique to it, listed with their last use, and used until they expire",
  ({ layer }) =>
    Effect.gen(function* makeListUse() {
      const { storage } = yield* openStore(layer);
      const { keys: madeKeys, used } = yield* madeAndUsed(storage);
      const listed = yield* storage.listAgentKeys(agent.name);
      const theirs = yield* storage.listAgentKeys(ada.name);
      const statuses = yield* statusesOf(storage, [ciKey]);

      expect({ listed, madeKeys, statuses, theirs, used }).toStrictEqual({
        listed: [
          { id: ciId, lastUsedAt: later, madeAt: made, name: "ci" },
          { expiresAt: tomorrow, id: deployId, lastUsedAt: later, madeAt: made, name: "deploy" },
        ],
        madeKeys: ["created", "name_taken", "created"],
        statuses: ["active"],
        theirs: [],
        used: ["used", "used", "expired", "not an agent key"],
      });
    }),
);

function revokedOnce(
  storage: Store,
): Fails<{ readonly refused: readonly RevokeSessionResult[]; readonly revoked: RevokeSessionResult }> {
  return Effect.gen(function* revokeCi() {
    yield* withPeople(storage);
    yield* Effect.all([storage.createAgentKey(ci), storage.createAgentKey(deploy)], ONE_AT_A_TIME);
    yield* joinedWith(storage, ciKey);
    const id = ciId;
    const refused = yield* Effect.all(
      [
        storage.revokeAgentKey({ id: UNKNOWN_ID, identity: agent.name, now: later }),
        storage.revokeAgentKey({ id, identity: ada.name, now: later }),
      ],
      ONE_AT_A_TIME,
    );
    const revoked = yield* storage.revokeAgentKey({ id, identity: agent.name, now: later });
    const again = yield* storage.revokeAgentKey({ id, identity: agent.name, now: later });
    return { refused: [...refused, again], revoked };
  });
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): revoking an agent key ends the agent session joined with it, frees its name and leaves the agent's other keys working",
  ({ layer }) =>
    Effect.gen(function* revokeOne() {
      const { storage } = yield* openStore(layer);
      const { refused, revoked } = yield* revokedOnce(storage);
      const session = yield* storage.useAgentSession({ hash: joinedWithCi, now: later });
      const left = yield* namesOf(storage);
      const renamed = yield* storage.createAgentKey({ ...ci, hash: newCiKey, publicId: otherId });
      const statuses = yield* statusesOf(storage, [ciKey, deployKey]);

      expect({ left, refused, renamed, revoked, session: session.status, statuses }).toStrictEqual({
        left: ["deploy"],
        refused: [NOT_FOUND, NOT_FOUND, NOT_FOUND],
        renamed: "created",
        revoked: {
          ended: [
            { hash: ciKey, identity: agent.name, kind: "agent key" },
            { hash: joinedWithCi, identity: agent.name, kind: "agent session" },
          ],
          status: "revoked",
        },
        session: "revoked",
        statuses: ["revoked", "active"],
      });
    }),
);

function endedOf(revoked: RevokeSessionResult): readonly EndedCredential[] {
  if (revoked.status === "revoked") {
    return revoked.ended;
  }
  return [];
}

function sessionRevoked(storage: Store): Fails<RevokeSessionResult> {
  return Effect.gen(function* revokeMaker() {
    yield* withPeople(storage);
    yield* approvedSession({ approvedWith: adaToken, hash: first, storage });
    yield* Effect.all(
      [storage.createAgentKey({ ...ci, parent: first }), storage.createAgentKey(deploy)],
      ONE_AT_A_TIME,
    );
    const sessions = yield* storage.listSessions({ current: first, identity: ada.name, now: later });
    const id = Option.match(Arr.head(sessions), { onNone: () => UNKNOWN_ID, onSome: (session) => session.id });
    return yield* storage.revokeSession({ id, identity: ada.name, now: later });
  });
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): revoking the session that made an agent key ends the key, and deactivating the agent ends every key",
  ({ layer }) =>
    Effect.gen(function* cascadeToKeys() {
      const { storage } = yield* openStore(layer);
      const revoked = yield* sessionRevoked(storage);
      const left = yield* namesOf(storage);
      yield* storage.deactivateIdentity(agent.name);
      const afterDeactivation = yield* namesOf(storage);
      const statuses = yield* statusesOf(storage, [deployKey]);
      const ended = endedOf(revoked);

      expect({
        afterDeactivation,
        endedKey: Arr.some(ended, ({ hash }) => hash === ciKey),
        left,
        statuses,
      }).toStrictEqual({ afterDeactivation: [], endedKey: true, left: ["deploy"], statuses: ["revoked"] });
    }),
);
