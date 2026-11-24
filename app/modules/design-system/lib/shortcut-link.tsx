import { ArrowUpRightIcon } from "./arrow-up-right-icon.tsx";
import { PANEL_ACTION_LOOK } from "./panel-action-look.ts";
import type { ReactNode } from "react";
import { Tooltip } from "./tooltip.tsx";
import { useMemo } from "react";

interface ShortcutLinkParts {
  readonly href: string;
  readonly label: string;
  readonly shortcut: string;
}

export function ShortcutLink(parts: ShortcutLinkParts): ReactNode {
  const { label, shortcut } = parts;
  const lines = useMemo(() => [`${label} (${shortcut})`], [label, shortcut]);
  return (
    <Tooltip lines={lines}>
      <a aria-keyshortcuts={parts.shortcut} aria-label={label} className={PANEL_ACTION_LOOK} href={parts.href}>
        <ArrowUpRightIcon />
      </a>
    </Tooltip>
  );
}
