import { useCallback, useId } from "react";
import type { ReactNode } from "react";
import { SettingInput } from "./setting-input.tsx";
import { SettingLabel } from "./setting-label.tsx";
import { SettingLine } from "./setting-line.tsx";

interface SettingFormParts {
  readonly label: string;
  readonly field: string;
  readonly description: string;
  readonly value: string;
  readonly saving: boolean;
  readonly onEdit: (text: string) => void;
  readonly onSubmit: () => void;
  readonly submit?: string;
  readonly children?: ReactNode;
}

const SAVE = "Save";

export function SettingForm(parts: SettingFormParts): ReactNode {
  const { onSubmit } = parts;
  const handleEdit = parts.onEdit;
  const id = useId();
  const submitted = useCallback(() => {
    onSubmit();
  }, [onSubmit]);
  return (
    <form action={submitted} aria-label={parts.label} className="flex flex-col gap-2">
      <SettingLine>
        <SettingLabel control={id} description={parts.description} field={parts.field} />
        <SettingInput
          control={id}
          onEdit={handleEdit}
          saving={parts.saving}
          submit={parts.submit ?? SAVE}
          value={parts.value}
        />
      </SettingLine>
      {parts.children}
    </form>
  );
}
