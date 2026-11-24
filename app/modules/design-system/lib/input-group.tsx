import type { InputGroupParts, InputSize, InputVariant } from "./input-parts.ts";
import type { ReactNode } from "react";

const SHAPE =
  "group/input-group relative flex w-full min-w-0 items-center border text-[13px] text-foreground antialiased transition-[color,background-color,border-color] duration-150 has-[[aria-invalid=true]]:border-destructive";

const VARIANTS: Readonly<Record<InputVariant, string>> = {
  default: "border-border bg-surface focus-within:border-muted-foreground",
  elevated: "border-border bg-card focus-within:border-muted-foreground",
  ghost: "border-transparent bg-transparent focus-within:bg-hover hover:bg-hover",
  unfilled: "h-auto! gap-0.5! border-0 bg-transparent p-0!",
};

const SIZES: Readonly<Record<InputSize, string>> = {
  lg: "h-7 gap-1.5 rounded-lg px-2 py-1 [&_svg]:size-3.5",
  md: "h-6 gap-1 rounded-md px-[5px] py-1 [&_svg]:size-3",
  xl: "h-8 gap-2 rounded-lg px-2 py-1.5 [&_svg]:size-4",
};

function lookOf(parts: InputGroupParts): string {
  const look = `${VARIANTS[parts.variant ?? "default"]} ${SIZES[parts.size ?? "lg"]}`;
  if (parts.disabled === true) {
    return `${look} cursor-not-allowed opacity-50`;
  }
  if (parts.rounded === true) {
    return `${look} rounded-full`;
  }
  return look;
}

export function InputGroup(parts: InputGroupParts): ReactNode {
  return <div className={`${SHAPE} ${lookOf(parts)}`}>{parts.children}</div>;
}
