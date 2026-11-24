import { ClosedBy } from "./closed-by.tsx";
import type { Closing } from "../../messages/index.ts";
import { ClosingRefusal } from "./closing-refusal.tsx";
import type { ReactNode } from "react";
import { ThreadBar } from "../../design-system/index.tsx";
import type { ThreadClosing } from "../../board/index.ts";
import type { TopLevelMessage } from "../../sdk/index.ts";

interface ThreadClosedNoteProps {
  readonly closing: ThreadClosing;
  readonly parent: TopLevelMessage;
}

function closingOf(parent: TopLevelMessage): Closing | null {
  const { closedAt = null, closedBy = null } = parent;
  if (closedAt === null || closedBy === null) {
    return null;
  }
  return { closedAt, closedBy };
}

export function ThreadClosedNote(props: ThreadClosedNoteProps): ReactNode {
  const closed = closingOf(props.parent);
  return (
    <>
      {closed !== null && (
        <ThreadBar>
          <ClosedBy closing={closed} />
        </ThreadBar>
      )}
      <ClosingRefusal closing={props.closing} />
    </>
  );
}
