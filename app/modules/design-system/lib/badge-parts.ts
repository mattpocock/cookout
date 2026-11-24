import type { ReactNode } from "react";

type BadgeVariant = "secondary" | "primary" | "outline" | "ghost";

type BadgeTone = "neutral" | "muted" | "faint" | "mention" | "destructive";

type BadgeSize = "sm" | "md";

interface BadgeParts {
  readonly children: ReactNode;
  readonly variant?: BadgeVariant | undefined;
  readonly tone?: BadgeTone | undefined;
  readonly size?: BadgeSize | undefined;
  readonly rounded?: boolean | undefined;
}

interface CountBadgeParts {
  readonly count: number;
  readonly label: string;
  readonly tone: "loud" | "quiet" | "unseen";
  readonly size?: BadgeSize | undefined;
}

interface StatusDotParts {
  readonly mode: "for-you" | "activity";
}

export type { BadgeParts, BadgeSize, BadgeTone, BadgeVariant, CountBadgeParts, StatusDotParts };
