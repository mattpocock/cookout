import type { LinkParts } from "./parts.ts";
import { PANEL_ACTION_LOOK } from "./panel-action-look.ts";
import type { ReactNode } from "react";

interface HoverActionParts extends LinkParts {
  readonly name: string;
}

export function HoverAction(parts: HoverActionParts): ReactNode {
  return (
    <a aria-label={parts.name} className={PANEL_ACTION_LOOK} href={parts.href} title={parts.name}>
      {parts.children}
    </a>
  );
}
