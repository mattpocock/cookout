import { Alert, BoxFrame, Form, SendButton, Suggestions, TextArea } from "../../design-system/index.tsx";
import { useId, useSyncExternalStore } from "react";
import type { Draft } from "../../composer/index.ts";
import type { PostState } from "../../board/index.ts";
import type { ReactNode } from "react";
import { ScheduleChoice } from "./schedule-choice.tsx";
import { useSend } from "./use-send.ts";
import { useSuggestions } from "./use-suggestions.ts";

interface MessageBoxText {
  readonly field: string;
  readonly form: string;
  readonly posts: string;
}

const SEND = { posting: "Sending…", ready: "Send" } as const;
const HINT = "Write a message, @ to mention";
const NONE = 0;

interface MessageBoxProps {
  readonly draft: Draft;
  readonly post: PostState;
  readonly onPost: (text: string, posted: () => void) => void;
  readonly onSchedule: (() => void) | null;
  readonly text: MessageBoxText;
  readonly focused: boolean;
}

function sendLabelOf(posting: boolean): string {
  if (posting) {
    return SEND.posting;
  }
  return SEND.ready;
}

export function MessageBox(props: MessageBoxProps): ReactNode {
  const { draft, onPost, post, text } = props;
  const { chooseHighlighted: handlePick, dismiss: handleClose, edit: handleEdit, highlight: handleMove } = draft;
  const written = useSyncExternalStore(draft.subscribe, draft.snapshot);
  const posting = post.status === "posting";
  const handleSend = useSend({ draft, onPost });
  const shown = useSuggestions({ commands: written.commands, draft, suggestions: written.suggestions });
  const choosing = shown.options.length > NONE;
  const handleChoose = shown.onChoose;
  const list = useId();
  return (
    <BoxFrame>
      <Form field="text" label={text.form} onSubmit={handleSend}>
        <TextArea
          caret={written.caret}
          choosing={choosing}
          focusRequests={written.focusRequests}
          focused={props.focused}
          highlighted={written.highlighted}
          label={text.field}
          list={list}
          name="text"
          onClose={handleClose}
          onEdit={handleEdit}
          onMove={handleMove}
          onPick={handlePick}
          placeholder={HINT}
          value={written.text}
        />
        {choosing && (
          <Suggestions
            highlighted={written.highlighted}
            label={shown.label}
            list={list}
            onChoose={handleChoose}
            options={shown.options}
          />
        )}
        {props.onSchedule !== null && <ScheduleChoice onSchedule={props.onSchedule} />}
        <SendButton disabled={posting || written.text.trim() === ""} label={sendLabelOf(posting)} />
      </Form>
      {post.status === "failed" && <Alert>{`Couldn't post the ${text.posts} (${post.code}): ${post.message}`}</Alert>}
    </BoxFrame>
  );
}
