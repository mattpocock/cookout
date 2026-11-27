import { MarkdownText } from "./markdown-text.tsx";
import type { ReactNode } from "react";
import type { ScheduledMessage } from "../../scheduled-messages/index.ts";
import { mentionsIn } from "./schedule-facts.ts";
import { useMemo } from "react";

interface ScheduleTextProps {
  readonly me: string;
  readonly schedule: ScheduledMessage;
}

export function ScheduleText(props: ScheduleTextProps): ReactNode {
  const { text } = props.schedule;
  const message = useMemo(() => ({ mentions: mentionsIn(text), text }), [text]);
  return (
    <div className="message-text line-clamp-2 text-sm break-words" title={text}>
      <MarkdownText me={props.me} message={message} />
    </div>
  );
}
