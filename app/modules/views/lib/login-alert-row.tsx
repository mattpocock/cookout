import { ItemRow, Muted } from "../../design-system/content.tsx";
import type { LoginAlert, PublicId } from "../../sdk/index.ts";
import { liveSessionOf, loginTextOf, sessionTextOf } from "./alert-text.ts";
import type { ReactNode } from "react";
import { RevokeSessionButton } from "./revoke-session-button.tsx";
import { useTimeAgo } from "./use-time-ago.ts";

interface LoginAlertRowProps {
  readonly alert: LoginAlert;
  readonly onRevoke: ((session: PublicId) => void) | undefined;
  readonly children?: ReactNode;
}

export function LoginAlertRow(props: LoginAlertRowProps): ReactNode {
  const { alert } = props;
  const onRevoke = props.onRevoke ?? null;
  const raised = useTimeAgo(alert.raisedAt);
  const live = liveSessionOf(alert);
  return (
    <ItemRow>
      <span className="text-sm">{loginTextOf(alert)}</span>
      <Muted>{`${raised}${sessionTextOf(alert)}`}</Muted>
      {live !== null && onRevoke !== null && <RevokeSessionButton onRevoke={onRevoke} session={live} />}
      {props.children}
    </ItemRow>
  );
}
