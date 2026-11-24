import type { AuthorParts } from "./parts.ts";
import { Avatar } from "./avatar.tsx";
import { Badge } from "./badge.tsx";
import type { ReactNode } from "react";

const AGENT = "agent";

export function Author(parts: AuthorParts): ReactNode {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar agent={parts.agent} name={parts.name} presence={parts.presence} size={parts.size} />
      <span className="truncate text-[13px] text-foreground">{parts.shown}</span>
      {parts.handle !== null && <span className="truncate text-xs text-muted-foreground">{parts.handle}</span>}
      {parts.agent && (
        <Badge size="sm" tone="muted" variant="outline">
          {AGENT}
        </Badge>
      )}
    </span>
  );
}
