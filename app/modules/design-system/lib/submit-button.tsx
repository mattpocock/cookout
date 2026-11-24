import type { ButtonParts } from "./button-parts.ts";
import type { ReactNode } from "react";
import { buttonLookOf } from "./button-paint.ts";

const LOOK = buttonLookOf({ size: "lg", variant: "primary" });

export function SubmitButton(parts: Omit<ButtonParts, "onClick">): ReactNode {
  return (
    <button className={`w-fit ${LOOK}`} disabled={parts.disabled} type="submit">
      {parts.children}
    </button>
  );
}
