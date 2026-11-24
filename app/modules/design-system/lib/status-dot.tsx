import type { ReactNode } from "react";
import type { StatusDotParts } from "./badge-parts.ts";

const MODES = { activity: "bg-muted-foreground/60", "for-you": "bg-mention-bar" } as const;

export function StatusDot(parts: StatusDotParts): ReactNode {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-1.5 shrink-0 rounded-full ${MODES[parts.mode]}`}
      data-mode={parts.mode}
    />
  );
}
