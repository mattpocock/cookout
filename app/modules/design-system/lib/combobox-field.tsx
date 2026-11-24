import { InputGroup } from "./input-group.tsx";
import { InputGroupAddon } from "./input-group-addon.tsx";
import type { ReactNode } from "react";
import { SearchIcon } from "./search-icon.tsx";
import { optionIdOf } from "./option-id.ts";

interface ComboboxFieldParts {
  readonly label: string;
  readonly placeholder: string;
  readonly keys: string;
  readonly list: string;
  readonly box: string;
  readonly expanded: boolean;
  readonly active: number | null;
  readonly defaultValue: string;
}

interface Active {
  readonly option?: string;
}

function activeOf({ active, expanded, list }: ComboboxFieldParts): Active {
  if (!expanded || active === null) {
    return {};
  }
  return { option: optionIdOf({ index: active, list }) };
}

export function ComboboxField(parts: ComboboxFieldParts): ReactNode {
  const active = activeOf(parts);
  return (
    <InputGroup size="md">
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <input
        aria-activedescendant={active.option}
        aria-autocomplete="list"
        aria-controls={parts.list}
        aria-expanded={parts.expanded}
        aria-keyshortcuts={parts.keys}
        aria-label={parts.label}
        autoComplete="off"
        className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
        defaultValue={parts.defaultValue}
        id={parts.box}
        placeholder={parts.placeholder}
        role="combobox"
        spellCheck={false}
        type="search"
      />
    </InputGroup>
  );
}
