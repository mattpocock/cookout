import { MenuIconFrame } from "./menu-icon-frame.tsx";
import type { ReactNode } from "react";

export function PowerIcon(): ReactNode {
  return (
    <MenuIconFrame>
      <path d="M12 3V12" />
      <path d="M17.5 6.5C18.9 7.9 19.75 9.85 19.75 12C19.75 16.28 16.28 19.75 12 19.75C7.72 19.75 4.25 16.28 4.25 12C4.25 9.85 5.1 7.9 6.5 6.5" />
    </MenuIconFrame>
  );
}
