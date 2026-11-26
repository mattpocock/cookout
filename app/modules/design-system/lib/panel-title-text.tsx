import type { MenuChoice } from "./menu-parts.ts";
import type { ReactNode } from "react";
import { useOffered } from "./use-offered.ts";

const FOCUSABLE = 0;
const NOT_TABBABLE = -1;

interface PanelTitleTextParts {
  readonly label: string;
  readonly detail: string;
  readonly focusable: boolean;
  readonly choices: readonly MenuChoice[];
}

function tabIndexOf(focusable: boolean): number {
  if (focusable) {
    return FOCUSABLE;
  }
  return NOT_TABBABLE;
}

export function PanelTitleText(parts: PanelTitleTextParts): ReactNode {
  const title = useOffered<HTMLHeadingElement>({ choices: parts.choices, inForm: false });
  return (
    <div className="flex flex-1 items-baseline gap-2">
      <h2 className="rounded-sm text-sm font-semibold" ref={title} tabIndex={tabIndexOf(parts.focusable)}>
        {parts.label}
      </h2>
      <span className="flex-1 font-mono text-xs text-muted-foreground">{parts.detail}</span>
    </div>
  );
}
