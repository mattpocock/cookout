import { PANEL_ACTION_LOOK } from "./panel-action-look.ts";
import type { ReactNode } from "react";

interface CloseLinkParts {
  readonly href: string;
  readonly label: string;
}

export function CloseLink(parts: CloseLinkParts): ReactNode {
  return (
    <a aria-label={parts.label} className={PANEL_ACTION_LOOK} href={parts.href}>
      <svg
        aria-hidden="true"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        viewBox="0 0 24 24"
      >
        <path d="M18.9991 19L5 5.00098" />
        <path d="M19 5L5.00092 18.999" />
      </svg>
    </a>
  );
}
