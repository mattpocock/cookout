import { FoldButton } from "./fold-button.tsx";
import type { ReactNode } from "react";

interface NavHeadingParts {
  readonly label: string;
  readonly folded: boolean;
  readonly onToggleFolded: () => void;
  readonly children?: ReactNode;
}

export function NavHeading(parts: NavHeadingParts): ReactNode {
  const handleToggle = parts.onToggleFolded;
  return (
    <div className="flex min-h-[30px] items-center justify-between gap-1.5 pt-4 pr-1 pb-0.5">
      <h2 className="min-w-0 flex-1">
        <FoldButton folded={parts.folded} label={parts.label} onToggle={handleToggle} />
      </h2>
      {parts.children}
    </div>
  );
}
