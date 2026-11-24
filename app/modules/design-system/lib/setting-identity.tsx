import { Avatar } from "./avatar.tsx";
import type { ReactNode } from "react";
import { SettingText } from "./setting-text.tsx";

interface SettingIdentityParts {
  readonly name: string;
  readonly agent: boolean;
  readonly title: string;
  readonly description: string | null;
  readonly children?: ReactNode;
}

export function SettingIdentity(parts: SettingIdentityParts): ReactNode {
  return (
    <span className="flex min-w-0 flex-1 basis-48 items-center gap-3">
      <Avatar agent={parts.agent} name={parts.name} presence={null} />
      <SettingText description={parts.description} title={parts.title}>
        {parts.children}
      </SettingText>
    </span>
  );
}
