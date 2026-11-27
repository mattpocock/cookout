import { Array as Arr, Effect, Option, Predicate, Schema } from "effect";
import { FALSE, TRUE, isFalse } from "./adapters/sql-database.ts";
import {
  IdentityNameColumn,
  LOGIN_COLUMNS,
  LoginColumns,
  loginAlertOf,
  loginColumnValues,
} from "./login-alert-rows.ts";
import type { SqlDatabase, SqlValue } from "./adapters/sql-database.ts";
import type { StoredInboxAlert, StoredLoginAlert } from "./inbox-alerts.ts";
import { TRIGGER_FAILED, isOfflineAlert, offlineOnly, sortedById } from "./offline-alerts.ts";
import { isOfflineAlertId, offlineReasons } from "../../../presence/index.ts";
import type { Fails } from "./errors.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import type { OfflineAlert } from "../../../presence/index.ts";
import type { OfflineAlertsSection } from "./offline-alerts.ts";
import { isMessageId } from "../../../messages/index.ts";
import { unreadable } from "./errors.ts";

type TriggerFailure = NonNullable<OfflineAlert["trigger"]>;

const UNREAD = 0;
const READ = 1;

const MessageIdColumn = Schema.Int.pipe(Schema.refine(isMessageId));

const AlertIdColumn = Schema.Int.pipe(Schema.refine(isOfflineAlertId));

const AlertRow = Schema.Struct({
  ...LoginColumns,
  agent_name: Schema.NullOr(IdentityNameColumn),
  back_online_at: Schema.NullOr(IsoTimeSchema),
  id: AlertIdColumn,
  offline_reason: Schema.NullOr(Schema.Literals(offlineReasons)),
  raised_at: IsoTimeSchema,
  read: Schema.Literals([UNREAD, READ]),
  trigger_error: Schema.NullOr(Schema.String),
  trigger_message: Schema.NullOr(MessageIdColumn),
  trigger_status: Schema.NullOr(Schema.Int),
});

type Row = typeof AlertRow.Type;

function failureOf({ trigger_error: error, trigger_status: status }: Row): Omit<TriggerFailure, "message"> {
  const answered = Option.match(Option.fromNullOr(status), {
    onNone: () => ({}),
    onSome: (code) => ({ status: code }),
  });
  if (Predicate.isNotNull(error)) {
    return { error, ...answered };
  }
  return answered;
}

function triggerOf(row: Row): Pick<OfflineAlert, "trigger"> {
  const message = row.trigger_message;
  if (Predicate.isNull(message)) {
    return {};
  }
  return { trigger: { message, ...failureOf(row) } };
}

function backOnlineOf(row: Row): Pick<OfflineAlert, "backOnlineAt"> {
  if (Predicate.isNull(row.back_online_at)) {
    return {};
  }
  return { backOnlineAt: row.back_online_at };
}

function offlineAlertOf(row: Row, fields: Pick<OfflineAlert, "id" | "raisedAt" | "read">): Option.Option<OfflineAlert> {
  return Option.all({
    agent: Option.fromNullOr(row.agent_name),
    offlineReason: Option.fromNullOr(row.offline_reason),
  }).pipe(Option.map((offline) => ({ ...offline, ...fields, ...triggerOf(row), ...backOnlineOf(row) })));
}

function alertOf(row: Row): Option.Option<StoredInboxAlert> {
  const fields = { id: row.id, raisedAt: row.raised_at, read: row.read === READ };
  if (Predicate.isNull(row.login_kind)) {
    return offlineAlertOf(row, fields);
  }
  return loginAlertOf({ fields, row });
}

function eachAlertOf(rows: readonly Row[]): Fails<readonly StoredInboxAlert[]> {
  const each = Option.all(Arr.map(rows, alertOf));
  return Effect.mapError(Effect.fromOption(each), unreadable);
}

function alertsOf(rows: readonly unknown[]): Fails<readonly StoredInboxAlert[]> {
  return Schema.decodeUnknownEffect(Schema.Array(AlertRow))(rows).pipe(
    Effect.mapError(unreadable),
    Effect.flatMap(eachAlertOf),
  );
}

function firstOf<Alert extends StoredInboxAlert>(
  isKind: (alert: StoredInboxAlert) => alert is Alert,
): (alerts: readonly StoredInboxAlert[]) => Fails<Alert> {
  return (alerts) => {
    const first = Option.filter(Arr.head(alerts), isKind);
    return Effect.mapError(Effect.fromOption(first), unreadable);
  };
}

function isStoredLoginAlert(alert: StoredInboxAlert): alert is StoredLoginAlert {
  return "login" in alert;
}

const COLUMNS = `id, agent_name, offline_reason, raised_at, read, back_online_at, trigger_message, trigger_status,
  trigger_error, ${LOGIN_COLUMNS}`;

type TriggerColumns = readonly [SqlValue, SqlValue, SqlValue];

const NO_TRIGGER: TriggerColumns = [null, null, null];

function triggerColumns(trigger: TriggerFailure | undefined): TriggerColumns {
  return Option.match(Option.fromUndefinedOr(trigger), {
    onNone: () => NO_TRIGGER,
    onSome: ({ error = null, message, status = null }) => [message, status, error],
  });
}

function markedBack(db: SqlDatabase, reasonTest: string) {
  return (agent: OfflineAlert["agent"], at: OfflineAlert["raisedAt"]): Fails<readonly OfflineAlert[]> =>
    Effect.flatMap(
      db.all(
        `UPDATE offline_alerts SET back_online_at = ? WHERE agent_name = ? AND back_online_at IS NULL
         AND offline_reason ${reasonTest} ? RETURNING ${COLUMNS}`,
        at,
        agent,
        TRIGGER_FAILED,
      ),
      alertsOf,
    ).pipe(Effect.map((alerts) => sortedById(offlineOnly(alerts))));
}

function recordedOffline(db: SqlDatabase): OfflineAlertsSection["recordOfflineAlert"] {
  return ({ agent, offlineReason, owner, raisedAt, trigger }) =>
    Effect.flatMap(
      db.all(
        `INSERT INTO offline_alerts
           (agent_name, owner_name, offline_reason, raised_at, read, trigger_message, trigger_status, trigger_error)
         VALUES (?, ?, ?, ?, ${FALSE[db.dialect]}, ?, ?, ?) RETURNING ${COLUMNS}`,
        agent,
        owner,
        offlineReason,
        raisedAt,
        ...triggerColumns(trigger),
      ),
      alertsOf,
    ).pipe(Effect.flatMap(firstOf(isOfflineAlert)));
}

function sqlOfflineAlerts(db: SqlDatabase): OfflineAlertsSection {
  return {
    listAlerts: (owner) =>
      Effect.flatMap(db.all(`SELECT ${COLUMNS} FROM offline_alerts WHERE owner_name = ? ORDER BY id`, owner), alertsOf),
    markAlertRead: (owner, id) =>
      Effect.flatMap(
        db.all(
          `UPDATE offline_alerts SET read = ${TRUE[db.dialect]} WHERE owner_name = ? AND id = ? RETURNING ${COLUMNS}`,
          owner,
          id,
        ),
        alertsOf,
      ).pipe(Effect.map((alerts) => Option.getOrNull(Arr.head(alerts)))),
    markAlertsRead: (owner, upTo) =>
      Effect.flatMap(
        db.all(
          `UPDATE offline_alerts SET read = ${TRUE[db.dialect]} WHERE owner_name = ? AND id <= ? AND ${isFalse[db.dialect]("read")} RETURNING ${COLUMNS}`,
          owner,
          upTo,
        ),
        alertsOf,
      ).pipe(Effect.map(sortedById)),
    markBackOnline: markedBack(db, "<>"),
    markTriggerAlertsCleared: markedBack(db, "="),
    recordLoginAlert: ({ login, owner, raisedAt }) =>
      Effect.flatMap(
        db.all(
          `INSERT INTO offline_alerts (owner_name, raised_at, read, ${LOGIN_COLUMNS})
           VALUES (?, ?, ${FALSE[db.dialect]}, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING ${COLUMNS}`,
          owner,
          raisedAt,
          ...loginColumnValues(login),
        ),
        alertsOf,
      ).pipe(Effect.flatMap(firstOf(isStoredLoginAlert))),
    recordOfflineAlert: recordedOffline(db),
  };
}

export { sqlOfflineAlerts };
