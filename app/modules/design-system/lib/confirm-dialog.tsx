import { Portal, Root } from "@radix-ui/react-alert-dialog";
import { ConfirmContent } from "./confirm-content.tsx";
import type { ConfirmDialogParts } from "./confirm-parts.ts";
import { ConfirmOverlay } from "./confirm-overlay.tsx";
import type { ReactNode } from "react";
import { useCallback } from "react";

export function ConfirmDialog(parts: ConfirmDialogParts): ReactNode {
  const { onCancel } = parts;
  const handleConfirm = parts.onConfirm;
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onCancel();
      }
    },
    [onCancel],
  );
  return (
    <Root onOpenChange={handleOpenChange} open={parts.open}>
      <Portal>
        <ConfirmOverlay />
        <ConfirmContent
          body={parts.body}
          confirm={parts.confirm}
          destructive={parts.destructive}
          error={parts.error}
          onConfirm={handleConfirm}
          pending={parts.pending}
          returnTo={parts.returnTo}
          title={parts.title}
        />
      </Portal>
    </Root>
  );
}
