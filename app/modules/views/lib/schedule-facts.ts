import type { Identity, IdentityName } from "../../sdk/index.ts";
import { runTimeIn, shortRunTimeIn } from "../../format/index.ts";
import type { ScheduledMessage } from "../../scheduled-messages/index.ts";
import { cronWords } from "../../board/index.ts";
import { isIdentityName } from "../../identities/index.ts";
import { mentionPattern } from "../../messages/index.ts";

const FIRST = 0;

const TEXT = {
  creatorDeactivated: "Paused: its creator was deactivated",
  finished: "Finished",
  noNext: "No next run",
  paused: "Paused",
} as const;

function stateWords(schedule: ScheduledMessage): string | null {
  if (schedule.status === "finished") {
    return TEXT.finished;
  }
  if (schedule.status !== "paused") {
    return null;
  }
  if (schedule.pausedBecause === "creator_deactivated") {
    return TEXT.creatorDeactivated;
  }
  return TEXT.paused;
}

function timingWords(schedule: ScheduledMessage): string {
  const { cron, timeZone } = schedule;
  const at = schedule.at ?? null;
  if (at !== null) {
    return `Once · ${runTimeIn({ iso: at, timeZone })}`;
  }
  const raw = cron ?? "";
  return cronWords(raw) ?? `Cron ${raw}`;
}

function headingWords(schedule: ScheduledMessage): string {
  const state = stateWords(schedule);
  if (state === null) {
    return timingWords(schedule);
  }
  return `${state} · ${timingWords(schedule)}`;
}

function nextOf(schedule: ScheduledMessage): string | null {
  return schedule.nextRuns[FIRST] ?? null;
}

function nextRunWords(schedule: ScheduledMessage): string {
  const next = nextOf(schedule);
  const { timeZone } = schedule;
  if (next === null) {
    return `${TEXT.noNext} · ${timeZone}`;
  }
  return `Next ${shortRunTimeIn({ iso: next, timeZone })} ${timeZone}`;
}

function detailWords(schedule: ScheduledMessage): string {
  return `${nextRunWords(schedule)} · by @${schedule.creator.name}`;
}

function mentionsIn(text: string): readonly IdentityName[] {
  const names: readonly string[] = text.match(mentionPattern) ?? [];
  return names.filter((name): name is IdentityName => isIdentityName(name));
}

function bySoonest(first: ScheduledMessage, second: ScheduledMessage): number {
  const one = nextOf(first);
  const other = nextOf(second);
  if (one === null || other === null) {
    return Number(one === null) - Number(other === null);
  }
  return one.localeCompare(other);
}

function soonestFirst(schedules: readonly ScheduledMessage[]): readonly ScheduledMessage[] {
  return schedules.toSorted(bySoonest);
}

interface Changing {
  readonly schedule: ScheduledMessage;
  readonly me: Identity;
}

function mayChange({ me, schedule }: Changing): boolean {
  const { creator } = schedule;
  return me.admin || creator.name === me.name || creator.owner === me.name;
}

export { detailWords, headingWords, mayChange, mentionsIn, soonestFirst };
