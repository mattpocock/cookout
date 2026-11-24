import { PanelEdge } from "./panel-edge.tsx";
import type { PanelEdgeParts } from "./panel-edge-parts.ts";
import type { ReactNode } from "react";
import { panelWidth } from "./panel-width.ts";

interface ConversationEmptyParts {
  readonly label: string;
  readonly edge: PanelEdgeParts;
  readonly children: ReactNode;
}

export function ConversationEmpty(parts: ConversationEmptyParts): ReactNode {
  const look = panelWidth({ edge: parts.edge, fixed: "" });
  return (
    <aside
      aria-label={parts.label}
      className={`relative hidden w-full items-center justify-center bg-card text-sm text-muted-foreground md:flex md:shrink-0 md:border-l ${look.width}`}
      style={look.style}
    >
      <PanelEdge edge={parts.edge} />
      {parts.children}
    </aside>
  );
}
