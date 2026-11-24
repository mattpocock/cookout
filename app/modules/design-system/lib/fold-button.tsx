import { ChevronIcon } from "./chevron-icon.tsx";
import type { ReactNode } from "react";

interface FoldButtonParts {
  readonly label: string;
  readonly folded: boolean;
  readonly onToggle: () => void;
}

export function FoldButton(parts: FoldButtonParts): ReactNode {
  const handleToggle = parts.onToggle;
  return (
    <button
      aria-expanded={!parts.folded}
      className="flex w-full min-w-0 cursor-pointer items-center gap-1 rounded-lg py-1 pl-[9px] text-left text-[13px] leading-[18px] text-muted-foreground hover:text-foreground focus-visible:ring-1 focus-visible:ring-link focus-visible:outline-none focus-visible:ring-inset"
      onClick={handleToggle}
      type="button"
    >
      <span className="truncate">{parts.label}</span>
      <ChevronIcon folded={parts.folded} />
    </button>
  );
}
