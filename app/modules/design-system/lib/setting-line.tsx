import type { Parts } from "./parts.ts";
import type { ReactNode } from "react";

export function SettingLine(parts: Parts): ReactNode {
  return <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2">{parts.children}</div>;
}
