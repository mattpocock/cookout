import type { ReactNode } from "react";
import { StatusDot } from "./status-dot.tsx";

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
  const { level } = parts;
  return (
    <span className={`mb-1 flex min-w-0 items-center gap-1.5 text-[11px] ${LOOKS[level]}`}>
      {level !== "read" && <StatusDot mode={level} />}
      <span className="truncate">{parts.children}</span>
    </span>
  );
}
