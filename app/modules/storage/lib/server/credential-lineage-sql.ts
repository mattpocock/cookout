import { Array as Arr, Effect, Option, Predicate, Schema } from "effect";
import type { EndedCredential, EndedWhy, LineageSection, ListedSession, NewLineage } from "./credential-lineage.ts";
import type { IdentityName, TokenHash } from "../../../identities/index.ts";
import { TRUE, isFalse } from "./adapters/sql-database.ts";
import { isIdentityName, tokenHash } from "../../../identities/index.ts";
import { isSessionKind, madeByOf } from "./credential-lineage.ts";
import type { Fails } from "./errors.ts";
import type { IsoTime } from "../../../time/index.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import { isPublicId } from "../../../logins/index.ts";
import { loginCredentialExpiry } from "./login-requests.ts";
import { unreadable } from "./errors.ts";

const ONE_AT_A_TIME = { concurrency: 1 } as const;

const RECORD = `INSERT INTO credential_lineage (hash, public_id, kind, identity_name, parent_hash, made_at, where_from)
  VALUES (?, ?, ?, ?, ?, ?, ?)`;

interface Ending {
  readonly hash: TokenHash;
  readonly why: EndedWhy;
  readonly now: IsoTime;
}

const MARK_ENDED = "UPDATE credential_lineage SET ended_at = ?, ended_why = ? WHERE hash = ? AND ended_at IS NULL";

function recordIn(db: SqlDatabase): (row: NewLineage) => Fails<void> {
  return ({ hash, identity, kind, madeAt, parent, publicId, where }) =>
    db.run(RECORD, hash, publicId, kind, identity, parent ?? null, madeAt, where ?? null);
}

function markEndedIn(db: SqlDatabase): (ending: Ending) => Fails<void> {
  return ({ hash, now, why }) => db.run(MARK_ENDED, now, why, hash);
}

function treeOf(roots: string): string {
  return `WITH RECURSIVE tree(hash) AS (
    ${roots}
    UNION
    SELECT l.hash FROM credential_lineage AS l JOIN tree ON l.parent_hash = tree.hash
  ) SELECT hash FROM tree`;
}

const NameColumn = Schema.String.pipe(Schema.refine(isIdentityName));
const HashRow = Schema.Struct({ hash: Schema.String });
const HolderRow = Schema.Struct({ expires_at: IsoTimeSchema, identity_name: NameColumn });

function decodedWith<RowSchema extends Schema.Decoder<unknown>>(schema: RowSchema) {
  return (row: unknown): Fails<Option.Option<RowSchema["Type"]>> => {
    if (!Predicate.isObject(row)) {
      return Effect.succeedNone;
    }
    return Effect.mapBoth(Schema.decodeEffect(schema)(row), { onFailure: unreadable, onSuccess: Option.some });
  };
}

const holderRow = decodedWith(HolderRow);

function hashesIn(db: SqlDatabase, roots: string, ...params: readonly string[]): Fails<readonly TokenHash[]> {
  return Effect.flatMap(db.all(treeOf(roots), ...params), (rows) =>
    Effect.mapBoth(
      Effect.forEach(rows, (row) => Schema.decodeUnknownEffect(HashRow)(row), ONE_AT_A_TIME),
      { onFailure: unreadable, onSuccess: Arr.map(({ hash }) => tokenHash(hash)) },
    ),
  );
}

interface KindTable {
  readonly kind: EndedCredential["kind"];
  readonly find: string;
  readonly end: string;
}

function kindTables(db: SqlDatabase): readonly KindTable[] {
  return [
    {
      end: "DELETE FROM login_credentials WHERE hash = ?",
      find: "SELECT identity_name, expires_at FROM login_credentials WHERE hash = ?",
      kind: "session",
    },
    {
      end: `UPDATE agent_session_tokens SET revoked = ${TRUE[db.dialect]} WHERE hash = ?`,
      find: `SELECT identity_name, expires_at FROM agent_session_tokens WHERE hash = ? AND ${isFalse[db.dialect]("revoked")}`,
      kind: "agent session",
    },
    {
      end: "DELETE FROM join_codes WHERE code_hash = ?",
      find: "SELECT agent AS identity_name, expires_at FROM join_codes WHERE code_hash = ?",
      kind: "join code",
    },
  ];
}

interface EndingIn {
  readonly db: SqlDatabase;
  readonly hash: TokenHash;
  readonly now: IsoTime;
}

function endIn({ db, hash, now }: EndingIn) {
  return (table: KindTable): Fails<Option.Option<EndedCredential>> =>
    Effect.gen(function* endInTable() {
      const found = yield* Effect.flatMap(db.get(table.find, hash), holderRow);
      if (Option.isNone(found)) {
        return Option.none();
      }
      yield* db.run(table.end, hash);
      const ended = { hash, identity: found.value.identity_name, kind: table.kind };
      return Option.some(ended).pipe(Option.filter(() => now < found.value.expires_at));
    });
}

function endEach(db: SqlDatabase, hashes: readonly TokenHash[], now: IsoTime): Fails<readonly EndedCredential[]> {
  return Effect.map(
    Effect.forEach(
      hashes,
      (hash) =>
        Effect.gen(function* endOne() {
          const ended = yield* Effect.forEach(kindTables(db), endIn({ db, hash, now }), ONE_AT_A_TIME);
          yield* markEndedIn(db)({ hash, now, why: "revoked" });
          return Arr.getSomes(ended);
        }),
      ONE_AT_A_TIME,
    ),
    Arr.flatten,
  );
}

function revokeTreeIn(db: SqlDatabase): (hash: TokenHash, now: IsoTime) => Fails<readonly EndedCredential[]> {
  return (hash, now) =>
    Effect.flatMap(hashesIn(db, "SELECT hash FROM credential_lineage WHERE hash = ?", hash), (hashes) =>
      endEach(db, hashes, now),
    );
}

interface SqlLineageWrites {
  readonly record: (row: NewLineage) => Fails<void>;
  readonly markEnded: (ending: Ending) => Fails<void>;
  readonly revokeTree: (hash: TokenHash, now: IsoTime) => Fails<readonly EndedCredential[]>;
}

function lineageIn(db: SqlDatabase): SqlLineageWrites {
  return { markEnded: markEndedIn(db), record: recordIn(db), revokeTree: revokeTreeIn(db) };
}

const SessionRow = Schema.Struct({
  hash: Schema.String,
  kind: Schema.String,
  last_used_at: IsoTimeSchema,
  made_at: IsoTimeSchema,
  parent_identity: Schema.NullOr(NameColumn),
  parent_kind: Schema.NullOr(Schema.String),
  parent_where: Schema.NullOr(Schema.String),
  public_id: Schema.String.pipe(Schema.refine(isPublicId)),
  token_holder: Schema.NullOr(NameColumn),
  where_from: Schema.NullOr(Schema.String),
});

type SessionRowType = typeof SessionRow.Type;

const LIST_SESSIONS = `SELECT l.public_id, l.kind, l.where_from, l.made_at, c.last_used_at, c.hash,
    p.kind AS parent_kind, p.where_from AS parent_where, p.identity_name AS parent_identity,
    t.identity_name AS token_holder
  FROM login_credentials AS c
  JOIN credential_lineage AS l ON l.hash = c.hash
  LEFT JOIN credential_lineage AS p ON p.hash = l.parent_hash
  LEFT JOIN tokens AS t ON t.token_hash = l.parent_hash
  WHERE c.identity_name = ? AND c.expires_at > ?
  ORDER BY l.made_at, l.public_id`;

function optional<Value extends string>(value: Value | null): Value | undefined {
  return Option.getOrUndefined(Option.fromNullOr(value));
}

function listedOf(identity: IdentityName, current: TokenHash | undefined) {
  return (row: SessionRowType): Option.Option<ListedSession> => {
    const { kind } = row;
    if (!isSessionKind(kind)) {
      return Option.none();
    }
    const madeBy = madeByOf({
      identity,
      parentIdentity: optional(row.parent_identity),
      parentKind: optional(row.parent_kind),
      parentWhere: optional(row.parent_where),
      tokenHolder: optional(row.token_holder),
    });
    return Option.some({
      current: row.hash === current,
      expiresAt: loginCredentialExpiry(row.last_used_at),
      id: row.public_id,
      kind,
      lastUsedAt: row.last_used_at,
      madeAt: row.made_at,
      where: row.where_from ?? "web browser",
      ...madeBy,
    });
  };
}

function listIn(db: SqlDatabase): LineageSection["listSessions"] {
  return ({ current, identity, now }) =>
    Effect.flatMap(db.all(LIST_SESSIONS, identity, now), (rows) =>
      Effect.mapBoth(
        Effect.forEach(rows, (row) => Schema.decodeUnknownEffect(SessionRow)(row), ONE_AT_A_TIME),
        {
          onFailure: unreadable,
          onSuccess: (decoded: readonly SessionRowType[]) =>
            Arr.getSomes(Arr.map(decoded, listedOf(identity, current))),
        },
      ),
    );
}

const FIND_SESSION = `SELECT l.hash FROM credential_lineage AS l JOIN login_credentials AS c ON c.hash = l.hash
  WHERE l.public_id = ? AND c.identity_name = ? AND c.expires_at > ?`;

const hashRow = decodedWith(HashRow);

function revokeSessionIn(db: SqlDatabase): LineageSection["revokeSession"] {
  return ({ id, identity, now }) =>
    db.transaction(
      Effect.gen(function* revokeSession() {
        const found = yield* Effect.flatMap(db.get(FIND_SESSION, id, identity, now), hashRow);
        if (Option.isNone(found)) {
          return { status: "not_found" } as const;
        }
        const ended = yield* revokeTreeIn(db)(tokenHash(found.value.hash), now);
        return { ended, status: "revoked" } as const;
      }),
    );
}

function belowRevokedTokensIn(db: SqlDatabase): LineageSection["revokeBelowRevokedTokens"] {
  const roots = `SELECT token_hash AS hash FROM tokens WHERE identity_name = ? AND revoked = ${TRUE[db.dialect]}`;
  return (identity, now) =>
    db.transaction(Effect.flatMap(hashesIn(db, roots, identity), (hashes) => endEach(db, hashes, now)));
}

function credentialsOfIn(db: SqlDatabase): LineageSection["endCredentialsOf"] {
  const roots = `SELECT token_hash AS hash FROM tokens WHERE identity_name = ?
    UNION SELECT hash FROM credential_lineage WHERE identity_name = ? AND kind <> 'join code'`;
  return (identity, now) =>
    db.transaction(Effect.flatMap(hashesIn(db, roots, identity, identity), (hashes) => endEach(db, hashes, now)));
}

function sqlLineage(db: SqlDatabase): LineageSection {
  return {
    endCredentialsOf: credentialsOfIn(db),
    listSessions: listIn(db),
    revokeBelowRevokedTokens: belowRevokedTokensIn(db),
    revokeSession: revokeSessionIn(db),
  };
}

export { lineageIn, sqlLineage };
