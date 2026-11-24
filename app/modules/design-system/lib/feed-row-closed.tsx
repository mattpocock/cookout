import { Badge } from "./badge.tsx";
import type { ReactNode } from "react";

interface FeedRowClosedParts {
  readonly closed: boolean;
}

const TEXT = { closed: "Closed" } as const;

export function FeedRowClosed(parts: FeedRowClosedParts): ReactNode {
  return (
    parts.closed && (
      <Badge rounded size="sm" tone="muted" variant="outline">
        {TEXT.closed}
      </Badge>
    )
  );
}
