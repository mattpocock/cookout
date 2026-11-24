import { InboxCheckIcon } from "./inbox-check-icon.tsx";
import type { ReactNode } from "react";

interface FeedCaughtUpParts {
  readonly children: ReactNode;
}

export function FeedCaughtUp(parts: FeedCaughtUpParts): ReactNode {
  return (
    <div className="flex flex-col items-center gap-3 px-1.5 py-12 text-center text-muted-foreground">
      <InboxCheckIcon />
      <p className="text-sm">{parts.children}</p>
    </div>
  );
}
