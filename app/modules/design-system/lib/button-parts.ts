import type { ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "text";

type ButtonTone = "default" | "monochrome" | "secondary" | "tertiary" | "danger";

type ButtonSize = "sm" | "md" | "lg" | "xl" | "icon-sm" | "icon-md" | "icon-lg" | "icon-xl";

interface ButtonLook {
  readonly variant?: ButtonVariant | undefined;
  readonly tone?: ButtonTone | undefined;
  readonly size?: ButtonSize | undefined;
  readonly rounded?: boolean | undefined;
}

interface ButtonParts extends ButtonLook {
  readonly children: ReactNode;
  readonly disabled?: boolean | undefined;
  readonly onClick: () => void;
}

export type { ButtonLook, ButtonParts, ButtonSize, ButtonTone, ButtonVariant };
