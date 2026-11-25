import type { Keymap } from "../../keymap/index.ts";
import type { ReactNode } from "react";
import type { ScheduleList } from "../../board/index.ts";
import type { Unread } from "../../unread/index.ts";
import { useSidebarKeys } from "./use-sidebar-keys.ts";

interface SidebarKeysProps {
  readonly keymap: Keymap;
  readonly me: string;
  readonly scheduleList: ScheduleList;
  readonly unread: Unread;
}

export function SidebarKeys(props: SidebarKeysProps): ReactNode {
  useSidebarKeys(props);
  return null;
}
