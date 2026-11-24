import { Alert, LineForm } from "../../design-system/index.tsx";
import type { DisplayNameDraft } from "../../composer/index.ts";
import type { ReactNode } from "react";
import { useNameDraft } from "./use-name-draft.ts";

interface DisplayNameFieldProps {
  readonly draft: DisplayNameDraft;
  readonly field: string;
  readonly label: string;
  readonly saved: string | null;
}

export function DisplayNameField(props: DisplayNameFieldProps): ReactNode {
  const name = useNameDraft({ draft: props.draft, saved: props.saved });
  return (
    <LineForm
      field={props.field}
      label={props.label}
      onEdit={name.handleEdit}
      onSubmit={name.handleSave}
      saving={name.saving}
      value={name.value}
    >
      {name.failure !== null && <Alert>{name.failure}</Alert>}
    </LineForm>
  );
}
