import type { PaneHeaderParts } from "./parts.ts";
import { PaneLead } from "./pane-lead.ts";
import { PaneSearch } from "./pane-search.ts";
import type { ReactNode } from "react";
import { useContext } from "react";

function fontOf(sans: boolean): string {
  if (sans) {
    return "";
  }
  return "font-mono ";
}

export function PaneHeader(parts: PaneHeaderParts): ReactNode {
  const lead = useContext(PaneLead);
  const search = useContext(PaneSearch);
  return (
    <header className="flex h-10 shrink-0 items-center gap-2 px-3">
      {lead}
      <h1
        className={`${fontOf(parts.sans === true)}flex h-[26px] max-w-[280px] min-w-0 shrink-0 items-center truncate rounded-md bg-muted px-1.5 text-[13px] font-medium`}
      >
        {parts.title}
      </h1>
      {parts.description !== null && parts.description !== "" && (
        <p className="hidden min-w-0 truncate text-xs text-muted-foreground md:block">{parts.description}</p>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {search}
        {parts.children}
      </div>
    </header>
  );
}
