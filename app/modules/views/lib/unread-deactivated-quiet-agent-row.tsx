import type { DeactivatedQuietAgent, DeactivatedQuietAgentId } from "../../sdk/index.ts";
import type { AskedRows } from "./asked-rows.ts";
import { ButtonRow } from "../../design-system/controls.tsx";
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
  readonly entries: Pick<DeactivatedQuietAgents, "markRead">;
  readonly identities: Pick<Identities, "actions">;
  readonly asking: Pick<AskedRows<DeactivatedQuietAgentId, DeactivatedQuietAgent>, "ask" | "closed">;
}

export function UnreadDeactivatedQuietAgentRow(props: UnreadDeactivatedQuietAgentRowProps): ReactNode {
  const { asking, entries, entry } = props;
  const actions = props.identities.actions(entry.identity.name);
  const handleReactivate = useCallback(() => {
    asking.ask(entry);
    actions.ask.reactivate();
  }, [actions, asking, entry]);
  const handleCloseFocused = useCallback(() => {
    if (actions.snapshot().confirming === null) {
      asking.closed(entry.id);
    }
  }, [actions, asking, entry]);
  const handleMarkRead = useCallback(() => {
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
      <IdentityConfirm actions={actions} identity={entry.identity} onCloseFocused={handleCloseFocused} />
    </DeactivatedQuietAgentRow>
  );
}
