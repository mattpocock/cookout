import { ActionGroup, Button } from "../../design-system/controls.tsx";
import type { AgentKeyView } from "../../logins/index.ts";
import type { AgentKeys } from "../../composer/index.ts";
import { Muted } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import { keyDetail } from "./key-words.ts";
import { useCallback } from "react";

const TEXT = { revoke: "Revoke" } as const;

interface KeyRowProps {
  readonly agentKey: AgentKeyView;
  readonly keys: AgentKeys;
}

export function KeyRow(props: KeyRowProps): ReactNode {
  const { agentKey, keys } = props;
  const handleRevoke = useCallback(() => {
    keys.askRevoke(agentKey);
  }, [agentKey, keys]);
  return (
    <ActionGroup label={agentKey.name}>
      <Muted>{keyDetail(agentKey)}</Muted>
      <Button onClick={handleRevoke}>{TEXT.revoke}</Button>
    </ActionGroup>
  );
}
