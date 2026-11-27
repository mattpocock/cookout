import type { Identity } from "../../sdk/index.ts";
import type { IdentityActions } from "../../composer/index.ts";
import { IdentityConfirm } from "./identity-confirm.tsx";
import { LoginLinkShown } from "./login-link-shown.tsx";
import { ManageButtons } from "./manage-buttons.tsx";
import type { ReactNode } from "react";
import { TokenShown } from "./token-shown.tsx";
import { TransferForm } from "./transfer-form.tsx";

interface ManageActionsProps {
  readonly actions: IdentityActions;
  readonly identity: Identity;
  readonly deletable: boolean;
  readonly transfer: boolean;
}

export function ManageActions(props: ManageActionsProps): ReactNode {
  const { actions, identity } = props;
  return (
    <>
      <ManageButtons actions={actions} deletable={props.deletable} identity={identity} />
      <IdentityConfirm actions={actions} identity={identity} />
      <TokenShown actions={actions} />
      {identity.kind === "human" && <LoginLinkShown actions={actions} name={identity.name} />}
      {props.transfer && <TransferForm actions={actions} name={identity.name} />}
    </>
  );
}
