import type { BadgeParts } from "./badge-parts.ts";
import type { ReactNode } from "react";
import { badgeLookOf } from "./badge-paint.ts";

const SHAPE =
  "inline-flex w-fit shrink-0 items-center gap-1 text-xs leading-4 whitespace-nowrap antialiased [&_svg]:pointer-events-none [&_svg]:size-3 [&_svg]:shrink-0";

export function Badge(parts: BadgeParts): ReactNode {
  return <span className={`${SHAPE} ${badgeLookOf(parts)}`}>{parts.children}</span>;
}
