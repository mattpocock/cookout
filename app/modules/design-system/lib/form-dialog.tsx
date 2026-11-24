import { Portal, Root } from "@radix-ui/react-alert-dialog";
import { ConfirmOverlay } from "./confirm-overlay.tsx";
import { FormDialogContent } from "./form-dialog-content.tsx";
import type { FormDialogParts } from "./form-dialog-parts.ts";
import type { ReactNode } from "react";
import { useCallback } from "react";

export function FormDialog(parts: FormDialogParts): ReactNode {
  const { busy, onCancel } = parts;
  const handleCancel = onCancel;
  const handleSubmit = parts.onSubmit;
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && !busy) {
        onCancel();
      }
    },
    [busy, onCancel],
  );
  return (
    <Root onOpenChange={handleOpenChange} open={parts.open}>
      <Portal>
        <ConfirmOverlay />
        <FormDialogContent
          busy={busy}
          busyButton={parts.busyButton}
          button={parts.button}
          description={parts.description}
          label={parts.label}
          onCancel={handleCancel}
          onSubmit={handleSubmit}
          title={parts.title}
        >
          {parts.children}
        </FormDialogContent>
      </Portal>
    </Root>
  );
}
