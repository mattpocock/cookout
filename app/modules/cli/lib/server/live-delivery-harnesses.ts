import { Effect } from "effect";
import type { HarnessLiveDelivery } from "./live-delivery-seam.ts";
import type { Registration } from "./registrations.ts";
import { claudeCodeLiveDelivery } from "./claude-code-live-delivery.ts";

const adapters: Readonly<Record<string, HarnessLiveDelivery>> = { "claude-code": claudeCodeLiveDelivery };

const noLiveDelivery: HarnessLiveDelivery = {
  ackWithinMinutes: 0,
  inboundWarning: () => Effect.succeedNone,
  reachOf: () => Effect.succeed({ kind: "none" }),
};

function liveDeliveryFor({ harness }: Registration): HarnessLiveDelivery {
  return adapters[harness] ?? noLiveDelivery;
}

export { liveDeliveryFor };
