import { Effect, String as Str } from "effect";
import { expect, it } from "@effect/vitest";
import {
  identityFixture as identity,
  identityName as nameOf,
  openStore,
  storageLayers,
} from "../../../testing/server.ts";
import type { Description } from "../../../identities/client.ts";
import type { Identity } from "../../../identities/index.ts";
import { isDescription } from "../../../identities/client.ts";
import { tokenHash } from "../../../identities/index.ts";

const HASH_LENGTH = 64;
const LONGEST = 500;
const hashA = tokenHash(Str.repeat(HASH_LENGTH)("a"));
const hashB = tokenHash(Str.repeat(HASH_LENGTH)("b"));
const hashC = tokenHash(Str.repeat(HASH_LENGTH)("c"));
const unavailable = { _tag: "StorageUnavailable" };

function description(value: string): Description {
  if (isDescription(value)) {
    return value;
  }
  return expect.unreachable(`${value} is not a description`);
}

function described(agent: Identity, text: string): Identity {
  if (agent.kind === "human") {
    return expect.unreachable(`${agent.name} is a human`);
  }
  return { ...agent, description: description(text) };
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): an agent's description is set and kept when listed, found by name or token and rotated",
  ({ emptyLayer }) =>
    Effect.gen(function* descriptionKept() {
      const { storage } = yield* openStore(emptyLayer);
      yield* storage.createIdentity(identity("ada", { kind: "human" }), hashA);
      yield* storage.createIdentity(identity("todo-bot", { owner: "ada" }), hashB);
      const set = yield* storage.setDescription(nameOf("todo-bot"), description("Ada's to-dos"));
      const aide = described(identity("todo-bot", { owner: "ada" }), "Ada's to-dos");
      const listed = yield* storage.listIdentities();
      const byToken = yield* storage.findIdentityByTokenHash(hashB);
      const rotated = yield* storage.replaceToken(nameOf("todo-bot"), hashC);

      expect(set).toStrictEqual({ identity: aide, status: "set" });
      expect([listed, byToken, rotated]).toStrictEqual([
        [identity("ada", { kind: "human" }), aide],
        { identity: aide, status: "active" },
        { identity: aide, status: "replaced" },
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): clearing a description removes it, and one of 500 characters is kept whole",
  ({ emptyLayer }) =>
    Effect.gen(function* clearAndLongest() {
      const { storage } = yield* openStore(emptyLayer);
      const longest = Str.repeat(LONGEST)("é");
      yield* storage.createIdentity(identity("ada", { kind: "human" }), hashA);
      yield* storage.createIdentity(identity("todo-bot", { owner: "ada" }), hashB);
      yield* storage.setDescription(nameOf("todo-bot"), description("Old"));
      const cleared = yield* storage.setDescription(nameOf("todo-bot"), null);
      const longestSet = yield* storage.setDescription(nameOf("todo-bot"), description(longest));

      expect([cleared, longestSet]).toStrictEqual([
        { identity: identity("todo-bot", { owner: "ada" }), status: "set" },
        { identity: described(identity("todo-bot", { owner: "ada" }), longest), status: "set" },
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a human or a missing identity has no description to set",
  ({ emptyLayer }) =>
    Effect.gen(function* noAgent() {
      const { storage } = yield* openStore(emptyLayer);
      yield* storage.createIdentity(identity("ada", { kind: "human" }), hashA);
      const human = yield* storage.setDescription(nameOf("ada"), description("A person"));
      const missing = yield* storage.setDescription(nameOf("nobody"), description("Nobody"));
      const listed = yield* storage.listIdentities();

      expect([human, missing]).toStrictEqual([{ status: "not_found" }, { status: "not_found" }]);
      expect(listed).toStrictEqual([identity("ada", { kind: "human" })]);
    }),
);

it.effect.each(storageLayers)("storage contract ($adapter): a closed store sets no description", ({ layer }) =>
  Effect.gen(function* closedStore() {
    const { close, storage } = yield* openStore(layer);
    yield* storage.createIdentity(identity("ada", { kind: "human" }), hashA);
    yield* storage.createIdentity(identity("todo-bot", { owner: "ada" }), hashB);
    yield* close;
    const refused = yield* Effect.flip(storage.setDescription(nameOf("todo-bot"), null));

    expect(refused).toMatchObject(unavailable);
  }),
);
