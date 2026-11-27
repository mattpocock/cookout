import { Effect, Option } from "effect";
import type { HarnessLiveDelivery, LiveDeliveryNeeds, LiveDeliveryWarning } from "./live-delivery-seam.ts";
import type { Registration } from "./registrations.ts";
import { inboundWarning } from "./claude-code-inbound.ts";
import { reachOf } from "./claude-code-inbox.ts";

const ACK_WITHIN_MINUTES = 10;

function warningFor(
  registration: Registration,
): Effect.Effect<Option.Option<LiveDeliveryWarning>, never, LiveDeliveryNeeds> {
  return Effect.map(
    inboundWarning(registration),
    Option.map(({ crossSessionInbound, fix }) => ({
      crossSessionInbound,
      fix,
      warning:
        `${registration.agent}'s Claude Code session would ${crossSessionInbound} runner messages ` +
        `(crossSessionInbound), so a mention waits for a wake run while it is open. Launch it with: ${fix}`,
    })),
  );
}

const claudeCodeLiveDelivery: HarnessLiveDelivery = {
  ackWithinMinutes: ACK_WITHIN_MINUTES,
  inboundWarning: warningFor,
  reachOf,
};

export { claudeCodeLiveDelivery };
