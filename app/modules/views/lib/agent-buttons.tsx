import type { IdentityActions } from "../../composer/index.ts";
import type { ReactNode } from "react";
import { RevokeButton } from "./revoke-button.tsx";

interface AgentButtonsProps {
  readonly actions: IdentityActions;
}

export function AgentButtons(props: AgentButtonsProps): ReactNode {
  return <RevokeButton actions={props.actions} />;
}
