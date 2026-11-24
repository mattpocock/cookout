import type { ReactNode } from "react";

const TEXT = { collapse: "Collapse sidebar", expand: "Expand sidebar" } as const;

const PANEL = [
  "M2 12C2 8.31087 2 6.4663 2.81382 5.15877C3.1149 4.67502 3.48891 4.25427 3.91891 3.91554C5.08116 3 6.72077 3 10 3H14C17.2792 3 18.9188 3 20.0811 3.91554C20.5111 4.25427 20.8851 4.67502 21.1862 5.15877C22 6.4663 22 8.31087 22 12C22 15.6891 22 17.5337 21.1862 18.8412C20.8851 19.325 20.5111 19.7457 20.0811 20.0845C18.9188 21 17.2792 21 14 21H10C6.72077 21 5.08116 21 3.91891 20.0845C3.48891 19.7457 3.1149 19.325 2.81382 18.8412C2 17.5337 2 15.6891 2 12Z",
  "M9.5 3L9.5 21",
  "M5 7H6M5 10H6",
] as const;

interface CollapseButtonParts {
  readonly collapsed: boolean;
  readonly onClick: () => void;
}

function labelOf(collapsed: boolean): string {
  if (collapsed) {
    return TEXT.expand;
  }
  return TEXT.collapse;
}

export function CollapseButton(parts: CollapseButtonParts): ReactNode {
  const handleClick = parts.onClick;
  return (
    <button
      aria-expanded={!parts.collapsed}
      aria-label={labelOf(parts.collapsed)}
      className="hidden size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-link focus-visible:outline-none md:inline-flex"
      onClick={handleClick}
      title={labelOf(parts.collapsed)}
      type="button"
    >
      <svg
        aria-hidden="true"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        viewBox="0 0 24 24"
      >
        {PANEL.map((path) => (
          <path d={path} key={path} />
        ))}
      </svg>
    </button>
  );
}
