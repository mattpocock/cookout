import { useCallback, useRef } from "react";
import type { InputGroupInputParts } from "./input-parts.ts";
import type { ReactNode } from "react";

const CONTROL =
  "min-w-0 flex-1 border-0 bg-transparent p-0 text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed";

function fontOf(mono: boolean): string {
  if (mono) {
    return "font-mono text-xs";
  }
  return "text-[13px]";
}

export function InputGroupInput(parts: InputGroupInputParts): ReactNode {
  const { onEdit } = parts;
  const box = useRef<HTMLInputElement>(null);
  const handleChange = useCallback(() => {
    if (box.current !== null && typeof onEdit === "function") {
      onEdit(box.current.value);
    }
  }, [onEdit]);
  return (
    <input
      aria-keyshortcuts={parts.keyshortcuts}
      aria-label={parts.label}
      autoComplete="off"
      className={`${CONTROL} ${fontOf(parts.mono ?? false)}`}
      defaultValue={parts.defaultValue}
      disabled={parts.disabled}
      onChange={handleChange}
      placeholder={parts.placeholder}
      ref={box}
      spellCheck={false}
      type={parts.type}
      value={parts.value}
    />
  );
}
