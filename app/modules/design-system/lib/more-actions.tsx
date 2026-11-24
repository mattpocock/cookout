import { Portal, Root } from "@radix-ui/react-dropdown-menu";
import type { MenuChoice } from "./menu-parts.ts";
import { MoreActionsButton } from "./more-actions-button.tsx";
import { MoreActionsContent } from "./more-actions-content.tsx";
import type { ReactNode } from "react";

interface MoreActionsParts {
  readonly choices: readonly MenuChoice[];
  readonly label: string;
  readonly quiet?: boolean;
}

export function MoreActions(parts: MoreActionsParts): ReactNode {
  return (
    <Root>
      <MoreActionsButton label={parts.label} quiet={parts.quiet ?? false} />
      <Portal>
        <MoreActionsContent choices={parts.choices} />
      </Portal>
    </Root>
  );
}
