import { Close } from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { RemoveIcon } from "./remove-icon.tsx";

interface ListDialogCloseParts {
  readonly label: string;
}

export function ListDialogClose(parts: ListDialogCloseParts): ReactNode {
  return (
    <Close asChild>
      <button
        aria-label={parts.label}
        className="absolute top-4 right-4 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        title={parts.label}
        type="button"
      >
        <RemoveIcon />
      </button>
    </Close>
  );
}
