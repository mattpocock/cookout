import { MenuIconFrame } from "./menu-icon-frame.tsx";
import type { ReactNode } from "react";

export function UnplugIcon(): ReactNode {
  return (
    <MenuIconFrame>
      <path d="M4 20L8 16" />
      <path d="M20 4L16 8" />
      <path d="M10 18L6 14L9 11C10.1046 9.89543 11.8954 9.89543 13 11C14.1046 12.1046 14.1046 13.8954 13 15L10 18Z" />
      <path d="M14 6L18 10L15 13C13.8954 14.1046 12.1046 14.1046 11 13C9.89543 11.8954 9.89543 10.1046 11 9L14 6Z" />
    </MenuIconFrame>
  );
}
