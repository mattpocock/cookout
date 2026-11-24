import type { ReactNode } from "react";

type InputVariant = "default" | "elevated" | "ghost" | "unfilled";

type InputSize = "md" | "lg" | "xl";

interface InputGroupParts {
  readonly children: ReactNode;
  readonly variant?: InputVariant | undefined;
  readonly size?: InputSize | undefined;
  readonly rounded?: boolean | undefined;
  readonly disabled?: boolean | undefined;
}

interface InputGroupInputParts {
  readonly label: string;
  readonly placeholder: string;
  readonly type: "text" | "search";
  readonly value?: string | undefined;
  readonly defaultValue?: string | undefined;
  readonly onEdit?: ((text: string) => void) | undefined;
  readonly mono?: boolean | undefined;
  readonly disabled?: boolean | undefined;
}

export type { InputGroupInputParts, InputGroupParts, InputSize, InputVariant };
