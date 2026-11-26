import type { ChannelMessagesState, Scheduling } from "../../board/index.ts";
import type { ComponentProps, ReactNode } from "react";
import { useCallback, useSyncExternalStore } from "react";
import type { ChannelName } from "../../sdk/index.ts";
import type { Draft } from "../../composer/index.ts";
import { MessageBox } from "./message-box.tsx";
import { ScheduleConfirmation } from "./schedule-confirmation.tsx";
import { ScheduleDialog } from "./schedule-dialog.tsx";
import { WebhookCommandPrompt } from "./webhook-command-prompt.tsx";
import { WebhookCommandsRefusal } from "./webhook-commands-refusal.tsx";
import { useFooterHandlers } from "./use-footer-handlers.ts";

const MESSAGE_BOX = {
  field: "Message",
  form: "Post to the channel",
  posts: "message",
} as const;

const POST_LATER = `main form[aria-label="${MESSAGE_BOX.form}"] button[aria-label="Post later"]`;

interface MessageFooterProps {
  readonly channel: ChannelName;
  readonly scheduling: Scheduling;
  readonly draft: Draft;
  readonly keymap: ComponentProps<typeof WebhookCommandPrompt>["keymap"];
  readonly state: ChannelMessagesState;
}

export function MessageFooter(props: MessageFooterProps): ReactNode {
  const { channel, draft, scheduling, state } = props;
  const handlers = useFooterHandlers({ channel, draft, form: MESSAGE_BOX.form });
  const handlePost = handlers.post;
  const { webhookCommand: command, returned } = useSyncExternalStore(draft.subscribe, draft.snapshot);
  const handleBack = draft.unpickWebhookCommand;
  const handleSaved = handlers.saved;
  const handleSchedule = useCallback(() => {
    scheduling.open(channel, draft.snapshot().text);
  }, [channel, draft, scheduling]);
  if (state.status !== "loaded") {
    return null;
  }
  return (
    <>
      {command === null && (
        <MessageBox
          draft={draft}
          focused={returned}
          onPost={handlePost}
          onSchedule={handleSchedule}
          post={state.post}
          text={MESSAGE_BOX}
        />
      )}
      {command !== null && (
        <WebhookCommandPrompt
          call={state.call}
          callData={state.callData}
          channel={channel}
          webhookCommand={command}
          keymap={props.keymap}
          onBack={handleBack}
          onDone={handleSaved}
        />
      )}
      <WebhookCommandsRefusal />
      <ScheduleConfirmation channel={channel} scheduling={scheduling} />
      <ScheduleDialog cancelled={POST_LATER} channel={channel} onSaved={handleSaved} scheduling={scheduling} />
    </>
  );
}
