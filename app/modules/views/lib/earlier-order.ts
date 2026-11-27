import type { AlertsState, InboxRow } from "../../unread/index.ts";
import type { InboxAlert } from "../../sdk/index.ts";
import { millisOf } from "../../format/index.ts";

type EarlierEntry =
  | { readonly kind: "alert"; readonly key: string; readonly alert: InboxAlert }
  | { readonly kind: "row"; readonly key: string; readonly row: InboxRow };

interface EarlierLists {
  readonly alerts: readonly InboxAlert[];
  readonly rows: readonly InboxRow[];
}

function readAlertsOf(state: AlertsState): readonly InboxAlert[] {
  if (state.status !== "loaded") {
    return [];
  }
  return state.alerts.filter(({ read }) => read);
}

function timeOf(entry: EarlierEntry): string {
  if (entry.kind === "alert") {
    return entry.alert.raisedAt;
  }
  return entry.row.latest.message.createdAt;
}

function newestFirst(first: EarlierEntry, second: EarlierEntry): number {
  return millisOf(timeOf(second)) - millisOf(timeOf(first));
}

function earlierEntries({ alerts, rows }: EarlierLists): readonly EarlierEntry[] {
  const entries: EarlierEntry[] = [
    ...rows.map((row): EarlierEntry => ({ key: row.key, kind: "row", row })),
    ...alerts.map((alert): EarlierEntry => ({ alert, key: `alert ${String(alert.id)}`, kind: "alert" })),
  ];
  return entries.toSorted(newestFirst);
}

export { type EarlierEntry, earlierEntries, readAlertsOf };
