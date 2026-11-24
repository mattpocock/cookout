import type { Unread, UnreadState } from "../../unread/index.ts";
import type { InboxRows } from "./use-inbox-rows.ts";
import type { MarkAllReadProps } from "./mark-all-read.tsx";
import { besideCountOf } from "./beside-count.ts";

const NONE = 0;

type LoadedState = Extract<UnreadState, { readonly status: "loaded" }>;

interface MarkAllPlaces {
  readonly besides: number;
  readonly held: number;
  readonly alerts: MarkAllReadProps | null;
  readonly forYou: MarkAllReadProps | null;
  readonly activity: MarkAllReadProps | null;
}

interface MarkAllWhere {
  readonly rows: InboxRows;
  readonly state: LoadedState;
  readonly store: Unread;
}

function markAllPlaces(where: MarkAllWhere): MarkAllPlaces {
  const { state } = where;
  const markAll = { state, unread: where.store };
  const held = state.heldDeactivatedQuietAgents.length;
  const besides = besideCountOf(state) - state.alerts.length;
  const none = { activity: null, alerts: null, besides, forYou: null, held };
  if (state.alerts.length > NONE) {
    return { ...none, alerts: markAll };
  }
  if (where.rows.rows.some((row) => row.forYou) || besides + held > NONE) {
    return { ...none, forYou: markAll };
  }
  return { ...none, activity: markAll };
}

export { markAllPlaces };
