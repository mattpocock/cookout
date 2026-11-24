import type { ChipParts } from "./parts.ts";
import type { ReactNode } from "react";

function chipStyle(pressed: boolean): string {
  if (pressed) {
    return "bg-accent text-foreground";
  }
  return "text-muted-foreground hover:bg-hover hover:text-foreground";
}

export function Chip(parts: ChipParts): ReactNode {
  const { onClick } = parts;
  return (
    <button
      aria-pressed={parts.pressed}
      className={`flex h-6 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors ${chipStyle(parts.pressed)}`}
      onClick={onClick}
      type="button"
    >
      {parts.children}
    </button>
  );
}
