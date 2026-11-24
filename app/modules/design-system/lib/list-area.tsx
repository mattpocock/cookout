import type { ListParts } from "./parts.ts";
import type { ReactNode } from "react";

export function ListArea(parts: ListParts): ReactNode {
  return (
    <section aria-label={parts.label} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
      {parts.children}
    </section>
  );
}
