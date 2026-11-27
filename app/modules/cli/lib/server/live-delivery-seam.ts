import type { Effect, FileSystem, Option, Path } from "effect";
import type { InboxItem } from "../../../sdk/index.ts";
import type { Registration } from "./registrations.ts";
import type { Secrets } from "../../../secrets/server.ts";

type LiveDeliveryNeeds = FileSystem.FileSystem | Path.Path | Secrets;

type Reach =
  | { readonly kind: "none" }
  | { readonly kind: "closed"; readonly reason: string }
  | {
      readonly kind: "open";
      readonly post: (items: readonly InboxItem[]) => Effect.Effect<void, string, LiveDeliveryNeeds>;
    };

type LiveDeliveryWarning = Readonly<Record<string, string>> & {
  readonly fix: string;
  readonly warning: string;
};

interface HarnessLiveDelivery {
  readonly ackWithinMinutes: number;
  readonly inboundWarning: (
    registration: Registration,
  ) => Effect.Effect<Option.Option<LiveDeliveryWarning>, never, LiveDeliveryNeeds>;
  readonly reachOf: (registration: Registration) => Effect.Effect<Reach, never, LiveDeliveryNeeds>;
}

export type { HarnessLiveDelivery, LiveDeliveryNeeds, LiveDeliveryWarning, Reach };
