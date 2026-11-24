import type { CountBadgeParts } from "./badge-parts.ts";
import type { ReactNode } from "react";

const SHAPE =
  "box-border inline-flex shrink-0 items-center justify-center rounded-full px-1 leading-none whitespace-nowrap tabular-nums";

const SIZES = {
  md: "h-[18px] min-w-[18px] text-[11px] font-medium",
  sm: "h-4 min-w-4 text-[10px] font-medium",
} as const;

const TONES = {
  loud: "bg-mention-bar/25 font-semibold text-mention-fg ring-1 ring-mention-bar/60 ring-inset",
  quiet: "bg-muted text-muted-foreground",
} as const;

export function CountBadge(parts: CountBadgeParts): ReactNode {
  if (parts.tone === "unseen") {
    return (
      <span className="sr-only">
        {" "}
        <span>{parts.label}</span>
      </span>
    );
  }
  return (
    <span className={`${SHAPE} ${SIZES[parts.size ?? "md"]} ${TONES[parts.tone]}`}>
      <span aria-hidden="true">{String(parts.count)}</span> <span className="sr-only">{parts.label}</span>
    </span>
  );
}
