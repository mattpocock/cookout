import type { Parts } from "./parts.ts";
import type { ReactNode } from "react";

export function SidebarFooter(parts: Parts): ReactNode {
  return <div className="relative flex flex-col gap-0.5 border-t p-2">{parts.children}</div>;
}
