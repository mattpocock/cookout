import type { AgentKeyView } from "../../logins/index.ts";
import type { AgentKeys } from "../../composer/index.ts";
import { ConfirmDialog } from "../../design-system/controls.tsx";
import type { ReactNode } from "react";
import { revokingAlert } from "./key-words.ts";
import { useSyncExternalStore } from "react";

const TEXT = {
  body: "It stops working at once, with every agent session it made. The agent's other keys keep working.",
  confirm: "Revoke key",
} as const;

interface KeyConfirmProps {
  readonly keys: AgentKeys;
}

function titleOf(asked: AgentKeyView | null): string {
  if (asked === null) {
    return "";
  }
  return `Revoke the key ${asked.name}?`;
}

export function KeyConfirm(props: KeyConfirmProps): ReactNode {
  const { keys } = props;
  const state = useSyncExternalStore(keys.subscribe, keys.snapshot);
  const handleCancel = keys.cancel;
  const handleConfirm = keys.confirm;
  return (
    <ConfirmDialog
      body={TEXT.body}
      confirm={TEXT.confirm}
      destructive
      error={revokingAlert(state)}
      onCancel={handleCancel}
      onConfirm={handleConfirm}
      open={state.asked !== null}
      pending={state.revoking.status === "sending"}
      returnTo={null}
      title={titleOf(state.asked)}
    />
  );
}
