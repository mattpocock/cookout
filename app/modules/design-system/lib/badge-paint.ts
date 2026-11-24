import type { BadgeParts, BadgeSize, BadgeTone, BadgeVariant } from "./badge-parts.ts";

const INK: Readonly<Record<BadgeTone, string>> = {
  destructive: "text-destructive",
  faint: "text-muted-foreground/70",
  mention: "text-mention-fg",
  muted: "text-muted-foreground",
  neutral: "text-foreground",
};

const SOFT: Readonly<Record<BadgeTone, string>> = {
  destructive: "bg-destructive/10",
  faint: "bg-muted",
  mention: "bg-mention-bg",
  muted: "bg-muted",
  neutral: "bg-muted",
};

const FILL: Readonly<Record<BadgeTone, string>> = {
  destructive: "bg-destructive text-background",
  faint: "bg-foreground text-background",
  mention: "bg-mention-bar text-mention-ink",
  muted: "bg-foreground text-background",
  neutral: "bg-foreground text-background",
};

const RING: Readonly<Record<BadgeTone, string>> = {
  destructive: "shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-destructive)_32%,transparent)]",
  faint: "shadow-[inset_0_0_0_1px_var(--color-border)]",
  mention: "shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-mention-bar)_32%,transparent)]",
  muted: "shadow-[inset_0_0_0_1px_var(--color-border)]",
  neutral: "shadow-[inset_0_0_0_1px_var(--color-border)]",
};

const GHOST_INK: Readonly<Record<BadgeTone, string>> = { ...INK, neutral: INK.muted };

const PADDING: Readonly<Record<"square" | "round", Readonly<Record<BadgeSize, string>>>> = {
  round: { md: "rounded-full px-1.5 py-px", sm: "rounded-full px-2 py-0.5" },
  square: { md: "rounded-sm px-1 py-0.5", sm: "rounded-sm px-1 py-0" },
};

function paintOf(variant: BadgeVariant, tone: BadgeTone): string {
  if (variant === "primary") {
    return FILL[tone];
  }
  if (variant === "outline") {
    return `${RING[tone]} ${INK[tone]}`;
  }
  if (variant === "ghost") {
    return GHOST_INK[tone];
  }
  return `${SOFT[tone]} ${INK[tone]}`;
}

function paddingOf(size: BadgeSize, rounded: boolean): string {
  if (rounded) {
    return PADDING.round[size];
  }
  return PADDING.square[size];
}

function badgeLookOf(parts: BadgeParts): string {
  const padding = paddingOf(parts.size ?? "md", parts.rounded ?? false);
  return `${padding} ${paintOf(parts.variant ?? "secondary", parts.tone ?? "neutral")}`;
}

export { badgeLookOf };
