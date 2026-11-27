import type { ChannelName, MessageId } from "../../sdk/index.ts";
import { useCallback, useContext } from "react";
import { useReply, useThreadCalls } from "./use-board.ts";
import type { Draft } from "../../composer/index.ts";
import { LandingContext } from "../../landing/index.ts";
import type { Outgoing } from "../../board/index.ts";
import type { WebhookCommandCalls } from "./use-board.ts";
import { useWebhookCommandRun } from "./use-webhook-command-run.ts";

interface ReplyCommand {
  readonly channel: ChannelName;
  readonly draft: Draft;
  readonly form: string;
  readonly replied: (() => void) | null;
  readonly thread: MessageId;
}

interface ReplyHandlers {
  readonly calls: WebhookCommandCalls;
  readonly post: (outgoing: Outgoing, posted: () => void) => void;
  readonly saved: () => void;
}

function useReplyCommand(command: ReplyCommand): ReplyHandlers {
  const { channel, draft, form, thread } = command;
  const calls = useThreadCalls({ channel, id: thread });
  const reply = useReply({ place: { channel, id: thread }, replied: command.replied });
  const { watch } = useContext(LandingContext);
  const saved = useCallback(() => {
    watch(`form[aria-label="${form}"] textarea`);
    draft.clear();
  }, [draft, form, watch]);
  const runWebhookCommand = useWebhookCommandRun({ calls, draft, saved });
  const post = useCallback(
    (outgoing: Outgoing, posted: () => void) => {
      const run = draft.commandRun(outgoing.text);
      if (run === null || run.kind === "command") {
        reply(outgoing, posted);
        return;
      }
      runWebhookCommand(run);
    },
    [draft, reply, runWebhookCommand],
  );
  return { calls, post, saved };
}

export { useReplyCommand };
