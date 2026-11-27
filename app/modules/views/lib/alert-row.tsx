import type { InboxAlert, PublicId } from "../../sdk/index.ts";
import { LoginAlertRow } from "./login-alert-row.tsx";
import { OfflineAlertRow } from "./offline-alert-row.tsx";
import type { ReactNode } from "react";
import { isLoginAlert } from "./alert-text.ts";

interface AlertRowProps {
  readonly alert: InboxAlert;
  readonly onRevoke?: (session: PublicId) => void;
  readonly children?: ReactNode;
}

export function AlertRow(props: AlertRowProps): ReactNode {
  const { alert } = props;
  if (isLoginAlert(alert)) {
    return (
      <LoginAlertRow alert={alert} onRevoke={props.onRevoke}>
        {props.children}
      </LoginAlertRow>
    );
  }
  return <OfflineAlertRow alert={alert}>{props.children}</OfflineAlertRow>;
}
