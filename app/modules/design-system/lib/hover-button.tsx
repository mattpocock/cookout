import type { ButtonParts } from "./button-parts.ts";
import { PANEL_ACTION_LOOK } from "./panel-action-look.ts";
import type { ReactNode } from "react";

interface HoverButtonParts extends ButtonParts {
  readonly name: string;
}

export function HoverButton(parts: HoverButtonParts): ReactNode {
  const handleClick = parts.onClick;
  return (
    <button
      aria-label={parts.name}
      className={PANEL_ACTION_LOOK}
      onClick={handleClick}
      title={parts.name}
      type="button"
    >
      {parts.children}
    </button>
  );
}
