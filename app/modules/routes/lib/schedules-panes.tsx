import type { ReactNode } from "react";
import { ScheduledMessagesPage } from "../../views/index.tsx";
import type { SchedulesRoute } from "../../paths/index.ts";
import type { Stores } from "./stores.ts";
import { useSyncExternalStore } from "react";

interface SchedulesPanesProps {
  readonly route: SchedulesRoute;
  readonly stores: Stores;
}

export function SchedulesPanes(props: SchedulesPanesProps): ReactNode {
  const { route, stores } = props;
  const state = useSyncExternalStore(stores.session.subscribe, stores.session.snapshot);
  if (state.status !== "logged-in") {
    return null;
  }
  return (
    <ScheduledMessagesPage
      key={route.channel}
      me={state.identity}
      route={route}
      scheduleList={stores.scheduleList}
      scheduling={stores.scheduling}
    />
  );
}
