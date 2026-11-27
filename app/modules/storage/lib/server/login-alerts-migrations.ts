import { Array as Arr } from "effect";

const ALERT_COLUMNS =
  "id, agent_name, owner_name, offline_reason, raised_at, read, back_online_at, trigger_message, trigger_status, trigger_error";

const LOGIN_COLUMNS: readonly (readonly [string, string])[] = [
  ["login_kind", "CHECK (login_kind IN ('new session', 'admin act'))"],
  ["credential_id", ""],
  ["session_kind", "CHECK (session_kind IN ('web', 'cli'))"],
  ["where_from", ""],
  ["client_ip", ""],
  ["admin_name", ""],
  ["admin_act", ""],
];

const LOGIN_COLUMN_LINES = Arr.join(
  Arr.map(LOGIN_COLUMNS, ([name, check]) => `     ${name} TEXT ${check},`),
  "\n",
);

const LOGIN_ALERTS_MIGRATION = `CREATE TABLE offline_alerts_rebuilt (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     agent_name TEXT REFERENCES identities (name) ON DELETE CASCADE,
     owner_name TEXT NOT NULL REFERENCES identities (name) ON DELETE CASCADE,
     offline_reason TEXT,
     raised_at TEXT NOT NULL,
     read INTEGER NOT NULL CHECK (read IN (0, 1)),
     back_online_at TEXT,
     trigger_message INTEGER,
     trigger_status INTEGER,
     trigger_error TEXT,
${LOGIN_COLUMN_LINES}
     CHECK ((agent_name IS NULL) = (login_kind IS NOT NULL))
   ) STRICT;
   INSERT INTO offline_alerts_rebuilt (${ALERT_COLUMNS}) SELECT ${ALERT_COLUMNS} FROM offline_alerts;
   DELETE FROM sqlite_sequence WHERE name = 'offline_alerts_rebuilt';
   INSERT INTO sqlite_sequence (name, seq) SELECT 'offline_alerts_rebuilt', seq FROM sqlite_sequence
     WHERE name = 'offline_alerts';
   DROP TABLE offline_alerts;
   ALTER TABLE offline_alerts_rebuilt RENAME TO offline_alerts;
   CREATE INDEX offline_alerts_by_owner ON offline_alerts (owner_name, id);`;

const POSTGRES_LOGIN_ALERTS_MIGRATION: readonly string[] = [
  "ALTER TABLE offline_alerts ALTER COLUMN agent_name DROP NOT NULL",
  "ALTER TABLE offline_alerts ALTER COLUMN offline_reason DROP NOT NULL",
  ...Arr.map(
    LOGIN_COLUMNS,
    ([name, check]) => `ALTER TABLE offline_alerts ADD COLUMN ${name} text COLLATE "C" ${check}`,
  ),
  `ALTER TABLE offline_alerts ADD CONSTRAINT offline_alerts_one_kind
     CHECK ((agent_name IS NULL) = (login_kind IS NOT NULL))`,
];

export { LOGIN_ALERTS_MIGRATION, POSTGRES_LOGIN_ALERTS_MIGRATION };
