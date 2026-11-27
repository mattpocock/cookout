import { FeedHeading, FeedList } from "../../design-system/feed.tsx";
import type { InboxAlert, OfflineAlertId, PublicId } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { UnreadAlertRow } from "./unread-alert-row.tsx";

const NONE = 0;
const TITLE = "Alerts";

interface InboxAlertsProps {
  readonly alerts: readonly InboxAlert[];
  readonly onMarkRead: (id: OfflineAlertId) => void;
  readonly onRevoke: (session: PublicId) => void;
}

export function InboxAlerts(props: InboxAlertsProps): ReactNode {
  const { alerts, onMarkRead, onRevoke } = props;
  return (
    alerts.length > NONE && (
      <>
        <FeedHeading count={alerts.length} title={TITLE} />
        <FeedList label={TITLE}>
          {alerts.map((alert) => (
            <UnreadAlertRow alert={alert} key={alert.id} onMarkRead={onMarkRead} onRevoke={onRevoke} />
          ))}
        </FeedList>
      </>
    )
  );
}
