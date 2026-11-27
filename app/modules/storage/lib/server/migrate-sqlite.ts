import { Effect, Schema } from "effect";
import type { FileSystem, Scope } from "effect";
import type { SqliteDatabase } from "./adapters/sqlite.ts";
import { StorageUnavailable } from "./errors.ts";
import { createOwnerOnly } from "./owner-only-file.ts";
import { migrations } from "./migrations.ts";
import { openSqlite } from "./adapters/sqlite.ts";

const NO_VERSION = 0;
const NEXT = 1;

const UserVersionRow = Schema.Struct({ user_version: Schema.Int.check(Schema.isGreaterThanOrEqualTo(NO_VERSION)) });

function decodeUserVersion(row: unknown): Effect.Effect<typeof UserVersionRow.Type, StorageUnavailable> {
  return Schema.decodeUnknownEffect(UserVersionRow)(row).pipe(
    Effect.mapError(() => StorageUnavailable.make({ message: "The database has no readable schema version." })),
  );
}

function tooNew(current: number): StorageUnavailable {
  return StorageUnavailable.make({
    message: `The database is at schema version ${String(current)}, newer than this cookout (${String(migrations.length)}). Upgrade cookout.`,
  });
}

interface Step {
  readonly sql: string;
  readonly version: number;
}

function applied(db: SqliteDatabase, { sql, version }: Step): Effect.Effect<void, StorageUnavailable> {
  return db.transaction(db.exec(`${sql}\nPRAGMA user_version = ${String(version)};`));
}

function migrate(db: SqliteDatabase): Effect.Effect<void, StorageUnavailable> {
  return Effect.gen(function* migrateSqlite() {
    const { user_version: current } = yield* Effect.flatMap(db.get("PRAGMA user_version"), decodeUserVersion);
    if (current > migrations.length) {
      return yield* tooNew(current);
    }
    const pending = migrations.slice(current);
    return yield* Effect.forEach(pending, (sql, index) => applied(db, { sql, version: current + index + NEXT }), {
      concurrency: 1,
      discard: true,
    });
  });
}

export function openMigrated(
  path: string,
): Effect.Effect<SqliteDatabase, StorageUnavailable, FileSystem.FileSystem | Scope.Scope> {
  return Effect.andThen(createOwnerOnly(path), Effect.tap(openSqlite(path), migrate));
}
