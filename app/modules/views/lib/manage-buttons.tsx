import { ButtonRow } from "../../design-system/controls.tsx";
import { CredentialButton } from "./credential-button.tsx";
import { FeederButton } from "./feeder-button.tsx";
import type { Identity } from "../../sdk/index.ts";
import type { IdentityActions } from "../../composer/index.ts";
import type { ReactNode } from "react";
import { RemovalButton } from "./removal-button.tsx";

interface ManageButtonsProps {
  readonly actions: IdentityActions;
  readonly identity: Identity;
  readonly deletable: boolean;
}

export function ManageButtons({ actions, deletable, identity }: ManageButtonsProps): ReactNode {
  const active = identity.deactivated !== true;
  return (
    <ButtonRow>
      <CredentialButton actions={actions} identity={identity} />
      {active && identity.kind === "agent" && <FeederButton actions={actions} agent={identity} />}
      <RemovalButton actions={actions} active={active} deletable={deletable} />
    </ButtonRow>
  );
}
