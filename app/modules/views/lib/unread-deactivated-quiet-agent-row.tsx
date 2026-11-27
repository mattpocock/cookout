import { ButtonRow } from "../../design-system/controls.tsx";
import type { DeactivatedQuietAgent } from "../../sdk/index.ts";
import { DeactivatedQuietAgentRow } from "./deactivated-quiet-agent-row.tsx";
import type { DeactivatedQuietAgents } from "../../unread/index.ts";
import type { Identities } from "../../composer/index.ts";
import { IdentityConfirm } from "./identity-confirm.tsx";
import type { ReactNode } from "react";
import { ReactivateRefusal } from "./reactivate-refusal.tsx";
import { RowButton } from "../../design-system/feed.tsx";
import { useCallback } from "react";

const TEXT = { markRead: "Mark read", reactivate: "Reactivate" } as const;

interface UnreadDeactivatedQuietAgentRowProps {
  readonly entry: DeactivatedQuietAgent;
  readonly entries: Pick<DeactivatedQuietAgents, "markRead" | "release">;
  readonly identities: Pick<Identities, "actions">;
}

export function UnreadDeactivatedQuietAgentRow(props: UnreadDeactivatedQuietAgentRowProps): ReactNode {
  const { entries, entry } = props;
  const actions = props.identities.actions(entry.identity.name);
  const handleReactivate = actions.ask.reactivate;
  const handleMarkRead = useCallback(() => {
    entries.release(entry.id);
    entries.markRead(entry.id);
  }, [entries, entry]);
  return (
    <DeactivatedQuietAgentRow entry={entry}>
      {!entry.read && (
        <ButtonRow>
          <RowButton onClick={handleReactivate}>{TEXT.reactivate}</RowButton>
          <RowButton onClick={handleMarkRead}>{TEXT.markRead}</RowButton>
        </ButtonRow>
      )}
      <ReactivateRefusal actions={actions} />
      <IdentityConfirm actions={actions} identity={entry.identity} />
    </DeactivatedQuietAgentRow>
  );
}
