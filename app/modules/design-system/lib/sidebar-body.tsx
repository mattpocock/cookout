import type { MouseEventHandler, ReactNode } from "react";
import { useCallback } from "react";

interface SidebarBodyParts {
  readonly children: ReactNode;
  readonly onFollow: () => void;
}

function isLink(target: EventTarget): boolean {
  return target instanceof Element && target.closest("a") !== null;
}

export function SidebarBody(parts: SidebarBodyParts): ReactNode {
  const { onFollow } = parts;
  const handleFollow = useCallback<MouseEventHandler>(
    (event) => {
      if (isLink(event.target)) {
        onFollow();
      }
    },
    [onFollow],
  );
  return (
    <div
      className="edge-fade flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pt-1 pb-3"
      onClickCapture={handleFollow}
    >
      {parts.children}
    </div>
  );
}
