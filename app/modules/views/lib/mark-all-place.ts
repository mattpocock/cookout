import type { Unread, UnreadState } from "../../unread/index.ts";
import type { InboxRows } from "./use-inbox-rows.ts";
import type { MarkAllReadProps } from "./mark-all-read.tsx";

const NONE = 0;

type LoadedState = Extract<UnreadState, { readonly status: "loaded" }>;

interface MarkAllPlaces {
  readonly besides: number;
  readonly held: number;
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
  const besides = state.nudges.length + state.deactivationOffers.length + state.deactivatedQuietAgents.length;
  if (where.rows.rows.some((row) => row.forYou) || besides + held > NONE) {
    return { activity: null, besides, forYou: markAll, held };
  }
  return { activity: markAll, besides, forYou: null, held };
}

export { markAllPlaces };
