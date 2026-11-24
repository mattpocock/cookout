import type { ButtonLook, ButtonSize, ButtonTone, ButtonVariant } from "./button-parts.ts";

const SHAPE =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center border text-[13px] leading-[18px] whitespace-nowrap transition-[color,background-color,transform] duration-100 select-none enabled:active:scale-[.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link disabled:cursor-not-allowed disabled:text-muted-foreground/50 [&_svg]:pointer-events-none [&_svg]:shrink-0";

const MONO_FILL = "border-transparent bg-foreground font-medium text-background enabled:hover:bg-foreground/85";

const SOFT_FILL = "border-transparent bg-muted text-foreground enabled:hover:bg-border";

const PRIMARY: Readonly<Record<ButtonTone, string>> = {
  danger: "border-transparent bg-destructive font-medium text-background enabled:hover:bg-destructive/90",
  default: MONO_FILL,
  monochrome: MONO_FILL,
  secondary: MONO_FILL,
  tertiary: MONO_FILL,
};

const SECONDARY: Readonly<Record<ButtonTone, string>> = {
  danger: "border-transparent bg-destructive/10 text-destructive enabled:hover:bg-destructive/20",
  default: SOFT_FILL,
  monochrome: SOFT_FILL,
  secondary: SOFT_FILL,
  tertiary: SOFT_FILL,
};

const UNFILLED: Readonly<Record<"outline" | "ghost" | "text", string>> = {
  ghost: "border-transparent enabled:hover:bg-muted",
  outline: "border-border enabled:hover:bg-muted",
  text: "border-transparent",
};

const INK: Readonly<Record<ButtonTone, string>> = {
  danger: "text-destructive",
  default: "text-muted-foreground enabled:hover:text-foreground",
  monochrome: "text-foreground",
  secondary: "text-muted-foreground enabled:hover:text-foreground",
  tertiary: "text-muted-foreground/70 enabled:hover:text-muted-foreground",
};

const DANGER: Readonly<Record<"outline" | "ghost" | "text", string>> = {
  ghost: "enabled:hover:bg-destructive/10",
  outline: "border-destructive/30 enabled:hover:bg-destructive/10",
  text: "",
};

const SIZES: Readonly<Record<ButtonSize, string>> = {
  "icon-lg": "size-7 rounded-lg [&_svg]:size-4",
  "icon-md": "size-6 rounded-md [&_svg]:size-3.5",
  "icon-sm": "size-5 rounded-sm [&_svg]:size-3.5",
  "icon-xl": "size-8 rounded-lg [&_svg]:size-4",
  lg: "h-7 gap-1.5 rounded-lg px-2.5 [&_svg]:size-4",
  md: "h-6 gap-1.5 rounded-md px-2 [&_svg]:size-3.5",
  sm: "h-5 gap-1.5 rounded-sm px-1.5 [&_svg]:size-3.5",
  xl: "h-8 gap-1.5 rounded-lg px-3 text-sm [&_svg]:size-4",
};

const PILLS: Readonly<Record<ButtonSize, string>> = {
  "icon-lg": "rounded-full",
  "icon-md": "rounded-full",
  "icon-sm": "rounded-full",
  "icon-xl": "rounded-full",
  lg: "rounded-full gap-1 px-3",
  md: "rounded-full gap-1 px-2.5",
  sm: "rounded-full gap-1 px-2",
  xl: "rounded-full gap-1 px-3.5",
};

function unfilledOf(variant: "outline" | "ghost" | "text", tone: ButtonTone): string {
  const ink = `${UNFILLED[variant]} ${INK[tone]}`;
  if (tone === "danger") {
    return `${ink} ${DANGER[variant]}`;
  }
  if (variant === "outline" && tone === "default") {
    return `${UNFILLED.outline} text-foreground`;
  }
  return ink;
}

function paintOf(variant: ButtonVariant, tone: ButtonTone): string {
  if (variant === "primary") {
    return `${PRIMARY[tone]} disabled:bg-muted`;
  }
  if (variant === "secondary") {
    return `${SECONDARY[tone]} disabled:bg-muted`;
  }
  return unfilledOf(variant, tone);
}

function sizeOf(size: ButtonSize, rounded: boolean): string {
  if (rounded) {
    return `${SIZES[size]} ${PILLS[size]}`;
  }
  return SIZES[size];
}

function buttonLookOf(look: ButtonLook): string {
  const paint = paintOf(look.variant ?? "secondary", look.tone ?? "default");
  return `${SHAPE} ${paint} ${sizeOf(look.size ?? "md", look.rounded ?? false)}`;
}

export { buttonLookOf };
