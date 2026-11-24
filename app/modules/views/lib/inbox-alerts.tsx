import { FeedHeading, FeedList } from "../../design-system/index.tsx";
import type { OfflineAlert, OfflineAlertId } from "../../sdk/index.ts";
import { MarkAllRead } from "./mark-all-read.tsx";
import type { MarkAllReadProps } from "./mark-all-read.tsx";
import type { ReactNode } from "react";
import { UnreadAlertRow } from "./unread-alert-row.tsx";

const NONE = 0;
const TITLE = "Agents offline";

interface InboxAlertsProps {
  readonly alerts: readonly OfflineAlert[];
  readonly onMarkRead: (id: OfflineAlertId) => void;
  readonly markAll: MarkAllReadProps | null;
}

export function InboxAlerts(props: InboxAlertsProps): ReactNode {
  const { alerts, markAll, onMarkRead } = props;
  return (
    alerts.length > NONE && (
      <>
        <FeedHeading count={alerts.length} title={TITLE}>
          {markAll !== null && <MarkAllRead state={markAll.state} unread={markAll.unread} />}
        </FeedHeading>
        <FeedList label={TITLE}>
          {alerts.map((alert) => (
            <UnreadAlertRow alert={alert} key={alert.id} onMarkRead={onMarkRead} />
          ))}
        </FeedList>
      </>
    )
  );
}
