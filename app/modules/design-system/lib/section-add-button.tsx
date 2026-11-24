import { PlusIcon } from "./plus-icon.tsx";
import type { ReactNode } from "react";
import type { SectionAdd } from "./section-add.ts";
import { buttonLookOf } from "./button-paint.ts";

const LOOK = buttonLookOf({ size: "lg", variant: "ghost" });

interface SectionAddButtonParts {
  readonly add: SectionAdd;
}

export function SectionAddButton(parts: SectionAddButtonParts): ReactNode {
  const { add } = parts;
  const handleAdd = add.onAdd;
  return (
    <button aria-expanded={add.expanded} className={`-mr-2.5 ${LOOK}`} onClick={handleAdd} type="button">
      <PlusIcon />
      {add.label}
    </button>
  );
}
