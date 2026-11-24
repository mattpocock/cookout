import type { ReactNode } from "react";

interface FeedTextParts {
  readonly children: ReactNode;
  readonly unread: boolean;
}

function colourOf(unread: boolean): string {
  if (unread) {
    return "text-foreground";
  }
  return "text-muted-foreground";
}

export function FeedText(parts: FeedTextParts): ReactNode {
  return (
    <span
      className={`-mx-1 mt-1 line-clamp-2 px-1 py-0.5 text-sm leading-relaxed whitespace-pre-wrap ${colourOf(parts.unread)}`}
    >
      {parts.children}
    </span>
  );
}
