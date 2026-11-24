import { InputGroup, InputGroupAddon, InputGroupInput, SearchIcon } from "../../design-system/index.tsx";
import type { ReactNode } from "react";

const TEXT = { label: "Search", placeholder: "Search (Ctrl+K)" } as const;

interface SearchFieldProps {
  readonly query: string;
}

export function SearchField(props: SearchFieldProps): ReactNode {
  return (
    <InputGroup size="md">
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput defaultValue={props.query} label={TEXT.label} placeholder={TEXT.placeholder} type="search" />
    </InputGroup>
  );
}
