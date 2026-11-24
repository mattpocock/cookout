import type { MenuIcon } from "./menu-icons.ts";
import { PANEL_ACTION_LOOK } from "./panel-action-look.ts";
import type { ReactNode } from "react";
import { Tooltip } from "./tooltip.tsx";
import { menuIcon } from "./menu-icons.ts";
import { useMemo } from "react";

interface PanelAction {
  readonly label: string;
  readonly name?: string;
  readonly icon: MenuIcon;
  readonly shortcut?: string;
  readonly onAction: () => void;
}

function linesOf(label: string, shortcut: string | null): readonly string[] {
  if (shortcut === null) {
    return [label];
  }
  return [`${label} (${shortcut})`];
}

interface PanelActionButtonParts {
  readonly action: PanelAction;
}

export function PanelActionButton(parts: PanelActionButtonParts): ReactNode {
  const { label, onAction: handleClick, shortcut = null } = parts.action;
  const lines = useMemo(() => linesOf(label, shortcut), [label, shortcut]);
  return (
    <Tooltip lines={lines}>
      <button
        aria-keyshortcuts={parts.action.shortcut}
        aria-label={parts.action.name ?? label}
        className={PANEL_ACTION_LOOK}
        onClick={handleClick}
        type="button"
      >
        {menuIcon(parts.action.icon)}
      </button>
    </Tooltip>
  );
}

export type { PanelAction };
