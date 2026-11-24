import { FeedRowTitle } from "./feed-row-title.tsx";
import { FeedRowWhy } from "./feed-row-why.tsx";
import type { ReactNode } from "react";
import { useId } from "react";

interface FeedRowParts {
  readonly level: "for-you" | "activity" | "read";
  readonly why: string;
  readonly author: string;
  readonly authorHref: string;
  readonly displayName: string | null;
  readonly note: string | null;
  readonly action: string;
  readonly channel: string;
  readonly time: string;
  readonly count: string | null;
  readonly closed: boolean;
  readonly context: string | null;
  readonly children: ReactNode;
  readonly href: string;
  readonly current: boolean;
}

function currentOf(current: boolean): "page" | false {
  if (current) {
    return "page";
  }
  return false;
}

export function FeedRowBody(parts: FeedRowParts): ReactNode {
  const id = useId();
  return (
    <span className="flex min-w-0 flex-1 flex-col" id={id}>
      <a
        aria-current={currentOf(parts.current)}
        aria-labelledby={id}
        className="flex min-w-0 pr-20 outline-none after:absolute after:inset-0 after:rounded-lg"
        data-feed-row=""
        href={parts.href}
      >
        <FeedRowWhy level={parts.level}>{parts.why}</FeedRowWhy>
      </a>
      <FeedRowTitle
        action={parts.action}
        author={parts.author}
        authorHref={parts.authorHref}
        bold={parts.level !== "read"}
        channel={parts.channel}
        closed={parts.closed}
        displayName={parts.displayName}
        note={parts.note}
        time={parts.time}
      />
      {parts.context !== null && (
        <span className="mt-1 truncate text-xs text-muted-foreground">{`re: ${parts.context}`}</span>
      )}
      {parts.children}
      {parts.count !== null && <span className="mt-1 text-xs text-muted-foreground">{parts.count}</span>}
    </span>
  );
}

export type { FeedRowParts };
