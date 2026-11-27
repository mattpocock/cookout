import { ChatIcon } from "./chat-icon.tsx";
import { CheckCircleIcon } from "./check-circle-icon.tsx";
import { CopyIcon } from "./copy-icon.tsx";
import { DeleteIcon } from "./delete-icon.tsx";
import { PencilIcon } from "./pencil-icon.tsx";
import { RotateIcon } from "./rotate-icon.tsx";

export const THREAD_MENU_ICONS = {
  close: CheckCircleIcon,
  "copy-link": CopyIcon,
  "copy-text": CopyIcon,
  delete: DeleteIcon,
  "edit-title": PencilIcon,
  "open-thread": ChatIcon,
  reopen: RotateIcon,
} as const;
