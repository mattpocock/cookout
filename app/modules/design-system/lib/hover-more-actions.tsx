import type { MenuChoice } from "./menu-parts.ts";
import { MoreActions } from "./more-actions.tsx";
import type { ReactNode } from "react";

const BLOCK =
  "invisible absolute top-1/2 right-3 -translate-y-1/2 group-focus-within/actions:visible group-hover/actions:visible has-data-[state=open]:visible";

const INLINE =
  "invisible absolute top-1/2 right-full z-10 mr-1 -translate-y-1/2 group-focus-within/inline-actions:visible group-hover/inline-actions:visible has-data-[state=open]:visible";

const QUIET =
  "invisible absolute top-1/2 right-1.5 -translate-y-1/2 group-focus-within/actions:visible group-hover/actions:visible has-data-[state=open]:visible";

interface HoverMoreActionsParts {
  readonly choices: readonly MenuChoice[];
  readonly inline: boolean;
  readonly label: string;
  readonly quiet: boolean;
}

function placeOf(parts: HoverMoreActionsParts): string {
  if (parts.inline) {
    return INLINE;
  }
  if (parts.quiet) {
    return QUIET;
  }
  return BLOCK;
}

export function HoverMoreActions(parts: HoverMoreActionsParts): ReactNode {
  return (
    <span className={placeOf(parts)}>
      <MoreActions choices={parts.choices} label={parts.label} quiet={parts.quiet} />
    </span>
  );
}
