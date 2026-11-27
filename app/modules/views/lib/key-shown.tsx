import { Button, ButtonRow, TokenText } from "../../design-system/controls.tsx";
import type { AgentKeys } from "../../composer/index.ts";
import { Muted } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

const TEXT = {
  copy: "Copy key",
  done: "Done",
  label: "New agent key",
  warning: "Copy it now: it won't be shown again.",
} as const;

interface KeyShownProps {
  readonly keys: AgentKeys;
}

export function KeyShown(props: KeyShownProps): ReactNode {
  const { keys } = props;
  const { made } = useSyncExternalStore(keys.subscribe, keys.snapshot);
  const handleCopy = keys.copy;
  const handleDone = keys.forget;
  if (made === null) {
    return null;
  }
  return (
    <>
      <TokenText label={TEXT.label} token={made.token} />
      <Muted>{TEXT.warning}</Muted>
      <ButtonRow>
        <Button focused onClick={handleCopy}>
          {TEXT.copy}
        </Button>
        <Button onClick={handleDone}>{TEXT.done}</Button>
      </ButtonRow>
    </>
  );
}
