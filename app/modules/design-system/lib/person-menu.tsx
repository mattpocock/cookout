import { useCallback, useRef } from "react";
import { ActionMenu } from "./action-menu.tsx";
import type { ActionMenuParts } from "./menu-parts.ts";
import type { ReactNode } from "react";
import { usePersonKeys } from "./use-person-keys.ts";
import { usePersonMenu } from "./use-person-menu.ts";

const UNKNOWN: Required<ActionMenuParts> = { buttonLabel: "", choices: [], label: "" };

interface PersonMenuParts {
  readonly name: string;
  readonly profileHref: string;
  readonly inline: boolean;
  readonly moreInTabOrder?: boolean;
  readonly children: ReactNode;
}

function shownOf(menu: Required<ActionMenuParts> | null): Required<ActionMenuParts> {
  if (menu === null) {
    return UNKNOWN;
  }
  return menu;
}

export function PersonMenu(parts: PersonMenuParts): ReactNode {
  const menu = usePersonMenu({ name: parts.name, profileHref: parts.profileHref });
  const person = useRef<HTMLSpanElement>(null);
  const within = useCallback(() => person.current, []);
  usePersonKeys({ person: menu, within });
  const shown = shownOf(menu);
  return (
    <span className="contents" ref={person}>
      <ActionMenu
        buttonLabel={shown.buttonLabel}
        choices={shown.choices}
        inline={parts.inline}
        label={shown.label}
        moreInTabOrder={parts.moreInTabOrder ?? true}
      >
        {parts.children}
      </ActionMenu>
    </span>
  );
}
