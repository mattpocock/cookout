import type { ReactNode } from "react";

interface FeedNoticeTitleParts {
  readonly name: string;
  readonly href: string;
  readonly displayName: string | null;
  readonly note: string | null;
  readonly bold: boolean;
  readonly time: string;
}

function weightOf(bold: boolean): string {
  if (bold) {
    return "font-semibold";
  }
  return "font-medium";
}

export function FeedNoticeTitle(parts: FeedNoticeTitleParts): ReactNode {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5 text-[13px] whitespace-nowrap">
      <a className={`min-w-0 truncate hover:underline ${weightOf(parts.bold)}`} href={parts.href}>
        {parts.displayName ?? parts.name}
      </a>
      {parts.displayName !== null && <span className="text-xs text-muted-foreground">{`@${parts.name}`}</span>}
      {parts.note !== null && <span className="text-xs text-muted-foreground">{parts.note}</span>}
      <span className="absolute top-3.5 right-3 shrink-0 text-xs text-muted-foreground tabular-nums">{parts.time}</span>
    </span>
  );
}
