import type {
  AgentKeysSection,
  CreateAgentKeyResult,
  ListedAgentKey,
  NewAgentKey,
  RevokeAgentKey,
  UseAgentKey,
  UseAgentKeyResult,
} from "./agent-keys.ts";
import { Array as Arr, Option, Order, pipe } from "effect";
import type { Ender, MemoryLineage } from "./credential-lineage-memory.ts";
import type { IdentityName, TokenHash } from "../../../identities/index.ts";
import { endedKey, isPastExpiry, listedKey } from "./agent-keys.ts";
import type { Fails } from "./errors.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { RevokeSessionResult } from "./credential-lineage.ts";

interface HeldKey {
  readonly identity: IdentityName;
  readonly name: string;
  readonly lastUsedAt: Option.Option<IsoTime>;
  readonly expiresAt: Option.Option<IsoTime>;
}

interface KeyTokens {
  readonly activeTokens: Map<TokenHash, IdentityName>;
  readonly revokedTokens: Map<TokenHash, IdentityName>;
}

type Open = <Value>(work: () => Value) => Fails<Value>;

interface MemoryKeys {
  readonly keys: Map<TokenHash, HeldKey>;
  readonly lineage: MemoryLineage;
  readonly tokens: KeyTokens;
}

interface MemoryAgentKeysOptions {
  readonly lineage: MemoryLineage;
  readonly tokens: KeyTokens;
  readonly open: Open;
}

const BY_MADE_AT = Order.mapInput(Order.String, ({ madeAt }: ListedAgentKey) => madeAt);
const BY_ID = Order.mapInput(Order.String, ({ id }: ListedAgentKey) => id);

interface LiveKey {
  readonly hash: TokenHash;
  readonly key: HeldKey;
}

function liveKeysOf({ keys, tokens }: MemoryKeys, identity: IdentityName): readonly LiveKey[] {
  const live: LiveKey[] = [];
  for (const [hash, key] of keys) {
    if (key.identity === identity && tokens.activeTokens.has(hash)) {
      live.push({ hash, key });
    }
  }
  return live;
}

function createIn(held: MemoryKeys, key: NewAgentKey): CreateAgentKeyResult {
  if (Arr.some(liveKeysOf(held, key.identity), ({ key: live }) => live.name === key.name)) {
    return "name_taken";
  }
  held.tokens.activeTokens.set(key.hash, key.identity);
  held.keys.set(key.hash, {
    expiresAt: key.expiresAt,
    identity: key.identity,
    lastUsedAt: Option.none(),
    name: key.name,
  });
  held.lineage.record({
    hash: key.hash,
    identity: key.identity,
    kind: "agent key",
    madeAt: key.now,
    parent: key.parent,
    publicId: key.publicId,
  });
  return "created";
}

function listedOf(held: MemoryKeys) {
  return ({ hash, key }: LiveKey): Option.Option<ListedAgentKey> =>
    Option.map(held.lineage.rowOf(hash), (row) => listedKey({ ...key, id: row.publicId, madeAt: row.madeAt }));
}

function listIn(held: MemoryKeys, identity: IdentityName): readonly ListedAgentKey[] {
  return pipe(liveKeysOf(held, identity), Arr.map(listedOf(held)), Arr.getSomes, Arr.sortBy(BY_MADE_AT, BY_ID));
}

function revokeIn(held: MemoryKeys, { id, identity, now }: RevokeAgentKey): RevokeSessionResult {
  const found = Arr.findFirst(liveKeysOf(held, identity), ({ hash }) =>
    Option.exists(held.lineage.rowOf(hash), (row) => row.publicId === id),
  );
  return Option.match(found, {
    onNone: () => ({ status: "not_found" }),
    onSome: ({ hash }) => ({ ended: held.lineage.revokeTree(hash, now), status: "revoked" }),
  });
}

function usedIn({ keys }: MemoryKeys, { hash, now }: UseAgentKey): UseAgentKeyResult {
  return Option.match(Option.fromUndefinedOr(keys.get(hash)), {
    onNone: (): UseAgentKeyResult => "not an agent key",
    onSome: (key): UseAgentKeyResult => {
      if (isPastExpiry(now)(key.expiresAt)) {
        return "expired";
      }
      keys.set(hash, { ...key, lastUsedAt: Option.some(now) });
      return "used";
    },
  });
}

function activeKey({ keys, tokens }: MemoryKeys, hash: TokenHash): Option.Option<HeldKey> {
  return Option.filter(Option.fromUndefinedOr(keys.get(hash)), () => tokens.activeTokens.has(hash));
}

function enderOf(held: MemoryKeys): Ender {
  const { tokens } = held;
  return (hash, now) =>
    Option.flatMap(activeKey(held, hash), (key) => {
      tokens.activeTokens.delete(hash);
      tokens.revokedTokens.set(hash, key.identity);
      return Option.as(
        Option.liftPredicate(key, () => !isPastExpiry(now)(key.expiresAt)),
        endedKey({ hash, identity: key.identity }),
      );
    });
}

function memoryAgentKeys({ lineage, open, tokens }: MemoryAgentKeysOptions): AgentKeysSection {
  const held: MemoryKeys = { keys: new Map(), lineage, tokens };
  lineage.addEnder(enderOf(held));
  return {
    createAgentKey: (key) => open(() => createIn(held, key)),
    listAgentKeys: (identity) => open(() => listIn(held, identity)),
    revokeAgentKey: (revoke) => open(() => revokeIn(held, revoke)),
    useAgentKey: (use) => open(() => usedIn(held, use)),
  };
}

export { memoryAgentKeys };
