import type { AgentKeysSection, ListedAgentKey } from "./agent-keys.ts";
import { Array as Arr, Effect, Option, Predicate, Schema } from "effect";
import { isPastExpiry, listedKey } from "./agent-keys.ts";
import type { Fails } from "./errors.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import { isFalse } from "./adapters/sql-database.ts";
import { isPublicId } from "../../../logins/index.ts";
import { lineageIn } from "./credential-lineage-sql.ts";
import { tokenHash } from "../../../identities/index.ts";
import { unreadable } from "./errors.ts";

const ONE_AT_A_TIME = { concurrency: 1 } as const;

function liveKeys(db: SqlDatabase): string {
  return `FROM agent_keys AS k
    JOIN tokens AS t ON t.token_hash = k.hash
    JOIN credential_lineage AS l ON l.hash = k.hash
    WHERE k.identity_name = ? AND ${isFalse[db.dialect]("t.revoked")}`;
}

const KeyRow = Schema.Struct({
  expires_at: Schema.NullOr(IsoTimeSchema),
  hash: Schema.String,
  last_used_at: Schema.NullOr(IsoTimeSchema),
  made_at: IsoTimeSchema,
  name: Schema.String,
  public_id: Schema.String.pipe(Schema.refine(isPublicId)),
});

type KeyRowType = typeof KeyRow.Type;

const UseRow = Schema.Struct({ expires_at: Schema.NullOr(IsoTimeSchema) });

function decodedRows(rows: readonly unknown[]): Fails<readonly KeyRowType[]> {
  return Effect.mapError(
    Effect.forEach(rows, (row) => Schema.decodeUnknownEffect(KeyRow)(row), ONE_AT_A_TIME),
    unreadable,
  );
}

function listedOf(row: KeyRowType): ListedAgentKey {
  return listedKey({
    expiresAt: Option.fromNullishOr(row.expires_at),
    id: row.public_id,
    lastUsedAt: Option.fromNullishOr(row.last_used_at),
    madeAt: row.made_at,
    name: row.name,
  });
}

function keysOf(db: SqlDatabase, sql: string, ...params: readonly string[]): Fails<readonly KeyRowType[]> {
  return Effect.flatMap(db.all(sql, ...params), decodedRows);
}

const KEY_COLUMNS = "k.hash, k.name, k.last_used_at, k.expires_at, l.public_id, l.made_at";

function createIn(db: SqlDatabase): AgentKeysSection["createAgentKey"] {
  return (key) =>
    db.transaction(
      Effect.gen(function* createAgentKey() {
        const taken = yield* keysOf(db, `SELECT ${KEY_COLUMNS} ${liveKeys(db)} AND k.name = ?`, key.identity, key.name);
        if (Arr.isReadonlyArrayNonEmpty(taken)) {
          return "name_taken" as const;
        }
        yield* db.run(
          "INSERT INTO tokens (token_hash, identity_name, revoked) VALUES (?, ?, FALSE)",
          key.hash,
          key.identity,
        );
        yield* db.run(
          "INSERT INTO agent_keys (hash, identity_name, name, last_used_at, expires_at) VALUES (?, ?, ?, NULL, ?)",
          key.hash,
          key.identity,
          key.name,
          Option.getOrNull(key.expiresAt),
        );
        yield* lineageIn(db).record({
          hash: key.hash,
          identity: key.identity,
          kind: "agent key",
          madeAt: key.now,
          parent: key.parent,
          publicId: key.publicId,
        });
        return "created" as const;
      }),
    );
}

function listIn(db: SqlDatabase): AgentKeysSection["listAgentKeys"] {
  return (identity) =>
    Effect.map(
      keysOf(db, `SELECT ${KEY_COLUMNS} ${liveKeys(db)} ORDER BY l.made_at, l.public_id`, identity),
      Arr.map(listedOf),
    );
}

function revokeIn(db: SqlDatabase): AgentKeysSection["revokeAgentKey"] {
  return ({ id, identity, now }) =>
    db.transaction(
      Effect.gen(function* revokeAgentKey() {
        const found = yield* keysOf(db, `SELECT ${KEY_COLUMNS} ${liveKeys(db)} AND l.public_id = ?`, identity, id);
        if (!Arr.isReadonlyArrayNonEmpty(found)) {
          return { status: "not_found" } as const;
        }
        const ended = yield* lineageIn(db).revokeTree(tokenHash(Arr.headNonEmpty(found).hash), now);
        return { ended, status: "revoked" } as const;
      }),
    );
}

function decodedUse(row: unknown): Fails<Option.Option<typeof UseRow.Type>> {
  if (!Predicate.isObject(row)) {
    return Effect.succeedNone;
  }
  return Effect.mapBoth(Schema.decodeUnknownEffect(UseRow)(row), { onFailure: unreadable, onSuccess: Option.some });
}

function usedIn(db: SqlDatabase): AgentKeysSection["useAgentKey"] {
  return ({ hash, now }) =>
    Effect.gen(function* useAgentKey() {
      const found = yield* Effect.flatMap(db.get("SELECT expires_at FROM agent_keys WHERE hash = ?", hash), decodedUse);
      if (Option.isNone(found)) {
        return "not an agent key" as const;
      }
      if (isPastExpiry(now)(Option.fromNullishOr(found.value.expires_at))) {
        return "expired" as const;
      }
      yield* db.run("UPDATE agent_keys SET last_used_at = ? WHERE hash = ?", now, hash);
      return "used" as const;
    });
}

function sqlAgentKeys(db: SqlDatabase): AgentKeysSection {
  return {
    createAgentKey: createIn(db),
    listAgentKeys: listIn(db),
    revokeAgentKey: revokeIn(db),
    useAgentKey: usedIn(db),
  };
}

export { sqlAgentKeys };
