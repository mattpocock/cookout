import { Alert, Skeleton } from "../../design-system/content.tsx";
import type { ComponentProps, ReactNode } from "react";
import type { OfflineAlertId, PublicId } from "../../sdk/index.ts";
import { FeedNote } from "../../design-system/feed.tsx";
import { InboxAlerts } from "./inbox-alerts.tsx";
import { InboxSections } from "./inbox-sections.tsx";
import type { UnreadState } from "../../unread/index.ts";
import { besideCountOf } from "./beside-count.ts";

const NONE = 0;

const TEXT = { empty: "You're all caught up." } as const;

type SectionsProps = ComponentProps<typeof InboxSections>;

interface InboxBodyProps {
  readonly actions: SectionsProps["actions"];
  readonly unread: UnreadState;
  readonly me: string;
  readonly rows: SectionsProps["rows"];
  readonly selected: SectionsProps["selected"];
  readonly onMarkAlertRead: (id: OfflineAlertId) => void;
  readonly onRevokeSession: (session: PublicId) => void;
  readonly notices: SectionsProps["notices"];
}

export function InboxBody(props: InboxBodyProps): ReactNode {
  const { unread } = props;
  if (unread.status === "loading") {
    return (
      <>
        <Skeleton width="short" />
        <Skeleton width="long" />
      </>
    );
  }
  if (unread.status === "failed") {
    return <Alert>{`Couldn't load the inbox (${unread.code}): ${unread.message}`}</Alert>;
  }
  return (
    <>
      {unread.items.length + besideCountOf(unread) === NONE && <FeedNote place="empty">{TEXT.empty}</FeedNote>}
      <InboxAlerts alerts={unread.alerts} onMarkRead={props.onMarkAlertRead} onRevoke={props.onRevokeSession} />
      <InboxSections
        actions={props.actions}
        besides={besideCountOf(unread) - unread.alerts.length}
        me={props.me}
        notices={props.notices}
        rows={props.rows}
        selected={props.selected}
        unread={unread}
      />
    </>
  );
}
