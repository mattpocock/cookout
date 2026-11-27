import type {
  CollectLoginRequest,
  LoginCollection,
  LoginCredentialLookup,
  LoginRequest,
  LoginRequestsSection,
  NewLoginRequest,
  UseLoginCredential,
} from "./login-requests.ts";
import { EXPIRED, GONE, PENDING, UNKNOWN, collected, loginCredentialExpiry } from "./login-requests.ts";
import { Effect, Function as Fn, Option, Predicate, Schema, pipe } from "effect";
import type { Identity, TokenHash } from "../../../identities/index.ts";
import { IdentityRow, toIdentity } from "./identity-row.ts";
import { isIdentityName, tokenHash } from "../../../identities/index.ts";
import type { Fails } from "./errors.ts";
import type { IsoTime } from "../../../time/index.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import type { NewLineage } from "./credential-lineage.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import { lineageIn } from "./credential-lineage-sql.ts";
import { newPublicId } from "./credential-lineage.ts";
import { unreadable } from "./errors.ts";

const ApproverColumn = Schema.String.pipe(Schema.refine(isIdentityName));

const RequestRow = Schema.Struct({
  approved_by: Schema.NullOr(ApproverColumn),
  approved_with: Schema.NullOr(Schema.String),
  expires_at: IsoTimeSchema,
  host: Schema.String,
  user_code: Schema.String,
});

type RequestRowType = typeof RequestRow.Type;

const REQUEST_COLUMNS = "approved_by, approved_with, expires_at, host, user_code";

const FIND_CREDENTIAL = `SELECT i.name, i.kind, i.owner, i.admin, i.created_at, i.display_name, i.deactivated, i.avatar
  FROM login_credentials AS c JOIN identities AS i ON i.name = c.identity_name WHERE c.hash = ?`;

const LOOK_UP_CREDENTIAL = `SELECT c.last_used_at, i.name, i.kind, i.owner, i.admin, i.created_at, i.display_name,
  i.deactivated, i.avatar
  FROM login_credentials AS c JOIN identities AS i ON i.name = c.identity_name WHERE c.hash = ?`;

const LastUsedRow = Schema.Struct({ last_used_at: IsoTimeSchema });

const FIND_LIVE_BY_HASH = `SELECT ${REQUEST_COLUMNS} FROM login_requests WHERE request_hash = ? AND expires_at > ?`;

const APPROVE = `UPDATE login_requests
  SET approved_with = CASE WHEN approved_by IS NULL THEN ? ELSE approved_with END, approved_by = coalesce(approved_by, ?)
  WHERE user_code = ?`;

const FIND_LIVE_BY_CODE = `SELECT ${REQUEST_COLUMNS} FROM login_requests WHERE user_code = ? AND expires_at > ?`;

const INSERT_REQUEST = `INSERT INTO login_requests (request_hash, user_code, host, created_at, expires_at)
  VALUES (?, ?, ?, ?, ?)`;

const ISSUE_CREDENTIAL = `INSERT INTO login_credentials (hash, identity_name, host, created_at, last_used_at, expires_at)
  SELECT ?, name, ?, ?, ?, ? FROM identities WHERE name = ?`;

function rowOf<Decoded, Failure>(decode: (row: unknown) => Effect.Effect<Decoded, Failure>) {
  return (row: unknown): Fails<Option.Option<Decoded>> => {
    if (!Predicate.isObject(row)) {
      return Effect.succeedNone;
    }
    return Effect.mapBoth(decode(row), { onFailure: unreadable, onSuccess: Option.some });
  };
}

const requestRow = rowOf(Schema.decodeUnknownEffect(RequestRow));
const identityRow = rowOf(Schema.decodeUnknownEffect(IdentityRow));
const lastUsedRow = rowOf(Schema.decodeUnknownEffect(LastUsedRow));

function shown(row: RequestRowType): LoginRequest {
  return { approved: row.approved_by !== null, expiresAt: row.expires_at, host: row.host, userCode: row.user_code };
}

interface Queries {
  readonly credential: (hash: TokenHash) => Fails<Option.Option<Identity>>;
  readonly liveByCode: (userCode: string, now: IsoTime) => Fails<Option.Option<RequestRowType>>;
}

function sqlQueries(db: SqlDatabase): Queries {
  return {
    credential: (hash: TokenHash): Fails<Option.Option<Identity>> =>
      Effect.map(Effect.flatMap(db.get(FIND_CREDENTIAL, hash), identityRow), Option.map(toIdentity)),
    liveByCode: (userCode: string, now: IsoTime): Fails<Option.Option<RequestRowType>> =>
      Effect.flatMap(db.get(FIND_LIVE_BY_CODE, userCode, now), requestRow),
  };
}

function addIn(db: SqlDatabase): LoginRequestsSection["addLoginRequest"] {
  const { liveByCode } = sqlQueries(db);
  return (request: NewLoginRequest, now: IsoTime) =>
    db.transaction(
      Effect.gen(function* addRequest() {
        yield* db.run("DELETE FROM login_requests WHERE expires_at <= ?", now);
        const taken = yield* liveByCode(request.userCode, now);
        if (Option.isSome(taken)) {
          return "code_taken" as const;
        }
        const { createdAt, expiresAt, host, requestHash, userCode } = request;
        yield* db.run(INSERT_REQUEST, requestHash, userCode, host, createdAt, expiresAt);
        return "added" as const;
      }),
    );
}

function approveIn(db: SqlDatabase): LoginRequestsSection["approveLoginRequest"] {
  const { liveByCode } = sqlQueries(db);
  return ({ approvedWith, approver, now, userCode }) =>
    db.transaction(
      Effect.gen(function* approveRequest() {
        const found = yield* liveByCode(userCode, now);
        if (Option.isNone(found)) {
          return "not_found" as const;
        }
        yield* db.run(APPROVE, approvedWith ?? null, approver, userCode);
        return "approved" as const;
      }),
    );
}

interface Issuing {
  readonly collect: CollectLoginRequest;
  readonly publicId: NewLineage["publicId"];
}

function parentOf(approvedWith: string | null): TokenHash | undefined {
  return pipe(Option.fromNullOr(approvedWith), Option.map(tokenHash), Option.getOrUndefined);
}

function issueIn(db: SqlDatabase, { collect, publicId }: Issuing) {
  const { credential } = sqlQueries(db);
  const { credentialHash, now, requestHash } = collect;
  return ({ approved_by: approver, approved_with: approvedWith, host }: RequestRowType): Fails<LoginCollection> =>
    Effect.gen(function* issueCredential() {
      yield* db.run("DELETE FROM login_requests WHERE request_hash = ?", requestHash);
      yield* db.run(ISSUE_CREDENTIAL, credentialHash, host, now, now, loginCredentialExpiry(now), approver);
      const issued = yield* credential(credentialHash);
      function recorded(identity: Identity): Fails<LoginCollection> {
        return Effect.as(
          lineageIn(db).record({
            hash: credentialHash,
            identity: identity.name,
            kind: "cli",
            madeAt: now,
            parent: parentOf(approvedWith),
            publicId,
            where: host,
          }),
          collected(identity),
        );
      }
      return yield* Option.match(issued, { onNone: Fn.constant(Effect.succeed(GONE)), onSome: recorded });
    });
}

function collectIn(db: SqlDatabase): LoginRequestsSection["collectLoginRequest"] {
  return (collect) =>
    Effect.flatMap(newPublicId, (publicId) =>
      db.transaction(
        Effect.gen(function* collectRequest() {
          const found = yield* Effect.flatMap(db.get(FIND_LIVE_BY_HASH, collect.requestHash, collect.now), requestRow);
          if (Option.isNone(found)) {
            return GONE;
          }
          if (found.value.approved_by === null) {
            return PENDING;
          }
          return yield* issueIn(db, { collect, publicId })(found.value);
        }),
      ),
    );
}

function issueStraightIn(db: SqlDatabase): LoginRequestsSection["issueLoginCredential"] {
  const { credential } = sqlQueries(db);
  return ({ credentialHash, host, identity, now, parent }) =>
    Effect.flatMap(newPublicId, (publicId) =>
      db.transaction(
        Effect.gen(function* issueCredential() {
          const expiresAt = loginCredentialExpiry(now);
          yield* db.run(ISSUE_CREDENTIAL, credentialHash, host, now, now, expiresAt, identity);
          const issued = yield* credential(credentialHash);
          if (Option.isSome(issued)) {
            yield* lineageIn(db).record({
              hash: credentialHash,
              identity,
              kind: "web",
              madeAt: now,
              parent,
              publicId,
              where: host,
            });
          }
          return Option.getOrUndefined(issued);
        }),
      ),
    );
}

interface FoundCredential {
  readonly identity: Identity;
  readonly lastUsedAt: IsoTime;
}

function foundCredential(db: SqlDatabase, hash: TokenHash): Fails<Option.Option<FoundCredential>> {
  return Effect.gen(function* findCredential() {
    const row = yield* db.get(LOOK_UP_CREDENTIAL, hash);
    const identity = yield* identityRow(row);
    const used = yield* lastUsedRow(row);
    return Option.zipWith(identity, used, (found, { last_used_at: lastUsedAt }) => ({
      identity: toIdentity(found),
      lastUsedAt,
    }));
  });
}

interface SqlLookUp {
  readonly db: SqlDatabase;
  readonly renew: boolean;
  readonly use: UseLoginCredential;
}

function expiredIn({ db, renew, use }: SqlLookUp): Fails<LoginCredentialLookup> {
  const forget = Effect.andThen(
    db.run("DELETE FROM login_credentials WHERE hash = ?", use.hash),
    lineageIn(db).markEnded({ hash: use.hash, now: use.now, why: "expired" }),
  );
  return Effect.as(Effect.when(forget, Effect.succeed(renew)), EXPIRED);
}

function activeIn(
  { db, renew, use }: SqlLookUp,
  { identity, lastUsedAt: usedBefore }: FoundCredential,
): Fails<LoginCredentialLookup> {
  if (!renew) {
    return Effect.succeed({
      expiresAt: loginCredentialExpiry(usedBefore),
      identity,
      lastUsedAt: usedBefore,
      status: "active",
    });
  }
  const expiresAt = loginCredentialExpiry(use.now);
  const renewing = "UPDATE login_credentials SET last_used_at = ?, expires_at = ? WHERE hash = ?";
  return Effect.as(db.run(renewing, use.now, expiresAt, use.hash), {
    expiresAt,
    identity,
    lastUsedAt: use.now,
    status: "active",
  } as const);
}

function lookUpIn(db: SqlDatabase, renew: boolean) {
  return (use: UseLoginCredential): Fails<LoginCredentialLookup> =>
    db.transaction(
      Effect.gen(function* lookUpCredential() {
        const found = yield* foundCredential(db, use.hash);
        if (Option.isNone(found)) {
          return UNKNOWN;
        }
        if (use.now >= loginCredentialExpiry(found.value.lastUsedAt)) {
          return yield* expiredIn({ db, renew, use });
        }
        return yield* activeIn({ db, renew, use }, found.value);
      }),
    );
}

function revokeIn(db: SqlDatabase): LoginRequestsSection["revokeLoginCredential"] {
  return (hash, now) =>
    db.transaction(
      Effect.gen(function* revokeCredential() {
        const found = yield* db.get("SELECT hash FROM login_credentials WHERE hash = ?", hash);
        yield* db.run("DELETE FROM login_credentials WHERE hash = ?", hash);
        yield* lineageIn(db).markEnded({ hash, now, why: "logged out" });
        return Predicate.isObject(found);
      }),
    );
}

function sqlLoginRequests(db: SqlDatabase): LoginRequestsSection {
  const { credential, liveByCode } = sqlQueries(db);
  return {
    addLoginRequest: addIn(db),
    approveLoginRequest: approveIn(db),
    checkLoginCredential: lookUpIn(db, false),
    collectLoginRequest: collectIn(db),
    findLoginCredential: (hash) => Effect.map(credential(hash), Option.getOrUndefined),
    findLoginRequest: (userCode, now) =>
      Effect.map(liveByCode(userCode, now), (row) => Option.getOrUndefined(Option.map(row, shown))),
    issueLoginCredential: issueStraightIn(db),
    revokeLoginCredential: revokeIn(db),
    useLoginCredential: lookUpIn(db, true),
  };
}

export { sqlLoginRequests };
