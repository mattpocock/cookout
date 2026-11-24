import type { ReactNode } from "react";

interface SettingTextParts {
  readonly title: string;
  readonly description: string | null;
  readonly children?: ReactNode;
}

export function SettingText(parts: SettingTextParts): ReactNode {
  return (
    <span className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
      <span className="truncate text-sm text-foreground">{parts.title}</span>
      {parts.description !== null && <span className="text-[13px] text-muted-foreground">{parts.description}</span>}
      {parts.children}
    </span>
  );
}
