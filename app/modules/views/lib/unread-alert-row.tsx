import type { InboxAlert, OfflineAlertId, PublicId } from "../../sdk/index.ts";
import { AlertReadButton } from "./alert-read-button.tsx";
import { AlertRow } from "./alert-row.tsx";
import type { ReactNode } from "react";

interface UnreadAlertRowProps {
  readonly alert: InboxAlert;
  readonly onMarkRead: (id: OfflineAlertId) => void;
  readonly onRevoke: (session: PublicId) => void;
}

export function UnreadAlertRow(props: UnreadAlertRowProps): ReactNode {
  return (
    <AlertRow alert={props.alert} onRevoke={props.onRevoke}>
      <AlertReadButton id={props.alert.id} onMarkRead={props.onMarkRead} />
    </AlertRow>
  );
}
