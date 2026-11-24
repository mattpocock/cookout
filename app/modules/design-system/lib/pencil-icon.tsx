import { MenuIconFrame } from "./menu-icon-frame.tsx";
import type { ReactNode } from "react";

export function PencilIcon(): ReactNode {
  return (
    <MenuIconFrame>
      <path d="M14.5 5.5L18.5 9.5" />
      <path d="M4 20L4.5 16.5L16.25 4.75C17.0784 3.92157 18.4216 3.92157 19.25 4.75C20.0784 5.57843 20.0784 6.92157 19.25 7.75L7.5 19.5L4 20Z" />
    </MenuIconFrame>
  );
}
