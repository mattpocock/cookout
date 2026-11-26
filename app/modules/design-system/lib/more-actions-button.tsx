import type { MenuChoice, MoreActionsLook } from "./menu-parts.ts";
import { BOX_BUTTON } from "./box-button-style.ts";
import { DotsIcon } from "./dots-icon.tsx";
import type { ReactNode } from "react";
import { Trigger } from "@radix-ui/react-dropdown-menu";
import { useOffered } from "./use-offered.ts";

interface MoreActionsButtonParts {
  readonly label: string;
  readonly returning: boolean;
  readonly inTabOrder: boolean;
  readonly look: MoreActionsLook;
  readonly choices: readonly MenuChoice[];
}

const TAB_STOP = 0;
const OUT_OF_TAB_ORDER = -1;
const SHARED =
  "block bg-background text-muted-foreground shadow-sm hover:text-foreground focus-visible:text-foreground data-[returning=true]:visible";
const SIZE = { box: BOX_BUTTON, hover: "rounded-md border px-1.5 py-0.5" } as const;

function tabIndexOf(inTabOrder: boolean): number {
  if (inTabOrder) {
    return TAB_STOP;
  }
  return OUT_OF_TAB_ORDER;
}

export function MoreActionsButton(parts: MoreActionsButtonParts): ReactNode {
  const button = useOffered<HTMLButtonElement>({ choices: parts.choices, inForm: parts.look === "box" });
  return (
    <Trigger asChild>
      <button
        aria-label={parts.label}
        className={`${SIZE[parts.look]} ${SHARED}`}
        data-returning={String(parts.returning)}
        ref={button}
        tabIndex={tabIndexOf(parts.inTabOrder)}
        title={parts.label}
        type="button"
      >
        <DotsIcon />
      </button>
    </Trigger>
  );
}
