import { ActionGroup, SettingLine } from "../../design-system/index.tsx";
import type { DisplayNameDraft, Identities } from "../../composer/index.ts";
import { AgentMenu } from "./agent-menu.tsx";
import { AgentNameDialog } from "./agent-name-dialog.tsx";
import { AgentSummary } from "./agent-summary.tsx";
import type { Identity } from "../../sdk/index.ts";
import { IdentityConfirm } from "./identity-confirm.tsx";
import type { ReactNode } from "react";
import { TokenShown } from "./token-shown.tsx";

interface AgentCardProps {
  readonly draft: DisplayNameDraft;
  readonly identities: Identities;
  readonly identity: Identity;
}

export function AgentCard(props: AgentCardProps): ReactNode {
  const { identity } = props;
  const actions = props.identities.actions(identity.name);
  return (
    <ActionGroup label={`@${identity.name}`}>
      <SettingLine>
        <AgentSummary actions={actions} identity={identity} />
        <AgentMenu actions={actions} active={identity.deactivated !== true} draft={props.draft} />
      </SettingLine>
      <IdentityConfirm actions={actions} identity={identity} />
      <TokenShown actions={actions} />
      <AgentNameDialog draft={props.draft} name={identity.name} />
    </ActionGroup>
  );
}
