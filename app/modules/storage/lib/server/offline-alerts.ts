import { Array as Arr, Effect, Number as Num, Option, Order, Predicate } from "effect";
import type { NewLoginAlert, StoredInboxAlert, StoredLoginAlert } from "./inbox-alerts.ts";
import type { OfflineAlert, OfflineAlertId, OfflineReason } from "../../../presence/index.ts";
import type { Fails } from "./errors.ts";
import type { IdentityName } from "../../../identities/index.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { MemoryState } from "./memory-state.ts";
import type { TriggerFailure } from "../../../triggers/index.ts";
import { isOfflineAlertId } from "../../../presence/index.ts";

interface NewOfflineAlert {
  readonly agent: IdentityName;
  readonly owner: IdentityName;
  readonly offlineReason: OfflineReason;
  readonly raisedAt: IsoTime;
  readonly trigger?: TriggerFailure;
}

interface OfflineAlertsSection {
  readonly recordOfflineAlert: (alert: NewOfflineAlert) => Fails<OfflineAlert>;
  readonly recordLoginAlert: (alert: NewLoginAlert) => Fails<StoredLoginAlert>;
  readonly listAlerts: (owner: IdentityName) => Fails<readonly StoredInboxAlert[]>;
  readonly markAlertRead: (owner: IdentityName, id: OfflineAlertId) => Fails<StoredInboxAlert | null>;
  readonly markAlertsRead: (owner: IdentityName, upTo: OfflineAlertId) => Fails<readonly StoredInboxAlert[]>;
  readonly markBackOnline: (agent: IdentityName, at: IsoTime) => Fails<readonly OfflineAlert[]>;
  readonly markTriggerAlertsCleared: (agent: IdentityName, at: IsoTime) => Fails<readonly OfflineAlert[]>;
}

type StoredAlert = StoredInboxAlert & { readonly owner: IdentityName };

interface Change {
  readonly matches: (alert: StoredAlert) => boolean;
  readonly change: (alert: StoredAlert) => StoredAlert;
}

const STEP = 1;

const TRIGGER_FAILED: OfflineReason = "trigger failed";

type StoredOfflineAlert = OfflineAlert & { readonly owner: IdentityName };

function isOffline(alert: StoredAlert): alert is StoredOfflineAlert {
  return "agent" in alert;
}

function isWaiting(alert: StoredOfflineAlert, agent: IdentityName): boolean {
  return alert.agent === agent && Predicate.isUndefined(alert.backOnlineAt);
}

function backAt(agent: IdentityName, at: IsoTime, triggerFailed: boolean): Change {
  return {
    change: (alert) => ({ ...alert, backOnlineAt: at }),
    matches: (alert) =>
      isOffline(alert) && isWaiting(alert, agent) && (alert.offlineReason === TRIGGER_FAILED) === triggerFailed,
  };
}

const byId = Order.mapInput(Num.Order, (alert: StoredInboxAlert) => alert.id);

function sortedById<Alert extends StoredInboxAlert>(alerts: readonly Alert[]): readonly Alert[] {
  return Arr.sort(alerts, byId);
}

function withoutOwner({ owner: _owner, ...alert }: StoredAlert): StoredInboxAlert {
  return alert;
}

function isOfflineAlert(alert: StoredInboxAlert): alert is OfflineAlert {
  return "agent" in alert;
}

function offlineOnly(alerts: readonly StoredInboxAlert[]): readonly OfflineAlert[] {
  return Arr.filter(alerts, isOfflineAlert);
}

function involves(identity: IdentityName): (alert: StoredAlert) => boolean {
  return (alert) => alert.owner === identity || (isOffline(alert) && alert.agent === identity);
}

function alertIdOf(value: number): OfflineAlertId {
  return Option.getOrThrow(Option.liftPredicate(value, isOfflineAlertId));
}

function markedRead(alert: StoredAlert): StoredAlert {
  return { ...alert, read: true };
}

function changedIf({ change, matches }: Change): (alert: StoredAlert) => StoredAlert {
  return (alert) => {
    if (matches(alert)) {
      return change(alert);
    }
    return alert;
  };
}

type MemoryOfflineAlertsSection = OfflineAlertsSection & {
  readonly dropOfflineAlerts: (identity: IdentityName) => Effect.Effect<void>;
};

function memoryOfflineAlerts(state: MemoryState): MemoryOfflineAlertsSection {
  let alerts: readonly StoredAlert[] = [];
  let raised = 0;
  function changed(change: Change): readonly StoredInboxAlert[] {
    const changing = Arr.filter(alerts, change.matches);
    alerts = Arr.map(alerts, changedIf(change));
    return Arr.map(changing, (alert) => withoutOwner(change.change(alert)));
  }
  function open<Value>(work: () => Value): Fails<Value> {
    return Effect.andThen(state.ensureOpen, Effect.sync(work));
  }
  function nextId(): OfflineAlertId {
    raised += STEP;
    return alertIdOf(raised);
  }
  function kept<Alert extends StoredAlert>(stored: Alert): Omit<Alert, "owner"> {
    alerts = [...alerts, stored];
    const { owner: _owner, ...shown } = stored;
    return shown;
  }
  return {
    dropOfflineAlerts: (identity) =>
      Effect.sync(() => {
        alerts = Arr.filter(alerts, (alert) => !involves(identity)(alert));
      }),
    listAlerts: (owner) =>
      open(() =>
        Arr.map(
          Arr.filter(alerts, (alert) => alert.owner === owner),
          withoutOwner,
        ),
      ),
    markAlertRead: (owner, id) =>
      open(() =>
        Option.getOrNull(
          Arr.head(changed({ change: markedRead, matches: (alert) => alert.owner === owner && alert.id === id })),
        ),
      ),
    markAlertsRead: (owner, upTo) =>
      open(() =>
        changed({ change: markedRead, matches: (alert) => alert.owner === owner && alert.id <= upTo && !alert.read }),
      ),
    markBackOnline: (agent, at) => open(() => offlineOnly(changed(backAt(agent, at, false)))),
    markTriggerAlertsCleared: (agent, at) => open(() => offlineOnly(changed(backAt(agent, at, true)))),
    recordLoginAlert: (alert) => open(() => kept({ ...alert, id: nextId(), read: false })),
    recordOfflineAlert: (alert) => open(() => kept({ ...alert, id: nextId(), read: false })),
  };
}

const OFFLINE_ALERTS_MIGRATION = `CREATE TABLE offline_alerts (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     agent_name TEXT NOT NULL REFERENCES identities (name) ON DELETE CASCADE,
     owner_name TEXT NOT NULL REFERENCES identities (name) ON DELETE CASCADE,
     offline_reason TEXT NOT NULL,
     raised_at TEXT NOT NULL,
     read INTEGER NOT NULL CHECK (read IN (0, 1)),
     back_online_at TEXT
   ) STRICT;
   CREATE INDEX offline_alerts_by_owner ON offline_alerts (owner_name, id);`;

export {
  type OfflineAlertsSection,
  OFFLINE_ALERTS_MIGRATION,
  TRIGGER_FAILED,
  isOfflineAlert,
  memoryOfflineAlerts,
  offlineOnly,
  sortedById,
};
