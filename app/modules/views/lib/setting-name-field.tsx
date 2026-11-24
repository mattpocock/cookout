import { Alert, SettingForm } from "../../design-system/index.tsx";
import type { DisplayNameDraft } from "../../composer/index.ts";
import type { ReactNode } from "react";
import { useNameDraft } from "./use-name-draft.ts";

interface SettingNameFieldProps {
  readonly description: string;
  readonly draft: DisplayNameDraft;
  readonly field: string;
  readonly label: string;
  readonly saved: string | null;
}

export function SettingNameField(props: SettingNameFieldProps): ReactNode {
  const name = useNameDraft({ draft: props.draft, saved: props.saved });
  return (
    <SettingForm
      description={props.description}
      field={props.field}
      label={props.label}
      onEdit={name.handleEdit}
      onSubmit={name.handleSave}
      saving={name.saving}
      value={name.value}
    >
      {name.failure !== null && <Alert>{name.failure}</Alert>}
    </SettingForm>
  );
}
