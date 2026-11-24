import type { Board } from "../../board/index.ts";
import { DeletedNotice } from "./deleted-notice.tsx";
import { PaneHeader } from "../../design-system/index.tsx";
import type { ReactNode } from "react";

const DESCRIPTION = "Mentions, threads you follow, and channels you subscribe to";

interface InboxHeaderProps {
  readonly board: Board;
  readonly title: string;
}

export function InboxHeader(props: InboxHeaderProps): ReactNode {
  return (
    <>
      <PaneHeader description={DESCRIPTION} sans title={props.title} />
      <DeletedNotice board={props.board} />
    </>
  );
}
