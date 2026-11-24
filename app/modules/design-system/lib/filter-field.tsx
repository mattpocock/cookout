import type { FilterFieldParts } from "./parts.ts";
import { InputGroup } from "./input-group.tsx";
import { InputGroupInput } from "./input-group-input.tsx";
import type { ReactNode } from "react";
import { SearchAddon } from "./search-addon.tsx";

export function FilterField(parts: FilterFieldParts): ReactNode {
  const handleEdit = parts.onEdit;
  return (
    <div className="w-60 max-w-full">
      <InputGroup size="lg">
        <SearchAddon />
        <InputGroupInput
          label={parts.label}
          onEdit={handleEdit}
          placeholder={`${parts.label}…`}
          type="text"
          value={parts.value}
        />
      </InputGroup>
    </div>
  );
}
