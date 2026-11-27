import { Button } from "../../design-system/controls.tsx";
import type { Identity } from "../../sdk/index.ts";
import type { IdentityActions } from "../../composer/index.ts";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

const TEXT = { feed: "Make feeder", unfeed: "Make agent again" } as const;

interface FeederButtonProps {
  readonly actions: IdentityActions;
  readonly agent: Identity;
}

function fed(agent: Identity): boolean {
  return agent.kind === "agent" && agent.feeder === true;
}

function askOf({ actions, agent }: FeederButtonProps): () => void {
  if (fed(agent)) {
    return actions.ask.unfeed;
  }
  return actions.ask.feed;
}

function labelOf(agent: Identity): string {
  if (fed(agent)) {
    return TEXT.unfeed;
  }
  return TEXT.feed;
}

export function FeederButton(props: FeederButtonProps): ReactNode {
  const { actions, agent } = props;
  const state = useSyncExternalStore(actions.subscribe, actions.snapshot);
  const handleAsk = askOf(props);
  return (
    <Button disabled={state.action.status === "sending"} onClick={handleAsk}>
      {labelOf(agent)}
    </Button>
  );
}
