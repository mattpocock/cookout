import type { AgentIdentity, Identity, IdentityName } from "../../../identities/index.ts";
import { Effect, Predicate, Schema } from "effect";
import { IDENTITY_COLUMNS, IdentityRow, toIdentity } from "./identity-row.ts";
import type { Fails } from "./errors.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import { unreadable } from "./errors.ts";

type SetFeederResult =
  | { readonly status: "set"; readonly identity: Identity }
  | { readonly status: "human" }
  | { readonly status: "not_found" };

interface FeedersSection {
  readonly setFeeder: (name: IdentityName, feeder: boolean) => Fails<SetFeederResult>;
}

interface MemoryIdentityMap {
  readonly identities: Map<IdentityName, Identity>;
  readonly open: <Value>(work: () => Value) => Fails<Value>;
}

const NOT_FOUND: SetFeederResult = { status: "not_found" };
const HUMAN: SetFeederResult = { status: "human" };
const SELECT_IDENTITY = `SELECT ${IDENTITY_COLUMNS} FROM identities WHERE name = ?`;

function fed(agent: AgentIdentity, feeder: boolean): AgentIdentity {
  const { feeder: _cleared, ...rest } = agent;
  if (feeder) {
    return { ...rest, feeder: true };
  }
  return rest;
}

function memoryFeeders({ identities, open }: MemoryIdentityMap): FeedersSection {
  return {
    setFeeder: (name, feeder) =>
      open(() => {
        const identity = identities.get(name);
        if (Predicate.isUndefined(identity)) {
          return NOT_FOUND;
        }
        if (identity.kind === "human") {
          return HUMAN;
        }
        const changed = fed(identity, feeder);
        identities.set(name, changed);
        return { identity: { ...changed }, status: "set" };
      }),
  };
}

function sqlFeeders(db: SqlDatabase): FeedersSection {
  return {
    setFeeder: (name, feeder) =>
      db.transaction(
        Effect.gen(function* setFeederRow() {
          yield* db.run("UPDATE identities SET feeder = ? WHERE name = ? AND kind = 'agent'", Number(feeder), name);
          const row = yield* db.get(SELECT_IDENTITY, name);
          if (Predicate.isUndefined(row)) {
            return NOT_FOUND;
          }
          const decoded = yield* Schema.decodeUnknownEffect(IdentityRow)(row).pipe(Effect.mapError(unreadable));
          const identity = toIdentity(decoded);
          if (identity.kind === "human") {
            return HUMAN;
          }
          return { identity, status: "set" } as const;
        }),
      ),
  };
}

export { type FeedersSection, type SetFeederResult, memoryFeeders, sqlFeeders };
