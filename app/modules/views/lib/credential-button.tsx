import type { Identity } from "../../sdk/index.ts";
import type { IdentityActions } from "../../composer/index.ts";
import { LoginLinkButton } from "./login-link-button.tsx";
import type { ReactNode } from "react";

interface CredentialButtonProps {
  readonly actions: IdentityActions;
  readonly identity: Identity;
}

export function CredentialButton(props: CredentialButtonProps): ReactNode {
  const { actions, identity } = props;
  if (identity.deactivated === true || identity.kind === "agent") {
    return null;
  }
  return <LoginLinkButton actions={actions} />;
}
