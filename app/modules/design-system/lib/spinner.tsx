import type { ReactNode } from "react";

export function Spinner(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5 animate-spin"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
    >
      <path d="M12 3V6" />
      <path d="M12 18V21" />
      <path d="M21 12L18 12" />
      <path d="M6 12L3 12" />
      <path d="M18.3635 5.63672L16.2422 7.75804" />
      <path d="M7.75804 16.2422L5.63672 18.3635" />
      <path d="M18.3635 18.3635L16.2422 16.2422" />
      <path d="M7.75804 7.75804L5.63672 5.63672" />
    </svg>
  );
}
