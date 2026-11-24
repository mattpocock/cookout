import type { ReactNode } from "react";

interface MenuIconFrameParts {
  readonly children: ReactNode;
}

export function MenuIconFrame(parts: MenuIconFrameParts): ReactNode {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
    >
      {parts.children}
    </svg>
  );
}
