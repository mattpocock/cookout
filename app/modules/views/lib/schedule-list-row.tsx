import { Alert, CurrentItemRow, Muted } from "../../design-system/content.tsx";
import type { ScheduleList, ScheduleListState, Scheduling } from "../../board/index.ts";
import { detailWords, headingWords, mayChange } from "./schedule-facts.ts";
import type { Identity } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { ScheduleControls } from "./schedule-controls.tsx";
import { ScheduleText } from "./schedule-text.tsx";
import type { ScheduledMessage } from "../../scheduled-messages/index.ts";
import { failureOf } from "./schedule-failure.ts";

interface ScheduleListRowProps {
  readonly me: Identity;
  readonly schedule: ScheduledMessage;
  readonly scheduleList: ScheduleList;
  readonly scheduling: Scheduling;
  readonly state: ScheduleListState;
}

export function ScheduleListRow(props: ScheduleListRowProps): ReactNode {
  const { schedule, state } = props;
  const failure = failureOf({ schedule, state });
  return (
    <CurrentItemRow current={state.selected === schedule.id}>
      <div className="flex min-h-7 items-center justify-between gap-2">
        <p className="text-sm font-medium">{headingWords(schedule)}</p>
        {mayChange({ me: props.me, schedule }) && (
          <ScheduleControls
            schedule={schedule}
            scheduleList={props.scheduleList}
            scheduling={props.scheduling}
            state={state}
          />
        )}
      </div>
      <ScheduleText me={props.me.name} schedule={schedule} />
      <Muted>{detailWords(schedule)}</Muted>
      {failure !== null && <Alert>{failure}</Alert>}
    </CurrentItemRow>
  );
}
