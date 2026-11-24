import { MenuIconFrame } from "./menu-icon-frame.tsx";
import type { ReactNode } from "react";

export function HashIcon(): ReactNode {
  return (
    <MenuIconFrame>
      <path d="M14 21L18 3" />
      <path d="M6 21L10 3" />
      <path d="M5 8H21" />
      <path d="M3 16H19" />
    </MenuIconFrame>
  );
}
