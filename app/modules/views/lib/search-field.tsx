import { InputGroup, InputGroupAddon, InputGroupInput, SearchIcon } from "../../design-system/index.tsx";
import type { Keymap } from "../../keymap/index.ts";
import type { ReactNode } from "react";

const TEXT = { label: "Search", placeholder: "Search" } as const;

interface SearchFieldProps {
  readonly query: string;
  readonly shortcut: ReturnType<Keymap["shortcutOf"]>;
}

export function SearchField(props: SearchFieldProps): ReactNode {
  return (
    <InputGroup size="md">
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        defaultValue={props.query}
        keyshortcuts={props.shortcut.keys}
        label={TEXT.label}
        placeholder={`${TEXT.placeholder} (${props.shortcut.label})`}
        type="search"
      />
    </InputGroup>
  );
}
