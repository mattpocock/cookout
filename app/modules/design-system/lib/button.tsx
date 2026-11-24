import type { ButtonParts } from "./button-parts.ts";
import type { ReactNode } from "react";
import { buttonLookOf } from "./button-paint.ts";

export function Button(parts: ButtonParts): ReactNode {
  const { onClick } = parts;
  return (
    <button className={`w-fit ${buttonLookOf(parts)}`} disabled={parts.disabled} onClick={onClick} type="button">
      {parts.children}
    </button>
  );
}
