import type { MentionParts } from "./parts.ts";
import type { ReactNode } from "react";

export function Mention(parts: MentionParts): ReactNode {
  if (parts.mine) {
    return (
      <mark className="rounded bg-mention-bg box-decoration-clone px-1 py-0.5 font-medium text-mention-fg ring-1 ring-mention-bar/40">
        {parts.children}
      </mark>
    );
  }
  return <span className="rounded px-0.5 font-medium text-foreground">{parts.children}</span>;
}
