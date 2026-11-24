import type { ReactNode } from "react";

interface ResultGroupParts {
  readonly label: string;
  readonly children: ReactNode;
}

export function ResultGroup(parts: ResultGroupParts): ReactNode {
  return (
    <div aria-label={parts.label} className="flex flex-col" role="group">
      <div aria-hidden className="px-3 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">
        {parts.label}
      </div>
      {parts.children}
    </div>
  );
}
