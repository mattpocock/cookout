import { useCallback, useRef } from "react";
import { ConfirmText } from "./confirm-text.tsx";
import { Content } from "@radix-ui/react-alert-dialog";
import type { FormDialogContentParts } from "./form-dialog-parts.ts";
import { PromptButtons } from "./prompt-buttons.tsx";
import type { ReactNode } from "react";
import { useReturnFocus } from "./use-return-focus.ts";

const FIRST_FIELD = "input, select, textarea";

export function FormDialogContent(parts: FormDialogContentParts): ReactNode {
  const focus = useReturnFocus();
  const form = useRef<HTMLFormElement>(null);
  const handleCloseAutoFocus = focus.onClose;
  const handleCancel = parts.onCancel;
  const handleOpenAutoFocus = useCallback(
    (event: Readonly<Event>) => {
      focus.onOpen();
      const shown = form.current;
      if (shown === null) {
        return;
      }
      const field = shown.querySelector<HTMLElement>(FIRST_FIELD);
      if (field !== null) {
        event.preventDefault();
        field.focus();
      }
    },
    [focus],
  );
  return (
    <Content asChild onCloseAutoFocus={handleCloseAutoFocus} onOpenAutoFocus={handleOpenAutoFocus}>
      <form
        action={parts.onSubmit}
        aria-label={parts.label}
        className="fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-1/2 gap-4 rounded-lg border bg-background p-5 shadow-lg"
        ref={form}
      >
        <ConfirmText body={parts.description} title={parts.title} />
        {parts.children}
        <PromptButtons busy={parts.busy} busyButton={parts.busyButton} button={parts.button} onCancel={handleCancel} />
      </form>
    </Content>
  );
}
