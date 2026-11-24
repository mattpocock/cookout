import type { ReactNode } from "react";

interface SettingLabelParts {
  readonly control: string;
  readonly field: string;
  readonly description: string;
}

export function SettingLabel(parts: SettingLabelParts): ReactNode {
  return (
    <span className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
      <label className="text-sm text-foreground" htmlFor={parts.control}>
        {parts.field}
      </label>
      <span className="text-[13px] text-muted-foreground">{parts.description}</span>
    </span>
  );
}
