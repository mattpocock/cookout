import { InputGroupAddon } from "./input-group-addon.tsx";
import type { ReactNode } from "react";
import { SearchIcon } from "./search-icon.tsx";

export function SearchAddon(): ReactNode {
  return (
    <InputGroupAddon>
      <SearchIcon />
    </InputGroupAddon>
  );
}
