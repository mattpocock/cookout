import type { ReactNode } from "react";

export function PlusIcon(): ReactNode {
  return (
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
      <path d="M12 4V20M20 12H4" />
    </svg>
  );
}
