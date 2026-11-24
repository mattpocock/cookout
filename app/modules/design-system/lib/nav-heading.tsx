import type { ReactNode } from "react";

interface NavHeadingParts {
  readonly label: string;
  readonly children?: ReactNode;
}

export function NavHeading(parts: NavHeadingParts): ReactNode {
  return (
    <div className="flex min-h-[30px] items-center justify-between gap-1.5 pt-4 pr-1 pb-0.5 pl-[9px]">
      <h2 className="truncate text-[13px] leading-[18px] text-muted-foreground">{parts.label}</h2>
      {parts.children}
    </div>
  );
}
