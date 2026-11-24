import { PaneLead, PaneSearch, WorkspaceMain } from "../../design-system/index.tsx";
import type { Board } from "../../board/index.ts";
import type { Identities } from "../../composer/index.ts";
import type { Keymap } from "../../keymap/index.ts";
import type { Layout } from "../../layout/index.ts";
import type { ReactNode } from "react";
import type { Search } from "../../search/web.ts";
import { SearchBox } from "./search-box.tsx";
import { SidebarExpand } from "./sidebar-expand.tsx";
import { useMemo } from "react";

interface SearchableMainProps {
  readonly board: Board;
  readonly identities: Identities;
  readonly keymap: Keymap;
  readonly layout: Layout;
  readonly search: Search;
  readonly children: ReactNode;
}

export function SearchableMain(props: SearchableMainProps): ReactNode {
  const { board, identities, keymap, layout, search } = props;
  const box = useMemo(
    () => <SearchBox board={board} identities={identities} keymap={keymap} search={search} />,
    [board, identities, keymap, search],
  );
  const expand = useMemo(() => <SidebarExpand layout={layout} />, [layout]);
  return (
    <PaneLead value={expand}>
      <PaneSearch value={box}>
        <WorkspaceMain>{props.children}</WorkspaceMain>
      </PaneSearch>
    </PaneLead>
  );
}
