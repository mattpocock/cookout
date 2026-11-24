import type { Parts } from "./parts.ts";
import type { ReactNode } from "react";

export function InputGroupAddon(parts: Parts): ReactNode {
  return (
    <span className="flex shrink-0 items-center text-muted-foreground [&_svg]:pointer-events-none">
      {parts.children}
    </span>
  );
}
