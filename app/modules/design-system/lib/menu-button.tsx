import type { ReactNode } from "react";

const TEXT = { close: "Close the sidebar", open: "Open the sidebar" } as const;

interface MenuButtonParts {
  readonly open: boolean;
  readonly onClick: () => void;
}

function labelOf(open: boolean): string {
  if (open) {
    return TEXT.close;
  }
  return TEXT.open;
}

export function MenuButton(parts: MenuButtonParts): ReactNode {
  const handleClick = parts.onClick;
  return (
    <button
      aria-expanded={parts.open}
      aria-label={labelOf(parts.open)}
      className="relative z-40 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      onClick={handleClick}
      type="button"
    >
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        viewBox="0 0 24 24"
      >
        <path d="M4 5L20 5" />
        <path d="M4 12L20 12" />
        <path d="M4 19L20 19" />
      </svg>
    </button>
  );
}
