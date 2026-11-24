import type { ButtonParts } from "./button-parts.ts";
import type { ReactNode } from "react";
import { buttonLookOf } from "./button-paint.ts";

const LOOK = buttonLookOf({ tone: "secondary", variant: "outline" });

export function RowButton(parts: ButtonParts): ReactNode {
  const { onClick } = parts;
  return (
    <span className="relative z-10 mt-2 flex">
      <button className={LOOK} disabled={parts.disabled} onClick={onClick} type="button">
        {parts.children}
      </button>
    </span>
  );
}
