import type { ChannelName } from "../../sdk/index.ts";
import type { ScheduledMessageId } from "../../scheduled-messages/index.ts";
import { isChannelName } from "../../channels/index.ts";
import { isScheduledMessageId } from "../../scheduled-messages/index.ts";

interface SchedulesRoute {
  readonly name: "schedules";
  readonly channel: ChannelName;
  readonly selected: ScheduledMessageId | null;
}

type SchedulesMatch = SchedulesRoute | { readonly name: "missing" } | false;

const SCHEDULES = /^#\/channels\/(?<channel>[^/]+)\/schedules(?:\/(?<selected>[^/]+))?$/u;
const DIGITS = /^\d+$/u;
const MISSING = { name: "missing" } as const;

function selectedOf(text: string): ScheduledMessageId | null | false {
  if (text === "") {
    return null;
  }
  const id = Number(text);
  if (!DIGITS.test(text) || !isScheduledMessageId(id)) {
    return false;
  }
  return id;
}

function schedulesMatch(hash: string): SchedulesMatch {
  if (!SCHEDULES.test(hash)) {
    return false;
  }
  const channel = hash.replace(SCHEDULES, "$<channel>");
  const selected = selectedOf(hash.replace(SCHEDULES, "$<selected>"));
  if (!isChannelName(channel) || selected === false) {
    return MISSING;
  }
  return { channel, name: "schedules", selected };
}

function schedulesHref(route: SchedulesRoute): string {
  if (route.selected === null) {
    return `#/channels/${route.channel}/schedules`;
  }
  return `#/channels/${route.channel}/schedules/${route.selected}`;
}

export { type SchedulesRoute, schedulesHref, schedulesMatch };
