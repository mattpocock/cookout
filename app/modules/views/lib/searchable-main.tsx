import { PaneLead, PaneSearch, WorkspaceMain } from "../../design-system/index.tsx";
import type { Layout } from "../../layout/index.ts";
import type { ReactNode } from "react";
import type { Search } from "../../search/web.ts";
import { SearchBox } from "./search-box.tsx";
import { SidebarExpand } from "./sidebar-expand.tsx";
import { useMemo } from "react";

interface SearchableMainProps {
  readonly layout: Layout;
  readonly search: Search;
  readonly children: ReactNode;
}

export function SearchableMain(props: SearchableMainProps): ReactNode {
  const { layout, search } = props;
  const box = useMemo(() => <SearchBox search={search} />, [search]);
  const expand = useMemo(() => <SidebarExpand layout={layout} />, [layout]);
  return (
    <PaneLead value={expand}>
      <PaneSearch value={box}>
        <WorkspaceMain>{props.children}</WorkspaceMain>
      </PaneSearch>
    </PaneLead>
  );
}
