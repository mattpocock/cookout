import type { ReactNode } from "react";

interface ResultListParts {
  readonly list: string;
  readonly label: string;
  readonly children: ReactNode;
}

export function ResultList(parts: ResultListParts): ReactNode {
  return (
    <div aria-label={parts.label} className="flex flex-col gap-1" id={parts.list} role="listbox">
      {parts.children}
    </div>
  );
}
