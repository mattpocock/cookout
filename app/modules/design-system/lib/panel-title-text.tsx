import { PanelTitled } from "./panel-titled.tsx";
import type { ReactNode } from "react";

const FOCUSABLE = 0;
const NOT_TABBABLE = -1;

interface PanelTitleTextParts {
  readonly label: string;
  readonly detail: string;
  readonly title: string | null;
  readonly focusable: boolean;
}

function tabIndexOf(focusable: boolean): number {
  if (focusable) {
    return FOCUSABLE;
  }
  return NOT_TABBABLE;
}

export function PanelTitleText(parts: PanelTitleTextParts): ReactNode {
  if (parts.title !== null) {
    return <PanelTitled detail={parts.detail} tabIndex={tabIndexOf(parts.focusable)} title={parts.title} />;
  }
  return (
    <div className="flex flex-1 items-baseline gap-2">
      <h2 className="rounded-sm text-sm font-semibold" tabIndex={tabIndexOf(parts.focusable)}>
        {parts.label}
      </h2>
      <span className="flex-1 font-mono text-xs text-muted-foreground">{parts.detail}</span>
    </div>
  );
}
