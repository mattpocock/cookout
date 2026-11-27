import { Effect, String as Str } from "effect";
import type { Redacted, Scope } from "effect";
import type { Storage, StorageUnavailable } from "../../server.ts";
import {
  emptyPostgresDatabase,
  identityFixture,
  identityName,
  isoTime,
  onPostgresDatabase,
  openStore,
  testSecretsCipher,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { OfflineAlert } from "../../../presence/index.ts";
import { isPublicId } from "../../../logins/index.ts";
import { postgresStorage } from "../../server.ts";
import { tokenHash } from "../../../identities/index.ts";

const FIRST_PARAMETER = 0;

type NewLoginAlert = Parameters<Storage["Service"]["recordLoginAlert"]>[typeof FIRST_PARAMETER];

const ada = identityName("ada");
const triage = identityName("triage");
const backAt = isoTime("2026-01-01T00:05:00.000Z");
const HASH_LENGTH = 64;
const SECOND = 2;

const MIGRATIONS_SINCE = 6;

const DOWNGRADE_POSTGRES = [
  "ALTER TABLE offline_alerts DROP COLUMN acted_on_agent",
  "ALTER TABLE identities DROP COLUMN feeder",
  "DROP TABLE agent_keys",
  "ALTER TABLE offline_alerts DROP COLUMN made_via",
  "ALTER TABLE offline_alerts DROP CONSTRAINT offline_alerts_one_kind",
  `ALTER TABLE offline_alerts DROP COLUMN login_kind, DROP COLUMN credential_id, DROP COLUMN session_kind,
     DROP COLUMN where_from, DROP COLUMN client_ip, DROP COLUMN admin_name, DROP COLUMN admin_act`,
  "ALTER TABLE offline_alerts ALTER COLUMN agent_name SET NOT NULL, ALTER COLUMN offline_reason SET NOT NULL",
  `UPDATE schema_version SET version = version - ${String(MIGRATIONS_SINCE)}`,
];

const session = "0123456789abcdef";

function newLogin(): NewLoginAlert {
  if (!isPublicId(session)) {
    throw new Error("Not a public ID");
  }
  return {
    login: { kind: "new session", session, sessionKind: "cli", where: "ada-laptop" },
    owner: ada,
    raisedAt: isoTime("2026-01-01T00:06:00.000Z"),
  };
}

function opened(url: Redacted.Redacted): ReturnType<typeof openStore<StorageUnavailable, never>> {
  return openStore(postgresStorage({ cipher: testSecretsCipher, url }));
}

function storedBeforeLoginAlerts(url: Redacted.Redacted): Effect.Effect<OfflineAlert, StorageUnavailable, Scope.Scope> {
  return Effect.gen(function* storeThenDowngrade() {
    const first = yield* opened(url);
    yield* first.storage.createIdentity(
      identityFixture("ada", { kind: "human" }),
      tokenHash(Str.repeat(HASH_LENGTH)("a")),
    );
    yield* first.storage.createIdentity(
      identityFixture("triage", { owner: "ada" }),
      tokenHash(Str.repeat(HASH_LENGTH)("c")),
    );
    const offline = yield* first.storage.recordOfflineAlert({
      agent: triage,
      offlineReason: "connection lost",
      owner: ada,
      raisedAt: isoTime("2026-01-01T00:01:00.000Z"),
    });
    yield* first.close;
    yield* onPostgresDatabase({ statements: DOWNGRADE_POSTGRES, url });
    return offline;
  });
}

it.effect("an offline alert stored on Postgres before Login alerts is listed and cleared after it", () =>
  Effect.scoped(
    Effect.gen(function* upgradePostgres() {
      const url = yield* emptyPostgresDatabase;
      const offline = yield* storedBeforeLoginAlerts(url);
      const second = yield* opened(url);
      const listed = yield* second.storage.listAlerts(ada);
      const back = yield* second.storage.markBackOnline(triage, backAt);
      const login = yield* second.storage.recordLoginAlert(newLogin());
      yield* second.close;

      expect({ back, listed, login: login.id }).toStrictEqual({
        back: [{ ...offline, backOnlineAt: backAt }],
        listed: [offline],
        login: SECOND,
      });
    }),
  ),
);
