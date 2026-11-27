import type { BoardCalls } from "../../board/index.ts";
import type { Message } from "../../sdk/index.ts";
import type { TitleChoice } from "../../design-system/messages.tsx";
import { hrefOf } from "../../paths/index.ts";
import { titleEditLabel } from "./use-thread-heading.ts";

interface TitleOf {
  readonly asking: Pick<BoardCalls, "askTitle">;
  readonly message: Message;
  readonly titling: boolean;
}

function titleChoiceOf({ asking, message, titling }: TitleOf): TitleChoice | null {
  if (!titling || message.kind !== "top-level") {
    return null;
  }
  const { channel, id } = message;
  return {
    label: titleEditLabel(message),
    onSelect: () => {
      asking.askTitle(id);
      globalThis.location.hash = hrefOf({ channel, name: "thread", thread: id });
    },
  };
}

export { titleChoiceOf };
