import type { ScheduleListState } from "../../board/index.ts";
import type { ScheduledMessage } from "../../scheduled-messages/index.ts";
import { refusalWords } from "./schedule-words.ts";

const TEXT = { failed: "Couldn't change it." } as const;

interface Failing {
  readonly schedule: ScheduledMessage;
  readonly state: ScheduleListState;
}

export function failureOf({ schedule, state }: Failing): string | null {
  const { change } = state;
  if (change.status !== "failed" || change.id !== schedule.id || state.deleting !== null) {
    return null;
  }
  return `${TEXT.failed} ${refusalWords(change)}`;
}
