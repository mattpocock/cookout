import type { Parts } from "./parts.ts";
import type { ReactNode } from "react";

export function ThreadBar(parts: Parts): ReactNode {
  return <p className="shrink-0 px-5 pt-1 pb-2 text-xs text-muted-foreground">{parts.children}</p>;
}
