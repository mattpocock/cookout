import type { ScheduleList } from "../../board/index.ts";
import { useEffect } from "react";

export function useLeftOnUnmount(scheduleList: ScheduleList): void {
  useEffect(() => scheduleList.leave, [scheduleList]);
}
