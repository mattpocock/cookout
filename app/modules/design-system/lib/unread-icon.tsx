import { MenuIconFrame } from "./menu-icon-frame.tsx";
import type { ReactNode } from "react";

export function UnreadIcon(): ReactNode {
  return (
    <MenuIconFrame>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
    </MenuIconFrame>
  );
}
