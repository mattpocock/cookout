import type { ReactNode } from "react";

interface BackLinkParts {
  readonly href: string;
  readonly label: string;
}

export function BackLink(parts: BackLinkParts): ReactNode {
  return (
    <a
      aria-label={parts.label}
      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
      href={parts.href}
    >
      <svg
        aria-hidden="true"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        viewBox="0 0 24 24"
      >
        <path d="M5.5 12.002H19" />
        <path d="M10.9999 18.002C10.9999 18.002 4.99998 13.583 4.99997 12.0019C4.99996 10.4208 11 6.00195 11 6.00195" />
      </svg>
    </a>
  );
}
