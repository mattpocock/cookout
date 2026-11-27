import type { ChannelName, MessageId } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { ScheduleConfirmation } from "./schedule-confirmation.tsx";
import { ScheduleDialog } from "./schedule-dialog.tsx";
import { useScheduling } from "./scheduling-context.ts";

interface ReplyScheduleProps {
  readonly channel: ChannelName;
  readonly form: string;
  readonly thread: MessageId;
  readonly onSaved: () => void;
}

export function ReplySchedule(props: ReplyScheduleProps): ReactNode {
  const { channel, thread } = props;
  const scheduling = useScheduling();
  return (
    <>
      <ScheduleConfirmation channel={channel} scheduling={scheduling} thread={thread} />
      <ScheduleDialog
        cancelled={`form[aria-label="${props.form}"] textarea`}
        channel={channel}
        onSaved={props.onSaved}
        scheduling={scheduling}
        thread={thread}
      />
    </>
  );
}
