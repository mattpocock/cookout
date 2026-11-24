import type { CSSProperties, ReactNode } from "react";
import { CollapseButton } from "./collapse-button.tsx";
import { PanelEdge } from "./panel-edge.tsx";
import type { SidebarParts } from "./parts.ts";

function openStyle(open: boolean): string {
  if (open) {
    return "fixed top-12 bottom-0 left-0 z-30 flex shadow-xl md:relative md:shadow-none";
  }
  return "relative hidden md:flex";
}

function widthOf(width: number): CSSProperties {
  const style: Readonly<Record<string, string>> = { "--sidebar-width": `${String(width)}px` };
  return style;
}

export function Sidebar(parts: SidebarParts): ReactNode {
  const handleToggle = parts.onToggleCollapsed;
  const handleFollowHome = parts.onFollowHome;
  if (parts.collapsed && !parts.open) {
    return null;
  }
  return (
    <nav
      aria-label={parts.label}
      className={`group/sidebar w-64 shrink-0 md:w-(--sidebar-width) flex-col border-r bg-card ${openStyle(parts.open)}`}
      style={widthOf(parts.edge.width)}
    >
      <PanelEdge edge={parts.edge} />
      <div className="flex h-10 shrink-0 items-center gap-1.5 pr-4 pl-2.5">
        <CollapseButton collapsed={false} onClick={handleToggle} />
        <a
          className="rounded font-mono text-sm font-semibold tracking-tight hover:text-muted-foreground"
          href={parts.home}
          onClick={handleFollowHome}
        >
          {parts.title}
        </a>
      </div>
      {parts.children}
    </nav>
  );
}
