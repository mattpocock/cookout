import type { Parts } from "./parts.ts";
import type { PromptButtonsParts } from "./prompt-parts.ts";

interface FormDialogContentParts extends Parts, PromptButtonsParts {
  readonly label: string;
  readonly title: string;
  readonly description: string;
  readonly onSubmit: () => void;
}

interface FormDialogParts extends FormDialogContentParts {
  readonly open: boolean;
}

export type { FormDialogContentParts, FormDialogParts };
