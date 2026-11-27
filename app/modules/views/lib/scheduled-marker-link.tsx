import { useCallback, useContext } from "react";
import type { ChannelName } from "../../sdk/index.ts";
import { LandingContext } from "../../landing/index.ts";
import type { ReactNode } from "react";
import { ScheduledMark } from "../../design-system/feed.tsx";
import type { ScheduledMessageId } from "../../scheduled-messages/index.ts";
import { hrefOf } from "../../paths/index.ts";
import { useDeletedSchedules } from "./use-board.ts";

const TEXT = { deleted: "Schedule deleted", scheduled: "Scheduled" } as const;

interface ScheduledMarkerLinkProps {
  readonly channel: ChannelName;
  readonly id: ScheduledMessageId;
}

export function ScheduledMarkerLink(props: ScheduledMarkerLinkProps): ReactNode {
  const { channel, id } = props;
  const deleted = useDeletedSchedules().has(id);
  const land = useContext(LandingContext).ask;
  const handleOpen = useCallback(() => {
    globalThis.location.hash = hrefOf({ channel, name: "schedules", selected: id });
    land();
  }, [channel, id, land]);
  if (deleted) {
    return <ScheduledMark label={TEXT.deleted} onOpen={null} />;
  }
  return <ScheduledMark label={TEXT.scheduled} onOpen={handleOpen} />;
}
