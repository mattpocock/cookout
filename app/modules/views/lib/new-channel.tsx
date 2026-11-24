import type { ChannelCreation } from "../../board/index.ts";
import { NewChannelForm } from "./new-channel-form.tsx";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

interface NewChannelProps {
  readonly creation: ChannelCreation;
}

export function NewChannel(props: NewChannelProps): ReactNode {
  const { creation } = props;
  const state = useSyncExternalStore(creation.subscribe, creation.snapshot);
  return <NewChannelForm creation={creation} state={state} />;
}
