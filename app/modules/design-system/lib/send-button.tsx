import type { ReactNode } from "react";

interface SendButtonParts {
  readonly label: string;
  readonly disabled: boolean;
}

export function SendButton(parts: SendButtonParts): ReactNode {
  return (
    <button
      aria-label={parts.label}
      className="grid size-7 shrink-0 place-items-center rounded-full bg-foreground text-background transition-opacity outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-link focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:bg-muted disabled:text-muted-foreground disabled:hover:opacity-100"
      disabled={parts.disabled}
      title={parts.label}
      type="submit"
    >
      <svg
        aria-hidden="true"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path d="M12 5.5V19" />
        <path d="M18 11C18 11 13.5811 5.00001 12 5C10.4188 4.99999 6 11 6 11" />
      </svg>
    </button>
  );
}
