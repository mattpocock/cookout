import { MenuIconFrame } from "./menu-icon-frame.tsx";
import type { ReactNode } from "react";

export function PencilIcon(): ReactNode {
  return (
    <MenuIconFrame>
      <path d="M10.75 2.75a1.77 1.77 0 0 1 2.5 2.5L5.5 13 2.5 13.5 3 10.5z" />
      <path d="M9.5 4l2.5 2.5" />
    </MenuIconFrame>
  );
}
