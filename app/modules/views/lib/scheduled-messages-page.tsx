import { Page, Pane, PaneHeader } from "../../design-system/layout.tsx";
import type { ScheduleList, Scheduling } from "../../board/index.ts";
import type { Identity } from "../../sdk/index.ts";
import { QuietLink } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import { ScheduleListBody } from "./schedule-list-body.tsx";
import { ScheduleListEditing } from "./schedule-list-editing.tsx";
import type { SchedulesRoute } from "../../paths/index.ts";
import { hrefOf } from "../../paths/index.ts";
import { useLeftOnUnmount } from "./use-left-on-unmount.ts";
import { useSyncExternalStore } from "react";

const TEXT = {
  back: (channel: string) => `Back to #${channel}`,
  description: (channel: string) => `Messages that post into #${channel} on a schedule.`,
  title: (channel: string) => `Scheduled messages in #${channel}`,
} as const;

interface ScheduledMessagesPageProps {
  readonly me: Identity;
  readonly route: SchedulesRoute;
  readonly scheduleList: ScheduleList;
  readonly scheduling: Scheduling;
}

export function ScheduledMessagesPage(props: ScheduledMessagesPageProps): ReactNode {
  const { route, scheduleList } = props;
  const { channel } = route;
  const state = useSyncExternalStore(scheduleList.subscribe, scheduleList.snapshot);
  useLeftOnUnmount(scheduleList);
  return (
    <Pane>
      <PaneHeader description={TEXT.description(channel)} sans title={TEXT.title(channel)}>
        <QuietLink href={hrefOf({ channel, name: "channel" })}>{TEXT.back(channel)}</QuietLink>
      </PaneHeader>
      <Page label={TEXT.title(channel)}>
        <ScheduleListBody
          channel={channel}
          me={props.me}
          scheduleList={scheduleList}
          scheduling={props.scheduling}
          selected={route.selected}
          state={state}
        />
      </Page>
      <ScheduleListEditing channel={channel} scheduleList={scheduleList} scheduling={props.scheduling} />
    </Pane>
  );
}
