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
      className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground"
      onClick={onClick}
      title={parts.label}
      type="button"
    >
      <PlusIcon />
    </button>
  );
}
