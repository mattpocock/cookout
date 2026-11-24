import { useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { buttonLookOf } from "./button-paint.ts";

interface SettingInputParts {
  readonly control: string;
  readonly value: string;
  readonly saving: boolean;
  readonly onEdit: (text: string) => void;
  readonly submit: string;
}

const SAVING = "Saving…";
const BUTTON = buttonLookOf({ size: "lg", variant: "secondary" });

export function SettingInput(parts: SettingInputParts): ReactNode {
  const { onEdit } = parts;
  const box = useRef<HTMLInputElement>(null);
  const handleChange = useCallback(() => {
    if (box.current !== null) {
      onEdit(box.current.value);
    }
  }, [onEdit]);
  return (
    <span className="flex shrink-0 items-center gap-2">
      <input
        autoComplete="off"
        className="h-7 w-56 min-w-0 rounded-lg border bg-surface px-2.5 text-[13px] text-foreground outline-none focus:border-muted-foreground"
        id={parts.control}
        onChange={handleChange}
        ref={box}
        spellCheck={false}
        type="text"
        value={parts.value}
      />
      <button className={`min-w-16 ${BUTTON}`} disabled={parts.saving} type="submit">
        {parts.saving && SAVING}
        {!parts.saving && parts.submit}
      </button>
    </span>
  );
}
