import type { Identity } from "../../sdk/index.ts";
import type { IdentityActions } from "../../composer/index.ts";
import { LoginLinkButton } from "./login-link-button.tsx";
import type { ReactNode } from "react";
import { RotateButton } from "./rotate-button.tsx";

interface CredentialButtonProps {
  readonly actions: IdentityActions;
  readonly identity: Identity;
}

export function CredentialButton(props: CredentialButtonProps): ReactNode {
  const { actions, identity } = props;
  if (identity.deactivated === true) {
    return null;
  }
  if (identity.kind === "agent") {
    return <RotateButton actions={actions} />;
  }
  return <LoginLinkButton actions={actions} />;
}
