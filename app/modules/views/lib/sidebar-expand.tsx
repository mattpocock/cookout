import { CollapseButton } from "../../design-system/index.tsx";
import type { Layout } from "../../layout/index.ts";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

interface SidebarExpandProps {
  readonly layout: Layout;
}

export function SidebarExpand(props: SidebarExpandProps): ReactNode {
  const { layout } = props;
  const { collapsed } = useSyncExternalStore(layout.subscribe, layout.snapshot);
  const handleExpand = layout.toggleCollapsed;
  if (!collapsed) {
    return null;
  }
  return <CollapseButton collapsed onClick={handleExpand} />;
}
