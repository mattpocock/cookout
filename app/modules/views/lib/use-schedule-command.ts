import type { CommandRun, Draft } from "../../composer/index.ts";
import { MessageActions, MessageKeys } from "../../design-system/messages.tsx";
import type { Outgoing, Scheduling } from "../../board/index.ts";
import { useCallback, useContext, useEffect } from "react";
import type { ChannelName } from "../../sdk/index.ts";
import type { MenuChoice } from "../../design-system/messages.tsx";
import { useChannelCalls } from "./use-board.ts";
import { useFooterHandlers } from "./use-footer-handlers.ts";

const SCHEDULE = "Schedule…";

interface ScheduleCommand {
  readonly channel: ChannelName;
  readonly draft: Draft;
  readonly form: string;
  readonly scheduling: Scheduling;
  readonly shown: boolean;
}

interface Offered {
  readonly form: string;
  readonly shown: boolean;
  readonly onSchedule: () => void;
}

function formOf({ form, shown }: Offered): Element | null {
  if (!shown) {
    return null;
  }
  return document.querySelector(`main form[aria-label="${form}"]`);
}

function useScheduleKey(offered: Offered): void {
  const { offer, withdraw } = useContext(MessageActions);
  const { schedule } = useContext(MessageKeys);
  const { form, onSchedule, shown } = offered;
  useEffect(() => {
    const target = formOf({ form, onSchedule, shown });
    const choices: readonly MenuChoice[] = [
      { href: null, icon: "schedule", keys: schedule, label: SCHEDULE, onSelect: onSchedule },
    ];
    offer(target, choices);
    return (): void => {
      withdraw(target);
    };
  }, [form, offer, onSchedule, schedule, shown, withdraw]);
}

function scheduledText(draft: Draft): string {
  const { text } = draft.snapshot();
  const run = draft.commandRun(text);
  if (run === null) {
    return text;
  }
  if (run.kind === "command") {
    return run.text;
  }
  return text;
}

interface Handlers {
  readonly post: (outgoing: Outgoing, posted: () => void) => void;
  readonly saved: () => void;
}

type WebhookCommandRun = Exclude<CommandRun, { readonly kind: "command" }>;

interface InlineCalling {
  readonly channel: ChannelName;
  readonly draft: Draft;
  readonly saved: () => void;
}

function useWebhookCommandRun({ channel, draft, saved }: InlineCalling): (run: WebhookCommandRun) => void {
  const { call, editCallData } = useChannelCalls(channel);
  return useCallback(
    (run: WebhookCommandRun) => {
      const { name } = run.webhookCommand;
      function opened(): void {
        draft.openWebhookCommand(name);
      }
      if (run.kind === "form") {
        editCallData("");
        opened();
        return;
      }
      const data = JSON.stringify({ [run.field]: run.text });
      editCallData(data);
      call({ called: saved, data, refused: opened, webhookCommand: name });
    },
    [call, draft, editCallData, saved],
  );
}

export function useScheduleCommand(command: ScheduleCommand): Handlers {
  const { channel, draft, scheduling } = command;
  const { post, saved } = useFooterHandlers({ channel, draft, form: command.form });
  const runWebhookCommand = useWebhookCommandRun({ channel, draft, saved });
  const handleSchedule = useCallback(() => {
    scheduling.open(channel, scheduledText(draft));
  }, [channel, draft, scheduling]);
  useScheduleKey({ form: command.form, onSchedule: handleSchedule, shown: command.shown });
  const handlePost = useCallback(
    (outgoing: Outgoing, posted: () => void) => {
      const run = draft.commandRun(outgoing.text);
      if (run === null) {
        post(outgoing, posted);
      } else if (run.kind === "command") {
        scheduling.open(channel, run.text);
      } else {
        runWebhookCommand(run);
      }
    },
    [channel, draft, post, runWebhookCommand, scheduling],
  );
  return { post: handlePost, saved };
}
