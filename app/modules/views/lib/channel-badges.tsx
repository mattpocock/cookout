import { CountBadge } from "../../design-system/index.tsx";
import { NONE } from "./unread-counts.ts";
import type { ReactNode } from "react";
import type { UnreadCounts } from "../../unread/index.ts";

interface ChannelBadgesProps {
  readonly counts: UnreadCounts;
}

export function ChannelBadges(props: ChannelBadgesProps): ReactNode {
  const { activity, forYou } = props.counts;
  return (
    <>
      {activity > NONE && <CountBadge count={activity} label={`${String(activity)} unread`} tone="unseen" />}
      {forYou > NONE && <CountBadge count={forYou} label={`${String(forYou)} for you`} tone="loud" />}
    </>
  );
}
