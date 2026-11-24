import type { ListParts } from "./parts.ts";
import type { ReactNode } from "react";

export function ActionGroup(parts: ListParts): ReactNode {
  return (
    <fieldset aria-label={parts.label} className="flex min-w-0 flex-col gap-4">
      {parts.children}
    </fieldset>
  );
}
