import type { ReactNode } from "react";

interface NavHeadingParts {
  readonly label: string;
  readonly children?: ReactNode;
}

export function NavHeading(parts: NavHeadingParts): ReactNode {
  return (
    <div className="flex min-h-[30px] items-center justify-between gap-1.5 pt-4 pr-1 pb-0.5 pl-[9px]">
      <h2 className="truncate text-[13px] leading-[18px] text-muted-foreground">{parts.label}</h2>
      <div className="flex items-center opacity-0 transition-opacity duration-100 group-hover/sidebar:opacity-100 focus-within:opacity-100 has-aria-expanded:opacity-100 pointer-coarse:opacity-100">
        {parts.children}
      </div>
    </div>
  );
}
