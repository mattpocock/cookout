import { FeedHeading, FeedList } from "../../design-system/index.tsx";
import type { InboxRowActions } from "./use-inbox-row-menu.ts";
import { InboxRowView } from "./inbox-row-view.tsx";
import type { InboxRows } from "./use-inbox-rows.ts";
import type { InboxSelection } from "../../paths/index.ts";
import { MarkAllRead } from "./mark-all-read.tsx";
import type { MarkAllReadProps } from "./mark-all-read.tsx";
import type { ReactNode } from "react";
import { isSelected } from "./use-inbox-rows.ts";

const NONE = 0;

interface InboxSectionProps {
  readonly actions: InboxRowActions;
  readonly title: string;
  readonly rows: InboxRows;
  readonly selected: InboxSelection | null;
  readonly forYou: boolean;
  readonly me: string;
  readonly besides?: number | undefined;
  readonly uncounted?: number | undefined;
  readonly markAll: MarkAllReadProps | null;
  readonly children?: ReactNode;
}

function countOf(count: number): number | null {
  if (count === NONE) {
    return null;
  }
  return count;
}

export function InboxSection(props: InboxSectionProps): ReactNode {
  const { markAll, me, selected } = props;
  const { held } = props.rows;
  const rows = props.rows.rows.filter((row) => row.forYou === props.forYou);
  const count = rows.length + (props.besides ?? NONE);
  return (
    count + (props.uncounted ?? NONE) > NONE && (
      <>
        <FeedHeading count={countOf(count)} title={props.title}>
          {markAll !== null && <MarkAllRead state={markAll.state} unread={markAll.unread} />}
        </FeedHeading>
        <FeedList label={props.title}>
          {props.children}
          {rows.map((row) => (
            <InboxRowView
              actions={props.actions}
              key={row.key}
              me={me}
              row={row}
              current={isSelected({ row, selected })}
              unread={row !== held}
            />
          ))}
        </FeedList>
      </>
    )
  );
}
