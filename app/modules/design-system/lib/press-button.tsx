import type { PressButtonParts } from "./parts.ts";
import type { ReactNode } from "react";
import { buttonLookOf } from "./button-paint.ts";

const LOOKS = {
  off: buttonLookOf({ variant: "outline" }),
  on: buttonLookOf({ variant: "secondary" }),
} as const;

function pressStyle(pressed: boolean): string {
  if (pressed) {
    return LOOKS.on;
  }
  return LOOKS.off;
}

export function PressButton(parts: PressButtonParts): ReactNode {
  const { onClick } = parts;
  return (
    <button
      aria-pressed={parts.pressed}
      className={pressStyle(parts.pressed)}
      disabled={parts.disabled}
      onClick={onClick}
      type="button"
    >
      {parts.children}
    </button>
  );
}
