import type { ReactNode } from "react";

interface ChevronIconParts {
  readonly folded: boolean;
}

function turnOf(folded: boolean): string {
  if (folded) {
    return "-rotate-90 opacity-100";
  }
  return "opacity-0 group-hover/sidebar:opacity-100";
}

export function ChevronIcon(parts: ChevronIconParts): ReactNode {
  return (
    <svg
      aria-hidden="true"
      className={`size-[13px] shrink-0 transition-[rotate,opacity] duration-200 ${turnOf(parts.folded)}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
    >
      <path d="M18 9.00005C18 9.00005 13.5811 15 12 15C10.4188 15 6 9 6 9" />
    </svg>
  );
}
