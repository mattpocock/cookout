import { FeedRowClosed } from "./feed-row-closed.tsx";
import type { ReactNode } from "react";

interface FeedRowTitleParts {
  readonly author: string;
  readonly authorHref: string;
  readonly displayName: string | null;
  readonly note: string | null;
  readonly bold: boolean;
  readonly action: string;
  readonly channel: string;
  readonly time: string;
  readonly closed: boolean;
}

function weightOf(bold: boolean): string {
  if (bold) {
    return "font-semibold";
  }
  return "font-medium";
}

export function FeedRowTitle(parts: FeedRowTitleParts): ReactNode {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5 text-[13px] whitespace-nowrap">
      <a
        className={`relative z-10 max-w-1/2 shrink-0 truncate hover:underline ${weightOf(parts.bold)}`}
        href={parts.authorHref}
      >
        {parts.displayName ?? parts.author}
      </a>
      {parts.displayName !== null && <span className="text-xs text-muted-foreground">{`@${parts.author}`}</span>}
      {parts.note !== null && <span className="min-w-0 truncate text-xs text-muted-foreground">{parts.note}</span>}
      <span className="shrink-0 text-muted-foreground">{parts.action}</span>
      <span className="min-w-8 truncate font-mono text-xs text-muted-foreground">{`#${parts.channel}`}</span>
      <FeedRowClosed closed={parts.closed} />
      <span className="absolute top-3.5 right-3 flex h-[17px] shrink-0 items-center text-xs text-muted-foreground tabular-nums">
        {parts.time}
      </span>
    </span>
  );
}
