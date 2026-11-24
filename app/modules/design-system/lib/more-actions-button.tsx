import { DotsIcon } from "./dots-icon.tsx";
import { PANEL_ACTION_LOOK } from "./panel-action-look.ts";
import type { ReactNode } from "react";
import { Trigger } from "@radix-ui/react-dropdown-menu";

interface MoreActionsButtonParts {
  readonly label: string;
  readonly quiet: boolean;
  readonly returning: boolean;
}

const LOOKS = {
  quiet:
    "flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground focus-visible:text-foreground data-[state=open]:bg-hover data-[state=open]:text-foreground data-[returning=true]:visible",
  raised: `${PANEL_ACTION_LOOK} data-[state=open]:bg-hover data-[state=open]:text-foreground data-[returning=true]:visible`,
} as const;

function lookOf(parts: MoreActionsButtonParts): string {
  if (parts.quiet) {
    return LOOKS.quiet;
  }
  return LOOKS.raised;
}

export function MoreActionsButton(parts: MoreActionsButtonParts): ReactNode {
  return (
    <Trigger asChild>
      <button
        aria-label={parts.label}
        className={lookOf(parts)}
        data-returning={String(parts.returning)}
        title={parts.label}
        type="button"
      >
        <DotsIcon />
      </button>
    </Trigger>
  );
}
