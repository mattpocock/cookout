import { useCallback, useId } from "react";
import type { ReactNode } from "react";
import type { TextAreaParts } from "./parts.ts";
import { comboboxOf } from "./combobox.ts";
import { useBoxKeys } from "./box-keys.ts";
import { useTypedCaret } from "./use-typed-caret.ts";

const ROWS = 1;

export function TextArea(parts: TextAreaParts): ReactNode {
  const { caret, choosing, focused, onClose, onEdit, onMove, onPick, value } = parts;
  const { focusRequests } = parts;
  const id = useId();
  const { box, handleEdit } = useTypedCaret({ caret, focusRequests, focused, onEdit, value });
  const handleSend = useCallback(() => {
    const element = box.current;
    if (element !== null && element.form !== null) {
      element.form.requestSubmit();
    }
  }, [box]);
  const handleKeyDown = useBoxKeys({ choosing, onClose, onMove, onPick, onSend: handleSend });
  const combobox = comboboxOf({ choosing, highlighted: parts.highlighted, list: parts.list });
  return (
    <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
      <label htmlFor={id}>{parts.label}</label>
      <textarea
        aria-activedescendant={combobox.activeOption}
        aria-autocomplete={combobox.autocomplete}
        aria-controls={combobox.list}
        aria-expanded={combobox.expanded}
        className="rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-muted-foreground"
        id={id}
        name={parts.name}
        onChange={handleEdit}
        onKeyDown={handleKeyDown}
        onSelect={handleEdit}
        placeholder={parts.placeholder}
        ref={box}
        role={combobox.role}
        rows={ROWS}
        value={value}
      />
    </div>
  );
}
