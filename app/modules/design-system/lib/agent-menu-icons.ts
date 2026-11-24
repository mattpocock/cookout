import { PencilIcon } from "./pencil-icon.tsx";
import { PowerIcon } from "./power-icon.tsx";
import { RotateIcon } from "./rotate-icon.tsx";
import { UnplugIcon } from "./unplug-icon.tsx";

export const AGENT_MENU_ICONS = {
  "edit-name": PencilIcon,
  power: PowerIcon,
  "revoke-session": UnplugIcon,
  "rotate-token": RotateIcon,
} as const;
