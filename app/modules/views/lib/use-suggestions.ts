import { useCallback, useMemo } from "react";
import type { Draft } from "../../composer/index.ts";
import type { Identity } from "../../sdk/index.ts";
import type { MentionOption } from "./mention-option.ts";
import type { Presences } from "../../board/index.ts";
import type { WebhookCommand } from "../../webhook-commands/index.ts";
import { mentionOptionOf } from "./mention-option.ts";
import { usePresences } from "./use-presence.ts";

const NONE = 0;
const SIGN = 1;
const MENTIONS = "Mention suggestions";
const WEBHOOK_COMMANDS = "Command suggestions";

interface SuggestionsOf {
  readonly draft: Draft;
  readonly suggestions: readonly Identity[];
  readonly webhookCommands: readonly WebhookCommand[];
}

interface Shown {
  readonly label: string;
  readonly options: readonly MentionOption[];
  readonly onChoose: (option: string) => void;
}

interface Handlers {
  readonly mention: (option: string) => void;
  readonly webhookCommand: (option: string) => void;
}

function shownFor(
  { webhookCommands: commands, suggestions }: SuggestionsOf,
  handlers: Handlers,
  presences: Presences,
): Shown {
  if (commands.length > NONE) {
    const options = commands.map((command) => ({
      detail: command.description ?? null,
      identity: null,
      option: `/${command.name}`,
      presence: null,
      spoken: `/${command.name}`,
    }));
    return { label: WEBHOOK_COMMANDS, onChoose: handlers.webhookCommand, options };
  }
  const options = suggestions.map((identity) => mentionOptionOf({ identity, presences }));
  return { label: MENTIONS, onChoose: handlers.mention, options };
}

function useSuggestions(of: SuggestionsOf): Shown {
  const { webhookCommands: commands, draft, suggestions } = of;
  const mention = useCallback(
    (option: string) => {
      draft.choose(option.slice(SIGN));
    },
    [draft],
  );
  const command = useCallback(
    (option: string) => {
      draft.pickWebhookCommand(option.slice(SIGN));
    },
    [draft],
  );
  const presences = usePresences();
  return useMemo(
    () => shownFor({ draft, suggestions, webhookCommands: commands }, { mention, webhookCommand: command }, presences),
    [command, commands, draft, mention, presences, suggestions],
  );
}

export { useSuggestions };
