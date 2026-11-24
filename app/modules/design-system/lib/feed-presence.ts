import type { PresenceShown } from "./avatar-parts.ts";

export function feedPresenceOf(presence: PresenceShown | null): PresenceShown | null {
  if (presence === null || presence.online || presence.warning) {
    return presence;
  }
  return null;
}
