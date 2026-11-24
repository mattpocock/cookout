import { PlusIcon } from "./plus-icon.tsx";
import type { ReactNode } from "react";

interface HeadingButtonParts {
  readonly label: string;
  readonly expanded: boolean;
  readonly onClick: () => void;
}

export function HeadingButton(parts: HeadingButtonParts): ReactNode {
  const { onClick } = parts;
  return (
    <button
      aria-expanded={parts.expanded}
      aria-label={parts.label}
      className="flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity duration-100 group-hover/sidebar:opacity-100 hover:bg-hover hover:text-foreground focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100"
      onClick={onClick}
      title={parts.label}
      type="button"
    >
      <PlusIcon />
    </button>
  );
}
