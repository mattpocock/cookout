import type { MentionParts } from "./parts.ts";
import type { ReactNode } from "react";

export function Mention(parts: MentionParts): ReactNode {
  if (parts.feeder === true) {
    return <span className="rounded px-0.5 text-muted-foreground">{parts.children}</span>;
  }
  if (parts.mine) {
    return (
      <mark className="rounded bg-mention-bg px-1 font-medium text-mention-fg ring-1 ring-mention-bar/40">
        {parts.children}
      </mark>
    );
  }
  return <span className="rounded px-0.5 font-medium text-foreground">{parts.children}</span>;
}
