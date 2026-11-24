import type { Parts } from "./parts.ts";
import type { ReactNode } from "react";

export function Toolbar(parts: Parts): ReactNode {
  return <div className="flex shrink-0 flex-wrap items-center gap-2 px-5 py-2.5">{parts.children}</div>;
}
