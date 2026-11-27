import type { Parts } from "./parts.ts";
import type { ReactNode } from "react";

export function ProfileFrame(parts: Parts): ReactNode {
  return <div className="flex flex-col gap-6 border-b px-5 py-5">{parts.children}</div>;
}
