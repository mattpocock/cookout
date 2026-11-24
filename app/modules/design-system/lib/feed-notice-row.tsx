import { Avatar } from "./avatar.tsx";
import { FeedNoticeTitle } from "./feed-notice-title.tsx";
import { FeedRowWhy } from "./feed-row-why.tsx";
import type { PresenceShown } from "./avatar-parts.ts";
import type { ReactNode } from "react";
import { feedPresenceOf } from "./feed-presence.ts";

interface FeedNoticeRowParts {
  readonly level: "for-you" | "read";
  readonly why: string;
  readonly name: string;
  readonly href: string;
  readonly displayName: string | null;
  readonly note: string | null;
  readonly agent: boolean;
  readonly presence: PresenceShown | null;
  readonly time: string;
  readonly children?: ReactNode;
}

export function FeedNoticeRow(parts: FeedNoticeRowParts): ReactNode {
  return (
    <li className="relative flex gap-3 rounded-lg px-3 py-3.5 transition-colors hover:bg-hover">
      <Avatar agent={parts.agent} name={parts.name} presence={feedPresenceOf(parts.presence)} />
      <span className="flex min-w-0 flex-1 flex-col">
        <FeedRowWhy level={parts.level}>{parts.why}</FeedRowWhy>
        <FeedNoticeTitle
          bold={parts.level !== "read"}
          displayName={parts.displayName}
          href={parts.href}
          name={parts.name}
          note={parts.note}
          time={parts.time}
        />
        {parts.children}
      </span>
    </li>
  );
}
