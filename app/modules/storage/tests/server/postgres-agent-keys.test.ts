import { Array as Arr, Effect, String as Str } from "effect";
import {
  emptyPostgresDatabase,
  identityFixture,
  isoTime,
  onPostgresDatabase,
  openStore,
  testSecretsCipher,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { postgresStorage } from "../../server.ts";
import { tokenHash } from "../../../identities/index.ts";

const HASH_LENGTH = 64;
const [adaToken, triageToken] = [tokenHash(Str.repeat(HASH_LENGTH)("a")), tokenHash(Str.repeat(HASH_LENGTH)("c"))];
const ada = identityFixture("ada", { kind: "human" });
const triage = identityFixture("triage", { kind: "agent", owner: "ada" });
const BEFORE_AGENT_KEYS = [
  "ALTER TABLE offline_alerts DROP COLUMN acted_on_agent",
  "ALTER TABLE identities DROP COLUMN feeder",
  "DROP TABLE agent_keys",
  "UPDATE schema_version SET version = version - 3",
];
const PUBLIC_ID = /^[0-9a-f]{16}$/u;

it.effect(
  "an agent's live Identity token stored on Postgres before agent keys is its key named legacy, and a person's token is untouched",
  () =>
    Effect.scoped(
      Effect.gen(function* upgradeAgentKeys() {
        const url = yield* emptyPostgresDatabase;
        const first = yield* openStore(postgresStorage({ cipher: testSecretsCipher, url }));
        yield* first.storage.createIdentity(ada, adaToken);
        yield* first.storage.createIdentity(triage, triageToken);
        yield* first.close;
        yield* onPostgresDatabase({ statements: BEFORE_AGENT_KEYS, url });
        const second = yield* openStore(postgresStorage({ cipher: testSecretsCipher, url }));
        const seen = yield* Effect.all(
          {
            listed: Effect.map(
              second.storage.listAgentKeys(triage.name),
              Arr.map(({ id, madeAt, name }) => ({ id: PUBLIC_ID.test(id), madeAt, name })),
            ),
            lookups: Effect.forEach(
              [triageToken, adaToken],
              (hash) => Effect.map(second.storage.findIdentityByTokenHash(hash), ({ status }) => status),
              { concurrency: 1 },
            ),
            theirs: second.storage.listAgentKeys(ada.name),
            used: second.storage.useAgentKey({ hash: triageToken, now: isoTime("2999-01-01T00:00:00.000Z") }),
          },
          { concurrency: 1 },
        );
        yield* second.close;

        expect(seen).toStrictEqual({
          listed: [{ id: true, madeAt: triage.createdAt, name: "legacy" }],
          lookups: ["active", "active"],
          theirs: [],
          used: "used",
        });
      }),
    ),
);
