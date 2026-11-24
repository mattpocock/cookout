import type { ReactNode } from "react";

export function ToolbarDivider(): ReactNode {
  return <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border" />;
}
