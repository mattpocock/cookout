import { Array as Arr } from "effect";
import { LEGACY_KEY_NAME } from "./agent-keys.ts";

type PublicIdOf = (column: string) => string;

function legacyKeys(isLive: string, publicIdOf: PublicIdOf): readonly string[] {
  return [
    `INSERT INTO agent_keys (hash, identity_name, name, last_used_at, expires_at)
     SELECT t.token_hash, t.identity_name, '${LEGACY_KEY_NAME}', NULL, NULL
     FROM tokens AS t JOIN identities AS i ON i.name = t.identity_name
     WHERE i.kind = 'agent' AND ${isLive}`,
    `INSERT INTO credential_lineage (hash, public_id, kind, identity_name, parent_hash, made_at, where_from)
     SELECT k.hash, ${publicIdOf("k.hash")}, 'agent key', k.identity_name, NULL, i.created_at, NULL
     FROM agent_keys AS k JOIN identities AS i ON i.name = k.identity_name`,
  ];
}

const SQLITE_STATEMENTS: readonly string[] = [
  `CREATE TABLE agent_keys (
     hash TEXT PRIMARY KEY,
     identity_name TEXT NOT NULL,
     name TEXT NOT NULL,
     last_used_at TEXT,
     expires_at TEXT
   ) STRICT`,
  "CREATE INDEX agent_keys_by_identity ON agent_keys (identity_name)",
  ...legacyKeys("t.revoked = 0", () => "lower(hex(randomblob(8)))"),
];

const AGENT_KEYS_MIGRATION = Arr.join(
  Arr.map(SQLITE_STATEMENTS, (statement) => `${statement};`),
  "\n",
);

const POSTGRES_AGENT_KEYS_MIGRATION: readonly string[] = [
  `CREATE TABLE agent_keys (
     hash text COLLATE "C" PRIMARY KEY,
     identity_name text COLLATE "C" NOT NULL,
     name text COLLATE "C" NOT NULL,
     last_used_at text COLLATE "C",
     expires_at text COLLATE "C"
   )`,
  "CREATE INDEX agent_keys_by_identity ON agent_keys (identity_name)",
  ...legacyKeys("NOT t.revoked", (column) => `substr(md5(random()::text || ${column}), 1, 16)`),
];

export { AGENT_KEYS_MIGRATION, POSTGRES_AGENT_KEYS_MIGRATION };
