import type { DeactivatedQuietAgent, DeactivatedQuietAgentId } from "../../sdk/index.ts";
import { createAskedRows, shownWith } from "./asked-rows.ts";
import { useMemo, useSyncExternalStore } from "react";
import type { DeactivatedQuietAgents } from "../../unread/index.ts";
import type { Identities } from "../../composer/index.ts";
import type { ReactNode } from "react";
import { UnreadDeactivatedQuietAgentRow } from "./unread-deactivated-quiet-agent-row.tsx";

interface UnreadDeactivatedQuietAgentsProps {
  readonly deactivated: readonly DeactivatedQuietAgent[];
  readonly entries: Pick<DeactivatedQuietAgents, "markRead">;
  readonly identities: Pick<Identities, "actions">;
}

export function UnreadDeactivatedQuietAgents(props: UnreadDeactivatedQuietAgentsProps): ReactNode {
  const asking = useMemo(() => createAskedRows<DeactivatedQuietAgentId, DeactivatedQuietAgent>(), []);
  const asked = useSyncExternalStore(asking.subscribe, asking.snapshot);
  return shownWith({ asked, entries: props.deactivated }).map((entry) => (
    <UnreadDeactivatedQuietAgentRow
      asking={asking}
      entries={props.entries}
      entry={entry}
      identities={props.identities}
      key={`deactivated ${String(entry.id)}`}
    />
  ));
}
