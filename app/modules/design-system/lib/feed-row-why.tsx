import type { ReactNode } from "react";

interface FeedRowWhyParts {
  readonly level: "for-you" | "activity" | "read";
  readonly children: string;
}

const LOOKS = {
  activity: "text-muted-foreground",
  "for-you": "font-medium text-foreground",
  read: "text-muted-foreground",
} as const;

export function FeedRowWhy(parts: FeedRowWhyParts): ReactNode {
  return <span className={`mb-1 truncate text-[11px] ${LOOKS[parts.level]}`}>{parts.children}</span>;
}
