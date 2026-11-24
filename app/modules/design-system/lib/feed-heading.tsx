import { CountBadge } from "./count-badge.tsx";
import type { ReactNode } from "react";

interface FeedHeadingParts {
  readonly title: string;
  readonly count: number | null;
  readonly children?: ReactNode;
}

const TITLE = "text-[13px] font-medium text-muted-foreground";

export function FeedHeading(parts: FeedHeadingParts): ReactNode {
  if (parts.count === null) {
    return (
      <div className="mt-8 mb-3 flex items-center gap-3 pl-1.5 first:mt-0">
        <h2 className={TITLE}>{parts.title}</h2>
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </div>
    );
  }
  return (
    <div className="mt-8 mb-2 flex min-h-7 items-center justify-between gap-3 pl-1.5 first:mt-0">
      <h2 className={`flex items-center gap-2 ${TITLE}`}>
        {parts.title} <CountBadge count={parts.count} label={String(parts.count)} tone="quiet" />
      </h2>
      {parts.children}
    </div>
  );
}
