import type { Parts } from "./parts.ts";
import type { ReactNode } from "react";

export function SidebarFooter(parts: Parts): ReactNode {
  return <div className="relative flex items-center gap-1 p-2">{parts.children}</div>;
}
