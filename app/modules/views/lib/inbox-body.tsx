import { Alert, FeedCaughtUp, Skeleton } from "../../design-system/index.tsx";
import type { ComponentProps, ReactNode } from "react";
import type { Unread, UnreadState } from "../../unread/index.ts";
import { ForYouNotices } from "./for-you-notices.tsx";
import { InboxAlerts } from "./inbox-alerts.tsx";
import type { InboxRows } from "./use-inbox-rows.ts";
import { InboxSection } from "./inbox-section.tsx";
import type { InboxSelection } from "../../paths/index.ts";
import type { NoticeActions } from "./for-you-notices.tsx";
import { besideCountOf } from "./beside-count.ts";
import { markAllPlaces } from "./mark-all-place.ts";

const NONE = 0;

const TEXT = { activity: "Activity", empty: "You're all caught up.", forYou: "For you" } as const;

interface InboxBodyProps {
  readonly actions: ComponentProps<typeof InboxSection>["actions"];
  readonly unread: UnreadState;
  readonly store: Unread;
  readonly me: string;
  readonly rows: InboxRows;
  readonly selected: InboxSelection | null;
  readonly onMarkAlertRead: ComponentProps<typeof InboxAlerts>["onMarkRead"];
  readonly notices: NoticeActions;
}

export function InboxBody(props: InboxBodyProps): ReactNode {
  const { me, rows, selected, unread } = props;
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
  const markAll = markAllPlaces({ rows, state: unread, store: props.store });
  return (
    <>
      {unread.items.length + besideCountOf(unread) + markAll.held === NONE && <FeedCaughtUp>{TEXT.empty}</FeedCaughtUp>}
      <InboxAlerts alerts={unread.alerts} markAll={markAll.alerts} onMarkRead={props.onMarkAlertRead} />
      <InboxSection
        actions={props.actions}
        besides={markAll.besides}
        forYou
        markAll={markAll.forYou}
        uncounted={markAll.held}
        me={me}
        rows={rows}
        selected={selected}
        title={TEXT.forYou}
      >
        <ForYouNotices
          actions={props.notices}
          deactivated={unread.deactivatedQuietAgents}
          held={unread.heldDeactivatedQuietAgents}
          joinRequests={unread.agentJoinRequests}
          nudges={unread.nudges}
          offers={unread.deactivationOffers}
        />
      </InboxSection>
      <InboxSection
        actions={props.actions}
        forYou={false}
        markAll={markAll.activity}
        me={me}
        rows={rows}
        selected={selected}
        title={TEXT.activity}
      />
    </>
  );
}
