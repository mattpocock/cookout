import type { Message } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { ScheduledMark } from "../../design-system/feed.tsx";
import { ScheduledMarkerLink } from "./scheduled-marker-link.tsx";

const TEXT = { deleted: "Schedule deleted" } as const;

interface ScheduledMarkerProps {
  readonly message: Message;
}

export function ScheduledMarker(props: ScheduledMarkerProps): ReactNode {
  const { message } = props;
  const marker = message.scheduledMessage ?? null;
  if (marker === null) {
    return null;
  }
  if (marker.deleted) {
    return <ScheduledMark label={TEXT.deleted} onOpen={null} />;
  }
  return <ScheduledMarkerLink channel={message.channel} id={marker.id} />;
}
