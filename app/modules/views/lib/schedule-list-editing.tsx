import type { ScheduleList, Scheduling } from "../../board/index.ts";
import { useCallback, useSyncExternalStore } from "react";
import type { ChannelName } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { ScheduleDeleteConfirm } from "./schedule-delete-confirm.tsx";
import { ScheduleDialog } from "./schedule-dialog.tsx";
import { useEditScheduling } from "./use-edit-scheduling.ts";

interface ScheduleListEditingProps {
  readonly channel: ChannelName;
  readonly scheduleList: ScheduleList;
  readonly scheduling: Scheduling;
}

export function ScheduleListEditing(props: ScheduleListEditingProps): ReactNode {
  const { scheduleList, scheduling } = props;
  const state = useSyncExternalStore(scheduleList.subscribe, scheduleList.snapshot);
  const { editing } = useSyncExternalStore(scheduling.subscribe, scheduling.snapshot);
  const handleSaved = useCallback(() => {
    scheduleList.returnToEdit(editing);
  }, [editing, scheduleList]);
  const editScheduling = useEditScheduling({ editing, scheduleList, scheduling });
  return (
    <>
      <ScheduleDialog
        cancelled={null}
        channel={props.channel}
        editing
        onSaved={handleSaved}
        scheduling={editScheduling}
        thread={null}
      />
      {state.deleting !== null && (
        <ScheduleDeleteConfirm deleting={state.deleting} scheduleList={scheduleList} state={state} />
      )}
    </>
  );
}
