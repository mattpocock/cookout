import type { ChannelStartParts } from "./parts.ts";
import type { ReactNode } from "react";

const HASH = "#";

export function ChannelStart(parts: ChannelStartParts): ReactNode {
  return (
    <div className="flex items-center gap-3 px-5 pt-10 pb-4">
      <div
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-lg text-muted-foreground"
      >
        {HASH}
      </div>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold">{parts.title}</h2>
        <p className="text-sm text-muted-foreground">{parts.description}</p>
      </div>
    </div>
  );
}
