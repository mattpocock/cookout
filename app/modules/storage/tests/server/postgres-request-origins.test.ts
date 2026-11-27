import {
  emptyPostgresDatabase,
  identityFixture,
  isoTime,
  onPostgresDatabase,
  openStore,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { postgresStorage } from "../../server.ts";
import { tokenHash } from "../../../identities/index.ts";

const ada = identityFixture("ada", { kind: "human" });
const triage = identityFixture("triage-agent", { kind: "agent", owner: "ada" });
const created = isoTime("2026-01-01T00:00:00.000Z");
const expiresAt = isoTime("2999-01-01T00:00:00.000Z");
const BEFORE_REQUEST_ORIGINS = [
  "ALTER TABLE login_requests DROP COLUMN client_ip, DROP COLUMN user_agent",
  "ALTER TABLE agent_join_requests DROP COLUMN client_ip, DROP COLUMN user_agent",
  "UPDATE schema_version SET version = version - 1",
];

const login = { createdAt: created, expiresAt, host: "ada-laptop", userCode: "WDJB-MJHT" };
const join = { agent: triage.name, createdAt: created, expiresAt, host: "build-box", userCode: "JOIN-CODE" };

const requestsStoredBeforeOrigins = Effect.gen(function* storeRequestsBeforeOrigins() {
  const url = yield* emptyPostgresDatabase;
  const { close, storage } = yield* url.pipe(postgresStorage, openStore);
  yield* storage.createIdentity(ada, tokenHash("hash:ada"));
  yield* storage.createIdentity(triage, tokenHash("hash:triage"));
  yield* storage.addLoginRequest({ ...login, requestHash: tokenHash("hash:login") }, created);
  yield* storage.addAgentJoinRequest({ ...join, requestHash: tokenHash("hash:join") }, created);
  yield* close;
  yield* onPostgresDatabase({ statements: BEFORE_REQUEST_ORIGINS, url });
  return url;
});

it.live("a Login request and an agent join request stored before request origins are found after the upgrade", () =>
  Effect.scoped(
    Effect.gen(function* upgradeRequests() {
      const url = yield* requestsStoredBeforeOrigins;
      const { close, storage } = yield* url.pipe(postgresStorage, openStore);
      const now = isoTime("2026-01-01T00:05:00.000Z");
      const found = [
        yield* storage.findLoginRequest("WDJB-MJHT", now),
        yield* storage.findAgentJoinRequest("JOIN-CODE", now),
      ];
      yield* close;

      expect(found).toStrictEqual([
        { approved: false, createdAt: created, expiresAt, host: "ada-laptop", userCode: "WDJB-MJHT" },
        {
          agent: "triage-agent",
          approved: false,
          createdAt: created,
          expiresAt,
          host: "build-box",
          userCode: "JOIN-CODE",
        },
      ]);
    }),
  ),
);
