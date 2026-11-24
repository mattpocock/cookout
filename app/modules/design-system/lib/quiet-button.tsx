import type { ButtonParts } from "./button-parts.ts";
import type { ReactNode } from "react";
import { buttonLookOf } from "./button-paint.ts";

const LOOK = buttonLookOf({ tone: "secondary", variant: "outline" });

export function QuietButton(parts: ButtonParts): ReactNode {
  const { onClick } = parts;
  return (
    <div className="flex flex-col items-center gap-2 pt-4">
      <button className={LOOK} disabled={parts.disabled} onClick={onClick} type="button">
        {parts.children}
      </button>
    </div>
  );
}
